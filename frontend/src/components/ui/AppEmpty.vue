<template>
  <div class="app-empty">
    <AppIcon
      v-if="icon !== 'none'"
      :name="icon"
      :size="18"
      class="app-empty__icon"
    />
    <span class="app-empty__text">{{ text }}</span>
    <div v-if="$slots.default" class="app-empty__extra">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * AppEmpty —— 极简空状态（Phase UI-R1 §三十六：一行说明，禁巨大插画）
 */
import AppIcon from "./AppIcon.vue";

withDefaults(
  defineProps<{
    text: string;
    icon?: "check" | "inbox" | "none";
  }>(),
  { icon: "inbox" }
);
</script>

<style scoped>
.app-empty {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  align-items: center;
  padding: var(--space-8) var(--space-4);
  color: var(--app-text-muted);
}

.app-empty__icon {
  color: var(--app-text-faint);
}

.app-empty__text {
  font-size: 13px;
}

.app-empty__extra {
  margin-top: var(--space-2);
}
</style>
