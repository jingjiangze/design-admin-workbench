<template>
  <div class="account">
    <div class="account__head">
      <h1 class="account__title">账户</h1>
    </div>

    <div class="account__card">
      <div class="account__avatar">{{ avatarText }}</div>
      <div class="account__info">
        <div class="account__name">{{ userIdentity }}</div>
        <div class="account__meta">
          数据模式：
          <b>{{
            legacyEnabled ? "真实数据（旧系统网关）" : "演示数据（Mock）"
          }}</b>
        </div>
      </div>
      <div class="account__actions">
        <AppButton variant="ghost" size="sm" icon="logout" @click="logout">
          退出登录
        </AppButton>
      </div>
    </div>

    <section class="account__section">
      <h2 class="account__section-title">外观</h2>
      <div class="account__theme" role="group" aria-label="外观模式">
        <button
          v-for="opt in themeOptions"
          :key="opt.value"
          class="account__theme-pill"
          :class="{ 'is-active': theme === opt.value }"
          type="button"
          @click="setTheme(opt.value)"
        >
          {{ opt.label }}
        </button>
      </div>
    </section>

    <section class="account__section">
      <h2 class="account__section-title">我的数据</h2>
      <button class="account__row" type="button" @click="goCategory">
        <span>金额规则</span>
        <span class="account__row-sub app-num">
          {{ ruleCount }} 条 · 在「品类」页设置
        </span>
        <AppIcon name="arrow-right" :size="14" class="account__row-arrow" />
      </button>
      <button class="account__row" type="button" @click="goCategory">
        <span>规则导入 / 导出</span>
        <span class="account__row-sub">JSON 文件</span>
        <AppIcon name="arrow-right" :size="14" class="account__row-arrow" />
      </button>
    </section>

    <section class="account__section">
      <h2 class="account__section-title">说明</h2>
      <p class="account__note">
        我的统计金额仅用于本工作台的个人收入统计，不会修改旧系统任何订单数据。
      </p>
    </section>
  </div>
</template>

<script setup lang="ts">
/**
 * 账户页（Phase UI-R1 极简化）
 * 身份 + 数据模式 + 规则统计 + 登出；导入/导出已并入品类页（避免双入口）
 */
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { AppButton, AppIcon } from "@/components/ui";
import { useTheme, type ThemeMode } from "@/hooks/useTheme";
import {
  getUserIdentity,
  listRules
} from "@/service/pricing/pricing-rule-store";
import { isLegacyRealEnabled } from "@/service/gateway";
import { removeToken } from "@/utils/auth";

defineOptions({ name: "AccountInfo" });

const router = useRouter();
const { mode: theme, setTheme } = useTheme();

const themeOptions: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
  { value: "system", label: "跟随系统" }
];

const userIdentity = ref(getUserIdentity() || "设计师");
const ruleCount = ref(0);
const legacyEnabled = isLegacyRealEnabled();

const avatarText = computed(() =>
  (userIdentity.value || "设").slice(0, 1).toUpperCase()
);

onMounted(() => {
  ruleCount.value = listRules().length;
});

function goCategory() {
  router.push("/category/index");
}

async function logout() {
  try {
    await ElMessageBox.confirm("确定要退出登录吗？", "退出登录", {
      confirmButtonText: "退出",
      cancelButtonText: "取消",
      type: "warning"
    });
  } catch {
    return;
  }
  removeToken();
  ElMessage.success("已退出登录");
  router.push("/login");
}
</script>

<style scoped>
.account {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  max-width: 560px;
}

.account__title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--app-text);
}

.account__card {
  display: flex;
  gap: var(--space-4);
  align-items: center;
  padding: var(--space-4);
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: var(--radius-md);
}

.account__avatar {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  font-size: 17px;
  font-weight: 600;
  color: var(--app-text);
  background: var(--app-accent-soft);
  border-radius: 50%;
}

.account__info {
  flex: 1;
  min-width: 0;
}

.account__name {
  font-size: 14.5px;
  font-weight: 600;
  color: var(--app-text);
}

.account__meta {
  margin-top: 2px;
  font-size: 12.5px;
  color: var(--app-text-muted);
}

.account__meta b {
  font-weight: 500;
  color: var(--app-text-secondary);
}

.account__section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.account__theme {
  display: inline-flex;
  gap: 4px;
  width: fit-content;
  padding: 3px;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: var(--radius-md);
}

.account__theme-pill {
  padding: 5px 14px;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--app-text-muted);
  cursor: pointer;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  transition:
    background-color 140ms ease,
    color 140ms ease;
}

.account__theme-pill:hover {
  color: var(--app-text-secondary);
}

.account__theme-pill.is-active {
  color: var(--app-accent-text);
  background: var(--app-accent);
}

.account__section-title {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--app-text-faint);
  letter-spacing: 0.04em;
}

.account__row {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  width: 100%;
  padding: var(--space-3) var(--space-2);
  font-family: inherit;
  font-size: 13.5px;
  color: var(--app-text);
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: none;
  border-radius: var(--radius-md);
  transition: background-color 140ms ease;
}

.account__row:hover {
  background: var(--app-surface-hover);
}

.account__row-sub {
  margin-left: auto;
  font-size: 12.5px;
  color: var(--app-text-faint);
}

.account__row-arrow {
  color: var(--app-text-faint);
}

.account__note {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--app-text-muted);
}
</style>
