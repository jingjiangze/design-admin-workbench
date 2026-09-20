<template>
  <ElDialog
    :model-value="modelValue"
    :title="title"
    :width="width"
    :append-to-body="appendToBody"
    :close-on-click-modal="false"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <slot />
    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
  </ElDialog>
</template>

<script setup lang="ts">
/**
 * AppDialog —— 极简确认/表单弹窗（Phase UI-R1 §三十：不需要复杂表单）
 */
import { ElDialog } from "element-plus";

withDefaults(
  defineProps<{
    modelValue: boolean;
    title?: string;
    width?: number | string;
    appendToBody?: boolean;
  }>(),
  { width: 440, appendToBody: true }
);

const emit = defineEmits<{ "update:modelValue": [v: boolean] }>();
</script>

<style scoped>
:deep(.el-dialog__header) {
  padding-bottom: 8px;
  margin-right: 0;
}
:deep(.el-dialog__title) {
  font-size: 15px;
  font-weight: 600;
  color: var(--app-text);
}
:deep(.el-dialog__body) {
  padding-top: 8px;
  color: var(--app-text-secondary);
}
</style>
