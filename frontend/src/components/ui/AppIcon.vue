<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    class="app-icon"
  >
    <path v-for="(d, i) in paths" :key="i" :d="d" />
  </svg>
</template>

<script setup lang="ts">
/**
 * AppIcon —— 项目自有线性图标（Phase UI-R1 §四十）
 * 24 viewBox / 1.5 stroke / round cap，零外部图标依赖
 */
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    name:
      | "home"
      | "orders"
      | "bell"
      | "income"
      | "grid"
      | "user"
      | "search"
      | "copy"
      | "arrow-right"
      | "check"
      | "close"
      | "plus"
      | "clock"
      | "refresh"
      | "sliders"
      | "alert"
      | "inbox"
      | "download"
      | "upload"
      | "file"
      | "history"
      | "logout"
      | "logo";
    size?: number;
  }>(),
  { size: 16 }
);

const ICON_PATHS: Record<string, string[]> = {
  home: ["M3 11 12 3.5 21 11", "M5.5 9.5V20h13V9.5"],
  orders: ["M4 6h16", "M4 12h16", "M4 18h10"],
  bell: [
    "M6 9a6 6 0 0 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9Z",
    "M10.3 20a2 2 0 0 0 3.4 0"
  ],
  income: [
    "M2 6.5h20v11H2z",
    "M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z",
    "M5.5 12h.01",
    "M18.5 12h.01"
  ],
  grid: [
    "M3.5 3.5h7v7h-7z",
    "M13.5 3.5h7v7h-7z",
    "M3.5 13.5h7v7h-7z",
    "M13.5 13.5h7v7h-7z"
  ],
  user: [
    "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
    "M4.5 20c1.5-3.5 4.2-5 7.5-5s6 1.5 7.5 5"
  ],
  search: ["M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z", "M21 21l-4.8-4.8"],
  copy: ["M9 9h11v11H9z", "M5 15V5a2 2 0 0 1 2-2h10"],
  "arrow-right": ["M4 12h15", "M13 6l6 6-6 6"],
  check: ["M4.5 12.5l5 5L19.5 7"],
  close: ["M6 6l12 12", "M18 6L6 18"],
  plus: ["M12 5v14", "M5 12h14"],
  clock: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M12 7v5l3.5 2"],
  refresh: ["M21 12a9 9 0 1 1-9-9c2.5 0 4.9 1 6.6 2.6L21 8", "M21 3v5h-5"],
  sliders: [
    "M4 8h9",
    "M17 8h3",
    "M15 5.8a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4Z",
    "M4 16h3",
    "M11 16h9",
    "M9 13.8a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4Z"
  ],
  alert: ["M12 3.5 2.5 20h19L12 3.5Z", "M12 10v4", "M12 17.2h.01"],
  inbox: ["M4 13h4.5l2 3h3l2-3H20", "M5.5 5h13l1.5 8v6H4v-6l1.5-8Z"],
  download: ["M12 3v11", "M7.5 10 12 14.5 16.5 10", "M4 17v3.5h16V17"],
  upload: ["M12 14.5V3.5", "M7.5 8 12 3.5 16.5 8", "M4 17v3.5h16V17"],
  file: [
    "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z",
    "M14 3v6h6"
  ],
  history: [
    "M3.5 12a8.5 8.5 0 1 0 8.5-8.5A8.4 8.4 0 0 0 5.6 6.4L3.5 8.5",
    "M3.5 3.5v5h5",
    "M12 7.5V12l3.5 2"
  ],
  logout: [
    "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4",
    "M16 17l5-5-5-5",
    "M21 12H9"
  ],
  logo: ["M12 3l9 9-9 9-9-9 9-9Z"]
};

const paths = computed(() => ICON_PATHS[props.name] ?? []);
</script>

<style scoped>
.app-icon {
  flex-shrink: 0;
  display: inline-block;
  vertical-align: middle;
}
</style>
