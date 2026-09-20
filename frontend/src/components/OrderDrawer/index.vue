<script setup lang="ts">
/**
 * 订单详情抽屉（P1B-05，docs/DESIGNER_WORKBENCH_SPEC.md §5）
 *
 * 区块：订单号(+复制)·状态 → 基础信息 → 金额区（原始/统计明确区分 + 来源解释）
 *       → 版次 → 文件约束 → 聊天/校对/历史（Phase 2 占位）。
 * 数据经 Domain Service（order-detail.ts / pricingRuleStore），UI 零 legacy 引用。
 * 快捷键：Esc 关闭（内置）；C 复制订单号（打开时）。
 */
import { computed, ref, watch } from "vue";
import { ElDrawer, ElTag, ElButton, ElMessage, ElEmpty } from "element-plus";
import { fetchOrderDetail } from "@/service/order-detail";
import type { OrderDetail } from "@/service/order-detail-types";
import { listRules } from "@/service/pricing/pricing-rule-store";
import {
  findMatchingRule,
  formatAmount
} from "@/service/pricing/amount-resolution";
import type { OrderListItem } from "@/service/types";

defineOptions({
  name: "OrderDrawer"
});

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

/** 金额来源解释（docs/INCOME_CALCULATION_SPEC.md：为什么是这个金额） */
const amountExplanation = computed(() => {
  const row = props.orderRow;
  if (!row) return null;
  const rules = listRules();
  const hit = findMatchingRule(row.goodsId, row.subGoodsId, rules);
  if (row.amountSource === "override" && hit) {
    return `本次统计 ${formatAmount(row.effectiveAmount)} · 来源：个人金额规则（${hit.productName} = ${formatAmount(hit.amount)}）`;
  }
  if (row.amountSource === "legacy") {
    return `本次统计 ${formatAmount(row.effectiveAmount)} · 来源：旧系统设计费`;
  }
  return "金额未定义 · 尚未设置统计规则，且旧系统无设计费";
});

/** 复制订单号（C 键 / 按钮） */
async function copyOrderNo() {
  const no = detail.value?.identity.ordernum ?? props.orderRow?.orderNo;
  if (!no) return;
  try {
    await navigator.clipboard.writeText(no);
    ElMessage.success(`已复制订单号 ${no}`);
  } catch {
    ElMessage.warning("复制失败，请手动选择复制");
  }
}

function onKeydown(e: KeyboardEvent) {
  if (!visible.value) return;
  if (e.key.toLowerCase() === "c" && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    void copyOrderNo();
  }
}

watch(
  () => [visible.value, props.orderId] as const,
  async ([vis, id]) => {
    if (vis && id) {
      loading.value = true;
      loadError.value = "";
      detail.value = null;
      try {
        detail.value = await fetchOrderDetail(id);
      } catch (e) {
        loadError.value = e instanceof Error ? e.message : "详情加载失败";
      } finally {
        loading.value = false;
      }
      window.addEventListener("keydown", onKeydown);
    } else {
      window.removeEventListener("keydown", onKeydown);
    }
  }
);

const categoryLabel = computed(() => {
  if (props.orderRow?.productName) return props.orderRow.productName;
  const first = detail.value?.editions?.[0]?.productName;
  return first || "—";
});
</script>

<template>
  <ElDrawer v-model="visible" title="订单详情" size="560px" destroy-on-close>
    <div v-loading="loading" class="drawer-body">
      <ElEmpty v-if="loadError" :description="loadError" />
      <template v-else-if="detail">
        <!-- 头部：订单号 + 复制 + 状态 -->
        <section class="block head">
          <div class="order-no">
            <span class="no-text">{{ detail.identity.ordernum }}</span>
            <ElButton size="small" text type="primary" @click="copyOrderNo">
              复制订单号
            </ElButton>
          </div>
          <div class="tags">
            <ElTag
              v-if="orderRow"
              :type="
                orderRow.view === 'completed'
                  ? 'success'
                  : orderRow.view === 'at_risk'
                    ? 'danger'
                    : 'warning'
              "
              size="small"
            >
              {{ orderRow.stateLabel }}
            </ElTag>
            <ElTag
              v-if="orderRow?.urgent"
              type="danger"
              size="small"
              effect="plain"
            >
              加急
            </ElTag>
          </div>
        </section>

        <!-- 基础信息 -->
        <section class="block">
          <h4>基础信息</h4>
          <div class="grid">
            <div class="cell">
              <span class="label">品类</span>{{ categoryLabel }}
            </div>
            <div class="cell">
              <span class="label">店铺</span>{{ orderRow?.shop || "—" }}
            </div>
            <div class="cell">
              <span class="label">类型</span>{{ orderRow?.taskType || "—" }}
            </div>
            <div class="cell">
              <span class="label">截稿</span>{{ orderRow?.endTime || "—" }}
            </div>
          </div>
        </section>

        <!-- 金额区：原始 / 统计 明确区分 -->
        <section class="block">
          <h4>金额</h4>
          <div class="amount-row">
            <div class="amount-card">
              <span class="label">原始金额（旧系统）</span>
              <strong>{{
                formatAmount(orderRow?.legacyAmount ?? null)
              }}</strong>
            </div>
            <div
              class="amount-card"
              :class="{ warn: orderRow?.amountSource === 'undefined' }"
            >
              <span class="label">统计金额（我的）</span>
              <strong>{{
                formatAmount(orderRow?.effectiveAmount ?? null)
              }}</strong>
            </div>
          </div>
          <p v-if="amountExplanation" class="explain">
            {{ amountExplanation }}
          </p>
        </section>

        <!-- 版次 -->
        <section class="block">
          <h4>版次（{{ detail.editions.length }}）</h4>
          <div v-for="ed in detail.editions" :key="ed.designNo" class="edition">
            <div class="edition-head">
              第 {{ ed.editionIndex }} 版 · {{ ed.productName }}
              <ElTag v-if="ed.designNo" size="small" effect="plain">{{
                ed.designNo
              }}</ElTag>
            </div>
            <div class="edition-meta">
              {{ ed.spec || "—" }} · {{ ed.quantity }} {{ ed.unit }}
              <template v-if="ed.material"> · {{ ed.material }}</template>
            </div>
          </div>
          <p v-if="detail.editions.length === 0" class="empty-hint">
            无版次数据
          </p>
        </section>

        <!-- 文件约束 -->
        <section class="block">
          <h4>文件要求</h4>
          <div
            v-for="(fc, i) in detail.fileConstraints"
            :key="i"
            class="file-line"
          >
            {{ fc.goodsName }}
            <span v-if="fc.subGoodsName"> / {{ fc.subGoodsName }}</span>
            · 格式 {{ fc.acceptedSuffixes.join(" / ") || "—" }}
            <ElTag
              v-if="fc.similarCheck"
              size="small"
              type="warning"
              effect="plain"
              >查重</ElTag
            >
          </div>
          <p v-if="detail.fileConstraints.length === 0" class="empty-hint">
            无文件约束
          </p>
        </section>

        <!-- Phase 2 占位 -->
        <section class="block">
          <h4>聊天 / 校对 / 历史</h4>
          <p class="empty-hint">Phase 2 接入旧系统消息与校对流程</p>
        </section>
      </template>
    </div>
  </ElDrawer>
</template>

<style scoped>
.drawer-body {
  min-height: 200px;
}

.block {
  padding-bottom: 16px;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.block:last-child {
  border-bottom: none;
}

.block h4 {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.order-no {
  display: flex;
  gap: 4px;
  align-items: center;
}

.no-text {
  font-family: monospace;
  font-size: 16px;
  font-weight: 600;
}

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 16px;
}

.cell {
  font-size: 13px;
}

.label {
  display: inline-block;
  width: 72px;
  color: var(--el-text-color-secondary);
}

.amount-row {
  display: flex;
  gap: 12px;
}

.amount-card {
  flex: 1;
  padding: 10px 12px;
  background: var(--el-fill-color-extra-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
}

.amount-card strong {
  display: block;
  margin-top: 4px;
  font-size: 18px;
}

.amount-card.warn strong {
  color: var(--el-color-warning);
}

.explain {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.edition {
  padding: 8px 10px;
  margin-bottom: 8px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
}

.edition-head {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 13px;
  font-weight: 500;
}

.edition-meta {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.file-line {
  font-size: 13px;
  line-height: 1.9;
}

.empty-hint {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}
</style>
