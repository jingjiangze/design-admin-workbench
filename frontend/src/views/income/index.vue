<template>
  <div class="income">
    <!-- 头部：大数字 + 口径切换（§二十六/§二十七：极简，不做 6 卡） -->
    <div class="income__head">
      <div class="income__headline">
        <h1 class="income__title">收入</h1>
        <div class="income__ranges">
          <button
            v-for="r in RANGE_TABS"
            :key="r.key"
            class="income__range"
            :class="{ 'income__range--active': range === r.key }"
            type="button"
            @click="switchRange(r.key)"
          >
            {{ r.label }}
          </button>
        </div>
      </div>

      <template v-if="loading">
        <AppSkeleton :rows="2" />
      </template>
      <template v-else-if="loadError">
        <AppEmpty icon="inbox" text="收入数据加载失败">
          <button class="income__retry" type="button" @click="load">
            重试
          </button>
        </AppEmpty>
      </template>
      <template v-else>
        <div class="income__primary">
          <AppMetric :value="systemAmount" label="系统口径" size="lg" />
          <AppMetric
            :value="myAmount"
            :label="myLabel"
            size="lg"
            :class="{ 'income__metric--overridden': hasOverride }"
          />
        </div>
        <div class="income__secondary">
          <span class="income__sub app-num">{{ subCountText }}</span>
          <button
            v-if="dashboard && dashboard.my.undefinedCount > 0"
            class="income__undefined-btn"
            type="button"
            @click="toggleUndefined"
          >
            {{ dashboard.my.undefinedCount }} 单金额未定义
            <AppIcon
              :name="showUndefined ? 'close' : 'arrow-right'"
              :size="13"
            />
          </button>
        </div>
        <p class="income__scope-note">{{ scopeNote }}{{ truncatedText }}</p>
      </template>
    </div>

    <!-- 未定义金额清单（§三十七：可反查为什么；真实源下恒空——保留显式语义） -->
    <div
      v-if="showUndefined && undefinedRecords.length"
      class="income__undefined-list"
    >
      <div class="income__undefined-title">以下收入记录金额未定义</div>
      <button
        v-for="r in undefinedRecords"
        :key="r.orderNo"
        class="income__undefined-row"
        type="button"
        @click="openDetailByOrderNo(r.orderNo)"
      >
        <span class="app-mono">{{ r.orderNo }}</span>
        <span class="income__undefined-muted">{{ r.goodsName || "—" }}</span>
        <span class="income__undefined-reason">系统无中标金额</span>
      </button>
    </div>

    <!-- 品类分布（§二十六：简单横条；§二十三 收入 → 品类 → 订单 链路） -->
    <section class="income__section">
      <h2 class="income__section-title">品类分布</h2>
      <AppSkeleton v-if="loading" :rows="4" />
      <template v-else>
        <div v-if="dashboard?.categories.length" class="income__cats">
          <div
            v-for="c in dashboard.categories"
            :key="c.goodsName"
            class="income__cat"
            role="button"
            tabindex="0"
            @click="goCategoryOrders(c.goodsName)"
          >
            <div class="income__cat-line1">
              <span class="income__cat-name">{{ c.goodsName }}</span>
              <span class="income__cat-amount app-num">{{
                formatCny(c.myIncome)
              }}</span>
            </div>
            <div class="income__cat-line2">
              <div class="income__cat-bar">
                <div
                  class="income__cat-bar-fill"
                  :style="{ width: catBarWidth(c.myIncome) }"
                />
              </div>
              <span class="income__cat-count app-num"
                >{{ c.orderCount }} 单</span
              >
            </div>
          </div>
        </div>
        <AppEmpty v-else icon="inbox" text="该区间暂无中标记录" />
      </template>
    </section>

    <!-- 品类反查结果（P1-08：系统金额 + 我的金额 + 金额来源） -->
    <section v-if="categoryRecords !== null" class="income__section">
      <div class="income__section-head">
        <h2 class="income__section-title">
          {{ activeCategory || "收入记录" }} · {{ categoryRecords.length }} 单
        </h2>
        <button class="income__back" type="button" @click="closeCategoryOrders">
          返回
        </button>
      </div>
      <div v-if="categoryRecords.length" class="income__mini-table">
        <div class="income__mini-head">
          <span>订单号</span>
          <span>中标时间</span>
          <span>系统金额</span>
          <span class="income__right">我的金额</span>
        </div>
        <div
          v-for="r in categoryRecords"
          :key="r.orderNo"
          class="income__mini-row"
          role="button"
          tabindex="0"
          @click="openDetailByOrderNo(r.orderNo)"
        >
          <span class="app-mono">{{ r.orderNo }}</span>
          <span class="income__mini-muted app-num">{{
            shortTime(r.awardTime)
          }}</span>
          <span class="app-num">{{ fmtAmount(r.legacyAmount) }}</span>
          <span class="income__right app-num">
            {{ amountWithSource(r) }}
          </span>
        </div>
      </div>
      <AppEmpty v-else icon="inbox" text="暂无收入记录" />
    </section>

    <OrderDrawer
      v-model="drawerVisible"
      :order-id="drawerId"
      :order-row="drawerRow"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * 收入工作台（Phase UI-R1 §二十六~§二十八；P1-07/08 切真实源）
 * 双口径大数字（系统口径 = moneys 直取 / 我的统计 = 规则覆盖后）+ 区间切换
 * + 品类横条分布（反查收入记录 → 订单 Drawer）+ 未定义清单（真实源恒空）
 * 数据一律走 income Domain Service（/api/income/*，中标记录口径）；
 * API 失败显式"加载失败 + 重试"（禁 mock fallback——P0 红线延续）。
 */
import { computed, onMounted, ref } from "vue";
import { AppEmpty, AppIcon, AppMetric, AppSkeleton } from "@/components/ui";
import OrderDrawer from "@/components/OrderDrawer/index.vue";
import {
  getIncomeDashboard,
  getIncomeRecordList,
  getUndefinedRecords,
  type IncomeDashboard,
  type IncomeRecord
} from "@/service/income";
import { resolveRecordAmount } from "@/service/income/income-record";
import { listRules } from "@/service/pricing/pricing-rule-store";
import { fetchOrders } from "@/service/order";
import type { OrderListItem } from "@/service/types";

defineOptions({ name: "IncomeOverview" });

type RangeKey = "today" | "week" | "month";

const RANGE_TABS: Array<{ key: RangeKey; label: string }> = [
  { key: "today", label: "今日" },
  { key: "week", label: "本周" },
  { key: "month", label: "本月" }
];

const loading = ref(true);
const loadError = ref(false);
const range = ref<RangeKey>("month");
const dashboard = ref<IncomeDashboard | null>(null);
const undefinedRecords = ref<IncomeRecord[]>([]);
const showUndefined = ref(false);

const categoryRecords = ref<IncomeRecord[] | null>(null);
const activeCategory = ref("");

const drawerVisible = ref(false);
const drawerId = ref<string | null>(null);
const drawerRow = ref<OrderListItem | null>(null);

const rules = listRules();

const hasOverride = computed(
  () => (dashboard.value?.my.overrideHitCount ?? 0) > 0
);
const systemAmount = computed(() =>
  dashboard.value ? formatCny(dashboard.value.summary.systemIncome) : "¥—"
);
const myAmount = computed(() => {
  if (!dashboard.value) return "¥—";
  // 无覆盖规则时我的统计 = 系统口径（不伪装差异，任务书 §五）
  return formatCny(dashboard.value.my.myIncome);
});
const myLabel = computed(
  () => `我的统计 · ${RANGE_TABS.find(r => r.key === range.value)?.label ?? ""}`
);
const scopeNote = computed(() => dashboard.value?.scopeNote ?? "");
const subCountText = computed(() => {
  if (!dashboard.value) return "";
  const s = dashboard.value.summary;
  return `已计入 ${s.orderCount} 单${s.avgPerOrder !== null ? ` · 均单 ${formatCny(s.avgPerOrder)}` : ""}`;
});
const truncatedText = computed(() =>
  dashboard.value?.truncated ? "（明细超上限，统计可能不完整）" : ""
);

function catBarWidth(income: number): string {
  const max = Math.max(
    ...(dashboard.value?.categories.map(c => c.myIncome) ?? [0]),
    1
  );
  const pct = Math.round((income / max) * 100);
  return `${Math.max(pct, 2)}%`;
}

function switchRange(r: RangeKey) {
  range.value = r;
  categoryRecords.value = null;
  activeCategory.value = "";
  void load();
}

async function load() {
  loading.value = true;
  loadError.value = false;
  try {
    dashboard.value = await getIncomeDashboard(range.value);
  } catch {
    // 红线：Real 失败 → 显式错误态（禁 mock fallback）
    dashboard.value = null;
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

async function toggleUndefined() {
  showUndefined.value = !showUndefined.value;
  if (showUndefined.value && undefinedRecords.value.length === 0) {
    try {
      undefinedRecords.value = await getUndefinedRecords();
    } catch {
      undefinedRecords.value = [];
    }
  }
}

async function goCategoryOrders(goodsName: string) {
  activeCategory.value = goodsName;
  try {
    categoryRecords.value = await getIncomeRecordList(range.value, goodsName);
  } catch {
    categoryRecords.value = [];
  }
}

function closeCategoryOrders() {
  categoryRecords.value = null;
  activeCategory.value = "";
}

/** 收入记录 → 订单 Drawer 反查：ordernum 搜索取 needsid（P1-08 链路） */
async function openDetailByOrderNo(orderNo: string) {
  try {
    const res = await fetchOrders({
      view: "all",
      page: 1,
      pageSize: 5,
      keyword: orderNo
    });
    const hit = res.list[0];
    if (!hit) return;
    drawerId.value = hit.orderId;
    drawerRow.value = hit;
    drawerVisible.value = true;
  } catch {
    // 反查失败静默（Drawer 主链路在订单页；此处禁假数据）
  }
}

/** 反查行金额：我的金额 + 来源标注（任务书 §十五） */
function amountWithSource(r: IncomeRecord): string {
  const { effectiveAmount, amountSource } = resolveRecordAmount(r, rules);
  if (amountSource === "undefined") return "未定义";
  const label = amountSource === "override" ? " · 个人规则" : "";
  return `¥${effectiveAmount ?? "—"}${label}`;
}

function fmtAmount(n: number | null): string {
  return n === null ? "—" : `¥${n}`;
}

function formatCny(n: number): string {
  return `¥${n.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
}

function shortTime(t: string): string {
  if (!t) return "—";
  const d = new Date(t.replace(/-/g, "/"));
  if (Number.isNaN(d.getTime())) return t;
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

onMounted(() => void load());
</script>

<style scoped>
.income {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
}

.income__head {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.income__headline {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.income__title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--app-text);
}

.income__ranges {
  display: flex;
  gap: var(--space-1);
}

.income__range {
  padding: 6px 12px;
  font-family: inherit;
  font-size: 13px;
  color: var(--app-text-muted);
  cursor: pointer;
  background: transparent;
  border: none;
  border-radius: 999px;
  transition:
    background-color 140ms ease,
    color 140ms ease;
}

.income__range:hover {
  color: var(--app-text);
  background: var(--app-surface-hover);
}

.income__range--active {
  font-weight: 500;
  color: var(--app-text);
  background: var(--app-accent-soft);
}

.income__primary {
  display: flex;
  gap: var(--space-8);
  margin-top: var(--space-2);
}

.income__metric--overridden {
  color: var(--app-accent);
}

.income__scope-note {
  margin: 0;
  font-size: 12px;
  color: var(--app-text-faint);
}

.income__retry {
  padding: 4px 14px;
  font-family: inherit;
  font-size: 12.5px;
  color: var(--app-text);
  cursor: pointer;
  background: var(--app-accent-soft);
  border: none;
  border-radius: 999px;
}

.income__secondary {
  display: flex;
  gap: var(--space-4);
  align-items: center;
  margin-top: var(--space-1);
}

.income__sub {
  font-size: 13px;
  color: var(--app-text-muted);
}

.income__undefined-btn {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  padding: 2px 6px;
  font-family: inherit;
  font-size: 12.5px;
  color: var(--app-warning);
  cursor: pointer;
  background: none;
  border: none;
  border-radius: var(--radius-sm);
}

.income__undefined-btn:hover {
  background: var(--app-warning-soft);
}

/* 未定义清单 */
.income__undefined-list {
  padding: var(--space-3) var(--space-4);
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: var(--radius-md);
}

.income__undefined-title {
  margin-bottom: var(--space-2);
  font-size: 12.5px;
  font-weight: 600;
  color: var(--app-text-secondary);
}

.income__undefined-row {
  display: grid;
  grid-template-columns: 1.4fr 1fr 1.2fr;
  gap: var(--space-3);
  align-items: center;
  width: 100%;
  padding: var(--space-2) var(--space-1);
  font-family: inherit;
  font-size: 13px;
  color: var(--app-text);
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  transition: background-color 140ms ease;
}

.income__undefined-row:hover {
  background: var(--app-surface-hover);
}

.income__undefined-muted {
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--app-text-secondary);
  white-space: nowrap;
}

.income__undefined-reason {
  font-size: 12px;
  color: var(--app-text-faint);
  text-align: right;
}

/* 分区 */
.income__section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.income__section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.income__section-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--app-text-secondary);
  letter-spacing: 0.02em;
}

.income__back {
  font-family: inherit;
  font-size: 12.5px;
  color: var(--app-text-muted);
  cursor: pointer;
  background: none;
  border: none;
}

.income__back:hover {
  color: var(--app-text);
}

/* 品类横条（§二十六：唯一"图表"，极简横线） */
.income__cats {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.income__cat {
  padding: 2px 4px;
  cursor: pointer;
  border-radius: var(--radius-md);
  transition: background-color 140ms ease;
}

.income__cat:hover {
  background: var(--app-surface-hover);
}

.income__cat-line1 {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 4px;
}

.income__cat-name {
  font-size: 13.5px;
  color: var(--app-text);
}

.income__cat-amount {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--app-text);
}

.income__cat-line2 {
  display: flex;
  gap: var(--space-3);
  align-items: center;
}

.income__cat-bar {
  flex: 1;
  height: 3px;
  overflow: hidden;
  background: var(--app-surface-hover);
  border-radius: 2px;
}

.income__cat-bar-fill {
  height: 100%;
  background: var(--app-accent);
  border-radius: 2px;
  transition: width 200ms ease;
}

.income__cat-count {
  font-size: 12px;
  color: var(--app-text-faint);
  white-space: nowrap;
}

/* 品类反查迷你表 */
.income__mini-table {
  display: flex;
  flex-direction: column;
}

.income__mini-head,
.income__mini-row {
  display: grid;
  grid-template-columns: 1.4fr 1fr 0.9fr 0.9fr;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-2) var(--space-2);
  font-size: 13px;
}

.income__mini-head {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--app-text-faint);
  letter-spacing: 0.03em;
  border-bottom: 1px solid var(--app-border);
}

.income__mini-row {
  color: var(--app-text);
  cursor: pointer;
  border-bottom: 1px solid var(--app-border);
  border-radius: var(--radius-sm);
  transition: background-color 140ms ease;
}

.income__mini-row:hover {
  background: var(--app-surface-hover);
}

.income__mini-muted {
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--app-text-secondary);
  white-space: nowrap;
}

.income__right {
  text-align: right;
}
</style>
