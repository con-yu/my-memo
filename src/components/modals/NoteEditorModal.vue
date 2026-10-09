<script setup>
import { computed, nextTick, onMounted, ref } from 'vue';

import { PAPERS, PAPER_PREVIEW } from '@/constants';
import { fmtTime, uid } from '@/utils';
import { useDataStore } from '@/stores/data';
import { useUiStore } from '@/stores/ui';
import { useClipboard } from '@/composables/useClipboard';
import BaseModal from '@/components/base/BaseModal.vue';

const data = useDataStore();
const ui = useUiStore();
const { copyText } = useClipboard();

const source = ui.editingNote;

// 新建时若当前正处在某个分类视图，就把分类预设上
function presetCategory() {
  const preset = data.settings.view;
  return data.categories.some((c) => c.id === preset) ? preset : null;
}

// 草稿：深拷贝，避免直接改动原始 note
const draft = ref({
  id: source ? source.id : null,
  title: source ? source.title : '',
  type: source ? source.type : 'text',
  content: source ? source.content : '',
  todos: source ? source.todos.map((t) => ({ id: t.id, text: t.text, done: t.done })) : [],
  categoryId: source ? source.categoryId : presetCategory(),
  paper: source ? source.paper : (data.settings.lastPaper || 'lined'),
  pinned: source ? source.pinned : false
});

const titleInput = ref(null);
const todoInputs = {}; // 非响应式：仅用于聚焦

const locked = computed(() => !!draft.value.id); // 已存在的备忘不允许改类型
const canCopy = computed(() => locked.value && draft.value.type === 'text');
const categoryChoices = computed(() => [{ id: '', name: '未分类', color: '#b9b2a6' }].concat(data.categories));
const metaText = computed(() => (source
  ? '创建于 ' + fmtTime(source.createdAt) + ' · 修改于 ' + fmtTime(source.updatedAt)
  : ''));

onMounted(() => {
  setTimeout(() => { if (titleInput.value) titleInput.value.focus(); }, 30);
});

function setTodoRef(id, el) {
  if (el) todoInputs[id] = el;
  else delete todoInputs[id];
}

function focusTodo(id) {
  nextTick(() => {
    const el = todoInputs[id];
    if (el) el.focus();
  });
}

function setType(type) {
  if (locked.value) return;
  draft.value.type = type;
}

function addTodo() {
  const item = { id: uid('t'), text: '', done: false };
  draft.value.todos.push(item);
  focusTodo(item.id);
}

function removeTodo(todo) {
  draft.value.todos = draft.value.todos.filter((t) => t.id !== todo.id);
}

// Enter 在末项时追加新条目，否则聚焦下一项；Backspace 在空条目上删除并回到上一项
function onTodoKeydown(e, todo) {
  const list = draft.value.todos;
  const idx = list.indexOf(todo);

  if (e.key === 'Enter') {
    e.preventDefault();
    if (idx === list.length - 1 && todo.text.trim()) {
      const item = { id: uid('t'), text: '', done: false };
      list.splice(idx + 1, 0, item);
      focusTodo(item.id);
    } else {
      const next = list[Math.min(idx + 1, list.length - 1)];
      if (next) focusTodo(next.id);
    }
  }

  if (e.key === 'Backspace' && !e.target.value && list.length > 1) {
    e.preventDefault();
    list.splice(idx, 1);
    const prev = list[Math.max(idx - 1, 0)];
    if (prev) focusTodo(prev.id);
  }
}

function close() {
  ui.noteEditorOpen = false;
  ui.editingNote = null;
}

function copyCurrent() {
  copyText(draft.value.content);
}

function submit() {
  const draftTitle = draft.value.title.trim();
  const content = draft.value.type === 'text' ? draft.value.content.trim() : '';
  const todos = draft.value.type === 'todo'
    ? draft.value.todos
        .map((t) => ({ id: t.id, text: t.text.trim(), done: t.done }))
        .filter((t) => t.text)
    : [];

  let title = draftTitle;
  if (!title && !content && !todos.length) {
    ui.toast('内容还是空的，先写点什么吧');
    return;
  }
  if (!title) title = (content.split('\n')[0] || todos[0].text).slice(0, 20);

  const ts = Date.now();
  let saved;

  if (draft.value.id) {
    const target = data.notes.find((n) => n.id === draft.value.id);
    if (!target) { close(); return; }
    target.title = title;
    target.type = draft.value.type;
    target.content = content;
    target.todos = todos;
    target.categoryId = draft.value.categoryId || null;
    target.paper = draft.value.paper;
    target.pinned = draft.value.pinned;
    target.updatedAt = ts;
    saved = target;
  } else {
    saved = {
      id: uid('n'),
      title,
      type: draft.value.type,
      content,
      todos,
      categoryId: draft.value.categoryId || null,
      paper: draft.value.paper,
      pinned: draft.value.pinned,
      createdAt: ts,
      updatedAt: ts
    };
    data.notes.unshift(saved);
  }

  data.settings.lastPaper = draft.value.paper;
  data.promoteNote(saved); // 编辑/新建后自动排到「固定组之后的第一位」
  data.upsertNote(saved);
  data.patchSettings();
  close();
}

function remove() {
  if (!draft.value.id) { close(); return; }
  const id = draft.value.id;
  ui.confirmDialog('确定删除这条备忘录吗？删除后无法恢复。', '删除备忘录').then((ok) => {
    if (!ok) return;
    data.notes = data.notes.filter((n) => n.id !== id);
    data.removeNote(id);
    close();
    ui.toast('已删除');
  });
}
</script>

<template>
  <BaseModal
    :small="false"
    :sheet-class="'paper-' + draft.paper"
    label="编辑备忘录"
    @close="close"
  >
    <div class="sheet-tape" aria-hidden="true"></div>

    <form
      autocomplete="off"
      novalidate
      @submit.prevent="submit"
      @keydown.meta.enter.prevent="submit"
      @keydown.ctrl.enter.prevent="submit"
    >
      <input
        ref="titleInput"
        v-model="draft.title"
        class="title-input"
        type="text"
        placeholder="标题…"
        maxlength="80"
      />

      <div class="type-switch" :data-locked="String(locked)" role="tablist" aria-label="内容类型">
        <button
          type="button"
          class="type-btn"
          role="tab"
          data-type="text"
          :aria-selected="String(draft.type === 'text')"
          :disabled="locked"
          :aria-disabled="String(locked)"
          @click="setType('text')"
        >文字笔记</button>
        <button
          type="button"
          class="type-btn"
          role="tab"
          data-type="todo"
          :aria-selected="String(draft.type === 'todo')"
          :disabled="locked"
          :aria-disabled="String(locked)"
          @click="setType('todo')"
        >待办清单</button>
      </div>

      <div class="editor-body">
        <label v-show="draft.type !== 'todo'" class="field">
          <textarea
            v-model="draft.content"
            class="content-input"
            rows="6"
            placeholder="随手写点什么…"
          ></textarea>
        </label>

        <div v-show="draft.type === 'todo'" class="todo-editor">
          <ul class="todo-edit-list">
            <li
              v-for="t in draft.todos"
              :key="t.id"
              class="todo-edit-item"
              :class="{ done: t.done }"
              :data-todo="t.id"
            >
              <button
                type="button"
                class="todo-check"
                role="checkbox"
                :aria-checked="String(t.done)"
                @click="t.done = !t.done"
              >
                <svg class="tick" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4.8 12.6l4.6 4.8L19.2 6.6" />
                </svg>
              </button>
              <input
                :ref="(el) => setTodoRef(t.id, el)"
                v-model="t.text"
                class="todo-input"
                type="text"
                placeholder="待办内容…"
                maxlength="120"
                @keydown="onTodoKeydown($event, t)"
              />
              <button type="button" class="todo-del" title="删除" @click="removeTodo(t)">×</button>
            </li>
          </ul>
          <button type="button" class="add-todo" @click="addTodo">+ 添加一条待办</button>
        </div>
      </div>

      <div class="editor-row">
        <span class="row-label">分类</span>
        <div class="chip-row">
          <button
            v-for="c in categoryChoices"
            :key="c.id"
            type="button"
            class="chip"
            :aria-pressed="String(String(draft.categoryId || '') === String(c.id))"
            @click="draft.categoryId = c.id || null"
          >
            <span class="chip-dot" :style="{ '--c': c.color }"></span>{{ c.name }}
          </button>
        </div>
      </div>

      <div class="editor-row">
        <span class="row-label">纸张</span>
        <div class="chip-row">
          <button
            v-for="p in PAPERS"
            :key="p.id"
            type="button"
            class="chip"
            :aria-pressed="String(draft.paper === p.id)"
            @click="draft.paper = p.id"
          >
            <span class="chip-swatch" :style="{ background: PAPER_PREVIEW[p.id] }"></span>{{ p.name }}
          </button>
        </div>
      </div>

      <div class="editor-actions">
        <button v-if="locked" type="button" class="btn btn-danger-ghost" @click="remove">删除</button>
        <button v-if="canCopy" type="button" class="btn btn-ghost" @click="copyCurrent">复制全文</button>
        <span class="spacer"></span>
        <button type="button" class="btn btn-ghost" @click="close">取消</button>
        <button type="submit" class="btn btn-primary">保存</button>
      </div>

      <p class="editor-meta">{{ metaText }}</p>
    </form>
  </BaseModal>
</template>
