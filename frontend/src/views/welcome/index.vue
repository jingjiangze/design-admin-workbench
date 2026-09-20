<script setup lang="ts">
defineOptions({
  name: "Welcome"
});
</script>

<template>
  <div class="workbench-empty">
    <h1>设计工作台</h1>
    <p>首页工作台建设中（规格见 docs/HOME_WORKBENCH_SPEC.md）</p>
    <p>三层结构：全局查单 / 待处理卡 / 品类快捷</p>
  </div>
</template>

<style scoped>
.workbench-empty {
  padding: 24px;
}
.workbench-empty h1 {
  margin-bottom: 12px;
  font-size: 20px;
  font-weight: 600;
}
.workbench-empty p {
  margin: 4px 0;
  color: var(--el-text-color-secondary);
  font-size: 14px;
}
</style>
