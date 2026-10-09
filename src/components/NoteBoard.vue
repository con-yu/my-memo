<script setup>
import { computed, ref } from 'vue';

import { useDataStore } from '@/stores/data';
import { useNoteActions } from '@/composables/useNoteActions';
import { useDragSort } from '@/composables/useDragSort';
import MemoCard from '@/components/MemoCard.vue';

const data = useDataStore();
const actions = useNoteActions();

const boardEl = ref(null);
const { moveNote } = useDragSort(boardEl);

const notes = computed(() => data.visibleNotes);
const categoryById = computed(() => (id) => data.categories.find((c) => c.id === id) || null);

const emptyText = computed(() => {
  if (!data.notes.length) {
    return data.categories.length
      ? '点右上角「新建备忘录」，写下第一条吧。'
      : '还没有内容。先在左侧新建一个分类，再写下第一条备忘吧。';
  }
  return '当前筛选条件下没有内容，换个分类或清空搜索试试。';
});

// 卡片的键盘操作：Alt + 方向键调序；Enter / Space 打开编辑器
function onKeydown(e) {
  const card = e.target.closest('.card');
  if (!card) return;
  const note = data.noteById(card.dataset.id);
  if (!note) return;

  if (e.altKey && e.key.indexOf('Arrow') === 0) {
    e.preventDefault();
    moveNote(note, (e.key === 'ArrowLeft' || e.key === 'ArrowUp') ? -1 : 1);
    return;
  }

  if (e.key !== 'Enter' && e.key !== ' ') return;
  if (e.target.closest('button')) return;
  e.preventDefault();
  actions.openEditor(note);
}
</script>

<template>
  <section class="board-wrap">
    <div ref="boardEl" class="board" @keydown="onKeydown">
      <MemoCard
        v-for="note in notes"
        :key="note.id"
        :note="note"
        :category="categoryById(note.categoryId)"
        @edit="actions.openEditor"
        @pin="actions.pinNote"
        @copy="actions.copyNote"
        @remove="actions.removeNote"
        @toggle-todo="actions.toggleTodo"
      />
    </div>

    <div v-if="!notes.length" class="empty">
      <div class="empty-note">
        <h3>空空的桌面</h3>
        <p>{{ emptyText }}</p>
      </div>
    </div>
  </section>
</template>
