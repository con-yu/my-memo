<script setup>
import { DESKS } from '@/constants';
import { useDataStore } from '@/stores/data';
import { useUiStore } from '@/stores/ui';
import BaseModal from '@/components/base/BaseModal.vue';

const data = useDataStore();
const ui = useUiStore();

// 选中即生效（body[data-desk] 由 App.vue 的 watch 同步），并走 600ms 防抖保存
function pick(id) {
  data.settings.desk = id;
  data.patchSettings();
}

function close() {
  ui.deskOpen = false;
  data.patchSettings(true); // 关闭时立即提交，避免防抖窗口内丢改动
}
</script>

<template>
  <BaseModal title="桌面材质" label="选择桌面材质" @close="close">
    <div class="desk-grid">
      <button
        v-for="d in DESKS"
        :key="d.id"
        type="button"
        class="desk-option"
        :data-desk="d.id"
        :aria-pressed="String(data.settings.desk === d.id)"
        @click="pick(d.id)"
      >
        <span class="swatch" :class="'sw-' + d.id"></span>
        <span class="name">{{ d.name }}</span>
      </button>
    </div>

    <div class="editor-actions">
      <span class="spacer"></span>
      <button type="button" class="btn btn-primary" @click="close">完成</button>
    </div>
  </BaseModal>
</template>
