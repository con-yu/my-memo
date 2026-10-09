/* ==========================================================================
   UI 状态：Toast / 离线遮罩 / 确认框 / 登录跳转
   时序与 legacy/app.js 保持一致（Toast 先插入再加 .show 触发过渡）
   ========================================================================== */
import { defineStore } from 'pinia';

// 定时器与 confirm 的 resolve 放在模块级，避免被响应式包装
let toastTimer = null;
let toastHideTimer = null;
let confirmResolve = null;

// 顶栏的同步状态文案（与 legacy 的 setSync 一致）
const SYNC_TEXT = {
  ok: '已同步到服务器',
  busy: '同步中…',
  error: '同步失败',
  offline: '未连接服务'
};

export const useUiStore = defineStore('ui', {
  state: () => ({
    toastText: '',
    toastShown: false,
    offlineVisible: false,
    offlineText: '',
    confirmVisible: false,
    confirmTitle: '请确认',
    confirmText: '',
    syncState: 'busy',

    // 弹窗状态：组件直接读写，省掉层层 emit
    deskOpen: false,
    noteEditorOpen: false,
    editingNote: null,        // null 表示新建
    categoryEditorOpen: false,
    editingCategory: null     // null 表示新建
  }),

  getters: {
    syncText: (state) => SYNC_TEXT[state.syncState] || ''
  },

  actions: {
    setSync(mode) {
      // legacy 的 setSync 支持自定义文案，这里只用四种固定状态
      if (SYNC_TEXT[mode]) this.syncState = mode;
    },

    toast(msg) {
      clearTimeout(toastTimer);
      clearTimeout(toastHideTimer);
      this.toastText = msg;
      this.toastShown = false;
      requestAnimationFrame(() => { this.toastShown = true; });
      toastTimer = setTimeout(() => {
        this.toastShown = false;
        toastHideTimer = setTimeout(() => { this.toastText = ''; }, 220);
      }, 2600);
    },

    showOffline(err) {
      this.offlineText = '无法连接后端服务（' + (err && err.message ? err.message : '网络错误') +
        '）。备忘录数据由服务端保存，请确认服务已启动后重试。';
      this.offlineVisible = true;
    },

    hideOffline() {
      this.offlineVisible = false;
    },

    // 会话失效（登录过期/被登出）→ 去登录页，登录后回到当前地址
    gotoLogin() {
      const next = location.pathname + location.search;
      setTimeout(() => {
        location.href = '/login?next=' + encodeURIComponent(next);
      }, 600);
    },

    confirmDialog(text, title) {
      this.confirmTitle = title || '请确认';
      this.confirmText = text;
      this.confirmVisible = true;
      return new Promise((resolve) => { confirmResolve = resolve; });
    },

    closeConfirm(ok) {
      this.confirmVisible = false;
      if (confirmResolve) {
        confirmResolve(!!ok);
        confirmResolve = null;
      }
    }
  }
});
