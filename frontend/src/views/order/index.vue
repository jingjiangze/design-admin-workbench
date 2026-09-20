<script setup lang="ts">
defineOptions({
  name: "Order"
});
</script>

<template>
  <div class="placeholder">
    <h2>订单中心</h2>
    <p>订单列表（12 态收敛 6 视图）</p>
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
