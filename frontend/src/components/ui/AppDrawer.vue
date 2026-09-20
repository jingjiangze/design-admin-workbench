<template>
  <ElDrawer
    :model-value="modelValue"
    :size="size"
    :append-to-body="appendToBody"
    :destroy-on-close="destroyOnClose"
    :with-header="false"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="app-drawer">
      <header class="app-drawer__header">
        <div class="app-drawer__title-row">
          <slot name="header">
            <h2 class="app-drawer__title">{{ title }}</h2>
          </slot>
          <button
            class="app-drawer__close"
            type="button"
            aria-label="关闭"
            @click="emit('update:modelValue', false)"
          >
            <AppIcon name="close" :size="16" />
          </button>
        </div>
        <div v-if="$slots.subheader" class="app-drawer__subheader">
          <slot name="subheader" />
        </div>
      </header>

      <div class="app-drawer__body">
        <slot />
      </div>

      <footer v-if="$slots.footer" class="app-drawer__footer">
        <slot name="footer" />
      </footer>
    </div>
  </ElDrawer>
</template>

<script setup lang="ts">
/**
 * AppDrawer —— 项目浮层语言（Phase UI-R1 §二十四/§三十九）
 * 统一宽度/圆角/阴影/内边距；业务侧只管内容
 */
import { ElDrawer } from "element-plus";
import AppIcon from "./AppIcon.vue";

withDefaults(
  defineProps<{
    modelValue: boolean;
    title?: string;
    /** 默认 680（§二十四 订单 Drawer 680~720） */
    size?: number | string;
    appendToBody?: boolean;
    destroyOnClose?: boolean;
  }>(),
  { size: 680, appendToBody: true, destroyOnClose: false }
);

const emit = defineEmits<{ "update:modelValue": [v: boolean] }>();
</script>

<style scoped>
.app-drawer {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--app-surface);
}

.app-drawer__header {
  flex-shrink: 0;
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--app-border);
}

.app-drawer__title-row {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  justify-content: space-between;
}

.app-drawer__title {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 16px;
  font-weight: 600;
  color: var(--app-text);
  white-space: nowrap;
}

.app-drawer__close {
  display: inline-flex;
  padding: 6px;
  color: var(--app-text-faint);
  cursor: pointer;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  transition:
    background-color 140ms ease,
    color 140ms ease;
}

.app-drawer__close:hover {
  color: var(--app-text);
  background: var(--app-surface-hover);
}

.app-drawer__subheader {
  margin-top: var(--space-3);
}

.app-drawer__body {
  flex: 1;
  min-height: 0;
  padding: var(--space-6) 24px;
  overflow-y: auto;
}

.app-drawer__footer {
  display: flex;
  flex-shrink: 0;
  gap: var(--space-2);
  align-items: center;
  padding: var(--space-4) 24px;
  border-top: 1px solid var(--app-border);
}
</style>
