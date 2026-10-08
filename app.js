/* ==========================================================================
   我的备忘录 · 逻辑层
   数据以服务器为唯一来源（见 server.js），前端通过 REST API 读写。
   ========================================================================== */
(function () {
  'use strict';

  var API = 'api'; // 相对路径，兼容部署在 /my-memo/ 之类的子路径下

  /* ---------------- 常量 ---------------- */

  var PAPERS = [
    { id: 'lined',  name: '横格纸' },
    { id: 'grid',   name: '方格纸' },
    { id: 'plain',  name: '白纸' },
    { id: 'kraft',  name: '牛皮纸' },
    { id: 'sticky', name: '便签黄' },
    { id: 'mint',   name: '薄荷便签' }
  ];

  var PAPER_PREVIEW = {
    lined:  'repeating-linear-gradient(to bottom, transparent 0 4px, rgba(120,155,195,.55) 4px 5px), #fdfaf0',
    grid:   'repeating-linear-gradient(to bottom, transparent 0 3px, rgba(120,155,195,.5) 3px 4px), repeating-linear-gradient(to right, transparent 0 3px, rgba(120,155,195,.5) 3px 4px), #fdfaf0',
    plain:  '#fffdf8',
    kraft:  'repeating-linear-gradient(72deg, rgba(120,85,40,.14) 0 1px, transparent 1px 4px), #d8bb8e',
    sticky: 'linear-gradient(180deg, #fff9c0, #fbf09a)',
    mint:   'linear-gradient(180deg, #dcf5e7, #c2e8d3)'
  };

  // 由浅到深排列，浅色款存在感低，更适合长时间盯着看
  var DESKS = [
    { id: 'ash',   name: '浅灰' },
    { id: 'sand',  name: '暖砂' },
    { id: 'mist',  name: '雾蓝' },
    { id: 'oak',   name: '浅橡木' },
    { id: 'linen', name: '亚麻桌布' },
    { id: 'cork',  name: '软木板' },
    { id: 'wood',  name: '实木桌面' },
    { id: 'felt',  name: '墨绿毛毡' },
    { id: 'slate', name: '深色石板' }
  ];

  var CAT_COLORS = ['#e8734a', '#e0a72e', '#6fae5a', '#4a90e2', '#8b6bb1', '#d95c8a', '#4fb3b3', '#8a8f98'];
  var SORTS = ['updated', 'created', 'title', 'manual'];
  var DESK_IDS = DESKS.map(function (d) { return d.id; });

  /* ---------------- 工具 ---------------- */

  var $ = function (sel, root) { return (root || document).querySelector(sel); };

  function uid(prefix) {
    return (prefix || 'id') + '-' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  }

  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  function hashOf(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) | 0; }
    return Math.abs(h);
  }

  // 依据 id 生成稳定的纸张倾斜与错落偏移，避免每次渲染跳动
  // 摆放倾角：按 id 散列在 ±1.25° 内随手摆放的样子（比原来略大，减少「方正」感）
  function tiltOf(id) { return (((hashOf(id) % 21) - 10) / 8).toFixed(2) + 'deg'; }
  function shiftOf(id) { return (hashOf(id + 'shift') % 3) * 7 + 'px'; }

  function fmtTime(ts) {
    if (!ts) return '';
    var d = new Date(ts), now = new Date(), diff = Date.now() - ts;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
    var hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    if (d.toDateString() === now.toDateString()) return '今天 ' + hm;
    if (new Date(now.getTime() - 86400000).toDateString() === d.toDateString()) return '昨天 ' + hm;
    var y = d.getFullYear() === now.getFullYear() ? '' : d.getFullYear() + '年';
    return y + (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  function noteById(id) {
    for (var i = 0; i < state.notes.length; i++) {
      if (state.notes[i].id === id) return state.notes[i];
    }
    return null;
  }

  /* ---------------- 数据层 ---------------- */

  var state = {
    rev: 0,
    categories: [],
    notes: [],
    settings: { desk: 'wood', sort: 'updated', view: 'all', lastPaper: 'lined' }
  };
  var online = false;
  var query = '';
  var noteDraft = null;
  var catDraft = null;
  var toastTimer = null;
  var confirmResolve = null;

  function normalize(raw) {
    var d = raw && typeof raw === 'object' ? raw : {};
    var s = Object.assign({ desk: 'wood', sort: 'updated', view: 'all', lastPaper: 'lined' }, d.settings || {});
    if (DESK_IDS.indexOf(s.desk) < 0) s.desk = 'wood';
    if (SORTS.indexOf(s.sort) < 0) s.sort = 'updated';
    if (!PAPER_PREVIEW[s.lastPaper]) s.lastPaper = 'lined';
    if (typeof s.view !== 'string' || !s.view) s.view = 'all';
    if (!Array.isArray(s.order)) s.order = [];

    return {
      rev: typeof d.rev === 'number' ? d.rev : 0,
      categories: Array.isArray(d.categories) ? d.categories : [],
      notes: (Array.isArray(d.notes) ? d.notes : []).map(function (n) {
        n.todos = Array.isArray(n.todos) ? n.todos : [];
        n.type = n.type === 'todo' ? 'todo' : 'text';
        n.paper = PAPER_PREVIEW[n.paper] ? n.paper : 'lined';
        return n;
      }),
      settings: s
    };
  }

  function api(method, path, body) {
    // Accept: application/json 让前置的鉴权网关区分「接口请求」与「页面请求」
    var opts = { method: method, headers: { 'Accept': 'application/json' } };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return fetch(API + path, opts).then(function (res) {
      if (!res.ok) {
        var err = new Error('HTTP ' + res.status);
        err.status = res.status;
        throw err;
      }
      return res.status === 204 ? null : res.json();
    });
  }

  // 所有写操作的统一出口：在线时走后端 API，失败给出明确提示
  function push(path, method, body) {
    if (!online) {
      toast('未连接到服务，改动无法保存');
      return Promise.resolve(null);
    }
    return api(method, path, body).then(function (res) {
      if (res && typeof res.rev === 'number') state.rev = res.rev;
      return res ? res.data : null;
    }).catch(function (err) {
      if (err.status === 401) {
        gotoLogin();
        return null;
      }
      if (typeof err.status === 'undefined') {
        online = false;
        showOffline(err);
      }
      toast('保存失败：' + err.message);
      return null;
    });
  }

  function pushNote(note) { return push('/notes/' + encodeURIComponent(note.id), 'PUT', note); }
  function removeNote(id) { return push('/notes/' + encodeURIComponent(id), 'DELETE'); }
  function pushCat(cat) { return push('/categories/' + encodeURIComponent(cat.id), 'PUT', cat); }
  function removeCat(id) { return push('/categories/' + encodeURIComponent(id), 'DELETE'); }
  // 偏好类改动（切视图 / 换桌面 / 排序 / 纸张 / 手动顺序）做合并防抖：
  // 每次 PATCH 都要穿过 Cloudflare 隧道（单次 1s+），连续操作合并成一次能明显减少等待。
  // 关键：只提交「相对上次同步结果真正变化」的字段。否则另一个较早打开的标签页
  // 在自身编辑操作里带出的陈旧快照，会把它没碰过的字段（尤其是手动排序 order）整体覆盖掉。
  var settingsTimer = null;
  var settingsSynced = null; // 上一次同步成功后、服务端那份偏好的快照

  function settingsDiff() {
    if (!settingsSynced) return state.settings; // 还没同步过，整体提交
    var body = {};
    Object.keys(state.settings).forEach(function (k) {
      if (JSON.stringify(settingsSynced[k]) !== JSON.stringify(state.settings[k])) body[k] = state.settings[k];
    });
    return body;
  }

  function flushSettingsNow() {
    settingsTimer = null;
    var body = settingsDiff();
    if (!Object.keys(body).length) return Promise.resolve(null); // 没有变化就不打扰服务端
    return push('/settings', 'PATCH', body).then(function (data) {
      // 以服务端合并后的结果为准，后续 diff 基于它计算
      settingsSynced = data || JSON.parse(JSON.stringify(state.settings));
      return data;
    });
  }

  function pushSettings(immediate) {
    clearTimeout(settingsTimer);
    settingsTimer = null;
    if (immediate) return flushSettingsNow();
    settingsTimer = setTimeout(flushSettingsNow, 600);
    return Promise.resolve(null);
  }

  // 页面隐藏/离开前把待发送的偏好立即提交，避免防抖期间丢改动
  function flushSettings() {
    if (settingsTimer) {
      clearTimeout(settingsTimer);
      flushSettingsNow();
    }
  }
  window.addEventListener('pagehide', flushSettings);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flushSettings();
  });

  /* ---------------- DOM ---------------- */

  var board = $('#board');
  var emptyState = $('#emptyState');
  var viewList = $('#viewList');
  var catList = $('#catList');
  var statLine = $('#statLine');
  var searchInput = $('#searchInput');
  var sortSelect = $('#sortSelect');
  var deskGrid = $('#deskGrid');
  var deskMask = $('#deskMask');
  var deskBtn = $('#deskBtn');
  var deskPreview = $('#deskPreview');
  var offlineMask = $('#offlineMask');
  var offlineText = $('#offlineText');

  var noteMask = $('#noteMask');
  var editorSheet = $('#editorSheet');
  var noteForm = $('#noteForm');
  var noteTitle = $('#noteTitle');
  var typeSwitch = $('#typeSwitch');
  var contentField = $('#contentField');
  var noteContent = $('#noteContent');
  var todoEditor = $('#todoEditor');
  var todoEditList = $('#todoEditList');
  var catChips = $('#catChips');
  var paperChips = $('#paperChips');
  var deleteNoteBtn = $('#deleteNoteBtn');
  var copyNoteBtn = $('#copyNoteBtn');
  var editorMeta = $('#editorMeta');

  var catMask = $('#catMask');
  var catForm = $('#catForm');
  var catFormTitle = $('#catFormTitle');
  var catName = $('#catName');
  var colorChips = $('#colorChips');
  var deleteCatBtn = $('#deleteCatBtn');

  var confirmMask = $('#confirmMask');
  var confirmTitle = $('#confirmTitle');
  var confirmText = $('#confirmText');
  var toastEl = $('#toast');

  /* ---------------- 通用 UI ---------------- */

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    requestAnimationFrame(function () { toastEl.classList.add('show'); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove('show');
      setTimeout(function () { toastEl.hidden = true; }, 220);
    }, 2600);
  }

  // 复制文本到剪贴板：优先 Clipboard API（要求 HTTPS / localhost），
  // 站点以 HTTP + IP 直连时该 API 不存在，降级为 execCommand，避免「点了没反应」。
  function writeClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () {
        return true;
      }, function () {
        return legacyCopy(text);
      });
    }
    return Promise.resolve(legacyCopy(text));
  }

  function legacyCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (err) {
      return false;
    }
  }

  // 复制并统一反馈（卡片的复制按钮与编辑器里的按钮共用）
  function copyText(text) {
    var value = String(text == null ? '' : text);
    if (!value.trim()) {
      toast('这条笔记没有可复制的内容');
      return;
    }
    writeClipboard(value).then(function (ok) {
      toast(ok ? '已复制全文' : '复制失败，请手动选中复制');
    });
  }

  // 卡片上的「复制全文」：卡片里正文是截断展示的，这里复制完整正文（不含标题）
  function copyNote(note) {
    copyText(note.content);
  }

  function confirmDialog(text, title) {
    confirmTitle.textContent = title || '请确认';
    confirmText.textContent = text;
    confirmMask.hidden = false;
    return new Promise(function (resolve) {
      confirmResolve = resolve;
    });
  }

  function closeConfirm(ok) {
    confirmMask.hidden = true;
    if (confirmResolve) { confirmResolve(!!ok); confirmResolve = null; }
  }

  function showOffline(err) {
    if (offlineText) {
      offlineText.textContent = '无法连接后端服务（' + (err && err.message ? err.message : '网络错误') +
        '）。备忘录数据由服务端保存，请确认服务已启动后重试。';
    }
    offlineMask.hidden = false;
  }

  function hideOffline() {
    offlineMask.hidden = true;
  }

  // 会话失效（登录过期/被登出）→ 去登录页，登录后回到当前地址
  function gotoLogin() {
    var next = location.pathname + location.search;
    setTimeout(function () {
      location.href = '/login?next=' + encodeURIComponent(next);
    }, 600);
  }

  /* ---------------- 启动：从服务端拉取数据 ---------------- */

  function boot() {
    emptyState.hidden = false;
    var hint = $('#emptyState .empty-note p');
    if (hint) hint.textContent = '正在连接服务…';

    return api('GET', '/state').then(function (data) {
      online = true;
      state = normalize(data);
      settingsSynced = JSON.parse(JSON.stringify(state.settings)); // 同步基线
      hideOffline();
      sortSelect.value = state.settings.sort;
      renderDeskGrid();
      applyDesk();
      renderAll();
    }).catch(function (err) {
      if (err.status === 401) {
        gotoLogin();
        return;
      }
      online = false;
      showOffline(err);
    });
  }

  /* ---------------- 渲染：侧栏 ---------------- */

  function countOf(filter) {
    return state.notes.filter(filter).length;
  }

  function renderViews() {
    var views = [
      { id: 'all',    name: '全部备忘', color: '#f0e2c8', count: state.notes.length },
      { id: 'pinned', name: '已固定',   color: '#d9524a', count: countOf(function (n) { return n.pinned; }) },
      { id: 'todos',  name: '待办清单', color: '#4fb3b3', count: countOf(function (n) { return n.type === 'todo'; }) }
    ];
    var uncat = countOf(function (n) { return !n.categoryId; });
    if (uncat) views.push({ id: 'none', name: '未分类', color: '#b9b2a6', count: uncat });

    viewList.innerHTML = views.map(function (v) {
      return '<li><button type="button" class="cat-item" data-view="' + v.id + '" aria-current="' +
        (state.settings.view === v.id) + '">' +
        '<span class="cat-dot" style="--c:' + v.color + '"></span>' +
        '<span class="cat-name">' + esc(v.name) + '</span>' +
        '<span class="cat-count">' + v.count + '</span>' +
        '</button></li>';
    }).join('');
  }

  function renderCats() {
    if (!state.categories.length) {
      catList.innerHTML = '<li><p class="side-hint" style="padding:2px 8px">还没有分类</p></li>';
      return;
    }
    catList.innerHTML = state.categories.map(function (c) {
      var count = countOf(function (n) { return n.categoryId === c.id; });
      return '<li><div class="cat-item" data-cat="' + esc(c.id) + '" role="button" tabindex="0" aria-current="' +
        (state.settings.view === c.id) + '">' +
        '<span class="cat-dot" style="--c:' + esc(c.color) + '"></span>' +
        '<span class="cat-name">' + esc(c.name) + '</span>' +
        '<span class="cat-count">' + count + '</span>' +
        '<span class="cat-tools">' +
          '<button type="button" class="cat-tool" data-cat-edit="' + esc(c.id) + '" title="编辑分类">✎</button>' +
          '<button type="button" class="cat-tool" data-cat-del="' + esc(c.id) + '" title="删除分类">×</button>' +
        '</span>' +
        '</div></li>';
    }).join('');
  }

  function renderStats() {
    var total = state.notes.length;
    var openTodos = 0;
    state.notes.forEach(function (n) {
      if (n.type === 'todo') {
        n.todos.forEach(function (t) { if (!t.done) openTodos++; });
      }
    });
    statLine.textContent = '共 ' + total + ' 条备忘 · ' + openTodos + ' 项待办未完成';
  }

  /* ---------------- 渲染：卡片 ---------------- */

  function filteredNotes() {
    var view = state.settings.view;
    var list = state.notes.slice();

    if (view === 'pinned') list = list.filter(function (n) { return n.pinned; });
    else if (view === 'todos') list = list.filter(function (n) { return n.type === 'todo'; });
    else if (view === 'none') list = list.filter(function (n) { return !n.categoryId; });
    else if (view !== 'all') list = list.filter(function (n) { return n.categoryId === view; });

    if (query) {
      var q = query.toLowerCase();
      list = list.filter(function (n) {
        return (n.title || '').toLowerCase().indexOf(q) >= 0 ||
          (n.content || '').toLowerCase().indexOf(q) >= 0 ||
          n.todos.some(function (t) { return (t.text || '').toLowerCase().indexOf(q) >= 0; });
      });
    }
    return list;
  }

  // 排序规则（固定在最前，其次按所选方式）。手动排序用 settings.order 里记录的 id 序列。
  function sortNotes(list) {
    var sort = state.settings.sort;
    var pos = {};
    (state.settings.order || []).forEach(function (id, i) { pos[id] = i; });

    list.sort(function (a, b) {
      if (!!b.pinned - !!a.pinned) return (!!b.pinned - !!a.pinned);
      if (sort === 'manual') {
        var ia = pos[a.id];
        var ib = pos[b.id];
        if (ia === undefined && ib === undefined) return b.updatedAt - a.updatedAt;
        if (ia === undefined) return -1; // 还没排进序列的新笔记放最前
        if (ib === undefined) return 1;
        return ia - ib;
      }
      if (sort === 'created') return b.createdAt - a.createdAt;
      if (sort === 'title') return String(a.title || '').localeCompare(String(b.title || ''), 'zh-Hans-CN');
      return b.updatedAt - a.updatedAt;
    });
    return list;
  }

  function visibleNotes() {
    return sortNotes(filteredNotes());
  }

  // 编辑保存后把这张便签提到「固定组之后的第一位」：
  // 固定便签仍然更靠前（保持 ★ 的语义），其余笔记的相对顺序不变。
  function promoteNote(note) {
    var ids = state.notes.map(function (n) { return n.id; });
    var order = (state.settings.order || []).filter(function (id) {
      return id !== note.id && ids.indexOf(id) >= 0;
    });

    // 还没建立过手动顺序（从没拖过）：以当前显示顺序为底，避免把顺序信息丢掉
    if (!order.length) order = sortNotes(state.notes.slice()).map(function (n) { return n.id; });
    order = order.filter(function (id) { return id !== note.id; });

    // 目标下标 = 它前面还有几张固定便签（自己若已固定则直接进固定组最前）
    var pinnedAhead = state.notes.filter(function (n) { return n.pinned && n.id !== note.id; }).length;
    order.splice(note.pinned ? 0 : pinnedAhead, 0, note.id);

    state.settings.order = order;
    pushSettings();
  }

  function todosHTML(note) {
    var items = note.todos.map(function (t) {
      return '<li class="todo-item' + (t.done ? ' done' : '') + '" data-todo="' + t.id + '">' +
        '<button type="button" class="todo-check" role="checkbox" aria-checked="' + t.done + '" aria-label="勾选待办">' +
          '<svg class="tick" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.8 12.6l4.6 4.8L19.2 6.6"/></svg>' +
        '</button>' +
        '<span class="todo-text">' + esc(t.text) + '</span>' +
        '</li>';
    }).join('');
    return '<ul class="todo-list">' + items + '</ul>';
  }

  function cardHTML(note) {
    var cat = state.categories.filter(function (c) { return c.id === note.categoryId; })[0];
    var isTodo = note.type === 'todo';
    var done = note.todos.filter(function (t) { return t.done; }).length;
    // 只有文字笔记且有正文时才提供复制（清单类内容不适合整体复制）
    var canCopy = !isTodo && !!String(note.content || '').trim();

    // 固定样式统一为胶带：只有「已固定」的卡片才有标记，与纸张类型无关
    var decor = note.pinned ? '<span class="card-tape" aria-hidden="true"></span>' : '';

    var body = isTodo
      ? (note.todos.length ? todosHTML(note) : '<p class="card-text">（空清单）</p>')
      : '<p class="card-text">' + esc(note.content) + '</p>';

    var meta = isTodo
      ? '<span class="todo-progress">' + done + '/' + note.todos.length + ' 已完成</span>'
      : '<span>文字笔记</span>';

    return '<article class="card paper-' + note.paper + '" data-id="' + esc(note.id) + '" tabindex="0"' +
      ' style="--tilt:' + tiltOf(note.id) + ';--shift:' + shiftOf(note.id) + '" aria-label="' + esc(note.title || '未命名') + '">' +
      decor +
      '<header class="card-head">' +
        (cat ? '<span class="cat-tag" style="--c:' + esc(cat.color) + '">' + esc(cat.name) + '</span>' : '<span></span>') +
        '<span class="card-tools">' +
          '<button type="button" class="tool-btn' + (note.pinned ? ' on' : '') + '" data-act="pin" title="' +
            (note.pinned ? '取消固定' : '固定到最前') + '">' + (note.pinned ? '★' : '☆') + '</button>' +
          (canCopy ? '<button type="button" class="tool-btn" data-act="copy" title="复制全文">📋</button>' : '') +
          '<button type="button" class="tool-btn" data-act="del" title="删除">🗑</button>' +
        '</span>' +
      '</header>' +
      (note.title ? '<h3 class="card-title">' + esc(note.title) + '</h3>' : '') +
      body +
      '<footer class="card-foot">' + meta +
        '<span class="foot-spacer"></span>' +
        '<time datetime="' + new Date(note.updatedAt).toISOString() + '">' + fmtTime(note.updatedAt) + '</time>' +
      '</footer>' +
      '</article>';
  }

  function renderBoard() {
    var list = visibleNotes();
    board.innerHTML = list.map(cardHTML).join('');
    emptyState.hidden = list.length > 0;
    if (!list.length) {
      var msg = $('#emptyState .empty-note p');
      if (!state.notes.length) {
        msg.textContent = state.categories.length
          ? '点右上角「新建备忘录」，写下第一条吧。'
          : '还没有内容。先在左侧新建一个分类，再写下第一条备忘吧。';
      } else {
        msg.textContent = '当前筛选条件下没有内容，换个分类或清空搜索试试。';
      }
    }
  }

  function renderAll() {
    renderViews();
    renderCats();
    renderBoard();
    renderStats();
  }

  /* ---------------- 桌面背景 ---------------- */

  function renderDeskGrid() {
    deskGrid.innerHTML = DESKS.map(function (d) {
      return '<button type="button" class="desk-option" data-desk="' + d.id + '" aria-pressed="' +
        (state.settings.desk === d.id) + '">' +
        '<span class="swatch sw-' + d.id + '"></span>' +
        '<span class="name">' + esc(d.name) + '</span>' +
        '</button>';
    }).join('');
  }

  function applyDesk() {
    document.body.dataset.desk = state.settings.desk;
    Array.prototype.forEach.call(deskGrid.children, function (el) {
      el.setAttribute('aria-pressed', String(el.dataset.desk === state.settings.desk));
    });
    // 按钮上的图标显示「当前桌面」的预览
    if (deskPreview) deskPreview.className = 'desk-preview sw-' + state.settings.desk;
  }

  function openDesk() {
    deskMask.hidden = false;
    deskBtn.setAttribute('aria-expanded', 'true');
  }

  function closeDesk() {
    deskMask.hidden = true;
    deskBtn.setAttribute('aria-expanded', 'false');
  }

  /* ---------------- 备忘录编辑 ---------------- */

  function setType(type) {
    noteDraft.type = type;
    Array.prototype.forEach.call(typeSwitch.children, function (btn) {
      btn.setAttribute('aria-selected', String(btn.dataset.type === type));
    });
    contentField.hidden = type === 'todo';
    todoEditor.hidden = type !== 'todo';
  }

  // 已存在的备忘不允许切换类型（新建时可自由选择）
  function setTypeLocked(locked) {
    typeSwitch.dataset.locked = locked ? 'true' : 'false';
    Array.prototype.forEach.call(typeSwitch.children, function (btn) {
      btn.disabled = locked;
      btn.setAttribute('aria-disabled', String(locked));
    });
  }

  function renderTodoEdit(focusId) {
    todoEditList.innerHTML = noteDraft.todos.map(function (t) {
      return '<li class="todo-edit-item' + (t.done ? ' done' : '') + '" data-todo="' + t.id + '">' +
        '<button type="button" class="todo-check" role="checkbox" aria-checked="' + t.done + '">' +
          '<svg class="tick" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.8 12.6l4.6 4.8L19.2 6.6"/></svg>' +
        '</button>' +
        '<input class="todo-input" type="text" value="' + esc(t.text) + '" placeholder="待办内容…" maxlength="120" />' +
        '<button type="button" class="todo-del" title="删除">×</button>' +
        '</li>';
    }).join('');
    if (focusId) {
      var input = todoEditList.querySelector('[data-todo="' + focusId + '"] .todo-input');
      if (input) input.focus();
    }
  }

  function renderCatChips() {
    var list = [{ id: '', name: '未分类', color: '#b9b2a6' }].concat(state.categories);
    var current = noteDraft.categoryId || '';
    catChips.innerHTML = list.map(function (c) {
      return '<button type="button" class="chip" data-cat="' + esc(c.id) + '" aria-pressed="' +
        (String(current) === String(c.id)) + '">' +
        '<span class="chip-dot" style="--c:' + esc(c.color) + '"></span>' + esc(c.name) +
        '</button>';
    }).join('');
  }

  function renderPaperChips() {
    paperChips.innerHTML = PAPERS.map(function (p) {
      return '<button type="button" class="chip" data-paper="' + p.id + '" aria-pressed="' +
        (noteDraft.paper === p.id) + '">' +
        '<span class="chip-swatch" style="background:' + PAPER_PREVIEW[p.id] + '"></span>' + esc(p.name) +
        '</button>';
    }).join('');
  }

  function openEditor(note) {
    if (note) {
      noteDraft = {
        id: note.id,
        title: note.title,
        type: note.type,
        content: note.content,
        todos: note.todos.map(function (t) { return { id: t.id, text: t.text, done: t.done }; }),
        categoryId: note.categoryId,
        paper: note.paper,
        pinned: note.pinned,
        createdAt: note.createdAt
      };
      editorMeta.textContent = '创建于 ' + fmtTime(note.createdAt) + ' · 修改于 ' + fmtTime(note.updatedAt);
      deleteNoteBtn.hidden = false;
      // 只有已存在的文字笔记才提供「复制全文」
      copyNoteBtn.hidden = noteDraft.type !== 'text';
    } else {
      var preset = state.settings.view;
      var isCat = state.categories.some(function (c) { return c.id === preset; });
      noteDraft = {
        id: null,
        title: '',
        type: 'text',
        content: '',
        todos: [],
        categoryId: isCat ? preset : null,
        paper: state.settings.lastPaper || 'lined',
        pinned: false,
        createdAt: null
      };
      editorMeta.textContent = '';
      deleteNoteBtn.hidden = true;
      copyNoteBtn.hidden = true;
    }

    noteTitle.value = noteDraft.title || '';
    noteContent.value = noteDraft.content || '';
    editorSheet.className = 'sheet paper-' + noteDraft.paper;
    setTypeLocked(!!noteDraft.id);
    setType(noteDraft.type);
    renderTodoEdit();
    renderCatChips();
    renderPaperChips();
    noteMask.hidden = false;
    setTimeout(function () { noteTitle.focus(); }, 30);
  }

  function closeEditor() {
    noteMask.hidden = true;
    noteDraft = null;
  }

  function submitNote(e) {
    if (e) e.preventDefault();
    if (!noteDraft) return;

    noteDraft.title = noteTitle.value.trim();
    if (noteDraft.type === 'text') noteDraft.content = noteContent.value.trim();

    var todos = noteDraft.type === 'todo'
      ? noteDraft.todos
          .map(function (t) { return { id: t.id, text: t.text.trim(), done: t.done }; })
          .filter(function (t) { return t.text; })
      : [];

    var title = noteDraft.title;
    var content = noteDraft.type === 'text' ? noteDraft.content : '';
    if (!title && !content && !todos.length) {
      toast('内容还是空的，先写点什么吧');
      return;
    }
    if (!title) title = (content.split('\n')[0] || todos[0].text).slice(0, 20);

    var ts = Date.now();
    var saved;
    if (noteDraft.id) {
      var target = noteById(noteDraft.id);
      if (!target) { closeEditor(); return; }
      target.title = title;
      target.type = noteDraft.type;
      target.content = content;
      target.todos = todos;
      target.categoryId = noteDraft.categoryId || null;
      target.paper = noteDraft.paper;
      target.pinned = noteDraft.pinned;
      target.updatedAt = ts;
      saved = target;
    } else {
      saved = {
        id: uid('n'),
        title: title,
        type: noteDraft.type,
        content: content,
        todos: todos,
        categoryId: noteDraft.categoryId || null,
        paper: noteDraft.paper,
        pinned: noteDraft.pinned,
        createdAt: ts,
        updatedAt: ts
      };
      state.notes.unshift(saved);
    }

    state.settings.lastPaper = noteDraft.paper;
    promoteNote(saved); // 编辑/新建后自动排到「固定组之后的第一位」
    pushNote(saved);
    pushSettings();
    closeEditor();
    renderAll();
  }

  function deleteNote() {
    if (!noteDraft || !noteDraft.id) { closeEditor(); return; }
    var id = noteDraft.id;
    confirmDialog('确定删除这条备忘录吗？删除后无法恢复。', '删除备忘录').then(function (ok) {
      if (!ok) return;
      state.notes = state.notes.filter(function (n) { return n.id !== id; });
      removeNote(id);
      closeEditor();
      renderAll();
      toast('已删除');
    });
  }

  /* ---------------- 分类编辑 ---------------- */

  function openCatEditor(cat) {
    catDraft = cat
      ? { id: cat.id, name: cat.name, color: cat.color }
      : { id: null, name: '', color: CAT_COLORS[Math.floor(Math.random() * CAT_COLORS.length)] };

    catFormTitle.textContent = cat ? '编辑分类' : '新建分类';
    catName.value = catDraft.name;
    deleteCatBtn.hidden = !cat;
    renderColorChips();
    catMask.hidden = false;
    setTimeout(function () { catName.focus(); }, 30);
  }

  function renderColorChips() {
    colorChips.innerHTML = CAT_COLORS.map(function (c) {
      return '<button type="button" class="color-chip" data-color="' + c + '" aria-pressed="' +
        (catDraft.color === c) + '" style="--c:' + c + '" title="' + c + '"></button>';
    }).join('');
  }

  function closeCatEditor() {
    catMask.hidden = true;
    catDraft = null;
  }

  function submitCat(e) {
    if (e) e.preventDefault();
    if (!catDraft) return;
    var name = catName.value.trim();
    if (!name) { toast('分类名称不能为空'); catName.focus(); return; }

    var saved;
    if (catDraft.id) {
      var target = state.categories.filter(function (c) { return c.id === catDraft.id; })[0];
      if (!target) { closeCatEditor(); return; }
      target.name = name;
      target.color = catDraft.color;
      saved = target;
    } else {
      saved = { id: uid('cat'), name: name, color: catDraft.color };
      state.categories.push(saved);
      state.settings.view = saved.id;
    }
    pushCat(saved);
    pushSettings();
    closeCatEditor();
    renderAll();
    toast('分类已保存');
  }

  function deleteCat(id) {
    var cat = state.categories.filter(function (c) { return c.id === id; })[0];
    if (!cat) return;
    var used = state.notes.filter(function (n) { return n.categoryId === id; }).length;
    closeCatEditor();
    confirmDialog(
      '删除分类「' + cat.name + '」？' + (used ? '该分类下的 ' + used + ' 条备忘会变成「未分类」，不会被删除。' : ''),
      '删除分类'
    ).then(function (ok) {
      if (!ok) return;
      state.notes.forEach(function (n) { if (n.categoryId === id) n.categoryId = null; });
      state.categories = state.categories.filter(function (c) { return c.id !== id; });
      if (state.settings.view === id) state.settings.view = 'all';
      removeCat(id);
      pushSettings();
      renderAll();
      toast('分类已删除');
    });
  }

  /* ---------------- 拖动排序 ---------------- */

  var drag = null;           // { id, el, startX, startY, active, placeholder }
  var suppressClick = false; // 拖拽结束后抑制紧随其后的一次 click，避免误开编辑器
  var DRAG_THRESHOLD = 6;    // 位移阈值：小于它视为点击（保留「点卡片即编辑」）

  // 首次拖动时自动切到手动排序
  function ensureManualSort() {
    if (state.settings.sort === 'manual') return false;
    state.settings.sort = 'manual';
    if (sortSelect) sortSelect.value = 'manual';
    return true;
  }

  // 把一段可见卡片的 id 序列落到 settings.order：
  // 以「当前全量顺序」为底，可见笔记占据的槽位按新序列重排，被筛选掉的笔记位置保持不动
  function applyOrder(sequence) {
    var all = sortNotes(state.notes.slice()).map(function (n) { return n.id; });
    var moved = {};
    sequence.forEach(function (id) { moved[id] = true; });
    var i = 0;
    var next = all.map(function (id) { return moved[id] ? sequence[i++] : id; });
    while (i < sequence.length) next.push(sequence[i++]);
    state.settings.order = next;
    pushSettings(true);
  }

  // 当前 DOM 里的卡片顺序（占位符所在位置即被拖卡片的新位置；
  // 被拖的卡片自身已脱离文档流，用占位符代表它，避免重复计数）
  function boardOrder() {
    var seq = [];
    Array.prototype.forEach.call(board.children, function (child) {
      if (child === drag.placeholder) { seq.push(drag.id); return; }
      if (child === drag.el) return;
      if (child.classList && child.classList.contains('card')) seq.push(child.dataset.id);
    });
    return seq;
  }

  function startDrag() {
    var el = drag.el;
    var r = el.getBoundingClientRect();
    el.style.width = r.width + 'px';
    el.style.height = r.height + 'px';
    el.style.left = r.left + 'px';
    el.style.top = r.top + 'px';
    el.classList.add('dragging');

    // 占位符顶住原槽位，避免网格塌陷
    var ph = document.createElement('div');
    ph.className = 'card-placeholder';
    ph.style.width = r.width + 'px';
    ph.style.height = r.height + 'px';
    el.parentNode.insertBefore(ph, el);
    drag.placeholder = ph;

    drag.active = true;
    document.body.classList.add('is-dragging');
    moveDrag(drag.startX, drag.startY);
  }

  function moveDrag(x, y) {
    var el = drag.el;
    el.style.transform = 'translate(' + (x - drag.startX) + 'px,' + (y - drag.startY) + 'px) rotate(0deg)';

    // 被拖卡片设了 pointer-events:none，所以这里拿到的是它下面的卡片
    var under = document.elementFromPoint(x, y);
    var over = under && under.closest ? under.closest('.card') : null;
    if (!over || over === el || over === drag.placeholder) return;

    var r = over.getBoundingClientRect();
    if (x < r.left + r.width / 2) board.insertBefore(drag.placeholder, over);
    else board.insertBefore(drag.placeholder, over.nextSibling);
  }

  function endDrag() {
    if (!drag) return;
    var el = drag.el;
    var ph = drag.placeholder;
    if (!drag.active) { drag = null; return; } // 只是点击，交给 click 处理

    var seq = boardOrder(); // 必须在清空 drag / 移除占位符之前取序
    drag = null;

    el.classList.remove('dragging');
    el.removeAttribute('style');
    if (ph && ph.parentNode) ph.parentNode.removeChild(ph);
    document.body.classList.remove('is-dragging');

    suppressClick = true;
    setTimeout(function () { suppressClick = false; }, 350);

    var switched = ensureManualSort();
    applyOrder(seq);
    renderAll();
    toast(switched ? '已切换为手动排序' : '顺序已更新');
  }

  // 键盘等价操作：Alt + 方向键把卡片前移/后移
  function moveNote(note, dir) {
    var seq = sortNotes(state.notes.slice()).map(function (n) { return n.id; });
    var i = seq.indexOf(note.id);
    if (i < 0) return;
    var j = i + dir;
    if (j < 0 || j >= seq.length) return;
    seq.splice(j, 0, seq.splice(i, 1)[0]);
    var switched = ensureManualSort();
    applyOrder(seq);
    renderAll();
    var el = board.querySelector('[data-id="' + note.id + '"]');
    if (el) el.focus();
    toast(switched ? '已切换为手动排序' : '顺序已更新');
  }

  board.addEventListener('pointerdown', function (e) {
    if (e.button !== 0 || drag) return;
    if (e.target.closest('button, a, input, textarea, select')) return;
    var card = e.target.closest('.card');
    if (!card) return;
    drag = { id: card.dataset.id, el: card, startX: e.clientX, startY: e.clientY, active: false, placeholder: null };
  });

  document.addEventListener('pointermove', function (e) {
    if (!drag) return;
    if (!drag.active) {
      if (Math.abs(e.clientX - drag.startX) + Math.abs(e.clientY - drag.startY) < DRAG_THRESHOLD) return;
      startDrag();
      return;
    }
    e.preventDefault(); // 拖拽中不要选中文字
    moveDrag(e.clientX, e.clientY);
  }, { passive: false });

  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', endDrag);

  /* ---------------- 事件绑定 ---------------- */

  // 侧栏（限定在侧栏内，避免与编辑器里的分类 chip 冲突）
  $('.sidebar').addEventListener('click', function (e) {
    var viewBtn = e.target.closest('[data-view]');
    if (viewBtn) {
      state.settings.view = viewBtn.dataset.view;
      pushSettings();
      renderViews(); renderCats(); renderBoard();
      return;
    }

    var catEdit = e.target.closest('[data-cat-edit]');
    if (catEdit) {
      e.stopPropagation();
      var c1 = state.categories.filter(function (c) { return c.id === catEdit.dataset.catEdit; })[0];
      if (c1) openCatEditor(c1);
      return;
    }

    var catDel = e.target.closest('[data-cat-del]');
    if (catDel) {
      e.stopPropagation();
      deleteCat(catDel.dataset.catDel);
      return;
    }

    var catItem = e.target.closest('[data-cat]');
    if (catItem && !e.target.closest('.cat-tool')) {
      state.settings.view = catItem.dataset.cat;
      pushSettings();
      renderViews(); renderCats(); renderBoard();
    }
  });

  // 看板
  board.addEventListener('click', function (e) {
    if (suppressClick) return; // 刚拖拽结束，这次 click 是拖动的尾巴
    var card = e.target.closest('.card');
    if (!card) return;
    var note = noteById(card.dataset.id);
    if (!note) return;

    var actBtn = e.target.closest('[data-act]');
    if (actBtn) {
      var act = actBtn.dataset.act;
      if (act === 'pin') {
        note.pinned = !note.pinned;
        note.updatedAt = Date.now();
        pushNote(note);
        renderBoard();
        toast(note.pinned ? '已固定到最前' : '已取消固定');
      } else if (act === 'copy') {
        copyNote(note);
      } else if (act === 'del') {
        confirmDialog('确定删除「' + (note.title || '未命名') + '」吗？删除后无法恢复。', '删除备忘录').then(function (ok) {
          if (!ok) return;
          state.notes = state.notes.filter(function (n) { return n.id !== note.id; });
          removeNote(note.id);
          renderAll();
          toast('已删除');
        });
      }
      return;
    }

    var check = e.target.closest('.todo-check');
    if (check) {
      var item = check.closest('.todo-item');
      var todo = note.todos.filter(function (t) { return t.id === item.dataset.todo; })[0];
      if (!todo) return;
      todo.done = !todo.done;
      note.updatedAt = Date.now();
      item.classList.toggle('done', todo.done);
      check.setAttribute('aria-checked', String(todo.done));
      var prog = card.querySelector('.todo-progress');
      if (prog) {
        var done = note.todos.filter(function (t) { return t.done; }).length;
        prog.textContent = done + '/' + note.todos.length + ' 已完成';
      }
      pushNote(note);
      renderStats();
      return;
    }

    openEditor(note);
  });

  board.addEventListener('keydown', function (e) {
    var card = e.target.closest('.card');
    if (!card) return;

    // Alt + 方向键：把卡片在序列中前移/后移（拖动的键盘等价操作）
    if (e.altKey && e.key.indexOf('Arrow') === 0) {
      var note0 = noteById(card.dataset.id);
      if (!note0) return;
      e.preventDefault();
      var back = (e.key === 'ArrowLeft' || e.key === 'ArrowUp');
      moveNote(note0, back ? -1 : 1);
      return;
    }

    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (e.target.closest('button')) return;
    e.preventDefault();
    var note = noteById(card.dataset.id);
    if (note) openEditor(note);
  });

  // 顶栏
  $('#newNoteBtn').addEventListener('click', function () { openEditor(null); });

  searchInput.addEventListener('input', function () {
    query = searchInput.value.trim();
    renderBoard();
  });

  sortSelect.addEventListener('change', function () {
    state.settings.sort = sortSelect.value;
    pushSettings();
    renderBoard();
  });

  deskBtn.addEventListener('click', function () {
    if (deskMask.hidden) openDesk(); else closeDesk();
  });

  deskGrid.addEventListener('click', function (e) {
    var opt = e.target.closest('[data-desk]');
    if (!opt) return;
    state.settings.desk = opt.dataset.desk;
    applyDesk();
    pushSettings();
  });

  $('#deskDoneBtn').addEventListener('click', closeDesk);
  deskMask.addEventListener('mousedown', function (e) { if (e.target === deskMask) closeDesk(); });

  $('#newCatBtn').addEventListener('click', function () { openCatEditor(null); });

  // 备忘录编辑弹窗
  typeSwitch.addEventListener('click', function (e) {
    if (typeSwitch.dataset.locked === 'true') return;
    var btn = e.target.closest('[data-type]');
    if (btn && !btn.disabled) setType(btn.dataset.type);
  });

  catChips.addEventListener('click', function (e) {
    var chip = e.target.closest('[data-cat]');
    if (!chip || !noteDraft) return;
    noteDraft.categoryId = chip.dataset.cat || null;
    renderCatChips();
  });

  paperChips.addEventListener('click', function (e) {
    var chip = e.target.closest('[data-paper]');
    if (!chip || !noteDraft) return;
    noteDraft.paper = chip.dataset.paper;
    editorSheet.className = 'sheet paper-' + noteDraft.paper;
    renderPaperChips();
  });

  $('#addTodoBtn').addEventListener('click', function () {
    if (!noteDraft) return;
    var item = { id: uid('t'), text: '', done: false };
    noteDraft.todos.push(item);
    renderTodoEdit(item.id);
  });

  todoEditList.addEventListener('click', function (e) {
    var li = e.target.closest('.todo-edit-item');
    if (!li || !noteDraft) return;
    var todo = noteDraft.todos.filter(function (t) { return t.id === li.dataset.todo; })[0];
    if (!todo) return;

    if (e.target.closest('.todo-check')) {
      todo.done = !todo.done;
      li.classList.toggle('done', todo.done);
      e.target.closest('.todo-check').setAttribute('aria-checked', String(todo.done));
      return;
    }
    if (e.target.closest('.todo-del')) {
      noteDraft.todos = noteDraft.todos.filter(function (t) { return t.id !== todo.id; });
      renderTodoEdit();
    }
  });

  todoEditList.addEventListener('input', function (e) {
    var li = e.target.closest('.todo-edit-item');
    if (!li || !noteDraft || !e.target.classList.contains('todo-input')) return;
    var todo = noteDraft.todos.filter(function (t) { return t.id === li.dataset.todo; })[0];
    if (todo) todo.text = e.target.value;
  });

  todoEditList.addEventListener('keydown', function (e) {
    if (!noteDraft || !e.target.classList.contains('todo-input')) return;
    var li = e.target.closest('.todo-edit-item');
    var todo = noteDraft.todos.filter(function (t) { return t.id === li.dataset.todo; })[0];
    if (!todo) return;

    if (e.key === 'Enter') {
      e.preventDefault();
      var idx = noteDraft.todos.indexOf(todo);
      if (idx === noteDraft.todos.length - 1 && todo.text.trim()) {
        var item = { id: uid('t'), text: '', done: false };
        noteDraft.todos.splice(idx + 1, 0, item);
        renderTodoEdit(item.id);
      } else {
        var next = todoEditList.querySelector('[data-todo="' + noteDraft.todos[Math.min(idx + 1, noteDraft.todos.length - 1)].id + '"] .todo-input');
        if (next) next.focus();
      }
    }

    if (e.key === 'Backspace' && !e.target.value && noteDraft.todos.length > 1) {
      e.preventDefault();
      var i2 = noteDraft.todos.indexOf(todo);
      noteDraft.todos.splice(i2, 1);
      var focusId = noteDraft.todos[Math.max(i2 - 1, 0)].id;
      renderTodoEdit(focusId);
    }
  });

  noteForm.addEventListener('submit', submitNote);
  deleteNoteBtn.addEventListener('click', deleteNote);
  // 复制编辑器里当前的内容（含尚未保存的修改）
  copyNoteBtn.addEventListener('click', function () { copyText(noteContent.value); });
  $('#cancelNoteBtn').addEventListener('click', closeEditor);

  // 分类弹窗
  colorChips.addEventListener('click', function (e) {
    var chip = e.target.closest('[data-color]');
    if (!chip || !catDraft) return;
    catDraft.color = chip.dataset.color;
    renderColorChips();
  });
  catForm.addEventListener('submit', submitCat);
  $('#cancelCatBtn').addEventListener('click', closeCatEditor);
  deleteCatBtn.addEventListener('click', function () {
    if (catDraft && catDraft.id) deleteCat(catDraft.id);
  });

  // 确认框
  $('#confirmYes').addEventListener('click', function () { closeConfirm(true); });
  $('#confirmNo').addEventListener('click', function () { closeConfirm(false); });

  // 断线重试
  $('#retryBtn').addEventListener('click', function () { boot(); });

  // 点击遮罩关闭
  noteMask.addEventListener('mousedown', function (e) { if (e.target === noteMask) closeEditor(); });
  catMask.addEventListener('mousedown', function (e) { if (e.target === catMask) closeCatEditor(); });
  confirmMask.addEventListener('mousedown', function (e) { if (e.target === confirmMask) closeConfirm(false); });

  // 快捷键
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (!confirmMask.hidden) { closeConfirm(false); return; }
      if (!catMask.hidden) { closeCatEditor(); return; }
      if (!noteMask.hidden) { closeEditor(); return; }
      if (!deskMask.hidden) { closeDesk(); return; }
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !noteMask.hidden) {
      submitNote(e);
    }
  });

  /* ---------------- 启动 ---------------- */

  boot();
})();
