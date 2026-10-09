/* ==========================================================================
   备忘的常用操作：编辑 / 勾选 / 固定 / 复制 / 删除
   对应 legacy/app.js 中 board 的事件委托分支
   ========================================================================== */
import { useDataStore } from '@/stores/data';
import { useUiStore } from '@/stores/ui';
import { useClipboard } from '@/composables/useClipboard';

export function useNoteActions() {
  const data = useDataStore();
  const ui = useUiStore();
  const { copyText } = useClipboard();

  function openEditor(note) {
    ui.editingNote = note || null;
    ui.noteEditorOpen = true;
  }

  // 卡片内勾选待办：乐观更新，随后落库
  function toggleTodo(note, todo) {
    todo.done = !todo.done;
    note.updatedAt = Date.now();
    data.upsertNote(note);
  }

  function pinNote(note) {
    note.pinned = !note.pinned;
    note.updatedAt = Date.now();
    data.upsertNote(note);
    ui.toast(note.pinned ? '已固定到最前' : '已取消固定');
  }

  function copyNote(note) {
    copyText(note.content);
  }

  function removeNote(note) {
    ui.confirmDialog(
      '确定删除「' + (note.title || '未命名') + '」吗？删除后无法恢复。',
      '删除备忘录'
    ).then((ok) => {
      if (!ok) return;
      data.notes = data.notes.filter((n) => n.id !== note.id);
      data.removeNote(note.id);
      ui.toast('已删除');
    });
  }

  return { openEditor, toggleTodo, pinNote, copyNote, removeNote };
}
