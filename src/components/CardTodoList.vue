<script setup>
defineProps({
  todos: { type: Array, required: true }
});

defineEmits(['toggle']);
</script>

<template>
  <ul class="todo-list">
    <li
      v-for="t in todos"
      :key="t.id"
      class="todo-item"
      :class="{ done: t.done }"
      :data-todo="t.id"
    >
      <button
        type="button"
        class="todo-check"
        role="checkbox"
        :aria-checked="String(t.done)"
        aria-label="勾选待办"
        @click.stop="$emit('toggle', t)"
      >
        <svg class="tick" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4.8 12.6l4.6 4.8L19.2 6.6" />
        </svg>
      </button>
      <span class="todo-text">{{ t.text }}</span>
    </li>
  </ul>
</template>
