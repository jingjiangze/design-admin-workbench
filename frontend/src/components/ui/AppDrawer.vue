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
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--app-border);
  flex-shrink: 0;
}
.app-drawer__title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}
.app-drawer__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--app-text);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.app-drawer__close {
  border: none;
  background: transparent;
  color: var(--app-text-faint);
  cursor: pointer;
  padding: 6px;
  border-radius: var(--radius-sm);
  display: inline-flex;
  transition:
    background-color 140ms ease,
    color 140ms ease;
}
.app-drawer__close:hover {
  background: var(--app-surface-hover);
  color: var(--app-text);
}
.app-drawer__subheader {
  margin-top: var(--space-3);
}

.app-drawer__body {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-6) 24px;
  min-height: 0;
}

.app-drawer__footer {
  padding: var(--space-4) 24px;
  border-top: 1px solid var(--app-border);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
</style>
