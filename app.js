/* ==========================================================================
   我的备忘录 · 逻辑层
   数据保存在浏览器 localStorage，纯前端、零依赖。
   ========================================================================== */
(function () {
  'use strict';

  var KEY = 'my-memo:v1';

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

  var DESKS = [
    { id: 'wood',  name: '实木桌面' },
    { id: 'cork',  name: '软木板' },
    { id: 'linen', name: '亚麻桌布' },
    { id: 'felt',  name: '墨绿毛毡' },
    { id: 'slate', name: '深色石板' }
  ];

  var CAT_COLORS = ['#e8734a', '#e0a72e', '#6fae5a', '#4a90e2', '#8b6bb1', '#d95c8a', '#4fb3b3', '#8a8f98'];

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
  function tiltOf(id) { return (((hashOf(id) % 21) - 10) / 12).toFixed(2) + 'deg'; }
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

  /* ---------------- 状态 ---------------- */

  function seed() {
    var t = Date.now();
    var work = { id: 'cat-work', name: '工作', color: '#e8734a' };
    var life = { id: 'cat-life', name: '生活', color: '#4a90e2' };
    var idea = { id: 'cat-idea', name: '灵感', color: '#8b6bb1' };

    return {
      version: 1,
      categories: [work, life, idea],
      notes: [
        {
          id: uid('n'),
          title: '欢迎使用我的备忘录',
          type: 'text',
          content: '这是一张横格纸卡片。\n\n· 点卡片任意位置即可编辑\n· 右上角图钉能把常用备忘固定在前面\n· 顶栏「桌面」可以更换桌面材质，编辑器里可以换纸张样式',
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
      settings: {
        desk: 'wood',
        sort: 'updated',
        view: 'all',
        lastPaper: 'lined'
      }
    };
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return seed();
      var data = JSON.parse(raw);
      var base = seed();
      data.categories = Array.isArray(data.categories) ? data.categories : [];
      data.notes = Array.isArray(data.notes) ? data.notes : [];
      data.settings = Object.assign({}, base.settings, data.settings || {});
      data.notes.forEach(function (n) {
        n.todos = Array.isArray(n.todos) ? n.todos : [];
        n.type = n.type === 'todo' ? 'todo' : 'text';
        n.paper = PAPER_PREVIEW[n.paper] ? n.paper : 'lined';
      });
      return data;
    } catch (err) {
      return seed();
    }
  }

  var state = load();
  var query = '';
  var noteDraft = null;
  var catDraft = null;
  var toastTimer = null;
  var confirmResolve = null;

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (err) {
      toast('本地存储写入失败，改动可能不会被保留');
    }
  }

  /* ---------------- DOM ---------------- */

  var board = $('#board');
  var emptyState = $('#emptyState');
  var viewList = $('#viewList');
  var catList = $('#catList');
  var statLine = $('#statLine');
  var searchInput = $('#searchInput');
  var sortSelect = $('#sortSelect');
  var deskGrid = $('#deskGrid');
  var deskPopover = $('#deskPopover');
  var deskBtn = $('#deskBtn');

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
    }, 2200);
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
      return '<li><div class="cat-item" data-cat="' + c.id + '" role="button" tabindex="0" aria-current="' +
        (state.settings.view === c.id) + '">' +
        '<span class="cat-dot" style="--c:' + esc(c.color) + '"></span>' +
        '<span class="cat-name">' + esc(c.name) + '</span>' +
        '<span class="cat-count">' + count + '</span>' +
        '<span class="cat-tools">' +
          '<button type="button" class="cat-tool" data-cat-edit="' + c.id + '" title="编辑分类">✎</button>' +
          '<button type="button" class="cat-tool" data-cat-del="' + c.id + '" title="删除分类">×</button>' +
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

  function visibleNotes() {
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

    var sort = state.settings.sort;
    list.sort(function (a, b) {
      if (!!b.pinned - !!a.pinned) return (!!b.pinned - !!a.pinned);
      if (sort === 'created') return b.createdAt - a.createdAt;
      if (sort === 'title') return String(a.title || '').localeCompare(String(b.title || ''), 'zh-Hans-CN');
      return b.updatedAt - a.updatedAt;
    });
    return list;
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

    var decor = note.pinned
      ? '<span class="card-pin" aria-hidden="true"></span>'
      : (note.paper === 'sticky' || note.paper === 'mint' ? '<span class="card-tape" aria-hidden="true"></span>' : '');

    var body = isTodo
      ? (note.todos.length ? todosHTML(note) : '<p class="card-text">（空清单）</p>')
      : '<p class="card-text">' + esc(note.content) + '</p>';

    var meta = isTodo
      ? '<span class="todo-progress">' + done + '/' + note.todos.length + ' 已完成</span>'
      : '<span>文字笔记</span>';

    return '<article class="card paper-' + note.paper + '" data-id="' + note.id + '" tabindex="0"' +
      ' style="--tilt:' + tiltOf(note.id) + ';--shift:' + shiftOf(note.id) + '" aria-label="' + esc(note.title || '未命名') + '">' +
      decor +
      '<header class="card-head">' +
        (cat ? '<span class="cat-tag" style="--c:' + esc(cat.color) + '">' + esc(cat.name) + '</span>' : '<span></span>') +
        '<span class="card-tools">' +
          '<button type="button" class="tool-btn' + (note.pinned ? ' on' : '') + '" data-act="pin" title="' +
            (note.pinned ? '取消固定' : '固定到最前') + '">' + (note.pinned ? '★' : '☆') + '</button>' +
          '<button type="button" class="tool-btn" data-act="edit" title="编辑">✎</button>' +
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
      msg.textContent = state.notes.length
        ? '当前筛选条件下没有内容，换个分类或清空搜索试试。'
        : '点右上角「新建备忘录」，写下第一条吧。';
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
    }

    noteTitle.value = noteDraft.title || '';
    noteContent.value = noteDraft.content || '';
    editorSheet.className = 'sheet paper-' + noteDraft.paper;
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

  function syncDraftFromInputs() {
    if (!noteDraft) return;
    noteDraft.title = noteTitle.value.trim();
    if (noteDraft.type === 'text') noteDraft.content = noteContent.value.trim();
  }

  function submitNote(e) {
    if (e) e.preventDefault();
    if (!noteDraft) return;
    syncDraftFromInputs();

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
    if (noteDraft.id) {
      var target = state.notes.filter(function (n) { return n.id === noteDraft.id; })[0];
      if (target) {
        target.title = title;
        target.type = noteDraft.type;
        target.content = content;
        target.todos = todos;
        target.categoryId = noteDraft.categoryId || null;
        target.paper = noteDraft.paper;
        target.pinned = noteDraft.pinned;
        target.updatedAt = ts;
      }
    } else {
      state.notes.unshift({
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
      });
    }

    state.settings.lastPaper = noteDraft.paper;
    save();
    closeEditor();
    renderAll();
    toast('已保存');
  }

  function deleteNote() {
    if (!noteDraft || !noteDraft.id) { closeEditor(); return; }
    var id = noteDraft.id;
    confirmDialog('确定删除这条备忘录吗？删除后无法恢复。', '删除备忘录').then(function (ok) {
      if (!ok) return;
      state.notes = state.notes.filter(function (n) { return n.id !== id; });
      save();
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

    if (catDraft.id) {
      var target = state.categories.filter(function (c) { return c.id === catDraft.id; })[0];
      if (target) { target.name = name; target.color = catDraft.color; }
    } else {
      var created = { id: uid('cat'), name: name, color: catDraft.color };
      state.categories.push(created);
      state.settings.view = created.id;
    }
    save();
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
      if (noteDraft && noteDraft.categoryId === id) noteDraft.categoryId = null;
      save();
      closeCatEditor();
      renderAll();
      toast('分类已删除');
    });
  }

  /* ---------------- 事件绑定 ---------------- */

  // 侧栏（限定在侧栏内，避免与编辑器里的分类 chip 冲突）
  $('.sidebar').addEventListener('click', function (e) {
    var viewBtn = e.target.closest('[data-view]');
    if (viewBtn) {
      state.settings.view = viewBtn.dataset.view;
      save();
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
      save();
      renderViews(); renderCats(); renderBoard();
    }
  });

  // 看板
  board.addEventListener('click', function (e) {
    var card = e.target.closest('.card');
    if (!card) return;
    var note = state.notes.filter(function (n) { return n.id === card.dataset.id; })[0];
    if (!note) return;

    var actBtn = e.target.closest('[data-act]');
    if (actBtn) {
      var act = actBtn.dataset.act;
      if (act === 'pin') {
        note.pinned = !note.pinned;
        note.updatedAt = Date.now();
        save();
        renderBoard();
        toast(note.pinned ? '已固定到最前' : '已取消固定');
      } else if (act === 'edit') {
        openEditor(note);
      } else if (act === 'del') {
        confirmDialog('确定删除「' + (note.title || '未命名') + '」吗？删除后无法恢复。', '删除备忘录').then(function (ok) {
          if (!ok) return;
          state.notes = state.notes.filter(function (n) { return n.id !== note.id; });
          save();
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
      save();
      renderStats();
      return;
    }

    openEditor(note);
  });

  board.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var card = e.target.closest('.card');
    if (!card || e.target.closest('button')) return;
    e.preventDefault();
    var note = state.notes.filter(function (n) { return n.id === card.dataset.id; })[0];
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
    save();
    renderBoard();
  });

  deskBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    deskPopover.hidden = !deskPopover.hidden;
    deskBtn.setAttribute('aria-expanded', String(!deskPopover.hidden));
  });

  deskGrid.addEventListener('click', function (e) {
    var opt = e.target.closest('[data-desk]');
    if (!opt) return;
    state.settings.desk = opt.dataset.desk;
    applyDesk();
    save();
  });

  document.addEventListener('click', function (e) {
    if (!deskPopover.hidden && !e.target.closest('.desk-picker')) {
      deskPopover.hidden = true;
      deskBtn.setAttribute('aria-expanded', 'false');
    }
  });

  $('#newCatBtn').addEventListener('click', function () { openCatEditor(null); });

  // 备忘录编辑弹窗
  typeSwitch.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-type]');
    if (btn) setType(btn.dataset.type);
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
      if (!deskPopover.hidden) { deskPopover.hidden = true; deskBtn.setAttribute('aria-expanded', 'false'); return; }
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !noteMask.hidden) {
      submitNote(e);
    }
  });

  /* ---------------- 启动 ---------------- */

  sortSelect.value = state.settings.sort;
  renderDeskGrid();
  applyDesk();
  renderAll();
})();
