<template>
  <div class="app-shell">
    <AppRail />
    <div class="app-shell__body">
      <AppHeader @open-search="paletteVisible = true" />
      <main class="app-shell__main">
        <router-view />
      </main>
    </div>
    <CommandPalette v-model:visible="paletteVisible" />
  </div>
</template>

<script setup lang="ts">
/**
 * AppShell —— 工作台 UI Shell（Phase UI-R1 §四/§四十七）
 * Rail + Header + Main；pure-admin layout（navbar/tags/setting panel）不再被
 * 任何路由引用 → 模板 UI 对用户不可见（代码保留，§四十七 允许绕过）
 */
import { onBeforeUnmount, onMounted, provide, ref } from "vue";
import AppRail from "./AppRail.vue";
import AppHeader from "./AppHeader.vue";
import CommandPalette from "./CommandPalette.vue";

const paletteVisible = ref(false);

/** 页面（如首页大搜索框）唤起全局搜索 */
provide("openCommandPalette", () => {
  paletteVisible.value = true;
});

/** 全局快捷键："/" 或 Ctrl/Cmd+K 打开搜索（输入态不劫持） */
function onKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null;
  const typing =
    target &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable);
  if (typing) return;
  if (
    e.key === "/" ||
    ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")
  ) {
    e.preventDefault();
    paletteVisible.value = true;
  }
}

onMounted(() => document.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => document.removeEventListener("keydown", onKeydown));
</script>

<style scoped>
.app-shell {
  display: flex;
  min-height: 100vh;
  background: var(--app-bg);
}

.app-shell__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.app-shell__main {
  flex: 1;
  width: 100%;
  max-width: var(--content-max);
  padding: var(--space-8) var(--space-8) var(--space-8);
  margin: 0 auto;
}

@media (width <= 960px) {
  .app-shell__main {
    padding: var(--space-6) var(--space-4);
  }
}
</style>
