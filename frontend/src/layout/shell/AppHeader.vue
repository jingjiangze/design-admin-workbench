<template>
  <header class="app-header">
    <div class="app-header__brand">
      <AppIcon name="logo" :size="18" class="app-header__logo" />
      <span class="app-header__title">设计工作台</span>
    </div>

    <div class="app-header__search">
      <AppSearch
        readonly
        kbd
        size="sm"
        placeholder="搜订单、客户、店铺…"
        @kbd-click="emit('open-search')"
        @click="emit('open-search')"
      />
    </div>

    <div class="app-header__actions">
      <!-- 接单开关 + 定时关闭（旧系统 updateWorkState.do 网关；切换必经二次确认） -->
      <AcceptanceSwitch />
      <ElTooltip content="催稿通知" placement="bottom" :show-after="200">
        <button
          class="app-header__icon-btn"
          type="button"
          aria-label="催稿通知"
          @click="goExpedite"
        >
          <AppIcon name="bell" :size="17" />
          <span v-if="unreadCount > 0" class="app-header__badge app-num">
            {{ unreadCount > 99 ? "99+" : unreadCount }}
          </span>
        </button>
      </ElTooltip>

      <ElDropdown trigger="click">
        <button class="app-header__avatar" type="button" aria-label="账户">
          {{ avatarText }}
        </button>
        <template #dropdown>
          <ElDropdownMenu>
            <ElDropdownItem @click="goAccount">
              <AppIcon name="user" :size="14" style="margin-right: 6px" />
              账户信息
            </ElDropdownItem>
          </ElDropdownMenu>
        </template>
      </ElDropdown>
    </div>
  </header>
</template>

<script setup lang="ts">
/**
 * AppHeader —— 54px 极简顶栏（Phase UI-R1 §七）
 * 左品牌 / 中全局搜索入口 / 右通知+头像；无面包屑无主题开关无标签页
 */
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  ElTooltip,
  ElDropdown,
  ElDropdownMenu,
  ElDropdownItem
} from "element-plus";
import AppIcon from "@/components/ui/AppIcon.vue";
import AppSearch from "@/components/ui/AppSearch.vue";
import AcceptanceSwitch from "@/layout/components/lay-acceptance/index.vue";
import { fetchExpediteMessages } from "@/service/expedite";
import { getUserIdentity } from "@/service/pricing/pricing-rule-store";

const emit = defineEmits<{ "open-search": [] }>();

const route = useRoute();
const router = useRouter();

const unreadCount = ref(0);

/** 打开页面/切页时刷新未读数（打开时查询，非轮询——§五十四） */
async function refreshUnread() {
  try {
    const list = await fetchExpediteMessages();
    unreadCount.value = list.filter(m => !m.read).length;
  } catch {
    unreadCount.value = 0;
  }
}
watch(
  () => route.name,
  () => void refreshUnread(),
  { immediate: true }
);

function goExpedite() {
  router.push("/expedite/index");
}
function goAccount() {
  router.push("/account/index");
}

const avatarText = computed(() => {
  const key = String(getUserIdentity() || "设").trim();
  return key.slice(0, 1).toUpperCase() || "设";
});
</script>

<style scoped>
.app-header {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  gap: var(--space-6);
  align-items: center;
  height: var(--header-height);
  padding: 0 var(--space-6);
  background: var(--app-surface);
  border-bottom: 1px solid var(--app-border);
}

.app-header__brand {
  display: flex;
  flex-shrink: 0;
  gap: var(--space-2);
  align-items: center;
}

.app-header__logo {
  color: var(--app-accent);
}

.app-header__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--app-text);
  letter-spacing: 0.01em;
}

.app-header__search {
  flex: 1;
  max-width: 480px;
  margin: 0 auto;
  cursor: pointer;
}

.app-header__search :deep(.app-search) {
  cursor: pointer;
}

.app-header__search :deep(.app-search__input) {
  cursor: pointer;
}

.app-header__actions {
  display: flex;
  flex-shrink: 0;
  gap: var(--space-3);
  align-items: center;
  margin-left: auto;
}

.app-header__icon-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  color: var(--app-text-muted);
  cursor: pointer;
  background: transparent;
  border: none;
  border-radius: var(--radius-md);
  transition:
    background-color 140ms ease,
    color 140ms ease;
}

.app-header__icon-btn:hover {
  color: var(--app-text);
  background: var(--app-surface-hover);
}

.app-header__badge {
  position: absolute;
  top: 2px;
  right: 0;
  min-width: 15px;
  height: 15px;
  padding: 0 4px;
  font-size: 10px;
  font-weight: 600;
  line-height: 15px;
  color: var(--app-on-danger);
  text-align: center;
  background: var(--app-danger);
  border-radius: 999px;
}

.app-header__avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--app-text);
  cursor: pointer;
  background: var(--app-accent-soft);
  border: 1px solid var(--app-border-strong);
  border-radius: 50%;
  transition: border-color 140ms ease;
}

.app-header__avatar:hover {
  border-color: var(--app-border-hover);
}
</style>
