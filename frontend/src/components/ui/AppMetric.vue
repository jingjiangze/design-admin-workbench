<template>
  <div class="app-metric" :class="`app-metric--${size}`">
    <span class="app-metric__value app-num">{{ value }}</span>
    <span class="app-metric__label">{{ label }}</span>
  </div>
</template>

<script setup lang="ts">
/**
 * AppMetric —— 数字 + 小标题（Phase UI-R1 §十一：统计不做卡片，无边界）
 */
withDefaults(
  defineProps<{
    value: string | number;
    label: string;
    size?: "lg" | "md";
  }>(),
  { size: "md" }
);
</script>

<style scoped>
.app-metric {
  display: inline-flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.app-metric__value {
  font-weight: 600;
  color: var(--app-text);
  line-height: 1.2;
}
.app-metric--md .app-metric__value {
  font-size: 22px;
}
.app-metric--lg .app-metric__value {
  font-size: 34px;
  letter-spacing: -0.02em;
}
.app-metric__label {
  font-size: 12px;
  color: var(--app-text-muted);
  white-space: nowrap;
}
</style>
