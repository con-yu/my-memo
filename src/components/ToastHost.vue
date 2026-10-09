<script setup>
import { useUiStore } from '@/stores/ui';

const ui = useUiStore();
</script>

<template>
  <div class="toast" :class="{ show: ui.toastShown }" :hidden="!ui.toastText">{{ ui.toastText }}</div>
</template>
