#!/usr/bin/env node
/* ==========================================================================
   我的备忘录 · 后端服务（多账号隔离版）
   - 零依赖（仅 Node 内置模块），Node >= 14 即可运行
   - JSON 文件持久化（原子写：先写 .tmp 再 rename）
   - **按账号隔离**：数据按网关注入的 X-User-Id 分区存放，每个账号只看自己的备忘
   - REST API：
       GET    /api/health
       GET    /api/state              读取当前账号的数据
       PUT    /api/notes/:id          新建或更新一条备忘（幂等 upsert）
       DELETE /api/notes/:id          删除一条备忘
       PUT    /api/categories/:id     新建或更新一个分类
       DELETE /api/categories/:id     删除分类（其下备忘转为未分类）
       PATCH  /api/settings           更新界面偏好（桌面/排序/视图/纸张）
   - 同时托管前端静态文件
   - 兼容子路径部署（识别 /api/ 之前的任意前缀）

   身份来源：
     由 Nginx 在鉴权通过后注入（auth_request_set → proxy_set_header），
     客户端自带的同名请求头会被网关覆盖，无法伪造。

   环境变量：
     PORT        监听端口，默认 5058
     HOST        监听地址，默认 127.0.0.1
     DATA_DIR    数据目录，默认 ./data
     ALLOW_ANON  设为 1 时允许无身份访问（落到 anonymous 空间，仅本机调试用）
   ========================================================================== */
'use strict';

const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const PORT = parseInt(process.env.PORT, 10) || 5058;
const HOST = process.env.HOST || '127.0.0.1';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');
const ROOT = __dirname;
const ALLOW_ANON = process.env.ALLOW_ANON === '1';
// 网关令牌：由 Nginx 注入 X-Gateway-Token，用于拒绝「绕过网关、直接伪造 X-User-Id」的请求
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || '';

const MAX_BODY = 512 * 1024; // 512KB
const PAPERS = ['lined', 'grid', 'plain', 'kraft', 'sticky', 'mint'];
const DESKS = ['ash', 'sand', 'mist', 'oak', 'linen', 'cork', 'wood', 'felt', 'slate'];
const SORTS = ['updated', 'created', 'title', 'manual'];
const MAX_ORDER = 1000; // 手动排序最多记录的 id 数
const VIEW_RE = /^[A-Za-z0-9_-]{1,64}$/;

const STATIC_MIME = {
  'index.html': 'text/html; charset=utf-8',
  'styles.css': 'text/css; charset=utf-8',
  'app.js': 'application/javascript; charset=utf-8'
};

// HTML 是 no-cache（每次校验），而 CSS/JS 允许缓存 1 小时。
// 若只更新了 HTML（或反之），浏览器会拿到新 HTML 却仍用旧脚本，出现新旧不匹配。
// 因此返回 HTML 时把「资源指纹」注入到引用上：内容一变 URL 就变，必然重新拉取；
// 内容没变时 URL 不变，浏览器与 CF 边缘缓存照旧生效。
const ASSET_FILES = ['styles.css', 'app.js'];

function assetStamp() {
  return ASSET_FILES.map((name) => {
    try {
      const st = fs.statSync(path.join(ROOT, name));
      return st.size.toString(36) + '-' + Math.floor(st.mtimeMs / 1000).toString(36);
    } catch (err) {
      return '0';
    }
  }).join('.');
}

function injectAssetStamp(html) {
  const stamp = assetStamp();
  return html
    .replace('href="styles.css"', 'href="styles.css?v=' + stamp + '"')
    .replace('src="app.js"', 'src="app.js?v=' + stamp + '"');
}

/* ------------------------------ 工具 ------------------------------ */

function uid(prefix) {
  return (prefix || 'id') + '-' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

function defaultSettings() {
  return { desk: 'wood', sort: 'updated', view: 'all', lastPaper: 'lined', order: [] };
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (!ba.length || ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/* ------------------------------ 数据校验 ------------------------------ */

function sanitizeNote(raw, id) {
  if (!raw || typeof raw !== 'object') return null;
  const ts = Date.now();
  const todos = (Array.isArray(raw.todos) ? raw.todos : []).slice(0, 300).map((t) => {
    const item = t && typeof t === 'object' ? t : {};
    return {
      id: typeof item.id === 'string' && item.id ? item.id.slice(0, 64) : uid('t'),
      text: typeof item.text === 'string' ? item.text.slice(0, 400) : '',
      done: !!item.done
    };
  });
  return {
    id: id,
    title: typeof raw.title === 'string' ? raw.title.slice(0, 120) : '',
    type: raw.type === 'todo' ? 'todo' : 'text',
    content: typeof raw.content === 'string' ? raw.content.slice(0, 40000) : '',
    todos: todos,
    categoryId: typeof raw.categoryId === 'string' && raw.categoryId ? raw.categoryId.slice(0, 64) : null,
    paper: PAPERS.indexOf(raw.paper) >= 0 ? raw.paper : 'lined',
    pinned: !!raw.pinned,
    createdAt: Number(raw.createdAt) || ts,
    updatedAt: ts
  };
}

function sanitizeCategory(raw, id) {
  if (!raw || typeof raw !== 'object') return null;
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 20) : '';
  if (!name) return null;
  const color = typeof raw.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(raw.color) ? raw.color : '#8a8f98';
  return { id: id, name: name, color: color };
}

// 手动排序序列：只接受短字符串 id，并限量，避免文件被写爆
function sanitizeOrder(raw) {
  return (Array.isArray(raw) ? raw : [])
    .filter((id) => typeof id === 'string' && id)
    .map((id) => id.slice(0, 64))
    .slice(0, MAX_ORDER);
}

// 单个账号的数据空间
function emptySpace() {
  return { categories: [], notes: [], settings: defaultSettings() };
}

function normalizeSpace(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const settings = Object.assign(defaultSettings(), src.settings && typeof src.settings === 'object' ? src.settings : {});
  if (DESKS.indexOf(settings.desk) < 0) settings.desk = 'wood';
  if (SORTS.indexOf(settings.sort) < 0) settings.sort = 'updated';
  if (PAPERS.indexOf(settings.lastPaper) < 0) settings.lastPaper = 'lined';
  if (typeof settings.view !== 'string' || !VIEW_RE.test(settings.view)) settings.view = 'all';
  settings.order = sanitizeOrder(settings.order);

  const categories = (Array.isArray(src.categories) ? src.categories : [])
    .map((c) => sanitizeCategory(c, c && c.id ? String(c.id).slice(0, 64) : uid('cat')))
    .filter(Boolean);
  const catIds = new Set(categories.map((c) => c.id));
  const notes = (Array.isArray(src.notes) ? src.notes : [])
    .map((n) => sanitizeNote(n, n && n.id ? String(n.id).slice(0, 64) : uid('n')))
    .filter(Boolean);
  notes.forEach((n) => {
    if (n.categoryId && !catIds.has(n.categoryId)) n.categoryId = null;
  });

  return { categories: categories, notes: notes, settings: settings };
}

/* ------------------------------ 持久化 ------------------------------ */

let store = { rev: 1, spaces: {}, pending: null };
let writing = Promise.resolve();

function loadState() {
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (raw && raw.spaces && typeof raw.spaces === 'object') {
      store = {
        rev: Number(raw.rev) || 1,
        spaces: raw.spaces,
        pending: raw.pending && typeof raw.pending === 'object' ? raw.pending : null
      };
      Object.keys(store.spaces).forEach((k) => {
        store.spaces[k] = normalizeSpace(store.spaces[k]);
      });
      console.log('[my-memo] 已载入 ' + Object.keys(store.spaces).length + ' 个账号空间');
    } else {
      // 旧版全局数据：暂存为 pending，首位登录用户首次访问时归属给他
      store = { rev: Number(raw.rev) || 1, spaces: {}, pending: normalizeSpace(raw) };
      console.log('[my-memo] 检测到历史全局数据，已暂存，将由首位登录的账号继承');
      persist();
    }
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('[my-memo] 读取数据失败（将重建）：' + err.message);
    store = { rev: 1, spaces: {}, pending: null };
    persist();
  }
}

function persist() {
  const snapshot = JSON.stringify(store, null, 2);
  writing = writing
    .then(() => fsp.mkdir(DATA_DIR, { recursive: true }))
    .then(() => fsp.writeFile(DATA_FILE + '.tmp', snapshot, 'utf8'))
    .then(() => fsp.rename(DATA_FILE + '.tmp', DATA_FILE))
    .catch((err) => console.error('[my-memo] 写入数据失败：' + err.message));
  return writing;
}

// 取（或创建）某个账号的数据空间
function getSpace(userId) {
  let space = store.spaces[userId];
  if (space) return space;

  if (store.pending) {
    // 历史数据由首位登录的账号继承
    space = normalizeSpace(store.pending);
    store.pending = null;
    console.log('[my-memo] 历史数据已归属账号 ' + userId);
  } else {
    space = emptySpace();
  }
  store.spaces[userId] = space;
  store.rev += 1;
  persist();
  return space;
}

/* ------------------------------ HTTP ------------------------------ */

function sendJSON(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readJSON(req) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        req.destroy();
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve(null);
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (err) {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });
}

// 写操作统一出口：自增版本号、落盘、返回 { rev, data }
function commit(res, data, tag) {
  store.rev += 1;
  persist();
  if (tag) console.log('[my-memo] ' + tag + ' rev=' + store.rev);
  return sendJSON(res, 200, { rev: store.rev, data: data });
}

async function handleNotes(req, res, parts, space) {
  const id = parts[1] ? decodeURIComponent(parts[1]).slice(0, 64) : '';
  if (!id) return sendJSON(res, 400, { error: 'missing id' });

  if (req.method === 'GET') {
    const note = space.notes.filter((n) => n.id === id)[0];
    return note ? sendJSON(res, 200, { rev: store.rev, data: note }) : sendJSON(res, 404, { error: 'not found' });
  }

  if (req.method === 'PUT') {
    const body = await readJSON(req);
    const note = sanitizeNote(body, id);
    if (!note) return sendJSON(res, 400, { error: 'invalid note' });
    const idx = space.notes.findIndex((n) => n.id === id);
    if (idx >= 0) {
      note.createdAt = space.notes[idx].createdAt;
      space.notes[idx] = note;
    } else {
      if (note.categoryId && !space.categories.some((c) => c.id === note.categoryId)) note.categoryId = null;
      space.notes.unshift(note);
    }
    return commit(res, note, 'PUT /notes/' + id);
  }

  if (req.method === 'DELETE') {
    const before = space.notes.length;
    space.notes = space.notes.filter((n) => n.id !== id);
    if (before === space.notes.length) return sendJSON(res, 404, { error: 'not found' });
    return commit(res, { id: id }, 'DELETE /notes/' + id);
  }

  return sendJSON(res, 405, { error: 'method not allowed' });
}

async function handleCategories(req, res, parts, space) {
  const id = parts[1] ? decodeURIComponent(parts[1]).slice(0, 64) : '';
  if (!id) return sendJSON(res, 400, { error: 'missing id' });

  if (req.method === 'PUT') {
    const body = await readJSON(req);
    const cat = sanitizeCategory(body, id);
    if (!cat) return sendJSON(res, 400, { error: 'invalid category' });
    const idx = space.categories.findIndex((c) => c.id === id);
    if (idx >= 0) space.categories[idx] = cat;
    else space.categories.push(cat);
    return commit(res, cat, 'PUT /categories/' + id);
  }

  if (req.method === 'DELETE') {
    const exists = space.categories.some((c) => c.id === id);
    if (!exists) return sendJSON(res, 404, { error: 'not found' });
    let affected = 0;
    space.notes.forEach((n) => {
      if (n.categoryId === id) {
        n.categoryId = null;
        affected += 1;
      }
    });
    space.categories = space.categories.filter((c) => c.id !== id);
    if (space.settings.view === id) space.settings.view = 'all';
    return commit(res, { id: id, affected: affected }, 'DELETE /categories/' + id);
  }

  return sendJSON(res, 405, { error: 'method not allowed' });
}

async function handleSettings(req, res, space) {
  if (req.method !== 'PATCH' && req.method !== 'PUT') {
    return sendJSON(res, 405, { error: 'method not allowed' });
  }
  const body = await readJSON(req);
  if (!body || typeof body !== 'object') return sendJSON(res, 400, { error: 'invalid body' });

  const s = space.settings;
  if (typeof body.desk === 'string' && DESKS.indexOf(body.desk) >= 0) s.desk = body.desk;
  if (typeof body.sort === 'string' && SORTS.indexOf(body.sort) >= 0) s.sort = body.sort;
  if (typeof body.lastPaper === 'string' && PAPERS.indexOf(body.lastPaper) >= 0) s.lastPaper = body.lastPaper;
  if (typeof body.view === 'string' && VIEW_RE.test(body.view)) s.view = body.view;
  if (Array.isArray(body.order)) s.order = sanitizeOrder(body.order);

  return commit(res, s);
}

async function handleApi(req, res, sub) {
  const parts = sub.split('/').filter(Boolean);
  try {
    if (parts[0] === 'health') {
      return sendJSON(res, 200, { ok: true, rev: store.rev, spaces: Object.keys(store.spaces).length });
    }

    // 先验网关令牌：确认请求确实经过 Nginx（否则任何人都能自带 X-User-Id 冒充）
    if (GATEWAY_TOKEN && !safeEqual(req.headers['x-gateway-token'] || '', GATEWAY_TOKEN)) {
      return sendJSON(res, 401, { error: 'unauthorized', hint: '请通过站点网关访问' });
    }

    // 身份来自网关（Nginx auth_request_set → proxy_set_header），客户端无法伪造
    let userId = String(req.headers['x-user-id'] || '').trim().slice(0, 64);
    if (!userId) {
      if (!ALLOW_ANON) {
        return sendJSON(res, 401, { error: 'unauthorized', hint: '请通过站点网关登录后访问' });
      }
      userId = 'anonymous';
    }
    const space = getSpace(userId);

    if (parts[0] === 'state') {
      if (req.method !== 'GET') return sendJSON(res, 405, { error: 'method not allowed' });
      return sendJSON(res, 200, {
        rev: store.rev,
        user: userId,
        categories: space.categories,
        notes: space.notes,
        settings: space.settings
      });
    }
    if (parts[0] === 'notes') return await handleNotes(req, res, parts, space);
    if (parts[0] === 'categories') return await handleCategories(req, res, parts, space);
    if (parts[0] === 'settings') return await handleSettings(req, res, space);
    return sendJSON(res, 404, { error: 'not found' });
  } catch (err) {
    console.error('[my-memo] API 异常：' + err.stack);
    return sendJSON(res, 500, { error: 'internal error' });
  }
}

function handleStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendJSON(res, 405, { error: 'method not allowed' });
  }
  let base = '';
  try {
    base = path.posix.basename(decodeURIComponent(pathname));
  } catch (err) {
    base = '';
  }
  if (base === 'favicon.ico') {
    res.writeHead(204).end();
    return;
  }
  const name = Object.prototype.hasOwnProperty.call(STATIC_MIME, base) ? base : 'index.html';
  const file = path.join(ROOT, name);

  fs.stat(file, (err, st) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('读取静态文件失败: ' + err.message);
      return;
    }
    const isHtml = name === 'index.html';
    // 用「大小 + 修改时间」做 ETag：内容没变就回 304，省掉穿隧道的整包传输。
    // HTML 还必须带上资源指纹：只改了 CSS/JS 时 HTML 自身没变，若仍回 304，
    // 浏览器会沿用旧 HTML 里的旧指纹，继续命中它自己缓存中的 CSS/JS（max-age=3600），
    // 于是「改了样式刷新却看不到」。带上指纹后，任何资源变动都会让 HTML 的 ETag 变化。
    const etag = '"' + st.size.toString(16) + '-' + Math.floor(st.mtimeMs).toString(16) +
      (isHtml ? '-' + assetStamp() : '') + '"';
    // CSS/JS 允许浏览器与 CF 边缘缓存 1 小时；HTML 每次都校验，保证改动即时可见
    const cacheControl = isHtml ? 'no-cache' : 'public, max-age=3600';
    const baseHead = {
      'ETag': etag,
      'Last-Modified': st.mtime.toUTCString(),
      'Cache-Control': cacheControl
    };

    if ((req.headers['if-none-match'] || '') === etag) {
      res.writeHead(304, baseHead);
      return res.end();
    }

    fs.readFile(file, (err2, buf) => {
      if (err2) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('读取静态文件失败: ' + err2.message);
        return;
      }
      // HTML 里的资源引用带上内容指纹，避免「页面已更新、脚本还是缓存的旧版」
      if (isHtml) buf = Buffer.from(injectAssetStamp(buf.toString('utf8')), 'utf8');
      res.writeHead(200, Object.assign({
        'Content-Type': STATIC_MIME[name],
        'Content-Length': buf.length
      }, baseHead));
      if (req.method === 'HEAD') return res.end();
      res.end(buf);
    });
  });
}

const server = http.createServer((req, res) => {
  let url;
  try {
    url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  } catch (err) {
    res.writeHead(400).end();
    return;
  }
  // 兼容子路径部署：/my-memo/api/notes/x → /notes/x
  const idx = url.pathname.indexOf('/api/');
  if (idx !== -1) {
    handleApi(req, res, decodeURIComponent(url.pathname.slice(idx + 4)));
    return;
  }
  handleStatic(req, res, url.pathname);
});

loadState();
persist();

server.listen(PORT, HOST, () => {
  const users = Object.keys(store.spaces).length;
  console.log('[my-memo] 服务已启动: http://' + HOST + ':' + PORT);
  console.log('[my-memo] 数据文件: ' + DATA_FILE + '（rev=' + store.rev + '，账号空间 ' + users + ' 个' +
    (store.pending ? '，有历史数据待继承' : '') + '）');
});

function shutdown(signal) {
  console.log('[my-memo] 收到 ' + signal + '，正在退出…');
  server.close(() => {
    persist().then(() => process.exit(0));
  });
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// 兜底：记录异常而不是静默退出
process.on('unhandledRejection', (err) => {
  console.error('[my-memo] 未处理的 Promise 异常：' + (err && err.stack ? err.stack : err));
});
process.on('uncaughtException', (err) => {
  console.error('[my-memo] 未捕获异常：' + (err && err.stack ? err.stack : err));
});
