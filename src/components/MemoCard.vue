<script setup>
import { computed } from 'vue';

import { fmtTime, shiftOf, tiltOf } from '@/utils';
import { dragSuppressClick } from '@/composables/useDragSort';
import CardTodoList from '@/components/CardTodoList.vue';

const props = defineProps({
  note: { type: Object, required: true },
  category: { type: Object, default: null }
});

const emit = defineEmits(['edit', 'pin', 'copy', 'remove', 'toggle-todo']);

const isTodo = computed(() => props.note.type === 'todo');
const doneCount = computed(() => props.note.todos.filter((t) => t.done).length);
// 只有文字笔记且有正文时才提供复制（清单类内容不适合整体复制）
const canCopy = computed(() => !isTodo.value && !!String(props.note.content || '').trim());
const isoTime = computed(() => new Date(props.note.updatedAt).toISOString());

// 点击卡片即编辑；但刚拖拽结束的那次 click 要忽略
function onClick() {
  if (dragSuppressClick.value) return;
  emit('edit', props.note);
}
</script>

<template>
  <article
    class="card"
    :class="'paper-' + note.paper"
    :data-id="note.id"
    tabindex="0"
    :style="{ '--tilt': tiltOf(note.id), '--shift': shiftOf(note.id) }"
    :aria-label="note.title || '未命名'"
    @click="onClick"
  >
    <span v-if="note.pinned" class="card-tape" aria-hidden="true"></span>

    <header class="card-head">
      <span v-if="category" class="cat-tag" :style="{ '--c': category.color }">{{ category.name }}</span>
      <span v-else></span>

      <span class="card-tools">
        <button
          type="button"
          class="tool-btn"
          :class="{ on: note.pinned }"
          :title="note.pinned ? '取消固定' : '固定到最前'"
          @click.stop="emit('pin', note)"
        >{{ note.pinned ? '★' : '☆' }}</button>
        <button
          v-if="canCopy"
          type="button"
          class="tool-btn"
          title="复制全文"
          @click.stop="emit('copy', note)"
        >📋</button>
        <button type="button" class="tool-btn" title="删除" @click.stop="emit('remove', note)">🗑</button>
      </span>
    </header>

    <h3 v-if="note.title" class="card-title">{{ note.title }}</h3>

    <CardTodoList
      v-if="isTodo && note.todos.length"
      :todos="note.todos"
      @toggle="(t) => emit('toggle-todo', note, t)"
    />
    <p v-else-if="isTodo" class="card-text">（空清单）</p>
    <p v-else class="card-text">{{ note.content }}</p>

    <footer class="card-foot">
      <span v-if="isTodo" class="todo-progress">{{ doneCount }}/{{ note.todos.length }} 已完成</span>
      <span v-else>文字笔记</span>
      <span class="foot-spacer"></span>
      <time :datetime="isoTime">{{ fmtTime(note.updatedAt) }}</time>
    </footer>
  </article>
</template>
