<script setup>
import { useUiStore } from '@/stores/ui';
import BaseModal from '@/components/base/BaseModal.vue';

const ui = useUiStore();
</script>

<template>
  <BaseModal
    :title="ui.confirmTitle"
    label="确认操作"
    role="alertdialog"
    @close="ui.closeConfirm(false)"
  >
    <p class="confirm-text">{{ ui.confirmText }}</p>

    <div class="editor-actions">
      <span class="spacer"></span>
      <button type="button" class="btn btn-ghost" @click="ui.closeConfirm(false)">取消</button>
      <button type="button" class="btn btn-danger" @click="ui.closeConfirm(true)">确定</button>
    </div>
  </BaseModal>
</template>
