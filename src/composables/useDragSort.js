/* ==========================================================================
   拖动排序：逻辑照搬 legacy/app.js，只把头尾接到 store
   关键取舍：拖拽「期间」直接操作真实 DOM（移动占位符），不写 store，
   避免响应式重排打断拖拽；松手时才把最终顺序一次性落库。
   ========================================================================== */
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

import { sortNotes, useDataStore } from '@/stores/data';

const DRAG_THRESHOLD = 6; // 位移阈值：小于它视为点击（保留「点卡片即编辑」）

// 拖拽刚结束时抑制紧随的那次 click，避免误开编辑器
export const dragSuppressClick = ref(false);

export function useDragSort(boardEl) {
  const data = useDataStore();
  let drag = null; // { id, el, startX, startY, active, placeholder }

  // 当前 DOM 里的卡片顺序（占位符所在位置即被拖卡片的新位置；
  // 被拖的卡片自身已脱离文档流，用占位符代表它，避免重复计数）
  function boardOrder() {
    const seq = [];
    Array.prototype.forEach.call(boardEl.value.children, (child) => {
      if (child === drag.placeholder) { seq.push(drag.id); return; }
      if (child === drag.el) return;
      if (child.classList && child.classList.contains('card')) seq.push(child.dataset.id);
    });
    return seq;
  }

  function startDrag() {
    const el = drag.el;
    const r = el.getBoundingClientRect();
    el.style.width = r.width + 'px';
    el.style.height = r.height + 'px';
    el.style.left = r.left + 'px';
    el.style.top = r.top + 'px';
    el.classList.add('dragging');

    // 占位符顶住原槽位，避免网格塌陷
    const ph = document.createElement('div');
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
    const el = drag.el;
    el.style.transform = 'translate(' + (x - drag.startX) + 'px,' + (y - drag.startY) + 'px) rotate(0deg)';

    // 被拖卡片设了 pointer-events:none，所以这里拿到的是它下面的卡片
    const under = document.elementFromPoint(x, y);
    const over = under && under.closest ? under.closest('.card') : null;
    if (!over || over === el || over === drag.placeholder) return;

    const r = over.getBoundingClientRect();
    if (x < r.left + r.width / 2) boardEl.value.insertBefore(drag.placeholder, over);
    else boardEl.value.insertBefore(drag.placeholder, over.nextSibling);
  }

  function endDrag() {
    if (!drag) return;
    const el = drag.el;
    const ph = drag.placeholder;
    if (!drag.active) { drag = null; return; } // 只是点击，交给 click 处理

    const seq = boardOrder(); // 必须在清空 drag / 移除占位符之前取序
    drag = null;

    el.classList.remove('dragging');
    el.removeAttribute('style');
    if (ph && ph.parentNode) ph.parentNode.removeChild(ph);
    document.body.classList.remove('is-dragging');

    dragSuppressClick.value = true;
    setTimeout(() => { dragSuppressClick.value = false; }, 350);

    data.ensureManualSort(); // 拖一次就切到手动排序（不弹提示）
    data.applyOrder(seq);    // 松手时才写 store，Vue 会按新顺序重排
  }

  function onPointerDown(e) {
    if (e.button !== 0 || drag) return;
    if (e.target.closest('button, a, input, textarea, select')) return;
    const card = e.target.closest('.card');
    if (!card) return;
    drag = {
      id: card.dataset.id,
      el: card,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
      placeholder: null
    };
  }

  function onPointerMove(e) {
    if (!drag) return;
    if (!drag.active) {
      if (Math.abs(e.clientX - drag.startX) + Math.abs(e.clientY - drag.startY) < DRAG_THRESHOLD) return;
      startDrag();
      return;
    }
    e.preventDefault(); // 拖拽中不要选中文字
    moveDrag(e.clientX, e.clientY);
  }

  // 键盘等价操作：Alt + 方向键把卡片前移/后移
  function moveNote(note, dir) {
    const seq = sortNotes(data.notes.slice(), data.settings).map((n) => n.id);
    const i = seq.indexOf(note.id);
    if (i < 0) return;
    const j = i + dir;
    if (j < 0 || j >= seq.length) return;
    seq.splice(j, 0, seq.splice(i, 1)[0]);

    data.ensureManualSort();
    data.applyOrder(seq);

    nextTick(() => {
      const el = boardEl.value && boardEl.value.querySelector('[data-id="' + note.id + '"]');
      if (el) el.focus();
    });
  }

  onMounted(() => {
    const el = boardEl.value;
    if (!el) return;
    el.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointermove', onPointerMove, { passive: false });
    document.addEventListener('pointerup', endDrag);
    document.addEventListener('pointercancel', endDrag);
  });

  onBeforeUnmount(() => {
    const el = boardEl.value;
    if (el) el.removeEventListener('pointerdown', onPointerDown);
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', endDrag);
    document.removeEventListener('pointercancel', endDrag);
  });

  return { moveNote };
}
