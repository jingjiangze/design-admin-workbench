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
 * 工作台首页（Phase UI-R1 §九~§十五；P1-09 真实聚合 + SWR 缓存版）
 * Search First + 极简统计 + 关注列表 + 最近订单；无统计卡堆叠、无图表
 * 数据一律走 Domain Service（§四十五：无任何硬编码假数据）。
 *
 * P1-09 真实口径（HOME_WORKBENCH_SPEC 冻结表）：
 * - 待处理   = countInfo.wait + nofeedback（[VERIFIED] 服务端 6 状态计数器）
 * - 今日订单 = begindate=enddate=今天 服务端筛选，取 pageInfo.total
 * - 本月收入 = income.summary.systemIncome（失败显 "—"，禁伪装 ¥0）
 * - 待催稿   = 催稿列表 !read 计数（未接收+已接收）
 * - 最近订单 = 服务端默认排序前 5 条仅展示
 * - 关注列表 = nofeedback 真实计数 + 本月实际接单中未设置个人金额的商品数
 *
 * SWR（2026-09-21 用户指令）：首次加载后写 localStorage 缓存；再次进入
 * 先渲染缓存（毫秒级出数据），后台静默刷新后无缝更新；fresh 60s 内跳过
 * 刷新（旧系统限流友好，避免路由来回切换狂打请求）。
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
import {
  getIncomeDashboard,
  getIncomeSummaryFast,
  type IncomeDashboard
} from "@/service/income";
import {
  swrRead,
  swrWrite,
  swrIsFresh,
  SWR_FRESH_MS
} from "@/service/swr-cache";

defineOptions({ name: "Welcome" });

const router = useRouter();
const openPalette = inject<() => void>("openCommandPalette");

const loading = ref(true);
const recentOrders = ref<OrderListItem[]>([]);
/** countInfo：6 状态计数器（wait/nofeedback/didnotpass/badordercount/aftersale/flowmarker） */
const countInfo = ref<Record<string, number>>({});
const expediteUnread = ref(0);
const monthIncome = ref("—");
const uncoveredGoodsCount = ref(0);
/** 今日订单 = 服务端 begindate/enddate 过滤后的真实 total */
const todayCount = ref(0);

const stats = computed(() => ({
  // 冻结口径：待处理 = 待接单(wait) + 未反馈(nofeedback)
  pendingCount: (countInfo.value.wait ?? 0) + (countInfo.value.nofeedback ?? 0),
  expediteCount: expediteUnread.value,
  todayCount: todayCount.value,
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
  const noFeedback = countInfo.value.nofeedback ?? 0;
  if (noFeedback > 0)
    items.push({
      key: "feedback",
      count: noFeedback,
      text: "个订单尚未反馈",
      go: () => goOrders()
    });
  if (uncoveredGoodsCount.value > 0)
    items.push({
      key: "amount",
      count: uncoveredGoodsCount.value,
      text: "个本月实际接单的商品未设置个人金额",
      go: () => router.push("/category/index")
    });
  return items;
});

function fmtDeadline(endTime: string): string {
  if (!endTime) return "—";
  const d = new Date(endTime.replace(/-/g, "/"));
  if (Number.isNaN(d.getTime())) return endTime;
  const now = new Date();
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (d.toDateString() === now.toDateString()) return hm;
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${hm}`;
}

/** 本地日期 yyyy-MM-dd（今日订单服务端过滤参数） */
function todayStr(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

function goOrders(keyword?: string) {
  router.push(
    keyword ? { path: "/order/index", query: { keyword } } : "/order/index"
  );
}

// ── SWR：缓存先行 + 后台静默刷新 ──

function todayStartMs(): number {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
}

/** 用缓存立即渲染；返回是否命中任何缓存 */
function renderFromCache(today: string): boolean {
  void today;
  const recent = swrRead<OrderListItem[]>("home:recent-orders");
  const info = swrRead<Record<string, number>>("home:count-info");
  const todayN = swrRead<number>("home:today-count");
  const expedite = swrRead<number>("home:expedite-unread");
  const incomeSummary = swrRead<{ systemIncome: number | null }>(
    "income-summary:month"
  );
  const income = swrRead<IncomeDashboard>("income-dashboard:month");
  // 今日计数缓存须为当天写入（跨天防陈旧"今日"数字）
  const todayValid = !!todayN?.data && todayN.at >= todayStartMs();
  if (!recent && !info && !todayValid && !expedite && !income && !incomeSummary)
    return false;
  if (recent?.data) recentOrders.value = recent.data;
  if (info?.data) countInfo.value = info.data;
  if (todayValid) todayCount.value = todayN.data;
  if (expedite?.data != null) expediteUnread.value = expedite.data;
  if (incomeSummary?.data) {
    monthIncome.value =
      incomeSummary.data.systemIncome != null
        ? formatCny(incomeSummary.data.systemIncome)
        : "—";
  }
  if (income?.data) {
    monthIncome.value =
      income.data.summary.systemIncome != null
        ? formatCny(income.data.summary.systemIncome)
        : "—";
    uncoveredGoodsCount.value = income.data.uncoveredGoodsCount ?? 0;
  }
  return true;
}

/** 后台静默刷新：单链失败容忍（缓存内容仍展示），成功即写缓存 */
async function refreshQuietly(today: string): Promise<void> {
  // 收入两段式：summary 快路径（1 请求）先更新金额；完整 dashboard
  // （月明细+实证，慢）后台补齐关注项与缓存 —— 金额无需等待真实明细
  const incomeSummaryP = getIncomeSummaryFast()
    .then(s => {
      monthIncome.value =
        s.systemIncome != null ? formatCny(s.systemIncome) : "—";
      swrWrite("income-summary:month", s);
    })
    .catch(() => {
      // summary 也失败：保持现状（缓存或 "—"），不伪装
    });

  const [recentRes, todayRes, messages, income] = await Promise.all([
    fetchOrders({ view: "all", page: 1, pageSize: 5 }).catch(() => null),
    fetchOrders({
      view: "all",
      page: 1,
      pageSize: 1,
      beginDate: today,
      endDate: today
    }).catch(() => null),
    fetchExpediteMessages().catch(() => []),
    getIncomeDashboard("month").catch(() => null)
  ]);
  if (recentRes) {
    recentOrders.value = recentRes.list;
    countInfo.value = recentRes.countInfo ?? {};
    swrWrite("home:recent-orders", recentRes.list);
    swrWrite("home:count-info", recentRes.countInfo ?? {});
  }
  if (todayRes) {
    todayCount.value = todayRes.total;
    swrWrite("home:today-count", todayRes.total);
  }
  expediteUnread.value = messages.filter(m => !m.read).length;
  swrWrite("home:expedite-unread", expediteUnread.value);
  if (income) {
    uncoveredGoodsCount.value = income.uncoveredGoodsCount ?? 0;
    swrWrite("income-dashboard:month", income);
  }
  await incomeSummaryP;
}

onMounted(async () => {
  const today = todayStr();
  if (renderFromCache(today)) {
    loading.value = false; // 缓存先行：立即渲染
    const freshAll =
      swrIsFresh(swrRead("home:count-info"), SWR_FRESH_MS) &&
      swrIsFresh(swrRead("income-dashboard:month"), SWR_FRESH_MS);
    if (!freshAll) void refreshQuietly(today); // 后台静默刷新
    return;
  }
  // 完全首访：无缓存 → 骨架屏 + 等首轮数据落定
  try {
    await refreshQuietly(today);
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
