#!/usr/bin/env node
/* ==========================================================================
   我的备忘录 · 后端服务
   - 零依赖（仅 Node 内置模块），Node >= 14 即可运行
   - JSON 文件持久化（原子写：先写 .tmp 再 rename）
   - REST API：
       GET    /api/health
       GET    /api/state              读取全部数据
       PUT    /api/notes/:id          新建或更新一条备忘（幂等 upsert）
       DELETE /api/notes/:id          删除一条备忘
       PUT    /api/categories/:id     新建或更新一个分类
       DELETE /api/categories/:id     删除分类（其下备忘转为未分类）
       PATCH  /api/settings           更新界面偏好（桌面/排序/视图/纸张）
   - 同时托管前端静态文件，可直接通过 http://127.0.0.1:5058/ 访问
   - 兼容子路径部署（Nginx 反代 /my-memo/ 时自动识别 /api/ 之前的任意前缀）

   环境变量：
     PORT      监听端口，默认 5058
     HOST      监听地址，默认 127.0.0.1
     DATA_DIR  数据目录，默认 ./data
   ========================================================================== */
'use strict';

const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const PORT = parseInt(process.env.PORT, 10) || 5058;
const HOST = process.env.HOST || '127.0.0.1';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');
const ROOT = __dirname;

const MAX_BODY = 512 * 1024; // 512KB
const PAPERS = ['lined', 'grid', 'plain', 'kraft', 'sticky', 'mint'];
const DESKS = ['wood', 'cork', 'linen', 'felt', 'slate'];
const SORTS = ['updated', 'created', 'title'];
const VIEW_RE = /^[A-Za-z0-9_-]{1,64}$/;

const STATIC_MIME = {
  'index.html': 'text/html; charset=utf-8',
  'styles.css': 'text/css; charset=utf-8',
  'app.js': 'application/javascript; charset=utf-8'
};

/* ------------------------------ 工具 ------------------------------ */

function uid(prefix) {
  return (prefix || 'id') + '-' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

function defaultSettings() {
  return { desk: 'wood', sort: 'updated', view: 'all', lastPaper: 'lined' };
}

function seedState() {
  const t = Date.now();
  const work = { id: 'cat-work', name: '工作', color: '#e8734a' };
  const life = { id: 'cat-life', name: '生活', color: '#4a90e2' };
  const idea = { id: 'cat-idea', name: '灵感', color: '#8b6bb1' };
  return {
    rev: 1,
    categories: [work, life, idea],
    notes: [
      {
        id: uid('n'),
        title: '欢迎使用我的备忘录',
        type: 'text',
        content: '数据现在保存在服务器上，换台设备打开也是同一份。\n\n· 点卡片任意位置即可编辑\n· 右上角图钉能把常用备忘固定在前面\n· 顶栏「桌面」换桌面材质，编辑器里换纸张样式',
        todos: [],
        categoryId: null,
        paper: 'lined',
        pinned: true,
        createdAt: t,
        updatedAt: t
      },
      {
        id: uid('n'),
        title: '今天要做的事',
        type: 'todo',
        content: '',
        todos: [
          { id: uid('t'), text: '梳理本周待办', done: true },
          { id: uid('t'), text: '写一份周报', done: false },
          { id: uid('t'), text: '给妈妈打个电话', done: false }
        ],
        categoryId: life.id,
        paper: 'sticky',
        pinned: false,
        createdAt: t - 3600000,
        updatedAt: t - 1200000
      },
      {
        id: uid('n'),
        title: '季度规划要点',
        type: 'text',
        content: '一、聚焦主线，砍掉边缘需求\n二、每周复盘一次，只留最有价值的三件事\n三、和设计同步一次视觉规范',
        todos: [],
        categoryId: work.id,
        paper: 'kraft',
        pinned: false,
        createdAt: t - 7200000,
        updatedAt: t - 5400000
      },
      {
        id: uid('n'),
        title: '随手记',
        type: 'text',
        content: '把「写实」当成一种态度：纸要有纹路，木要有年轮，字要像人写的。',
        todos: [],
        categoryId: idea.id,
        paper: 'mint',
        pinned: false,
        createdAt: t - 10800000,
        updatedAt: t - 9000000
      }
    ],
    settings: defaultSettings()
  };
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

function normalizeState(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const settings = Object.assign(defaultSettings(), src.settings && typeof src.settings === 'object' ? src.settings : {});
  if (DESKS.indexOf(settings.desk) < 0) settings.desk = 'wood';
  if (SORTS.indexOf(settings.sort) < 0) settings.sort = 'updated';
  if (PAPERS.indexOf(settings.lastPaper) < 0) settings.lastPaper = 'lined';
  if (typeof settings.view !== 'string' || !VIEW_RE.test(settings.view)) settings.view = 'all';

  const categories = (Array.isArray(src.categories) ? src.categories : []).map((c) => sanitizeCategory(c, c && c.id ? String(c.id).slice(0, 64) : uid('cat'))).filter(Boolean);
  const catIds = new Set(categories.map((c) => c.id));
  const notes = (Array.isArray(src.notes) ? src.notes : []).map((n) => sanitizeNote(n, n && n.id ? String(n.id).slice(0, 64) : uid('n'))).filter(Boolean);
  notes.forEach((n) => {
    if (n.categoryId && !catIds.has(n.categoryId)) n.categoryId = null;
  });

  return {
    rev: Number(src.rev) || 1,
    categories: categories,
    notes: notes,
    settings: settings
  };
}

/* ------------------------------ 持久化 ------------------------------ */

let state = normalizeState(null);
let writing = Promise.resolve();

function loadState() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    state = normalizeState(JSON.parse(raw));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error('[my-memo] 读取数据失败（将重建初始数据）：' + err.message);
    }
    state = seedState();
    persist();
  }
}

function persist() {
  const snapshot = JSON.stringify(state, null, 2);
  writing = writing
    .then(() => fsp.mkdir(DATA_DIR, { recursive: true }))
    .then(() => fsp.writeFile(DATA_FILE + '.tmp', snapshot, 'utf8'))
    .then(() => fsp.rename(DATA_FILE + '.tmp', DATA_FILE))
    .catch((err) => console.error('[my-memo] 写入数据失败：' + err.message));
  return writing;
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
  state.rev += 1;
  persist();
  if (tag) console.log('[my-memo] ' + tag + ' rev=' + state.rev);
  return sendJSON(res, 200, { rev: state.rev, data: data });
}

async function handleNotes(req, res, parts) {
  const id = parts[1] ? decodeURIComponent(parts[1]).slice(0, 64) : '';
  if (!id) return sendJSON(res, 400, { error: 'missing id' });

  if (req.method === 'GET') {
    const note = state.notes.filter((n) => n.id === id)[0];
    return note ? sendJSON(res, 200, { rev: state.rev, data: note }) : sendJSON(res, 404, { error: 'not found' });
  }

  if (req.method === 'PUT') {
    const body = await readJSON(req);
    const note = sanitizeNote(body, id);
    if (!note) return sendJSON(res, 400, { error: 'invalid note' });
    const idx = state.notes.findIndex((n) => n.id === id);
    if (idx >= 0) {
      note.createdAt = state.notes[idx].createdAt;
      state.notes[idx] = note;
    } else {
      if (note.categoryId && !state.categories.some((c) => c.id === note.categoryId)) note.categoryId = null;
      state.notes.unshift(note);
    }
    return commit(res, note, 'PUT /notes/' + id);
  }

  if (req.method === 'DELETE') {
    const before = state.notes.length;
    state.notes = state.notes.filter((n) => n.id !== id);
    if (before === state.notes.length) return sendJSON(res, 404, { error: 'not found' });
    return commit(res, { id: id }, 'DELETE /notes/' + id);
  }

  return sendJSON(res, 405, { error: 'method not allowed' });
}

async function handleCategories(req, res, parts) {
  const id = parts[1] ? decodeURIComponent(parts[1]).slice(0, 64) : '';
  if (!id) return sendJSON(res, 400, { error: 'missing id' });

  if (req.method === 'PUT') {
    const body = await readJSON(req);
    const cat = sanitizeCategory(body, id);
    if (!cat) return sendJSON(res, 400, { error: 'invalid category' });
    const idx = state.categories.findIndex((c) => c.id === id);
    if (idx >= 0) state.categories[idx] = cat;
    else state.categories.push(cat);
    return commit(res, cat, 'PUT /categories/' + id);
  }

  if (req.method === 'DELETE') {
    const exists = state.categories.some((c) => c.id === id);
    if (!exists) return sendJSON(res, 404, { error: 'not found' });
    let affected = 0;
    state.notes.forEach((n) => {
      if (n.categoryId === id) {
        n.categoryId = null;
        affected += 1;
      }
    });
    state.categories = state.categories.filter((c) => c.id !== id);
    if (state.settings.view === id) state.settings.view = 'all';
    return commit(res, { id: id, affected: affected }, 'DELETE /categories/' + id);
  }

  return sendJSON(res, 405, { error: 'method not allowed' });
}

async function handleSettings(req, res) {
  if (req.method !== 'PATCH' && req.method !== 'PUT') {
    return sendJSON(res, 405, { error: 'method not allowed' });
  }
  const body = await readJSON(req);
  if (!body || typeof body !== 'object') return sendJSON(res, 400, { error: 'invalid body' });

  const s = state.settings;
  if (typeof body.desk === 'string' && DESKS.indexOf(body.desk) >= 0) s.desk = body.desk;
  if (typeof body.sort === 'string' && SORTS.indexOf(body.sort) >= 0) s.sort = body.sort;
  if (typeof body.lastPaper === 'string' && PAPERS.indexOf(body.lastPaper) >= 0) s.lastPaper = body.lastPaper;
  if (typeof body.view === 'string' && VIEW_RE.test(body.view)) s.view = body.view;

  return commit(res, s);
}

async function handleApi(req, res, sub) {
  const parts = sub.split('/').filter(Boolean);
  try {
    if (parts[0] === 'health') return sendJSON(res, 200, { ok: true, rev: state.rev });
    if (parts[0] === 'state') {
      if (req.method !== 'GET') return sendJSON(res, 405, { error: 'method not allowed' });
      return sendJSON(res, 200, Object.assign({ rev: state.rev }, state));
    }
    if (parts[0] === 'notes') return handleNotes(req, res, parts);
    if (parts[0] === 'categories') return handleCategories(req, res, parts);
    if (parts[0] === 'settings') return handleSettings(req, res);
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
  fs.readFile(path.join(ROOT, name), (err, buf) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('读取静态文件失败: ' + err.message);
      return;
    }
    res.writeHead(200, {
      'Content-Type': STATIC_MIME[name],
      'Content-Length': buf.length,
      'Cache-Control': 'no-cache'
    });
    if (req.method === 'HEAD') return res.end();
    res.end(buf);
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
  console.log('[my-memo] 服务已启动: http://' + HOST + ':' + PORT);
  console.log('[my-memo] 数据文件: ' + DATA_FILE + '（rev=' + state.rev + '，备忘 ' + state.notes.length + ' 条）');
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
