<script setup>
// 弹层公共外壳：.mask + .sheet 的结构、点遮罩关闭
const props = defineProps({
  title: { type: String, default: '' },
  label: { type: String, default: '' },          // aria-label，缺省用 title
  role: { type: String, default: 'dialog' },
  sheetClass: { type: [String, Array, Object], default: 'paper-plain' },
  small: { type: Boolean, default: true },
  closeOnMask: { type: Boolean, default: true }
});

const emit = defineEmits(['close']);

function onMaskDown(e) {
  // 与 legacy 一致：只有点在遮罩本身（而非面板内部）才关闭
  if (props.closeOnMask && e.target === e.currentTarget) emit('close');
}
</script>

<template>
  <div class="mask" @mousedown="onMaskDown">
    <div
      class="sheet"
      :class="[small ? 'sheet--sm' : '', sheetClass]"
      :role="role"
      aria-modal="true"
      :aria-label="label || title"
    >
      <h3 v-if="title" class="sheet-title">{{ title }}</h3>
      <slot />
    </div>
  </div>
</template>
