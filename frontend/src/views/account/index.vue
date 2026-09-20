<script setup lang="ts">
defineOptions({
  name: "Account"
});
</script>

<template>
  <div class="placeholder">
    <h2>账户中心</h2>
    <p>我的信息/密码/工具外链</p>
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
