<template>
  <span class="app-status" :class="`app-status--${tone}`">
    <i class="app-status__dot" />
    <span class="app-status__text">{{ label }}</span>
  </span>
</template>

<script setup lang="ts">
/**
 * AppStatus —— 状态点 + 状态文字（Phase UI-R1 §十七：状态色只出现在状态本身）
 * 无背景无边框无彩 Tag；tone 由状态文案自动推断，或显式传入覆盖。
 */
import { computed } from "vue";

type StatusTone = "accent" | "warning" | "success" | "danger" | "neutral";

const props = defineProps<{
  /** 旧系统中文状态标签（原样展示） */
  label: string;
  /** 显式覆盖色调（默认按 label 推断） */
  tone?: StatusTone;
}>();

/** 状态文案 → 色调（与 service/types.ts mapStateToView 的语义归类一致） */
const TONE_BY_LABEL: Record<string, StatusTone> = {
  待接单: "neutral",
  未反馈: "accent",
  设计中: "accent",
  进行中: "accent",
  交稿审核: "warning",
  待审核: "warning",
  审核不通过: "warning",
  审核通过: "success",
  订单完结: "success",
  完结: "success",
  已完成: "success",
  流标: "danger",
  超时: "danger",
  不良: "danger",
  风险: "danger"
};

const tone = computed<StatusTone>(() => {
  if (props.tone) return props.tone;
  return TONE_BY_LABEL[props.label] ?? "neutral";
});
</script>

<style scoped>
.app-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  line-height: 1;
  color: var(--app-text-secondary);
  white-space: nowrap;
}
.app-status__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.app-status--accent .app-status__dot {
  background: var(--app-accent);
}
.app-status--warning .app-status__dot {
  background: var(--app-warning);
}
.app-status--success .app-status__dot {
  background: var(--app-success);
}
.app-status--danger .app-status__dot {
  background: var(--app-danger);
}
.app-status--neutral .app-status__dot {
  background: var(--app-text-faint);
}
</style>
