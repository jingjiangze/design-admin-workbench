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
  gap: 6px;
  align-items: center;
  font-family: inherit;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  transition:
    background-color 140ms ease,
    border-color 140ms ease,
    color 140ms ease,
    opacity 140ms ease;
}

.app-btn:disabled {
  cursor: not-allowed;
  opacity: 0.45;
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
  color: var(--app-accent-text);
  background: var(--app-accent);
}

.app-btn--solid:hover:not(:disabled) {
  background: var(--app-accent-hover);
}

.app-btn--ghost {
  color: var(--app-text);
  background: var(--app-surface);
  border-color: var(--app-border-strong);
}

.app-btn--ghost:hover:not(:disabled) {
  background: var(--app-surface);
  border-color: var(--app-border-hover);
}

.app-btn--text {
  color: var(--app-text-secondary);
  background: transparent;
}

.app-btn--text:hover:not(:disabled) {
  color: var(--app-text);
  background: var(--app-surface-hover);
}

.app-btn--danger {
  color: var(--app-danger);
  background: var(--app-surface);
  border-color: color-mix(in srgb, var(--app-danger) 40%, transparent);
}

.app-btn--danger:hover:not(:disabled) {
  background: var(--app-danger-soft);
  border-color: var(--app-danger);
}
</style>
