<script setup>
import { onBeforeUnmount, onMounted, watch } from 'vue';

import { useDataStore } from '@/stores/data';
import { useUiStore } from '@/stores/ui';
import TopBar from '@/components/TopBar.vue';
import SideBar from '@/components/SideBar.vue';
import NoteBoard from '@/components/NoteBoard.vue';
import ToastHost from '@/components/ToastHost.vue';
import NoteEditorModal from '@/components/modals/NoteEditorModal.vue';
import CategoryEditorModal from '@/components/modals/CategoryEditorModal.vue';
import DeskModal from '@/components/modals/DeskModal.vue';
import ConfirmModal from '@/components/modals/ConfirmModal.vue';
import OfflineModal from '@/components/modals/OfflineModal.vue';

const data = useDataStore();
const ui = useUiStore();

// 桌面材质写在 body 上（CSS 按 body[data-desk] 取背景）
watch(
  () => data.settings.desk,
  (desk) => { document.body.dataset.desk = desk; },
  { immediate: true }
);

// 页面隐藏/离开前把待发送的偏好立即提交，避免防抖期间丢改动
function onVisibility() {
  if (document.visibilityState === 'hidden') data.flushSettings();
}

// Escape 关闭当前弹层（优先级与 legacy 一致）
function onKeydown(e) {
  if (e.key !== 'Escape') return;
  if (ui.confirmVisible) { ui.closeConfirm(false); return; }
  if (ui.categoryEditorOpen) { ui.editingCategory = null; ui.categoryEditorOpen = false; return; }
  if (ui.noteEditorOpen) { ui.editingNote = null; ui.noteEditorOpen = false; return; }
  if (ui.deskOpen) { ui.deskOpen = false; return; }
}

onMounted(() => {
  data.load();
  window.addEventListener('pagehide', data.flushSettings);
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('pagehide', data.flushSettings);
  document.removeEventListener('visibilitychange', onVisibility);
  document.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <TopBar />

  <main class="layout">
    <SideBar />
    <NoteBoard />
  </main>

  <NoteEditorModal v-if="ui.noteEditorOpen" />
  <CategoryEditorModal v-if="ui.categoryEditorOpen" />
  <DeskModal v-if="ui.deskOpen" />
  <ConfirmModal v-if="ui.confirmVisible" />
  <OfflineModal v-if="ui.offlineVisible" />

  <ToastHost />
</template>
