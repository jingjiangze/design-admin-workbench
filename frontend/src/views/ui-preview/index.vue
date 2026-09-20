<template>
  <div class="preview">
    <h1 class="preview__title">视觉验收 · UI 组件</h1>
    <p class="preview__sub">
      Phase UI-R1 §四十六 · 开发阶段专用，不进入正式导航
    </p>

    <!-- Button -->
    <section class="preview__section">
      <h2 class="preview__label">AppButton</h2>
      <div class="preview__row">
        <AppButton>主要操作</AppButton>
        <AppButton variant="ghost">次要操作</AppButton>
        <AppButton variant="text">轻量操作</AppButton>
        <AppButton variant="danger">危险操作</AppButton>
        <AppButton size="sm">小按钮</AppButton>
        <AppButton disabled>禁用</AppButton>
        <AppButton icon="copy">带图标</AppButton>
      </div>
    </section>

    <!-- Search -->
    <section class="preview__section">
      <h2 class="preview__label">AppSearch</h2>
      <div class="preview__row preview__row--stack">
        <AppSearch
          v-model="searchText"
          size="sm"
          placeholder="小号搜索…"
          style="width: 280px"
        />
        <AppSearch
          v-model="searchText"
          placeholder="中号搜索（受控）"
          style="width: 320px"
        />
        <AppSearch
          readonly
          kbd
          size="lg"
          placeholder="只读触发形态"
          style="width: 400px"
        />
      </div>
    </section>

    <!-- Status -->
    <section class="preview__section">
      <h2 class="preview__label">AppStatus（状态色只出现在状态本身）</h2>
      <div class="preview__row" style="gap: 20px">
        <AppStatus label="设计中" />
        <AppStatus label="待接单" />
        <AppStatus label="待审核" />
        <AppStatus label="审核通过" />
        <AppStatus label="流标" />
        <AppStatus label="未知状态" />
      </div>
    </section>

    <!-- Metric -->
    <section class="preview__section">
      <h2 class="preview__label">AppMetric（无卡片边界）</h2>
      <div class="preview__row" style="gap: 40px">
        <AppMetric value="12" label="待处理" />
        <AppMetric value="3" label="待催稿" />
        <AppMetric value="¥2,860" label="本月收入" size="lg" />
      </div>
    </section>

    <!-- Table -->
    <section class="preview__section">
      <h2 class="preview__label">极简线表</h2>
      <div class="preview__table">
        <div class="preview__t-head">
          <span>订单号</span><span>品类</span><span>状态</span>
          <span class="preview__t-right">截稿</span>
        </div>
        <div v-for="r in tableRows" :key="r.no" class="preview__t-row">
          <span class="app-mono">{{ r.no }}</span>
          <span class="preview__t-muted">{{ r.cat }}</span>
          <span><AppStatus :label="r.state" /></span>
          <span class="preview__t-muted preview__t-right app-num">{{
            r.due
          }}</span>
        </div>
      </div>
    </section>

    <!-- Drawer / Dialog / Empty / Skeleton -->
    <section class="preview__section">
      <h2 class="preview__label">浮层与状态</h2>
      <div class="preview__row">
        <AppButton variant="ghost" @click="drawerVisible = true"
          >Drawer</AppButton
        >
        <AppButton variant="ghost" @click="dialogVisible = true"
          >Dialog</AppButton
        >
        <AppButton variant="ghost" @click="ElMessage.success('操作成功')">
          Toast
        </AppButton>
      </div>
      <div class="preview__row preview__row--stack" style="max-width: 420px">
        <AppEmpty icon="check" text="今天没有待催稿" />
        <AppEmpty icon="inbox" text="暂无订单" />
        <AppSkeleton :rows="3" />
      </div>
    </section>

    <AppDrawer v-model="drawerVisible" title="AppDrawer · 680px">
      <p style="margin: 0; font-size: 13.5px; color: var(--app-text-secondary)">
        左圆角 10px、柔阴影、内容导航式 Tabs；普通页面无阴影（§十八/§十九）。
      </p>
      <template #footer>
        <AppButton size="sm" @click="drawerVisible = false">关闭</AppButton>
      </template>
    </AppDrawer>

    <AppDialog v-model="dialogVisible" title="AppDialog">
      <p style="margin: 0; font-size: 13.5px">
        极简确认/表单弹窗：宽 440、圆角 10（§三十）。
      </p>
      <template #footer>
        <div style="display: flex; gap: 8px; justify-content: flex-end">
          <AppButton variant="ghost" size="sm" @click="dialogVisible = false">
            取消
          </AppButton>
          <AppButton size="sm" @click="dialogVisible = false">保存</AppButton>
        </div>
      </template>
    </AppDialog>
  </div>
</template>

<script setup lang="ts">
/**
 * /ui-preview 视觉验收页（Phase UI-R1 §四十六）
 * 展示基础组件的默认形态；不进入导航（showLink: false）
 */
import { ref } from "vue";
import { ElMessage } from "element-plus";
import {
  AppButton,
  AppDialog,
  AppDrawer,
  AppEmpty,
  AppMetric,
  AppSearch,
  AppSkeleton,
  AppStatus
} from "@/components/ui";

defineOptions({ name: "UiPreviewIndex" });

const searchText = ref("");
const drawerVisible = ref(false);
const dialogVisible = ref(false);

const tableRows = [
  { no: "TT_260920001", cat: "名片", state: "设计中", due: "16:30" },
  { no: "TT_260920002", cat: "PVC名片", state: "待审核", due: "17:20" },
  { no: "TT_260920003", cat: "海报", state: "审核通过", due: "18:00" },
  { no: "TT_260920004", cat: "KT板", state: "流标", due: "—" }
];
</script>

<style scoped>
.preview {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
  max-width: 720px;
}

.preview__title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--app-text);
}

.preview__sub {
  margin: -20px 0 0;
  font-size: 12.5px;
  color: var(--app-text-faint);
}

.preview__section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.preview__label {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--app-text-faint);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.preview__row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
}

.preview__row--stack {
  flex-direction: column;
  align-items: stretch;
}

.preview__table {
  display: flex;
  flex-direction: column;
}

.preview__t-head,
.preview__t-row {
  display: grid;
  grid-template-columns: 1.4fr 1fr 0.9fr 0.8fr;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-2) var(--space-3);
  font-size: 13px;
}

.preview__t-head {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--app-text-faint);
  border-bottom: 1px solid var(--app-border);
}

.preview__t-row {
  border-bottom: 1px solid var(--app-border);
}

.preview__t-muted {
  color: var(--app-text-secondary);
}

.preview__t-right {
  text-align: right;
}
</style>
