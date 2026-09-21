<template>
  <div class="home">
    <!-- 主视觉：Search First（§十/§十二：不套卡片） -->
    <section class="home__hero">
      <h1 class="home__title">设计师工作台</h1>
      <p class="home__subtitle">今天需要处理什么？</p>
      <div class="home__search">
        <AppSearch
          readonly
          size="lg"
          placeholder="搜订单号…"
          @click="openPalette"
        />
      </div>
    </section>

    <!-- 极简横向统计（§十一：数字+小标题，无卡片边界） -->
    <section class="home__metrics">
      <template v-if="loading">
        <AppSkeleton :rows="1" />
      </template>
      <div v-else class="home__metrics-row">
        <AppMetric :value="stats.pendingCount" label="待处理" />
        <AppMetric :value="stats.expediteCount" label="待催稿" />
        <AppMetric :value="stats.todayCount" label="今日订单" />
        <AppMetric :value="stats.monthIncome" label="本月收入" />
      </div>
    </section>

    <!-- 今天需要关注（§十三：列表，非 Card） -->
    <section class="home__section">
      <h2 class="home__section-title">今天需要关注</h2>
      <template v-if="loading">
        <AppSkeleton :rows="3" />
      </template>
      <template v-else>
        <button
          v-for="item in attentionItems"
          :key="item.key"
          class="home__attention-row"
          type="button"
          @click="item.go()"
        >
          <span class="home__attention-num app-num">{{ item.count }}</span>
          <span class="home__attention-text">{{ item.text }}</span>
          <AppIcon
            name="arrow-right"
            :size="15"
            class="home__attention-arrow"
          />
        </button>
        <AppEmpty
          v-if="attentionItems.length === 0"
          icon="check"
          text="今天没有需要关注的事项"
        />
      </template>
    </section>

    <!-- 最近订单（§十四：极简表格） -->
    <section class="home__section">
      <div class="home__section-head">
        <h2 class="home__section-title">最近订单</h2>
        <button class="home__view-all" type="button" @click="goOrders()">
          查看全部
          <AppIcon name="arrow-right" :size="13" />
        </button>
      </div>
      <template v-if="loading">
        <AppSkeleton :rows="4" type="table" />
      </template>
      <template v-else>
        <div v-if="recentOrders.length" class="home__table">
          <div class="home__table-head">
            <span>订单号</span>
            <span>品类</span>
            <span>状态</span>
            <span class="home__table-right">截稿</span>
          </div>
          <button
            v-for="o in recentOrders"
            :key="o.orderId"
            class="home__table-row"
            type="button"
            @click="goOrders(o.orderNo)"
          >
            <span class="app-mono home__order-no">{{ o.orderNo }}</span>
            <span class="home__cell-muted">{{
              o.productName || o.taskType || "—"
            }}</span>
            <span><AppStatus :label="o.stateLabel" /></span>
            <span class="home__cell-muted home__table-right app-num">
              {{ fmtDeadline(o.endTime) }}
            </span>
          </button>
        </div>
        <AppEmpty v-else icon="inbox" text="暂无订单" />
      </template>
    </section>
  </div>
</template>

<script setup lang="ts">
/**
 * 工作台首页（Phase UI-R1 §九~§十五）
 * Search First + 极简统计 + 关注列表 + 最近订单；无统计卡堆叠、无图表
 * 数据一律走 Domain Service（§四十五：无任何硬编码假数据）
 */
import { computed, inject, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import {
  AppIcon,
  AppMetric,
  AppSearch,
  AppSkeleton,
  AppStatus,
  AppEmpty
} from "@/components/ui";
import { fetchOrders, type OrderListItem } from "@/service/order";
import { fetchExpediteMessages } from "@/service/expedite";
import { getIncomeDashboard } from "@/service/income";
import { fetchGoodsCatalog, type GoodsItem } from "@/service/category";
import { listRules } from "@/service/pricing/pricing-rule-store";

defineOptions({ name: "Welcome" });

const router = useRouter();
const openPalette = inject<() => void>("openCommandPalette");

const loading = ref(true);
const allOrders = ref<OrderListItem[]>([]);
const expediteUnread = ref(0);
const monthIncome = ref("¥—");
const catalog = ref<GoodsItem[]>([]);

/** 进行中+待接单 = 「待处理」口径 */
const activeOrders = computed(() =>
  allOrders.value.filter(
    o => o.view === "in_progress" || o.view === "pending_accept"
  )
);

const stats = computed(() => ({
  pendingCount: activeOrders.value.length,
  expediteCount: expediteUnread.value,
  todayCount: allOrders.value.filter(o => isToday(o.createTime)).length,
  monthIncome: monthIncome.value
}));

interface AttentionItem {
  key: string;
  count: number;
  text: string;
  go: () => void;
}

const attentionItems = computed<AttentionItem[]>(() => {
  const items: AttentionItem[] = [];
  const dueSoon = activeOrders.value.filter(o =>
    isDueWithin24h(o.endTime)
  ).length;
  const noFeedback = allOrders.value.filter(
    o => o.stateLabel === "未反馈"
  ).length;
  const undefinedGoods = countUndefinedGoods();
  if (dueSoon > 0)
    items.push({
      key: "due",
      count: dueSoon,
      text: "个订单将在 24h 内截稿",
      go: () => goOrders()
    });
  if (noFeedback > 0)
    items.push({
      key: "feedback",
      count: noFeedback,
      text: "个订单尚未反馈",
      go: () => goOrders()
    });
  if (undefinedGoods > 0)
    items.push({
      key: "amount",
      count: undefinedGoods,
      text: "个商品金额未设置",
      go: () => router.push("/category/index")
    });
  return items;
});

/** 最近订单：截稿时间升序（最紧急在前），取 5 条 */
const recentOrders = computed(() =>
  [...activeOrders.value]
    .sort((a, b) => String(a.endTime).localeCompare(String(b.endTime)))
    .slice(0, 5)
);

// ── 时间工具（展示层聚合，长文 §四十七 前端聚合原则） ──
function isToday(timeStr: string): boolean {
  if (!timeStr) return false;
  const d = new Date(timeStr.replace(/-/g, "/"));
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function isDueWithin24h(endTime: string): boolean {
  if (!endTime) return false;
  const d = new Date(endTime.replace(/-/g, "/"));
  if (Number.isNaN(d.getTime())) return false;
  const now = Date.now();
  return d.getTime() > now && d.getTime() - now <= 24 * 3600 * 1000;
}

function fmtDeadline(endTime: string): string {
  if (!endTime) return "—";
  const d = new Date(endTime.replace(/-/g, "/"));
  if (Number.isNaN(d.getTime())) return endTime;
  const now = new Date();
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (d.toDateString() === now.toDateString()) return hm;
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${hm}`;
}

/** 商品维度未设置金额：系统金额未定义 且 无个人规则（§三十七） */
function countUndefinedGoods(): number {
  const rules = listRules();
  const ruleKeys = new Set(
    rules.map(r => `${r.goodsId}|${r.subGoodsId ?? ""}`)
  );
  return catalog.value.filter(
    g =>
      g.legacyAmount === null && !ruleKeys.has(`${g.goodsId}|${g.subGoodsId}`)
  ).length;
}

function goOrders(keyword?: string) {
  router.push(
    keyword ? { path: "/order/index", query: { keyword } } : "/order/index"
  );
}

onMounted(async () => {
  try {
    const [ordersRes, messages, income, goods] = await Promise.all([
      fetchOrders({ view: "all", page: 1, pageSize: 100 }).catch(() => null),
      fetchExpediteMessages().catch(() => []),
      getIncomeDashboard("month").catch(() => null),
      fetchGoodsCatalog().catch(() => [])
    ]);
    allOrders.value = ordersRes?.list ?? [];
    expediteUnread.value = messages.filter(m => !m.read).length;
    monthIncome.value = income
      ? formatCny(income.summary.income)
      : formatCny(0);
    catalog.value = goods;
  } finally {
    loading.value = false;
  }
});

function formatCny(n: number): string {
  return `¥${n.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
}
</script>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
}

/* ── 主视觉 ── */
.home__hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: var(--space-6);
  text-align: center;
}

.home__title {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  color: var(--app-text);
  letter-spacing: 0.01em;
}

.home__subtitle {
  margin: var(--space-1) 0 var(--space-6);
  font-size: 14px;
  color: var(--app-text-muted);
}

.home__search {
  width: 100%;
  max-width: 560px;
  cursor: pointer;
}

.home__search :deep(.app-search) {
  border-radius: var(--radius-lg);
  box-shadow: 0 1px 2px rgb(0 0 0 / 4%);
}

.home__search :deep(.app-search__input--lg) {
  cursor: pointer;
}

/* ── 统计行：无卡片边界（§十一） ── */
.home__metrics {
  display: flex;
  justify-content: center;
}

.home__metrics-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-8);
  align-items: flex-start;
  justify-content: center;
}

.home__metrics-row :deep(.app-metric) {
  min-width: 96px;
}

/* ── 分区 ── */
.home__section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.home__section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.home__section-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--app-text-secondary);
  letter-spacing: 0.02em;
}

.home__view-all {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  padding: 2px 4px;
  font-family: inherit;
  font-size: 12.5px;
  color: var(--app-text-muted);
  cursor: pointer;
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  transition: color 140ms ease;
}

.home__view-all:hover {
  color: var(--app-text);
}

/* ── 关注列表（§十三） ── */
.home__attention-row {
  display: flex;
  gap: var(--space-4);
  align-items: center;
  padding: var(--space-3);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: none;
  border-radius: var(--radius-md);
  transition: background-color 140ms ease;
}

.home__attention-row:hover {
  background: var(--app-surface-hover);
}

.home__attention-num {
  min-width: 28px;
  font-size: 16px;
  font-weight: 600;
  color: var(--app-text);
  text-align: right;
}

.home__attention-text {
  flex: 1;
  font-size: 13.5px;
  color: var(--app-text-secondary);
}

.home__attention-arrow {
  color: var(--app-text-faint);
}

.home__attention-row:hover .home__attention-arrow {
  color: var(--app-text-secondary);
}

/* ── 最近订单极简表（§十四） ── */
.home__table {
  display: flex;
  flex-direction: column;
}

.home__table-head,
.home__table-row {
  display: grid;
  grid-template-columns: 1.4fr 1fr 0.9fr 1fr;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-3);
  text-align: left;
}

.home__table-head {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--app-text-faint);
  letter-spacing: 0.04em;
  border-bottom: 1px solid var(--app-border);
}

.home__table-row {
  font-family: inherit;
  cursor: pointer;
  background: transparent;
  border: none;
  border-radius: var(--radius-md);
  transition: background-color 140ms ease;
}

.home__table-row:hover {
  background: var(--app-surface-hover);
}

.home__order-no {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  color: var(--app-text);
  white-space: nowrap;
}

.home__cell-muted {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  color: var(--app-text-secondary);
  white-space: nowrap;
}

.home__table-right {
  text-align: right;
}
</style>
