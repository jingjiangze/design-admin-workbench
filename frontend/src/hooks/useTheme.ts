import { ref } from "vue";

/**
 * 夜间模式（Phase UI-DARK）—— 全站唯一主题状态源
 *
 * 规则：
 *  - 三态：light / dark / system（跟随系统）
 *  - 持久化 localStorage "dw:theme"（与 dw:recent-searches 同前缀惯例）
 *  - 真实生效开关是 html.dark 类；index.html 的防闪烁脚本与这里保持同一判定
 *  - system 态监听 prefers-color-scheme 变化实时切换
 */

export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "dw:theme";

function readStored(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* localStorage 不可用时静默走 system */
  }
  return "system";
}

function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

function applyMode(mode: ThemeMode) {
  const dark = mode === "dark" || (mode === "system" && systemPrefersDark());
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  // 防白闪兜底：dark 下 html 底色与 --app-bg 同步
  root.style.background = dark ? "#131315" : "";
}

const mode = ref<ThemeMode>(readStored());

// 模块级单例：首次加载即同步应用（含 system 监听器），供所有调用方共享
applyMode(mode.value);

const media = window.matchMedia?.("(prefers-color-scheme: dark)");
media?.addEventListener?.("change", () => {
  if (mode.value === "system") applyMode("system");
});

export function useTheme() {
  function setTheme(next: ThemeMode) {
    mode.value = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* 写失败不阻塞，仅本次会话生效 */
    }
    applyMode(next);
  }

  return { mode, setTheme };
}
