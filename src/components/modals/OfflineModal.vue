<script setup>
import { useDataStore } from '@/stores/data';
import { useUiStore } from '@/stores/ui';
import BaseModal from '@/components/base/BaseModal.vue';

const data = useDataStore();
const ui = useUiStore();
</script>

<template>
  <BaseModal
    title="未连接到服务"
    label="未连接到服务"
    role="alertdialog"
    :close-on-mask="false"
  >
    <p class="confirm-text">{{ ui.offlineText }}</p>
    <p class="offline-hint">
      本地启动：<code>node server.js</code> 后访问 <code>http://127.0.0.1:5058/</code>
    </p>

    <div class="editor-actions">
      <span class="spacer"></span>
      <button type="button" class="btn btn-primary" @click="data.load()">重试连接</button>
    </div>
  </BaseModal>
</template>
