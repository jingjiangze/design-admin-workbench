<script setup lang="ts">
/**
 * 单号查历史（2026-09-21 用户需求）
 * 输入单号 → 完整呈现：① 订单记录（该单号全部需求行）② 交稿记录（每次交稿
 * 的具体时间/状态/设计单号/三类文件，一次或多次全部列出——重点）③ 改价申请与
 * 改价记录（旧系统 editNeeds/query，返回该单号最新一条改价申请及审核信息）。
 * 诚实性：区块缺失/接口失败显式透出，禁静默当空。
 */
import { computed, ref } from "vue";
import { ElInput } from "element-plus";
import { AppButton, AppEmpty, AppIcon } from "@/components/ui";
import {
  fetchOrderHistory,
  retryFailedDeliveries,
  type OrderHistoryResult
} from "@/service/order-history";

defineOptions({ name: "OrderHistoryQuery" });

const keyword = ref("");
const loading = ref(false);
const retrying = ref(false);
const loadError = ref<string | null>(null);
const result = ref<OrderHistoryResult | null>(null);
const searched = ref("");

function fmtAmount(n: number | null): string {
  return n === null ? "—" : `¥${n}`;
}

/** 失败项数量（重试按钮仅在 >0 时出现，§十九） */
const failedCount = computed(
  () => result.value?.deliveries.filter(d => d.status === "error").length ?? 0
);
const okCount = computed(
  () => result.value?.deliveries.filter(d => d.status !== "error").length ?? 0
);
const totalSubmissions = computed(
  () => result.value?.deliveries.reduce((n, d) => n + d.rows.length, 0) ?? 0
);

async function search() {
  const no = keyword.value.trim();
  if (!no) return;
  loading.value = true;
  loadError.value = null;
  result.value = null;
  try {
    result.value = await fetchOrderHistory(no);
    searched.value = no;
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : "查询失败（网络异常）";
  } finally {
    loading.value = false;
  }
}

/** 仅重试失败项（不全部重新请求） */
async function retryFailed() {
  if (!result.value) return;
  retrying.value = true;
  try {
    result.value = await retryFailedDeliveries(result.value);
  } finally {
    retrying.value = false;
  }
}

/** 改价审核状态文案（0=审核中/1=通过/其他=不通过，详情页 JS 取证） */
function priceStatusText(status: number | undefined): string {
  if (status === undefined || status === null) return "—";
  if (status === 0) return "审核中";
  if (status === 1) return "审核通过";
  return "审核不通过";
}
</script>

<template>
  <div class="ohq">
    <div class="ohq__head">
      <h1 class="ohq__title">单号查历史</h1>
      <p class="ohq__sub">
        输入订单号，完整列出该单号下的订单记录、每次交稿记录（含具体时间）与改价记录
      </p>
    </div>

    <div class="ohq__search">
      <ElInput
        v-model="keyword"
        placeholder="输入订单号，如 TT_260908007929"
        size="large"
        clearable
        class="ohq__input"
        @keyup.enter="search"
      />
      <AppButton variant="solid" size="md" :loading="loading" @click="search">
        <AppIcon name="search" :size="16" />
        查询
      </AppButton>
    </div>

    <AppEmpty v-if="loadError" icon="close" :text="loadError">
      <AppButton variant="ghost" size="sm" @click="search">重试</AppButton>
    </AppEmpty>

    <template v-else-if="result">
      <!-- 摘要行 + 精确匹配标注（§十四） -->
      <div class="ohq__summary">
        <span class="app-mono ohq__summary-no">{{ result.orderNo }}</span>
        <span class="ohq__muted app-num">
          {{ result.orders.length }} 条需求 · {{ totalSubmissions }} 次交稿
        </span>
        <span
          v-if="!result.exactMatch && result.orders.length"
          class="ohq__warn"
        >
          未找到与输入完全一致的订单号，以下为包含匹配候选
        </span>
        <span
          v-if="failedCount"
          class="ohq__warn ohq__warn--action"
          role="button"
          @click="retryFailed"
        >
          {{
            retrying
              ? "重试中…"
              : `${okCount}/${result.deliveries.length} 条需求历史已加载，${failedCount} 条读取失败——点击重试失败项`
          }}
        </span>
      </div>

      <!-- ① 订单记录 -->
      <section class="ohq__section">
        <h2 class="ohq__section-title">
          订单记录
          <span class="app-num ohq__count">{{ result.orders.length }} 条</span>
        </h2>
        <AppEmpty
          v-if="!result.orders.length"
          icon="inbox"
          :text="`未查到单号 ${result.orderNo} 对应的订单`"
        />
        <div v-else class="ohq__table">
          <div class="ohq__tr ohq__tr--head">
            <span>订单号</span><span>需求ID</span><span>品类</span>
            <span>店铺</span><span>状态</span><span>设计费</span>
            <span>下单时间</span><span>截稿时间</span>
          </div>
          <div v-for="o in result.orders" :key="o.orderId" class="ohq__tr">
            <span class="app-mono">{{ o.orderNo }}</span>
            <span class="app-mono">{{ o.orderId }}</span>
            <span>{{ o.productName || o.taskType || "—" }}</span>
            <span>{{ o.shop }}</span>
            <span>{{ o.stateLabel || "—" }}</span>
            <span class="app-num">{{ fmtAmount(o.legacyAmount) }}</span>
            <span class="app-num">{{ o.createTime || "—" }}</span>
            <span class="app-num">{{ o.endTime || "—" }}</span>
          </div>
        </div>
      </section>

      <!-- ② 交稿记录（重点：每次交稿具体时间，一次或多次全部列出） -->
      <section class="ohq__section">
        <h2 class="ohq__section-title">交稿记录</h2>
        <AppEmpty
          v-if="!result.deliveries.length"
          icon="check"
          text="该单号下没有需求行，无交稿记录"
        />
        <template v-else>
          <div
            v-for="d in result.deliveries"
            :key="d.needsid"
            class="ohq__delivery"
          >
            <div class="ohq__delivery-head">
              <span class="app-mono">{{ d.orderNo }}</span>
              <span class="ohq__muted">需求ID {{ d.needsid }}</span>
              <span v-if="d.status === 'ok'" class="app-num ohq__count">
                共 {{ d.rows.length }} 次交稿
              </span>
              <span v-else-if="d.status === 'no-block'" class="ohq__warn">
                未找到交稿记录区块——可能尚未交稿，或旧系统模板变更（需人工核查）
              </span>
              <span v-else class="ohq__warn">
                交稿记录读取失败{{
                  d.errorMessage ? `：${d.errorMessage}` : ""
                }}
              </span>
            </div>
            <!-- error ≠ 无交稿（§五红线）：失败显式呈现，禁伪装空 -->
            <div v-if="d.status === 'ok' && d.rows.length" class="ohq__table">
              <div class="ohq__tr ohq__tr--head">
                <span>序号</span><span>交稿时间</span><span>状态</span>
                <span>定稿文件</span><span>源文件</span><span>定稿凭证</span>
                <span class="ohq__wide">设计单号</span>
              </div>
              <div v-for="r in d.rows" :key="r.index" class="ohq__tr">
                <span class="app-num">{{ r.index }}</span>
                <span class="app-num ohq__time">
                  {{ r.isoTime || r.timeText || "—" }}
                </span>
                <span>{{ r.status || "—" }}</span>
                <span>{{ r.files.final ? "已上传" : "—" }}</span>
                <span>{{ r.files.source ? "已上传" : "—" }}</span>
                <span>{{ r.files.proof ? "已上传" : "—" }}</span>
                <span class="ohq__wide ohq__design-no">
                  {{ r.designNos.join("，") || "—" }}
                </span>
              </div>
            </div>
            <AppEmpty
              v-else-if="d.status === 'ok'"
              icon="check"
              text="该需求尚未交稿（区块存在但无记录行）"
            />
          </div>
        </template>
      </section>

      <!-- ③ 最近一次改价（旧系统 editNeeds/query 语义：仅最新一条，非全量历史） -->
      <section class="ohq__section">
        <h2 class="ohq__section-title">最近一次改价</h2>
        <AppEmpty
          v-if="!result.priceChange"
          icon="check"
          :text="`单号 ${result.orderNo} 暂无改价记录`"
        />
        <div v-else class="ohq__price">
          <div class="ohq__price-row">
            <span class="ohq__muted">改价内容</span>
            <span>
              {{ result.priceChange.oldContent || "—" }}
              <AppIcon name="arrow-right" :size="14" />
              {{ result.priceChange.newContent || "—" }}
            </span>
          </div>
          <div class="ohq__price-row">
            <span class="ohq__muted">改价类型</span>
            <span>{{ result.priceChange.editPriceType || "—" }}</span>
          </div>
          <div class="ohq__price-row">
            <span class="ohq__muted">申请时间</span>
            <span class="app-num">{{
              result.priceChange.applyTime ||
              result.priceChange.createTime ||
              "—"
            }}</span>
          </div>
          <div class="ohq__price-row">
            <span class="ohq__muted">审核状态</span>
            <span>{{ priceStatusText(result.priceChange.checkStatus) }}</span>
          </div>
          <div class="ohq__price-row">
            <span class="ohq__muted">审核时间 / 人</span>
            <span class="app-num">
              {{ result.priceChange.auditingTime || "—" }}
              {{ result.priceChange.auditingUserName || "" }}
            </span>
          </div>
          <div class="ohq__price-row">
            <span class="ohq__muted">改价理由</span>
            <span>{{
              result.priceChange.notes || result.priceChange.remark || "—"
            }}</span>
          </div>
        </div>
      </section>
    </template>

    <AppEmpty
      v-else
      icon="inbox"
      text="输入订单号开始查询（支持 TT_ 单号与平台数字单号）"
    />
  </div>
</template>

<style scoped>
.ohq {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.ohq__head {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.ohq__title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--app-text);
}

.ohq__sub {
  margin: 0;
  font-size: 12.5px;
  color: var(--app-text-muted);
}

.ohq__search {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  max-width: 640px;
}

.ohq__input {
  flex: 1;
}

.ohq__section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.ohq__section-title {
  display: flex;
  gap: var(--space-2);
  align-items: baseline;
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--app-text);
}

.ohq__count {
  font-size: 12.5px;
  font-weight: 400;
  color: var(--app-text-muted);
}

.ohq__muted {
  font-size: 12.5px;
  color: var(--app-text-muted);
}

.ohq__summary {
  display: flex;
  gap: var(--space-3);
  align-items: baseline;
  flex-wrap: wrap;
}

.ohq__summary-no {
  font-size: 14px;
  font-weight: 600;
  color: var(--app-text);
}

.ohq__warn {
  font-size: 12.5px;
  color: var(--app-warning, #b7791f);
}

.ohq__warn--action {
  cursor: pointer;
  text-decoration: underline;
}

.ohq__table {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-md);
}

.ohq__tr {
  display: grid;
  grid-template-columns: 1.4fr 1.2fr 0.9fr 1fr 0.8fr 0.7fr 1.2fr 1.1fr;
  gap: var(--space-2);
  align-items: center;
  padding: var(--space-2) var(--space-3);
  font-size: 12.5px;
  color: var(--app-text);
  border-bottom: 1px solid var(--app-border);
}

.ohq__tr:last-child {
  border-bottom: none;
}

.ohq__tr--head {
  font-weight: 500;
  color: var(--app-text-muted);
  background: var(--app-surface-hover);
}

.ohq__delivery {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--app-border);
  border-radius: var(--radius-md);
}

.ohq__delivery-head {
  display: flex;
  gap: var(--space-3);
  align-items: baseline;
}

.ohq__time {
  font-weight: 500;
  color: var(--app-text);
}

.ohq__design-no {
  overflow-wrap: anywhere;
  font-size: 12px;
  color: var(--app-text-muted);
}

@media (max-width: 900px) {
  .ohq__tr {
    grid-template-columns: 1fr 1fr;
  }

  .ohq__wide {
    grid-column: 1 / -1;
  }
}

.ohq__price {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--app-border);
  border-radius: var(--radius-md);
}

.ohq__price-row {
  display: flex;
  gap: var(--space-3);
  align-items: baseline;
  font-size: 13px;
  color: var(--app-text);
}

.ohq__price-row > span:first-child {
  flex-shrink: 0;
  width: 96px;
  font-size: 12.5px;
  color: var(--app-text-muted);
}
</style>
