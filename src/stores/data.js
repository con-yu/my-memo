/* ==========================================================================
   数据 store：备忘录 / 分类 / 偏好 + 与后端的同步
   同步语义与 legacy/app.js 完全一致：
     - 乐观更新（界面先改，随后落库）
     - 偏好增量 PATCH（只提交真正变化的字段，避免多标签页互相覆盖）
     - 600ms 防抖合并，页面隐藏前立即提交
   ========================================================================== */
import { defineStore } from 'pinia';

import { API_BASE, DESK_IDS, PAPER_PREVIEW, SETTINGS_DEFAULTS, SORTS } from '@/constants';
import { clone } from '@/utils';
import { useUiStore } from '@/stores/ui';

/* ---------------- 纯函数：过滤与排序 ---------------- */

function filterNotes(notes, view, query) {
  let list = notes.slice();
  if (view === 'pinned') list = list.filter((n) => n.pinned);
  else if (view === 'todos') list = list.filter((n) => n.type === 'todo');
  else if (view === 'none') list = list.filter((n) => !n.categoryId);
  else if (view !== 'all') list = list.filter((n) => n.categoryId === view);

  if (query) {
    const q = query.toLowerCase();
    list = list.filter((n) =>
      (n.title || '').toLowerCase().includes(q) ||
      (n.content || '').toLowerCase().includes(q) ||
      n.todos.some((t) => (t.text || '').toLowerCase().includes(q))
    );
  }
  return list;
}

// 排序规则（固定在最前，其次按所选方式）。手动排序用 settings.order 里记录的 id 序列。
export function sortNotes(list, settings) {
  const sort = settings.sort;
  const pos = {};
  (settings.order || []).forEach((id, i) => { pos[id] = i; });

  return list.sort((a, b) => {
    if (!!b.pinned - !!a.pinned) return (!!b.pinned - !!a.pinned);
    if (sort === 'manual') {
      const ia = pos[a.id];
      const ib = pos[b.id];
      if (ia === undefined && ib === undefined) return b.updatedAt - a.updatedAt;
      if (ia === undefined) return -1; // 还没排进序列的新笔记放最前
      if (ib === undefined) return 1;
      return ia - ib;
    }
    if (sort === 'created') return b.createdAt - a.createdAt;
    if (sort === 'title') return String(a.title || '').localeCompare(String(b.title || ''), 'zh-Hans-CN');
    return b.updatedAt - a.updatedAt;
  });
}

function normalize(raw) {
  const d = raw && typeof raw === 'object' ? raw : {};
  const s = Object.assign({}, SETTINGS_DEFAULTS, d.settings || {});
  if (DESK_IDS.indexOf(s.desk) < 0) s.desk = 'wood';
  if (SORTS.indexOf(s.sort) < 0) s.sort = 'updated';
  if (!PAPER_PREVIEW[s.lastPaper]) s.lastPaper = 'lined';
  if (typeof s.view !== 'string' || !s.view) s.view = 'all';
  if (!Array.isArray(s.order)) s.order = [];

  return {
    rev: typeof d.rev === 'number' ? d.rev : 0,
    categories: Array.isArray(d.categories) ? d.categories : [],
    notes: (Array.isArray(d.notes) ? d.notes : []).map((n) => {
      n.todos = Array.isArray(n.todos) ? n.todos : [];
      n.type = n.type === 'todo' ? 'todo' : 'text';
      n.paper = PAPER_PREVIEW[n.paper] ? n.paper : 'lined';
      return n;
    }),
    settings: s
  };
}

export const useDataStore = defineStore('data', {
  state: () => ({
    rev: 0,
    notes: [],
    categories: [],
    settings: { ...SETTINGS_DEFAULTS },
    online: false,
    query: '',
    loaded: false,
    // 上次同步成功后、服务端那份偏好的快照（用于增量 diff）
    settingsSynced: null
  }),

  getters: {
    // 当前视图 + 搜索 + 排序后的可见列表
    visibleNotes(state) {
      return sortNotes(filterNotes(state.notes, state.settings.view, state.query), state.settings);
    },

    noteById: (state) => (id) => state.notes.find((n) => n.id === id) || null,

    countOf: (state) => (filter) => state.notes.filter(filter).length,

    openTodoCount: (state) => state.notes.reduce((sum, n) => {
      if (n.type !== 'todo') return sum;
      return sum + n.todos.filter((t) => !t.done).length;
    }, 0),

    statsLine(state) {
      return '共 ' + state.notes.length + ' 条备忘 · ' + this.openTodoCount + ' 项待办未完成';
    },

    // 侧栏「视图」列表
    views(state) {
      const views = [
        { id: 'all',    name: '全部备忘', color: '#f0e2c8', count: state.notes.length },
        { id: 'pinned', name: '已固定',   color: '#d9524a', count: state.notes.filter((n) => n.pinned).length },
        { id: 'todos',  name: '待办清单', color: '#4fb3b3', count: state.notes.filter((n) => n.type === 'todo').length }
      ];
      const uncat = state.notes.filter((n) => !n.categoryId).length;
      if (uncat) views.push({ id: 'none', name: '未分类', color: '#b9b2a6', count: uncat });
      return views;
    },

    categoryCounts(state) {
      const map = {};
      state.notes.forEach((n) => {
        if (!n.categoryId) return;
        map[n.categoryId] = (map[n.categoryId] || 0) + 1;
      });
      return map;
    }
  },

  actions: {
    /* ---------------- 请求 ---------------- */

    // 统一请求出口：返回 { ok, data }，失败时已处理好提示与状态
    async request(method, path, body) {
      const ui = useUiStore();
      const opts = { method, headers: { Accept: 'application/json' } };
      if (body !== undefined) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
      }

      let res;
      try {
        res = await fetch(API_BASE + path, opts);
      } catch (err) {
        // fetch 抛错 = 连不上服务（与 HTTP 错误区分开）
        this.online = false;
        ui.setSync('offline');
        ui.showOffline(err);
        ui.toast('保存失败：' + err.message);
        return { ok: false, data: null };
      }

      if (!res.ok) {
        if (res.status === 401) {
          ui.gotoLogin();
          return { ok: false, data: null };
        }
        ui.setSync('error');
        ui.toast('保存失败：HTTP ' + res.status);
        return { ok: false, data: null };
      }

      const payload = res.status === 204 ? null : await res.json();
      if (payload && typeof payload.rev === 'number') this.rev = payload.rev;
      return { ok: true, data: payload ? payload.data : null };
    },

    // 写操作的统一入口：离线时直接提示，不发请求
    async push(path, method, body) {
      const ui = useUiStore();
      if (!this.online) {
        ui.setSync('offline');
        ui.toast('未连接到服务，改动无法保存');
        return null;
      }
      ui.setSync('busy');
      const res = await this.request(method, path, body);
      if (res.ok) ui.setSync('ok');
      return res.data;
    },

    /* ---------------- 启动加载 ---------------- */

    async load() {
      const ui = useUiStore();
      try {
        const res = await fetch(API_BASE + '/state', { headers: { Accept: 'application/json' } });
        if (!res.ok) {
          if (res.status === 401) { ui.gotoLogin(); return; }
          throw Object.assign(new Error('HTTP ' + res.status), { status: res.status });
        }
        this.applyState(await res.json());
      } catch (err) {
        if (err.status === 401) { ui.gotoLogin(); return; }
        this.online = false;
        ui.showOffline(err);
      }
    },

    applyState(raw) {
      const d = normalize(raw);
      this.rev = d.rev;
      this.notes = d.notes;
      this.categories = d.categories;
      this.settings = d.settings;
      this.online = true;
      this.loaded = true;
      // 同步基线：后续 PATCH 只提交相对它真正变化的字段
      this.settingsSynced = clone(d.settings);
      const ui = useUiStore();
      ui.hideOffline();
      ui.setSync('ok');
    },

    /* ---------------- 备忘 / 分类 ---------------- */

    upsertNote(note) { return this.push('/notes/' + encodeURIComponent(note.id), 'PUT', note); },
    removeNote(id) { return this.push('/notes/' + encodeURIComponent(id), 'DELETE'); },
    upsertCategory(cat) { return this.push('/categories/' + encodeURIComponent(cat.id), 'PUT', cat); },
    removeCategory(id) { return this.push('/categories/' + encodeURIComponent(id), 'DELETE'); },

    /* ---------------- 偏好（增量 + 防抖） ---------------- */

    settingsDiff() {
      if (!this.settingsSynced) return this.settings; // 还没同步过，整体提交
      const body = {};
      Object.keys(this.settings).forEach((k) => {
        if (JSON.stringify(this.settingsSynced[k]) !== JSON.stringify(this.settings[k])) {
          body[k] = this.settings[k];
        }
      });
      return body;
    },

    async flushSettingsNow() {
      this.settingsTimer = null;
      const body = this.settingsDiff();
      if (!Object.keys(body).length) return null; // 没有变化就不打扰服务端
      const data = await this.push('/settings', 'PATCH', body);
      // 以服务端合并后的结果为准，后续 diff 基于它计算
      this.settingsSynced = data || clone(this.settings);
      return data;
    },

    patchSettings(immediate = false) {
      clearTimeout(this.settingsTimer);
      this.settingsTimer = null;
      if (immediate) return this.flushSettingsNow();
      this.settingsTimer = setTimeout(() => this.flushSettingsNow(), 600);
      return Promise.resolve(null);
    },

    // 页面隐藏/离开前把待发送的偏好立即提交，避免防抖期间丢改动
    flushSettings() {
      if (this.settingsTimer) {
        clearTimeout(this.settingsTimer);
        this.settingsTimer = null;
        return this.flushSettingsNow();
      }
      return Promise.resolve(null);
    },

    /* ---------------- 顺序 ---------------- */

    // 拖动/键盘调序后切到手动排序（不额外弹提示）
    ensureManualSort() {
      if (this.settings.sort === 'manual') return;
      this.settings.sort = 'manual';
    },

    // 把一段可见卡片的 id 序列落到 settings.order：
    // 以「当前全量顺序」为底，可见笔记占据的槽位按新序列重排，被筛选掉的笔记位置保持不动
    applyOrder(sequence) {
      const all = sortNotes(this.notes.slice(), this.settings).map((n) => n.id);
      const moved = {};
      sequence.forEach((id) => { moved[id] = true; });
      let i = 0;
      const next = all.map((id) => (moved[id] ? sequence[i++] : id));
      while (i < sequence.length) next.push(sequence[i++]);
      this.settings.order = next;
      this.patchSettings(true); // 拖动是明确动作，立即提交
    },

    // 编辑保存后把这张便签提到「固定组之后的第一位」
    promoteNote(note) {
      const ids = this.notes.map((n) => n.id);
      let order = (this.settings.order || []).filter((id) => id !== note.id && ids.indexOf(id) >= 0);

      // 还没建立过手动顺序（从没拖过）：以当前显示顺序为底，避免把顺序信息丢掉
      if (!order.length) order = sortNotes(this.notes.slice(), this.settings).map((n) => n.id);
      order = order.filter((id) => id !== note.id);

      // 目标下标 = 它前面还有几张固定便签（自己若已固定则直接进固定组最前）
      const pinnedAhead = this.notes.filter((n) => n.pinned && n.id !== note.id).length;
      order.splice(note.pinned ? 0 : pinnedAhead, 0, note.id);

      this.settings.order = order;
      this.patchSettings();
    }
  }
});
