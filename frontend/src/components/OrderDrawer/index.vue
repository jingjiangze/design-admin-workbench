<template>
  <AppDrawer v-model="visible" :size="680">
    <template #header>
      <div class="odr-head">
        <div class="odr-head__main">
          <span class="app-mono odr-head__no">{{ orderNo }}</span>
          <AppStatus v-if="stateLabel" :label="stateLabel" />
        </div>
        <div class="odr-head__actions">
          <AppButton variant="text" size="sm" icon="copy" @click="copyOrderNo">
            复制订单号
          </AppButton>
        </div>
      </div>
    </template>

    <template #subheader>
      <AppSkeleton v-if="loading" :rows="1" />
      <div v-else-if="orderRow" class="odr-summary">
        <span>{{ orderRow.productName || orderRow.taskType || "—" }}</span>
        <i class="odr-sep" />
        <span>{{ orderRow.shop || "—" }}</span>
        <i class="odr-sep" />
        <span>截稿 {{ fmtTime(orderRow.endTime) }}</span>
        <i class="odr-sep" />
        <span>创建 {{ fmtTime(orderRow.createTime) }}</span>
      </div>
    </template>

    <!-- 金额特别设计（§二十五）：数字 + 来源解释，未定义不显示 0 -->
    <div v-if="orderRow" class="odr-amount">
      <span class="odr-amount__label">设计费</span>
      <span
        v-if="orderRow.amountSource !== 'undefined'"
        class="odr-amount__value app-num"
      >
        ¥{{ orderRow.effectiveAmount ?? "—" }}
      </span>
      <span v-else class="odr-amount__value odr-amount__value--undefined">
        未定义
      </span>
      <span class="odr-amount__source">{{ amountSourceText }}</span>
    </div>

    <AppSkeleton v-if="loading" :rows="6" />

    <template v-else-if="loadError">
      <div class="odr-error">
        <AppIcon name="alert" :size="18" />
        <span>详情暂时无法加载</span>
        <AppButton variant="ghost" size="sm" icon="refresh" @click="load">
          重新加载
        </AppButton>
      </div>
    </template>

    <template v-else-if="detail">
      <ElTabs v-model="activeTab" class="odr-tabs">
        <!-- 概要 -->
        <ElTabPane label="概要" name="summary">
          <div class="odr-grid">
            <div
              v-if="detail.preview.smallUrl || detail.preview.largeUrl"
              class="odr-preview"
            >
              <img
                :src="detail.preview.largeUrl || detail.preview.smallUrl"
                alt="订单预览"
                loading="lazy"
              />
            </div>

            <div class="odr-kv-list">
              <div v-if="detail.identity.applyid" class="odr-kv">
                <span class="odr-kv__key">申请流水</span>
                <span class="odr-kv__val app-mono">{{
                  detail.identity.applyid
                }}</span>
              </div>
              <div v-if="orderRow?.customerName" class="odr-kv">
                <span class="odr-kv__key">客户</span>
                <span class="odr-kv__val">
                  {{ orderRow.customerName
                  }}<template v-if="orderRow.customerNick"
                    >（{{ orderRow.customerNick }}）</template
                  >
                </span>
              </div>
              <div v-if="orderRow?.completeTime" class="odr-kv">
                <span class="odr-kv__key">完成时间</span>
                <span class="odr-kv__val app-num">{{
                  orderRow.completeTime
                }}</span>
              </div>
              <div v-if="flagItems.length" class="odr-kv">
                <span class="odr-kv__key">标记</span>
                <span class="odr-kv__val odr-kv__val--flags">
                  <span v-for="f in flagItems" :key="f" class="odr-flag">{{
                    f
                  }}</span>
                </span>
              </div>
              <div v-if="piiItems.length" class="odr-kv">
                <span class="odr-kv__key">联系方式</span>
                <span class="odr-kv__val">{{ piiItems.join(" · ") }}</span>
              </div>
            </div>
          </div>
        </ElTabPane>

        <!-- 版次 -->
        <ElTabPane v-if="detail.editions.length" label="版次" name="editions">
          <div class="odr-table">
            <div class="odr-table__head">
              <span>版次</span>
              <span>规格</span>
              <span>材质</span>
              <span>数量</span>
              <span class="odr-table__right">金额</span>
            </div>
            <div
              v-for="e in detail.editions"
              :key="e.editionIndex"
              class="odr-table__row"
            >
              <span class="app-num"
                >#{{ e.editionIndex }} {{ e.designNo }}</span
              >
              <span class="odr-table__muted app-num">
                {{ e.width }}×{{ e.height }}mm
              </span>
              <span class="odr-table__muted">{{ e.material || "—" }}</span>
              <span class="app-num">{{ e.quantity }}{{ e.unit }}</span>
              <span class="odr-table__right app-num">
                {{ e.amount > 0 ? `¥${e.amount}` : "—" }}
              </span>
            </div>
          </div>
        </ElTabPane>

        <!-- 文件 -->
        <ElTabPane
          v-if="detail.fileConstraints.length"
          label="文件"
          name="files"
        >
          <div
            v-for="fc in detail.fileConstraints"
            :key="fc.goodsId"
            class="odr-files"
          >
            <div class="odr-files__head">
              {{ fc.subGoodsName || fc.goodsName }}
            </div>
            <div class="odr-files__row">
              <span class="odr-kv__key">允许格式</span>
              <span class="odr-files__suffixes">
                <span
                  v-for="s in fc.acceptedSuffixes"
                  :key="s"
                  class="odr-flag app-mono"
                >
                  {{ s }}
                </span>
                <span
                  v-if="!fc.acceptedSuffixes.length"
                  class="odr-table__muted"
                >
                  未限制
                </span>
              </span>
            </div>
            <div class="odr-files__row">
              <span class="odr-kv__key">相似度校验</span>
              <span>{{ fc.similarCheck ? "开启" : "关闭" }}</span>
            </div>
            <div class="odr-files__row">
              <span class="odr-kv__key">文件版次</span>
              <span class="app-num">{{ fc.editionCount }}</span>
            </div>
          </div>
        </ElTabPane>

        <!-- 轨迹（ERP 快照，只读审计） -->
        <ElTabPane v-if="detail.erpSnapshot" label="轨迹" name="trace">
          <div class="odr-kv-list">
            <div class="odr-kv">
              <span class="odr-kv__key">ERP 单号</span>
              <span class="odr-kv__val app-mono">
                {{ detail.erpSnapshot.erpOrderId }}
              </span>
            </div>
            <div v-if="detail.erpSnapshot.erpCreateTime" class="odr-kv">
              <span class="odr-kv__key">ERP 建单</span>
              <span class="odr-kv__val app-num">
                {{ detail.erpSnapshot.erpCreateTime }}
              </span>
            </div>
            <div v-if="detail.erpSnapshot.customerNote" class="odr-kv">
              <span class="odr-kv__key">客户备注</span>
              <span class="odr-kv__val">{{
                detail.erpSnapshot.customerNote
              }}</span>
            </div>
            <div v-if="detail.erpSnapshot.serviceTrace" class="odr-kv">
              <span class="odr-kv__key">工单轨迹</span>
              <span class="odr-kv__val odr-kv__val--pre">
                {{ detail.erpSnapshot.serviceTrace }}
              </span>
            </div>
          </div>
        </ElTabPane>
      </ElTabs>
    </template>

    <AppEmpty v-else icon="inbox" text="未找到该订单的详情数据" />
  </AppDrawer>
</template>

<script setup lang="ts">
/**
 * 订单详情 Drawer（Phase UI-R1 §二十四/§二十五）
 * 680px 现代浮层；Tabs = 概要/版次/文件/轨迹——数据驱动：无数据的区块不渲染，
 * 不造"聊天/校对/历史"空 Tab；金额块带来源解释（§二十五）
 * 接口与 P1B 版本兼容（orderId + orderRow + v-model），使用方零改动
 */
import { computed, ref, watch } from "vue";
import { ElTabs, ElTabPane, ElMessage } from "element-plus";
import {
  AppButton,
  AppDrawer,
  AppEmpty,
  AppIcon,
  AppSkeleton,
  AppStatus
} from "@/components/ui";
import { fetchOrderDetail } from "@/service/order-detail";
import type { OrderDetail } from "@/service/order-detail-types";
import type { OrderListItem } from "@/service/types";
import { findMatchingRule } from "@/service/pricing/amount-resolution";
import { listRules } from "@/service/pricing/pricing-rule-store";

defineOptions({ name: "OrderDrawer" });

const props = defineProps<{
  /** 订单主键（needsid），打开时触发加载 */
  orderId: string | null;
  /** 列表行（可选，补充状态/金额等列表级信息） */
  orderRow: OrderListItem | null;
}>();

const visible = defineModel<boolean>({ default: false });

const loading = ref(false);
const detail = ref<OrderDetail | null>(null);
const loadError = ref("");
const activeTab = ref("summary");

const orderNo = computed(
  () => detail.value?.identity.ordernum ?? props.orderRow?.orderNo ?? "—"
);
const stateLabel = computed(() => props.orderRow?.stateLabel ?? "");

/** 金额来源解释（§二十五：来源必须可识别） */
const amountSourceText = computed(() => {
  const row = props.orderRow;
  if (!row) return "";
  if (row.amountSource === "override") {
    const hit = findMatchingRule(row.goodsId, row.subGoodsId, listRules());
    return hit
      ? `来源：我的金额规则（${hit.productName}）`
      : "来源：我的金额规则";
  }
  if (row.amountSource === "legacy") return "来源：系统设计费";
  return "尚未设置统计金额，且旧系统无设计费";
});

/** 列表级标记（仅展示已验证语义：加急/打回/老客户） */
const flagItems = computed(() => {
  const row = props.orderRow;
  if (!row) return [];
  const out: string[] = [];
  if (row.urgent) out.push("加急");
  if (row.isRepulse) out.push("曾打回");
  if (row.isRegular) out.push("老客户");
  return out;
});

const piiItems = computed(() => {
  const p = detail.value?.pii;
  if (!p) return [];
  return [p.telMasked, p.qqMasked, p.emailMasked, p.companyMasked].filter(
    Boolean
  );
});

watch(
  visible,
  v => {
    if (v) {
      activeTab.value = "summary";
      void load();
    }
  },
  { immediate: true }
);

async function load() {
  const id = props.orderId;
  if (!id) return;
  loading.value = true;
  loadError.value = "";
  try {
    detail.value = await fetchOrderDetail({ needsid: id });
  } catch {
    loadError.value = "load-failed";
    detail.value = null;
  } finally {
    loading.value = false;
  }
}

async function copyOrderNo() {
  try {
    await navigator.clipboard.writeText(orderNo.value);
    ElMessage.success(`已复制订单号 ${orderNo.value}`);
  } catch {
    ElMessage.error("复制失败，请手动选择复制");
  }
}

function fmtTime(t: string): string {
  if (!t) return "—";
  return t;
}
</script>

<style scoped>
.odr-head {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  justify-content: space-between;
  min-width: 0;
}

.odr-head__main {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  min-width: 0;
}

.odr-head__no {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 16px;
  font-weight: 600;
  color: var(--app-text);
  white-space: nowrap;
}

.odr-summary {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
  font-size: 13px;
  color: var(--app-text-secondary);
}

.odr-sep {
  display: inline-block;
  width: 3px;
  height: 3px;
  background: var(--app-text-faint);
  border-radius: 50%;
}

/* 金额块（§二十五） */
.odr-amount {
  display: flex;
  gap: var(--space-3);
  align-items: baseline;
  padding: var(--space-4);
  margin-bottom: var(--space-6);
  background: var(--app-bg);
  border: 1px solid var(--app-border);
  border-radius: var(--radius-md);
}

.odr-amount__label {
  font-size: 12.5px;
  color: var(--app-text-muted);
}

.odr-amount__value {
  font-size: 24px;
  font-weight: 600;
  color: var(--app-text);
  letter-spacing: -0.01em;
}

.odr-amount__value--undefined {
  font-size: 18px;
  color: var(--app-text-faint);
}

.odr-amount__source {
  margin-left: auto;
  font-size: 12px;
  color: var(--app-text-muted);
}

.odr-error {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-8) 0;
  font-size: 13px;
  color: var(--app-text-muted);
}

/* 概要 */
.odr-grid {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.odr-preview img {
  max-width: 240px;
  max-height: 180px;
  object-fit: contain;
  background: var(--app-bg);
  border: 1px solid var(--app-border);
  border-radius: var(--radius-md);
}

.odr-kv-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.odr-kv {
  display: flex;
  gap: var(--space-6);
  align-items: baseline;
  font-size: 13px;
}

.odr-kv__key {
  flex-shrink: 0;
  width: 72px;
  font-size: 12px;
  color: var(--app-text-muted);
}

.odr-kv__val {
  min-width: 0;
  color: var(--app-text);
  word-break: break-all;
}

.odr-kv__val--pre {
  line-height: 1.7;
  white-space: pre-wrap;
}

.odr-kv__val--flags {
  display: inline-flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.odr-flag {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  font-size: 11.5px;
  color: var(--app-text-secondary);
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 999px;
}

/* 版次/明细表 */
.odr-table {
  display: flex;
  flex-direction: column;
}

.odr-table__head,
.odr-table__row {
  display: grid;
  grid-template-columns: 1.3fr 1.1fr 0.9fr 0.7fr 0.8fr;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-2) var(--space-1);
  font-size: 13px;
}

.odr-table__head {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--app-text-faint);
  letter-spacing: 0.03em;
  border-bottom: 1px solid var(--app-border);
}

.odr-table__row {
  color: var(--app-text);
  border-bottom: 1px solid var(--app-border);
}

.odr-table__muted {
  color: var(--app-text-muted);
}

.odr-table__right {
  text-align: right;
}

/* 文件 */
.odr-files {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--app-border);
}

.odr-files__head {
  margin-bottom: var(--space-1);
  font-size: 13.5px;
  font-weight: 600;
  color: var(--app-text);
}

.odr-files__row {
  display: flex;
  gap: var(--space-4);
  align-items: center;
  font-size: 13px;
  color: var(--app-text);
}

.odr-files__suffixes {
  display: inline-flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

/* Tabs 内容导航化（§二十四：像内容导航，不像后台） */
.odr-tabs :deep(.el-tabs__header) {
  margin-bottom: var(--space-6);
}
</style>
