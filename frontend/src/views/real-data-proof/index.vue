<script setup lang="ts">
/**
 * real-data-proof —— 真实数据证明页（#67 收尾 Wave）
 *
 * 用途：逐域实时探测当前数据通道，向用户证明 INCOME/PRICING/HOME 三域
 * 数据来自真实源（Worker /api/* → 旧系统 / D1），而非 Mock 伪装。
 * 诚实性红线：探测失败显式透出错误原文，禁成功伪装、禁 null→0。
 * 本页不进入正式导航（showLink:false），与 /ui-preview 同类。
 */
import { computed, onMounted, ref } from "vue";
import { ElButton, ElCard, ElTag } from "element-plus";

import { isLegacyRealEnabled } from "@/service/gateway";
import {
  fetchIncomeSummary,
  fetchIncomeMonthRecords
} from "@/service/income/income-api";
import { monthRange } from "@/service/income/time-utils";
import { fetchOrders } from "@/service/order";
import { fetchRules } from "@/service/pricing/pricing-api";
import {
  getSyncStatus,
  getUserIdentity,
  listRules
} from "@/service/pricing/pricing-rule-store";

/** 单项探测结果 */
interface ProbeResult {
  label: string;
  source: string;
  status: "pending" | "ok" | "fail";
  latencyMs: number | null;
  metrics: Array<{ key: string; value: string }>;
  error: string | null;
}

const probedAt = ref<string | null>(null);
const running = ref(false);

function newProbe(label: string, source: string): ProbeResult {
  return {
    label,
    source,
    status: "pending",
    latencyMs: null,
    metrics: [],
    error: null
  };
}

const incomeProbe = ref<ProbeResult>(
  newProbe(
    "收入域 INCOME",
    "Worker /api/income/summary + month-records（旧系统 getIncomeList 中标记录，awardTime 中标时间锚点）"
  )
);
const pricingProbe = ref<ProbeResult>(
  newProbe(
    "品类规则域 PRICING",
    "Worker /api/pricing/rules → D1 pricing_rules（用户身份隔离）"
  )
);
const homeProbe = ref<ProbeResult>(
  newProbe(
    "工作台域 HOME",
    "Worker /api/orders（getOrderList countInfo 六状态计数器 + begindate/enddate 服务端过滤）"
  )
);

const modeLabel = computed(() => (isLegacyRealEnabled() ? "REAL" : "MOCK"));

async function probeIncome(): Promise<void> {
  const probe = newProbe(incomeProbe.value.label, incomeProbe.value.source);
  incomeProbe.value = probe;
  const t0 = performance.now();
  try {
    const { monthKey } = monthRange();
    const [summary, records] = await Promise.all([
      fetchIncomeSummary({ range: "month", month: monthKey }),
      fetchIncomeMonthRecords(monthKey)
    ]);
    probe.metrics = [
      { key: "账期", value: monthKey },
      {
        key: "系统口径收入",
        value:
          summary.systemIncome === null
            ? "—（null，不伪装）"
            : `¥${summary.systemIncome}`
      },
      { key: "订单数", value: String(summary.orderCount) },
      {
        key: "客单均价",
        value: summary.avgPerOrder === null ? "—" : `¥${summary.avgPerOrder}`
      },
      {
        key: "月明细记录数",
        value: `${records.list.length} / total ${records.total}`
      },
      {
        key: "明细截断",
        value: records.truncated ? "是（超 10 页上限）" : "否"
      }
    ];
    probe.status = "ok";
  } catch (e) {
    probe.status = "fail";
    probe.error = e instanceof Error ? e.message : String(e);
  } finally {
    probe.latencyMs = Math.round(performance.now() - t0);
  }
}

async function probePricing(): Promise<void> {
  const probe = newProbe(pricingProbe.value.label, pricingProbe.value.source);
  pricingProbe.value = probe;
  const t0 = performance.now();
  try {
    const serverRules = await fetchRules();
    const sync = getSyncStatus();
    probe.metrics = [
      { key: "身份", value: getUserIdentity() },
      { key: "服务端规则数", value: String(serverRules.length) },
      { key: "本地缓存规则数", value: String(listRules().length) },
      { key: "待同步写意图", value: String(sync.pendingCount) },
      { key: "最近同步时间", value: sync.lastSyncedAt ?? "—" },
      { key: "同步错误", value: sync.lastError ?? "无" }
    ];
    probe.status = "ok";
  } catch (e) {
    probe.status = "fail";
    probe.error = e instanceof Error ? e.message : String(e);
  } finally {
    probe.latencyMs = Math.round(performance.now() - t0);
  }
}

function todayLocal(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

async function probeHome(): Promise<void> {
  const probe = newProbe(homeProbe.value.label, homeProbe.value.source);
  homeProbe.value = probe;
  const t0 = performance.now();
  try {
    const [all, today] = await Promise.all([
      fetchOrders({ view: "all", page: 1, pageSize: 1 }),
      fetchOrders({
        view: "all",
        page: 1,
        pageSize: 1,
        beginDate: todayLocal(),
        endDate: todayLocal()
      })
    ]);
    const ci = all.countInfo ?? {};
    probe.metrics = [
      { key: "订单总数（pageInfo.total）", value: String(all.total) },
      { key: "待接单（countInfo.wait）", value: String(ci.wait ?? "—") },
      {
        key: "未反馈（countInfo.nofeedback）",
        value: String(ci.nofeedback ?? "—")
      },
      { key: "审核不通过（didnotpass）", value: String(ci.didnotpass ?? "—") },
      { key: "不良（badordercount）", value: String(ci.badordercount ?? "—") },
      { key: "今日新增（服务端日期过滤 total）", value: String(today.total) }
    ];
    probe.status = "ok";
  } catch (e) {
    probe.status = "fail";
    probe.error = e instanceof Error ? e.message : String(e);
  } finally {
    probe.latencyMs = Math.round(performance.now() - t0);
  }
}

async function runAllProbes(): Promise<void> {
  running.value = true;
  try {
    await Promise.all([probeIncome(), probePricing(), probeHome()]);
    probedAt.value = new Date().toLocaleString();
  } finally {
    running.value = false;
  }
}

onMounted(runAllProbes);
</script>

<template>
  <div class="rdp-page">
    <ElCard shadow="never" class="rdp-header">
      <div class="rdp-header-row">
        <div>
          <h2 class="rdp-title">真实数据证明 · Real Data Proof</h2>
          <p class="rdp-sub">
            逐域探测当前数据通道真实性；失败显式透出，禁伪装。
          </p>
        </div>
        <div class="rdp-header-meta">
          <ElTag
            :type="modeLabel === 'REAL' ? 'success' : 'warning'"
            size="large"
            effect="dark"
          >
            {{ modeLabel }} 模式
          </ElTag>
          <span class="rdp-probed-at">
            {{ probedAt ? `探测于 ${probedAt}` : "探测中…" }}
          </span>
          <ElButton :loading="running" @click="runAllProbes">重新探测</ElButton>
        </div>
      </div>
    </ElCard>

    <ElCard
      v-for="probe in [incomeProbe, pricingProbe, homeProbe]"
      :key="probe.label"
      shadow="never"
      class="rdp-section"
    >
      <template #header>
        <div class="rdp-section-header">
          <span class="rdp-section-title">{{ probe.label }}</span>
          <ElTag
            :type="
              probe.status === 'ok'
                ? 'success'
                : probe.status === 'fail'
                  ? 'danger'
                  : 'info'
            "
          >
            {{
              probe.status === "ok"
                ? "探测成功"
                : probe.status === "fail"
                  ? "探测失败"
                  : "探测中"
            }}
          </ElTag>
          <span v-if="probe.latencyMs !== null" class="rdp-latency">
            {{ probe.latencyMs }} ms
          </span>
        </div>
      </template>

      <p class="rdp-source">数据源：{{ probe.source }}</p>

      <dl v-if="probe.status === 'ok'" class="rdp-metrics">
        <div v-for="m in probe.metrics" :key="m.key" class="rdp-metric">
          <dt>{{ m.key }}</dt>
          <dd>{{ m.value }}</dd>
        </div>
      </dl>

      <div v-else-if="probe.status === 'fail'" class="rdp-error">
        <p class="rdp-error-title">探测失败（原文透出，不降级伪装）：</p>
        <pre class="rdp-error-body">{{ probe.error }}</pre>
      </div>

      <p v-else class="rdp-loading">探测进行中…</p>
    </ElCard>

    <ElCard shadow="never" class="rdp-section">
      <template #header>
        <div class="rdp-section-header">
          <span class="rdp-section-title">已知边界（诚实性声明）</span>
        </div>
      </template>
      <ul class="rdp-boundary">
        <li>
          商品目录 fetchGoodsCatalog 仍为 Phase 1 脱敏 Mock 样本（Real 聚合
          详情层为 Phase 2 计划）；样本金额已全部清零，不冒充真实金额。
        </li>
        <li>
          收入明细若加载失败，收入页金额按系统口径兜底并显式注记
          （detailDegraded 语义，SPEC §5 红线软化，依据用户 2026-09-21 指令）。
        </li>
        <li>
          旧系统无催稿已读/发送写 API，Real 模式催稿页隐藏已读按钮，仅做
          文本生成+复制。
        </li>
      </ul>
    </ElCard>
  </div>
</template>

<style scoped>
.rdp-page {
  padding: 16px;
}

.rdp-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

.rdp-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.rdp-sub {
  margin: 4px 0 0;
  font-size: 13px;
  opacity: 0.72;
}

.rdp-header-meta {
  display: flex;
  align-items: center;
  gap: 12px;
}

.rdp-probed-at {
  font-size: 12px;
  opacity: 0.72;
}

.rdp-section {
  margin-top: 16px;
}

.rdp-section-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.rdp-section-title {
  font-weight: 600;
}

.rdp-latency {
  font-size: 12px;
  opacity: 0.72;
}

.rdp-source {
  margin: 0 0 12px;
  font-size: 12px;
  opacity: 0.72;
}

.rdp-metrics {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}

.rdp-metric dt {
  font-size: 12px;
  opacity: 0.72;
}

.rdp-metric dd {
  margin: 2px 0 0;
  font-size: 16px;
  font-weight: 600;
}

.rdp-error-title {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 600;
}

.rdp-error-body {
  margin: 0;
  padding: 10px;
  border-radius: 6px;
  background: var(--el-color-danger-light-9, rgba(245, 108, 108, 0.1));
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
}

.rdp-loading {
  margin: 0;
  font-size: 13px;
  opacity: 0.72;
}

.rdp-boundary {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.9;
}
</style>
