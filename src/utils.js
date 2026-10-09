/* ==========================================================================
   工具函数（与 legacy/app.js 行为保持一致）
   ========================================================================== */

export function uid(prefix) {
  return (prefix || 'id') + '-' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

export function hashOf(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// 依据 id 生成稳定的纸张倾斜与错落偏移，避免每次渲染跳动
// 摆放倾角：按 id 散列在 ±1.25° 内随手摆放的样子
export function tiltOf(id) { return (((hashOf(id) % 21) - 10) / 8).toFixed(2) + 'deg'; }
export function shiftOf(id) { return (hashOf(id + 'shift') % 3) * 7 + 'px'; }

export function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diff = Date.now() - ts;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
  const hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  if (d.toDateString() === now.toDateString()) return '今天 ' + hm;
  if (new Date(now.getTime() - 86400000).toDateString() === d.toDateString()) return '昨天 ' + hm;
  const y = d.getFullYear() === now.getFullYear() ? '' : d.getFullYear() + '年';
  return y + (d.getMonth() + 1) + '月' + d.getDate() + '日';
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
