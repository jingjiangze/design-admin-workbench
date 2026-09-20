<script setup lang="ts">
defineOptions({
  name: "Expedite"
});
</script>

<template>
  <div class="placeholder">
    <h2>催单中心</h2>
    <p>生成催单文本/复制催单文本/加入催单清单</p>
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
