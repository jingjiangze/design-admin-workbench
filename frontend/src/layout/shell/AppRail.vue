<template>
  <nav class="app-rail" aria-label="主导航">
    <ElTooltip
      v-for="item in NAV_ITEMS"
      :key="item.path"
      :content="item.title"
      placement="right"
      :show-after="300"
      :hide-after="0"
    >
      <RouterLink
        :to="item.path"
        class="app-rail__item"
        :class="{ 'app-rail__item--active': isActive(item) }"
        :aria-label="item.title"
        :aria-current="isActive(item) ? 'page' : undefined"
      >
        <span class="app-rail__accent" />
        <AppIcon :name="item.icon" :size="19" />
      </RouterLink>
    </ElTooltip>
  </nav>
</template>

<script setup lang="ts">
/**
 * AppRail —— 60px 紧凑图标导航（Phase UI-R1 §四/§五）
 * 只保留 6 项；当前项 = 浅底色 + 左侧极细强调线；hover 右浮文字
 */
import { useRoute } from "vue-router";
import { ElTooltip } from "element-plus";
import AppIcon from "@/components/ui/AppIcon.vue";

type RailIcon =
  | "home"
  | "orders"
  | "bell"
  | "income"
  | "grid"
  | "user";

const NAV_ITEMS: Array<{
  path: string;
  title: string;
  icon: RailIcon;
  /** 匹配的路由 name 前缀（当前项判定） */
  match: string[];
}> = [
  { path: "/welcome", title: "工作台", icon: "home", match: ["Welcome"] },
  { path: "/order/index", title: "订单", icon: "orders", match: ["OrderList"] },
  { path: "/expedite/index", title: "催稿", icon: "bell", match: ["ExpediteList"] },
  { path: "/income/index", title: "收入", icon: "income", match: ["IncomeOverview"] },
  { path: "/category/index", title: "品类", icon: "grid", match: ["CategoryList"] },
  { path: "/account/index", title: "账户", icon: "user", match: ["AccountInfo"] }
];

const route = useRoute();

function isActive(item: { match: string[] }): boolean {
  return item.match.includes(String(route.name ?? ""));
}
</script>

<style scoped>
.app-rail {
  width: var(--rail-width);
  flex-shrink: 0;
  height: 100vh;
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-3) 0;
  background: var(--app-surface);
  border-right: 1px solid var(--app-border);
  z-index: 30;
}

.app-rail__item {
  position: relative;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  color: var(--app-text-muted);
  transition:
    background-color 140ms ease,
    color 140ms ease;
}
.app-rail__item:hover {
  background: var(--app-surface-hover);
  color: var(--app-text);
}
.app-rail__item--active {
  background: var(--app-accent-soft);
  color: var(--app-text);
}

/* 左侧极细强调线（§四：非大面积色块选中态） */
.app-rail__accent {
  position: absolute;
  left: -10px;
  top: 10px;
  bottom: 10px;
  width: 2px;
  border-radius: 2px;
  background: var(--app-accent);
  opacity: 0;
  transition: opacity 140ms ease;
}
.app-rail__item--active .app-rail__accent {
  opacity: 1;
}
</style>
