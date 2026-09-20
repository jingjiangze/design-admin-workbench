<script setup lang="ts">
/** 统计卡（首页工作台第二层"待处理卡"的数据单元） */
defineOptions({
  name: "StatCard"
});

defineProps<{
  label: string;
  value: string | number;
}>();
</script>

<template>
  <div class="stat-card">
    <span class="stat-card__value">{{ value }}</span>
    <span class="stat-card__label">{{ label }}</span>
  </div>
</template>

<style scoped>
.stat-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 16px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
}

.stat-card__value {
  font-size: 22px;
  font-weight: 600;
}

.stat-card__label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
</style>
