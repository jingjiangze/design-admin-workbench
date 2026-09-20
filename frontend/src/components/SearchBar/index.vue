<script setup lang="ts">
/** 全局查单搜索框（首页工作台第一层，规格见 docs/HOME_WORKBENCH_SPEC.md） */
defineOptions({
  name: "SearchBar"
});
</script>

<template>
  <div class="search-bar-placeholder">P1B：全局查单（订单号/客户/店铺/关键词）</div>
</template>

<style scoped>
.search-bar-placeholder {
  padding: 16px;
  color: var(--el-text-color-secondary);
}
</style>
