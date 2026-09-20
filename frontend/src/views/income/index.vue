<script setup lang="ts">
/**
 * 收入页（P1B-07b，docs/DESIGNER_WORKBENCH_SPEC.md §7）
 *
 * 卡片：本日 / 本周 / 本月收入 + 已完成订单 + 金额未定义（点击去设置）。
 * 双口径：我的统计（默认突出）⇄ 系统金额。
 * 品类分布（点击反查订单列表 → Drawer）；未定义提醒条（不计入收入，显式计数）。
 * 数据经 incomeService；金额计算全部委托 income-calculation 纯函数层。
 */
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import OrderDrawer from "@/components/OrderDrawer/index.vue";
import { fetchIncomeScope } from "@/service/income";
import type { CategoryIncome } from "@/service/income";
import {
  getIncomeSummary,
  getIncomeByCategory,
  getIncomeOrders
} from "@/service/income/income-calculation";
import { DEFAULT_INCOME_POLICY } from "@/service/income/income-policy";
import {
  enrichOrderAmounts,
  formatAmount
} from "@/service/pricing/amount-resolution";
import { listRules } from "@/service/pricing/pricing-rule-store";
import type { OrderListItem } from "@/service/types";

defineOptions({
  name: "IncomeView"
});

const router = useRouter();

const loading = ref(true);
const orders = ref<OrderListItem[]>([]);

// 区间：today / week / month / custom
type RangeKey = "today" | "week" | "month" | "custom";
const range = ref<RangeKey>("month");
const customFrom = ref<Date | null>(null);
const customTo = ref<Date | null>(null);

// 双口径："mine" 我的统计 | "system" 系统金额
const gauge = ref<"mine" | "system">("mine");

// Drawer（反查链路：品类 → 订单 → 详情）
const drawerVisible = ref(false);
const drawerOrderId = ref<string | null>(null);
const drawerRow = ref<OrderListItem | null>(null);

// 反查的品类（null = 未选中）
const activeCategory = ref<string | null>(null);

const RANGE_LABEL: Record<RangeKey, string> = {
  today: "本日",
  week: "本周",
  month: "本月",
  custom: "自定义"
};

/** 当前区间（custom 缺省回退本月） */
function currentRange(): { from: Date; to: Date } {
  if (range.value === "custom" && customFrom.value && customTo.value) {
    return { from: customFrom.value, to: customTo.value };
  }
  const key: Exclude<RangeKey, "custom"> =
    range.value === "custom" ? "month" : range.value;
  return presetRange(key);
}

import { DEFAULT_RANGE_PRESETS } from "@/service/income/income-service-core";
function presetRange(key: Exclude<RangeKey, "custom">): {
  from: Date;
  to: Date;
} {
  return DEFAULT_RANGE_PRESETS[key]();
}

/** 区间内 enrich 后的订单 */
const scopedAll = computed(() => {
  const enriched = enrichOrderAmounts(orders.value, listRules());
  const { from, to } = currentRange();
  return enriched.filter(o => {
    if (!o.completeTime) return false;
    const d = new Date(o.completeTime.replace(/-/g, "/"));
    if (Number.isNaN(d.getTime())) return false;
    return d >= from && d <= to;
  });
});

const summary = computed(() =>
  getIncomeSummary(scopedAll.value, listRules(), DEFAULT_INCOME_POLICY)
);

const categories = computed<CategoryIncome[]>(() =>
  getIncomeByCategory(scopedAll.value, listRules(), DEFAULT_INCOME_POLICY, {
    from: new Date(0),
    to: null
  })
);

const scopedOrders = computed(() => {
  if (!activeCategory.value) return scopedAll.value;
  return getIncomeOrders(
    scopedAll.value,
    listRules(),
    DEFAULT_INCOME_POLICY,
    { from: new Date(0), to: null },
    activeCategory.value
  );
});

const displayIncome = computed(() =>
  gauge.value === "mine"
    ? formatAmount(summary.value?.income ?? null)
    : formatAmount(summary.value?.systemIncome ?? null)
);

const undefinedCount = computed(() => summary.value?.undefinedCount ?? 0);

onMounted(async () => {
  loading.value = true;
  try {
    orders.value = await fetchIncomeScope();
  } finally {
    loading.value = false;
  }
});

function selectCategory(name: string | null) {
  activeCategory.value = name;
}

function openDrawer(row: OrderListItem) {
  drawerRow.value = row;
  drawerOrderId.value = row.orderId;
  drawerVisible.value = true;
}

function goPricingRules() {
  void router.push({ path: "/category/index", query: { tab: "pricing" } });
}

function fmtTime(t: string): string {
  const m = t.match(/\d{2}-\d{2} \d{2}:\d{2}/);
  return m ? m[0] : t || "—";
}
</script>

<template>
  <div v-loading="loading" class="income-page">
    <!-- 区间 + 口径 -->
    <div class="toolbar">
      <el-radio-group v-model="range">
        <el-radio-button value="today">本日</el-radio-button>
        <el-radio-button value="week">本周</el-radio-button>
        <el-radio-button value="month">本月</el-radio-button>
        <el-radio-button value="custom">自定义</el-radio-button>
      </el-radio-group>
      <el-date-picker
        v-if="range === 'custom'"
        v-model="customFrom"
        type="date"
        placeholder="开始日期"
        class="date-picker"
      />
      <el-date-picker
        v-if="range === 'custom'"
        v-model="customTo"
        type="date"
        placeholder="结束日期"
        class="date-picker"
      />
      <el-radio-group v-model="gauge" class="gauge-switch">
        <el-radio-button value="mine">我的统计</el-radio-button>
        <el-radio-button value="system">系统金额</el-radio-button>
      </el-radio-group>
    </div>

    <!-- 汇总卡 -->
    <div class="stat-row">
      <div class="stat-card main">
        <span class="stat-label">
          {{ RANGE_LABEL[range] }}收入（{{
            gauge === "mine" ? "我的统计" : "系统金额"
          }}）
        </span>
        <strong class="stat-value">{{ displayIncome }}</strong>
        <span v-if="summary" class="stat-sub">
          {{ gauge === "mine" ? "系统金额口径" : "我的统计口径" }}：
          {{
            formatAmount(
              gauge === "mine" ? summary.systemIncome : summary.income
            )
          }}
        </span>
      </div>
      <div class="stat-card">
        <span class="stat-label">已完成订单</span>
        <strong class="stat-value">{{ summary?.orderCount ?? 0 }}</strong>
        <span class="stat-sub"
          >平均每单 {{ formatAmount(summary?.avgPerOrder ?? null) }}</span
        >
      </div>
      <div class="stat-card warn" @click="goPricingRules">
        <span class="stat-label">金额未定义</span>
        <strong class="stat-value" :class="{ warn: undefinedCount > 0 }">{{
          undefinedCount
        }}</strong>
        <span class="stat-sub">未计入收入统计 [去设置]</span>
      </div>
    </div>

    <!-- 未定义提醒条 -->
    <div v-if="undefinedCount > 0" class="undef-banner">
      ⚠ {{ undefinedCount }} 个订单未计入收入统计（金额未定义）——
      <el-button size="small" text type="primary" @click="goPricingRules">
        去完善商品金额
      </el-button>
    </div>

    <!-- 品类分布（点击反查） -->
    <div class="panel">
      <div class="panel-head">
        <h3>{{ RANGE_LABEL[range] }}品类分布</h3>
        <el-button
          v-if="activeCategory"
          size="small"
          text
          @click="selectCategory(null)"
        >
          清除筛选（{{ activeCategory }}）
        </el-button>
      </div>
      <div class="cat-rows">
        <div
          v-for="c in categories"
          :key="c.category"
          class="cat-row"
          :class="{ active: activeCategory === c.category }"
          @click="selectCategory(c.category)"
        >
          <span class="cat-name">{{ c.category }}</span>
          <span class="cat-count">{{ c.orderCount }} 单</span>
          <span class="cat-income">{{ formatAmount(c.income) }}</span>
        </div>
        <div v-if="categories.length === 0" class="empty-hint">
          该区间暂无计入统计的订单
        </div>
      </div>
    </div>

    <!-- 反查订单列表 -->
    <div class="panel">
      <h3>
        订单列表
        <span v-if="activeCategory" class="panel-sub"
          >（{{ activeCategory }}）</span
        >
      </h3>
      <el-table
        :data="scopedOrders"
        size="small"
        class="compact-table"
        @row-click="openDrawer"
      >
        <el-table-column
          prop="orderNo"
          label="订单号"
          min-width="150"
          show-overflow-tooltip
        >
          <template #default="{ row }">
            <span class="mono">{{ row.orderNo }}</span>
          </template>
        </el-table-column>
        <el-table-column label="品类" width="120">
          <template #default="{ row }">{{
            row.productName || "未分类"
          }}</template>
        </el-table-column>
        <el-table-column label="统计金额" width="110" align="right">
          <template #default="{ row }">
            <span
              :class="{ 'amt-undefined': row.amountSource === 'undefined' }"
            >
              {{ formatAmount(row.effectiveAmount) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="来源" width="130">
          <template #default="{ row }">
            <el-tag
              size="small"
              effect="plain"
              :type="
                row.amountSource === 'override'
                  ? 'primary'
                  : row.amountSource === 'legacy'
                    ? 'info'
                    : 'warning'
              "
            >
              {{
                row.amountSource === "override"
                  ? "个人金额规则"
                  : row.amountSource === "legacy"
                    ? "旧系统设计费"
                    : "金额未定义"
              }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="完成时间" width="110">
          <template #default="{ row }">{{
            fmtTime(row.completeTime)
          }}</template>
        </el-table-column>
      </el-table>
      <div v-if="scopedOrders.length === 0" class="empty-hint">
        无计入统计的订单
      </div>
    </div>

    <OrderDrawer
      v-model="drawerVisible"
      :order-id="drawerOrderId"
      :order-row="drawerRow"
    />
  </div>
</template>

<style scoped>
.income-page {
  padding: 16px 20px;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin-bottom: 14px;
}

.date-picker {
  width: 140px;
}

.gauge-switch {
  margin-left: auto;
}

.stat-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.stat-card {
  padding: 14px 16px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}

.stat-card.main {
  border-color: var(--el-color-primary-light-5);
}

.stat-card.warn {
  cursor: pointer;
}

.stat-label {
  display: block;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.stat-value {
  display: block;
  margin-top: 6px;
  font-size: 26px;
  font-weight: 600;
}

.stat-value.warn {
  color: var(--el-color-warning);
}

.stat-sub {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.undef-banner {
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 10px 14px;
  margin-bottom: 16px;
  font-size: 13px;
  background: var(--el-color-warning-light-9);
  border-radius: 6px;
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

.panel-sub {
  font-size: 12px;
  font-weight: 400;
  color: var(--el-text-color-secondary);
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.panel-head h3 {
  margin: 0;
}

.cat-rows {
  display: flex;
  flex-direction: column;
}

.cat-row {
  display: flex;
  gap: 16px;
  align-items: center;
  padding: 9px 10px;
  font-size: 13px;
  cursor: pointer;
  border-radius: 6px;
}

.cat-row:hover,
.cat-row.active {
  background: var(--el-fill-color-light);
}

.cat-name {
  flex: 1;
}

.cat-count {
  color: var(--el-text-color-secondary);
}

.cat-income {
  min-width: 80px;
  font-weight: 600;
  text-align: right;
}

.compact-table {
  width: 100%;
  cursor: pointer;
}

.mono {
  font-family: monospace;
}

.amt-undefined {
  font-style: italic;
  color: var(--el-color-warning);
}

.empty-hint {
  padding: 12px 0;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}
</style>
