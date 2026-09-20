<script setup lang="ts">
/**
 * 工作台首页（P1B-02，docs/DESIGNER_WORKBENCH_SPEC.md §2）
 *
 * 结构：大搜索框 → 4 统计卡（待处理/待催稿/今日订单/本月收入）→ 今天需要关注
 *       → 最近订单（≤8 行，点击开 Drawer）→ 常用品类。
 * 禁止：大面积图表 / 复杂 BI / 几十个统计卡片 / 大量装饰。
 * 数据经 Domain Service（income.ts / expedite.ts / pricing），UI 零 legacy 引用。
 */
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import OrderDrawer from "@/components/OrderDrawer/index.vue";
import { fetchIncomeScope, getIncomeDashboard } from "@/service/income";
import type { IncomeSummary, CategoryIncome } from "@/service/income";
import type { OrderListItem } from "@/service/types";
import {
  enrichOrderAmounts,
  formatAmount
} from "@/service/pricing/amount-resolution";
import { listRules } from "@/service/pricing/pricing-rule-store";
import { fetchExpediteMessages } from "@/service/expedite";
import type { ExpediteMessage } from "@/service/expedite";
import {
  dateKey,
  parseCompleteTime
} from "@/service/income/income-calculation";

defineOptions({
  name: "Welcome"
});

const router = useRouter();

const loading = ref(true);
const orders = ref<OrderListItem[]>([]);
const messages = ref<ExpediteMessage[]>([]);
const summary = ref<IncomeSummary | null>(null);
const categories = ref<CategoryIncome[]>([]);

// Drawer 联动
const drawerVisible = ref(false);
const drawerOrderId = ref<string | null>(null);
const drawerRow = ref<OrderListItem | null>(null);

// 搜索框（P1B-03 全局化的本页落点）
const keyword = ref("");

async function loadAll() {
  loading.value = true;
  try {
    const [scope, dash, msgs] = await Promise.all([
      fetchIncomeScope(),
      getIncomeDashboard("month"),
      fetchExpediteMessages()
    ]);
    // 规则 enrich（规则可能已变化，重算派生金额）
    orders.value = enrichOrderAmounts(scope, listRules());
    summary.value = dash.summary;
    categories.value = dash.categories;
    messages.value = msgs;
  } finally {
    loading.value = false;
  }
}

onMounted(loadAll);

// ===== 统计计算 =====

/** 今日键 */
const today = dateKey(new Date());

const activeOrders = computed(() =>
  orders.value.filter(
    o =>
      o.view === "pending_accept" ||
      o.view === "in_progress" ||
      o.view === "pending_review"
  )
);

const pendingCount = computed(() => activeOrders.value.length);
const unreadRemindCount = computed(
  () => messages.value.filter(m => !m.read).length
);
const todayOrderCount = computed(
  () =>
    orders.value.filter(
      o => dateKey(parseCompleteTime(o) ?? new Date(0)) === today
    ).length
);

/** 即将截稿：活跃单且 endTime 在 24h 内 */
const nearDeadline = computed(() =>
  activeOrders.value.filter(o => {
    const d = o.endTime
      ? new Date(o.endTime.replace(/-/g, "/")).getTime()
      : NaN;
    if (Number.isNaN(d)) return false;
    const diff = d - Date.now();
    return diff > 0 && diff < 24 * 3600 * 1000;
  })
);

/** 尚未反馈 */
const noFeedback = computed(() =>
  activeOrders.value.filter(o => o.stateLabel === "未反馈")
);

/** 金额未定义（命中统计状态的活跃场景：全量口径取 summary.undefinedCount） */
const undefinedAmount = computed(() => summary.value?.undefinedCount ?? 0);

/** 最近订单 ≤8 行（创建时间倒序） */
const recentOrders = computed(() =>
  [...orders.value]
    .sort((a, b) => b.createTime.localeCompare(a.createTime))
    .slice(0, 8)
);

/** 常用品类（固定四类 + 实时计数，点击跳订单页） */
const commonCategories = computed(() => {
  const names = ["名片", "PVC", "宣传物料", "其他"];
  const count = (match: (n: string) => boolean) =>
    orders.value.filter(o => match(o.productName ?? "")).length;
  return [
    {
      name: "名片",
      count: count(n => n.includes("名片") && !n.includes("PVC"))
    },
    { name: "PVC", count: count(n => n.includes("PVC")) },
    {
      name: "宣传物料",
      count: count(n => /宣传|海报|展架|易拉宝|画册/.test(n))
    },
    {
      name: "其他",
      count: count(
        n =>
          n === "" ||
          (!n.includes("名片") &&
            !n.includes("PVC") &&
            !/宣传|海报|展架|易拉宝|画册/.test(n))
      )
    }
  ].map(c => ({ ...c, _order: names.indexOf(c.name) }));
});

// ===== 交互 =====

function openDrawer(row: OrderListItem) {
  drawerRow.value = row;
  drawerOrderId.value = row.orderId;
  drawerVisible.value = true;
}

/** 搜索：订单号 → 直接开 Drawer；其他 → 订单页带关键词 */
function onSearch() {
  const kw = keyword.value.trim();
  if (!kw) return;
  // 批量（含分隔符）或模糊 → 订单页；单订单号 → Drawer
  const isSingleOrderNo = !/[\n、,，\s]/.test(kw);
  if (isSingleOrderNo) {
    const hit = orders.value.find(o => o.orderNo === kw || o.orderId === kw);
    if (hit) {
      openDrawer(hit);
      keyword.value = "";
      return;
    }
  }
  void router.push({ path: "/order/index", query: { keyword: kw } });
}

function goIncome() {
  void router.push("/income/index");
}

function goCategoryRules() {
  void router.push({ path: "/category/index", query: { tab: "pricing" } });
}

function copyOrderNo(row: OrderListItem) {
  navigator.clipboard
    .writeText(row.orderNo)
    .then(() => ElMessage.success(`已复制 ${row.orderNo}`))
    .catch(() => ElMessage.warning("复制失败"));
}

function fmtTime(t: string): string {
  // "2026-09-21 11:43:16" → "09-21 11:43"（紧凑）
  const m = t.match(/\d{2}-\d{2} \d{2}:\d{2}/);
  return m ? m[0] : t || "—";
}
</script>

<template>
  <div v-loading="loading" class="workbench">
    <!-- 大搜索框 -->
    <div class="search-wrap">
      <el-input
        v-model="keyword"
        size="large"
        placeholder="搜订单、客户、店铺，或粘贴多个订单号…"
        class="big-search"
        clearable
        @keyup.enter="onSearch"
      >
        <template #prefix>🔍</template>
        <template #append>
          <el-button @click="onSearch">搜索</el-button>
        </template>
      </el-input>
      <p class="search-tip">按 / 全局聚焦 · Enter 搜索 · 订单号直接打开详情</p>
    </div>

    <!-- 4 统计卡 -->
    <div class="stat-row">
      <div
        class="stat-card"
        @click="
          router.push({ path: '/order/index', query: { view: 'in_progress' } })
        "
      >
        <span class="stat-label">待处理</span>
        <strong class="stat-value">{{ pendingCount }}</strong>
      </div>
      <div class="stat-card" @click="router.push('/expedite/index')">
        <span class="stat-label">待催稿</span>
        <strong class="stat-value" :class="{ warn: unreadRemindCount > 0 }">{{
          unreadRemindCount
        }}</strong>
      </div>
      <div class="stat-card">
        <span class="stat-label">今日订单</span>
        <strong class="stat-value">{{ todayOrderCount }}</strong>
      </div>
      <div class="stat-card" @click="goIncome">
        <span class="stat-label">本月收入（我的统计）</span>
        <strong class="stat-value">{{
          formatAmount(summary?.income ?? null)
        }}</strong>
      </div>
    </div>

    <!-- 今天需要关注 -->
    <div class="panel">
      <h3>今天需要关注</h3>
      <div class="focus-list">
        <div
          class="focus-item"
          @click="
            router.push({
              path: '/order/index',
              query: { view: 'in_progress' }
            })
          "
        >
          <el-tag type="warning" effect="plain" size="small">截稿</el-tag>
          <b>{{ nearDeadline.length }}</b> 个订单即将截稿（24h 内）
        </div>
        <div
          class="focus-item"
          @click="
            router.push({
              path: '/order/index',
              query: { view: 'in_progress' }
            })
          "
        >
          <el-tag type="info" effect="plain" size="small">反馈</el-tag>
          <b>{{ noFeedback.length }}</b> 个订单尚未反馈
        </div>
        <div class="focus-item" @click="goCategoryRules">
          <el-tag type="danger" effect="plain" size="small">金额</el-tag>
          <b>{{ undefinedAmount }}</b> 个订单金额未定义
          <el-button size="small" text type="primary">去设置</el-button>
        </div>
      </div>
    </div>

    <!-- 最近订单 -->
    <div class="panel">
      <div class="panel-head">
        <h3>最近订单</h3>
        <el-button
          size="small"
          text
          type="primary"
          @click="router.push('/order/index')"
        >
          全部订单 →
        </el-button>
      </div>
      <el-table
        :data="recentOrders"
        size="small"
        class="compact-table"
        @row-click="openDrawer"
      >
        <el-table-column
          prop="orderNo"
          label="订单号"
          min-width="150"
          show-overflow-tooltip
        />
        <el-table-column label="品类" width="110">
          <template #default="{ row }">{{ row.productName || "—" }}</template>
        </el-table-column>
        <el-table-column prop="stateLabel" label="状态" width="90" />
        <el-table-column label="金额" width="90" align="right">
          <template #default="{ row }">
            <span
              :class="{ 'amt-undefined': row.amountSource === 'undefined' }"
            >
              {{ formatAmount(row.effectiveAmount) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="截稿" width="110">
          <template #default="{ row }">{{ fmtTime(row.endTime) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="80" align="center">
          <template #default="{ row }">
            <el-button
              size="small"
              text
              type="primary"
              @click.stop="copyOrderNo(row)"
              >复制</el-button
            >
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 常用品类 -->
    <div class="panel">
      <h3>常用品类</h3>
      <div class="cat-row">
        <div
          v-for="cat in commonCategories"
          :key="cat.name"
          class="cat-chip"
          @click="
            router.push({ path: '/order/index', query: { keyword: cat.name } })
          "
        >
          <span>{{ cat.name }}</span>
          <b>{{ cat.count }} 单</b>
        </div>
      </div>
    </div>

    <!-- 订单详情 Drawer -->
    <OrderDrawer
      v-model="drawerVisible"
      :order-id="drawerOrderId"
      :order-row="drawerRow"
    />
  </div>
</template>

<style scoped>
.workbench {
  max-width: 1080px;
  padding: 16px 20px 32px;
  margin: 0 auto;
}

.search-wrap {
  margin-bottom: 16px;
}

.big-search {
  max-width: 640px;
}

.search-tip {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.stat-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.stat-card {
  padding: 14px 16px;
  cursor: pointer;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  transition: box-shadow 0.15s;
}

.stat-card:hover {
  box-shadow: var(--el-box-shadow-light);
}

.stat-label {
  display: block;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.stat-value {
  display: block;
  margin-top: 6px;
  font-size: 24px;
  font-weight: 600;
}

.stat-value.warn {
  color: var(--el-color-warning);
}

.panel {
  padding: 14px 16px;
  margin-bottom: 16px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}

.panel h3 {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 600;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.panel-head h3 {
  margin: 0;
}

.focus-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.focus-item {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  font-size: 13px;
  cursor: pointer;
  border-radius: 6px;
}

.focus-item:hover {
  background: var(--el-fill-color-light);
}

.compact-table {
  width: 100%;
  cursor: pointer;
}

.amt-undefined {
  font-style: italic;
  color: var(--el-color-warning);
}

.cat-row {
  display: flex;
  gap: 12px;
}

.cat-chip {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 20px;
  cursor: pointer;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}

.cat-chip:hover {
  border-color: var(--el-color-primary-light-5);
}

.cat-chip span {
  font-size: 13px;
}

.cat-chip b {
  font-size: 15px;
}
</style>
