<script setup lang="ts">
/**
 * 批量操作栏（跨页勾选 + 3 种复制格式，规格见 docs/BATCH_ORDER_OPERATION_SPEC.md）
 * 复用设计：useBatchSelection() composable + 本组件
 */
defineOptions({
  name: "BatchActionBar"
});
</script>

<template>
  <div class="batch-bar-placeholder">
    P1B：跨页勾选 / 复制订单号（顿号/逗号/逐行）
  </div>
</template>

<style scoped>
.batch-bar-placeholder {
  padding: 16px;
  color: var(--el-text-color-secondary);
}
</style>
