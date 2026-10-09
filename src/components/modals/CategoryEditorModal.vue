<script setup>
import { onMounted, ref } from 'vue';

import { CAT_COLORS } from '@/constants';
import { uid } from '@/utils';
import { useDataStore } from '@/stores/data';
import { useUiStore } from '@/stores/ui';
import BaseModal from '@/components/base/BaseModal.vue';

const data = useDataStore();
const ui = useUiStore();

// 组件由 v-if 控制挂载，每次打开都是新实例，直接初始化草稿即可
const editing = ui.editingCategory;
const draft = ref(editing
  ? { id: editing.id, name: editing.name, color: editing.color }
  : { id: null, name: '', color: CAT_COLORS[Math.floor(Math.random() * CAT_COLORS.length)] });

const nameInput = ref(null);

onMounted(() => {
  setTimeout(() => { if (nameInput.value) nameInput.value.focus(); }, 30);
});

function close() {
  ui.categoryEditorOpen = false;
  ui.editingCategory = null;
}

function submit() {
  const name = draft.value.name.trim();
  if (!name) {
    ui.toast('分类名称不能为空');
    if (nameInput.value) nameInput.value.focus();
    return;
  }

  let saved;
  if (draft.value.id) {
    const target = data.categories.find((c) => c.id === draft.value.id);
    if (!target) { close(); return; }
    target.name = name;
    target.color = draft.value.color;
    saved = target;
  } else {
    saved = { id: uid('cat'), name, color: draft.value.color };
    data.categories.push(saved);
    data.settings.view = saved.id;
  }

  data.upsertCategory(saved);
  data.patchSettings();
  close();
  ui.toast('分类已保存');
}

function remove() {
  const id = draft.value.id;
  if (!id) return;
  const cat = data.categories.find((c) => c.id === id);
  if (!cat) return;

  const used = data.notes.filter((n) => n.categoryId === id).length;
  close();

  ui.confirmDialog(
    '删除分类「' + cat.name + '」？' + (used ? '该分类下的 ' + used + ' 条备忘会变成「未分类」，不会被删除。' : ''),
    '删除分类'
  ).then((ok) => {
    if (!ok) return;
    data.notes.forEach((n) => { if (n.categoryId === id) n.categoryId = null; });
    data.categories = data.categories.filter((c) => c.id !== id);
    if (data.settings.view === id) data.settings.view = 'all';
    data.removeCategory(id);
    data.patchSettings();
    ui.toast('分类已删除');
  });
}
</script>

<template>
  <BaseModal :title="draft.id ? '编辑分类' : '新建分类'" label="编辑分类" @close="close">
    <form autocomplete="off" novalidate @submit.prevent="submit">
      <label class="field">
        <span class="field-label">名称</span>
        <input
          ref="nameInput"
          v-model="draft.name"
          class="line-input"
          type="text"
          maxlength="16"
          placeholder="例如：工作"
        />
      </label>

      <div class="editor-row">
        <span class="row-label">颜色</span>
        <div class="chip-row">
          <button
            v-for="c in CAT_COLORS"
            :key="c"
            type="button"
            class="color-chip"
            :aria-pressed="String(draft.color === c)"
            :style="{ '--c': c }"
            :title="c"
            @click="draft.color = c"
          ></button>
        </div>
      </div>

      <div class="editor-actions">
        <button v-if="draft.id" type="button" class="btn btn-danger-ghost" @click="remove">删除分类</button>
        <span class="spacer"></span>
        <button type="button" class="btn btn-ghost" @click="close">取消</button>
        <button type="submit" class="btn btn-primary">保存</button>
      </div>
    </form>
  </BaseModal>
</template>
