<template>
  <div class="app-skeleton" aria-busy="true">
    <div
      v-for="(w, i) in widths"
      :key="i"
      class="app-skeleton__row"
      :class="{ 'app-skeleton__row--table': type === 'table' }"
      :style="{ width: w }"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * AppSkeleton —— 局部骨架（Phase UI-R1 §三十五：禁整页 Loading）
 */
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    rows?: number;
    /** table = 行高等高的表格式骨架 */
    type?: "text" | "table";
  }>(),
  { rows: 3, type: "text" }
);

const widthPool = ["100%", "92%", "96%", "84%", "90%", "76%"];
const widths = computed(() =>
  Array.from({ length: props.rows }, (_, i) => widthPool[i % widthPool.length])
);
</script>

<style scoped>
.app-skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-2) 0;
}
.app-skeleton__row {
  height: 14px;
  border-radius: var(--radius-sm);
  background: #eeeeec;
  animation: app-skeleton-breath 1.2s ease-in-out infinite;
}
.app-skeleton__row--table {
  height: 34px;
}
@keyframes app-skeleton-breath {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.55;
  }
}
</style>
