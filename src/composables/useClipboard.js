/* ==========================================================================
   剪贴板：优先 Clipboard API（要求 HTTPS / localhost），
   站点以 HTTP + IP 直连时该 API 不存在，降级为 execCommand，避免「点了没反应」。
   ========================================================================== */
import { useUiStore } from '@/stores/ui';

function legacyCopy(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (err) {
    return false;
  }
}

export function writeClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text).then(
      () => true,
      () => legacyCopy(text)
    );
  }
  return Promise.resolve(legacyCopy(text));
}

export function useClipboard() {
  const ui = useUiStore();

  // 复制并统一反馈（卡片的复制按钮与编辑器里的按钮共用）
  function copyText(text) {
    const value = String(text == null ? '' : text);
    if (!value.trim()) {
      ui.toast('这条笔记没有可复制的内容');
      return;
    }
    writeClipboard(value).then((ok) => {
      ui.toast(ok ? '已复制全文' : '复制失败，请手动选中复制');
    });
  }

  return { copyText };
}
