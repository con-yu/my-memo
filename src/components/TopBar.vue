<script setup>
import { computed } from 'vue';

import { useDataStore } from '@/stores/data';
import { useUiStore } from '@/stores/ui';

const data = useDataStore();
const ui = useUiStore();

const SORT_OPTIONS = [
  { value: 'updated', label: '最近修改' },
  { value: 'created', label: '创建时间' },
  { value: 'title', label: '标题' },
  { value: 'manual', label: '手动排序' }
];

const search = computed({
  get: () => data.query,
  set: (v) => { data.query = v; }
});

const sort = computed({
  get: () => data.settings.sort,
  set: (v) => {
    data.settings.sort = v;
    data.patchSettings();
  }
});

function newNote() {
  ui.editingNote = null;
  ui.noteEditorOpen = true;
}

function openDesk() {
  ui.deskOpen = true;
}
</script>

<template>
  <header class="topbar">
    <div class="brand">
      <span class="brand-pin" aria-hidden="true"></span>
      <div class="brand-text">
        <h1>我的备忘录</h1>
        <p>Memo &amp; To-do Board</p>
      </div>
    </div>

    <div class="toolbar">
      <label class="search">
        <svg viewBox="0 0 24 24" class="ico" aria-hidden="true">
          <circle cx="11" cy="11" r="6.4" />
          <path d="M15.8 15.8 20.5 20.5" />
        </svg>
        <input
          v-model="search"
          type="search"
          placeholder="搜索标题 / 内容 / 待办…"
          autocomplete="off"
        />
      </label>

      <label class="select-wrap">
        <span class="select-label">排序</span>
        <select v-model="sort">
          <option v-for="o in SORT_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
      </label>

      <button
        class="btn btn-ghost"
        :aria-expanded="String(ui.deskOpen)"
        aria-haspopup="dialog"
        aria-controls="deskMask"
        @click="openDesk"
      >
        <span class="desk-preview" :class="'sw-' + data.settings.desk" id="deskPreview" aria-hidden="true"></span>
        桌面
      </button>

      <button class="btn btn-primary" @click="newNote">新建备忘录</button>

      <!-- 右上角账号菜单：由账号服务的通用组件挂进来（见 index.html） -->
      <span class="account-slot"></span>
    </div>
  </header>
</template>
