<script setup lang="ts">
defineOptions({
  name: "Category"
});
</script>

<template>
  <div class="placeholder">
    <h2>品类中心</h2>
    <p>428 unique goodsid 按 5 业务分组</p>
    <p class="note">P1B 业务实现</p>
  </div>
</template>

<style scoped>
.placeholder {
  padding: 24px;
}

.placeholder h2 {
  margin-bottom: 12px;
  font-size: 18px;
  font-weight: 600;
}

.placeholder p {
  margin: 4px 0;
  color: var(--el-text-color-secondary);
}

.placeholder .note {
  font-size: 12px;
}
</style>
