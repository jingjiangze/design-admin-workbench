<template>
  <button
    class="app-btn"
    :class="[`app-btn--${variant}`, `app-btn--${size}`]"
    :type="nativeType"
    :disabled="disabled || loading"
    @click="emit('click', $event)"
  >
    <AppIcon v-if="icon" :name="icon" :size="size === 'sm' ? 14 : 15" />
    <slot />
  </button>
</template>

<script setup lang="ts">
/**
 * AppButton —— 项目按钮语言（Phase UI-R1 §四十）
 * solid=近黑实底 / ghost=白底细边 / text=轻量文字 / danger=危险
 */
import AppIcon from "./AppIcon.vue";

withDefaults(
  defineProps<{
    variant?: "solid" | "ghost" | "text" | "danger";
    size?: "sm" | "md";
    icon?: InstanceType<typeof AppIcon>["$props"]["name"];
    disabled?: boolean;
    loading?: boolean;
    nativeType?: "button" | "submit";
  }>(),
  { variant: "solid", size: "md", nativeType: "button" }
);

const emit = defineEmits<{ click: [e: MouseEvent] }>();
</script>

<style scoped>
.app-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  font-family: inherit;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition:
    background-color 140ms ease,
    border-color 140ms ease,
    color 140ms ease,
    opacity 140ms ease;
}
.app-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.app-btn--md {
  height: 34px;
  padding: 0 14px;
  font-size: 13.5px;
}
.app-btn--sm {
  height: 28px;
  padding: 0 10px;
  font-size: 12.5px;
}

.app-btn--solid {
  background: var(--app-accent);
  color: var(--app-accent-text);
}
.app-btn--solid:hover:not(:disabled) {
  background: var(--app-accent-hover);
}

.app-btn--ghost {
  background: var(--app-surface);
  border-color: var(--app-border-strong);
  color: var(--app-text);
}
.app-btn--ghost:hover:not(:disabled) {
  border-color: rgba(0, 0, 0, 0.28);
  background: var(--app-surface);
}

.app-btn--text {
  background: transparent;
  color: var(--app-text-secondary);
}
.app-btn--text:hover:not(:disabled) {
  color: var(--app-text);
  background: var(--app-surface-hover);
}

.app-btn--danger {
  background: var(--app-surface);
  border-color: rgba(198, 72, 62, 0.4);
  color: var(--app-danger);
}
.app-btn--danger:hover:not(:disabled) {
  background: var(--app-danger-soft);
  border-color: var(--app-danger);
}
</style>
