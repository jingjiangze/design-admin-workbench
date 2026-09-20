<script setup lang="ts">
/**
 * 品类中心（P1B-06b，docs/DESIGNER_WORKBENCH_SPEC.md §8）
 *
 * Tab1 品类订单：品类卡（今日 N 单 / 本月 ¥xx / 我的金额）→ 点击进订单页。
 * Tab2 金额规则：按品类分组商品行（系统金额 | 我的金额 对照，⚠ 未设置醒目）、
 *      搜索（名称/goodsid/keywords）、设置金额弹窗、批量设置、恢复系统金额。
 * 金额规则读写经 pricingRuleStore（页面禁止直接 localStorage）。
 * 未定义 ≠ ¥0：未定义灰色警告样式，¥0 正常样式（docs/PRICING_RULE_SPEC.md §5）。
 */
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  fetchGoodsCatalog,
  groupByCategory,
  searchGoods
} from "@/service/category";
import type { GoodsItem } from "@/service/category";
import {
  listRules,
  setRule,
  clearRule
} from "@/service/pricing/pricing-rule-store";
import { formatAmount } from "@/service/pricing/amount-resolution";
import { getIncomeDashboard } from "@/service/income";
import type { CategoryIncome } from "@/service/income";
import type { PricingRule } from "@/service/pricing/pricing-rule-types";

defineOptions({
  name: "Category"
});

const route = useRoute();
const router = useRouter();

const activeTab = ref(route.query.tab === "pricing" ? "pricing" : "orders");
const loading = ref(true);
const goods = ref<GoodsItem[]>([]);
const rules = ref<PricingRule[]>([]);
const categoryStats = ref<CategoryIncome[]>([]);
const keyword = ref("");

// 设置金额弹窗
const editVisible = ref(false);
const editingGoods = ref<GoodsItem | null>(null);
const editAmount = ref<string>("");

// 批量设置
const selectedGoods = ref<GoodsItem[]>([]);
const batchVisible = ref(false);
const batchAmount = ref<string>("");

async function load() {
  loading.value = true;
  try {
    const [catalog, dash] = await Promise.all([
      fetchGoodsCatalog(),
      getIncomeDashboard("month")
    ]);
    goods.value = catalog;
    rules.value = listRules();
    categoryStats.value = dash.categories;
  } finally {
    loading.value = false;
  }
}

onMounted(load);

const grouped = computed(() =>
  groupByCategory(searchGoods(goods.value, keyword.value))
);

function ruleOf(g: GoodsItem): PricingRule | null {
  return (
    rules.value.find(
      r =>
        r.goodsId === g.goodsId && (r.subGoodsId ?? "") === (g.subGoodsId || "")
    ) ?? null
  );
}

function myAmountLabel(g: GoodsItem): string {
  const r = ruleOf(g);
  if (!r || r.amount === null) return "⚠ 未设置";
  return formatAmount(r.amount);
}

function openEdit(g: GoodsItem) {
  editingGoods.value = g;
  const r = ruleOf(g);
  editAmount.value = r?.amount != null ? String(r.amount) : "";
  editVisible.value = true;
}

async function saveEdit() {
  const g = editingGoods.value;
  if (!g) return;
  const raw = editAmount.value.trim();
  let amount: number | null = null;
  if (raw !== "") {
    amount = Number(raw);
    if (!Number.isFinite(amount) || amount < 0) {
      ElMessage.warning("金额需为非负数字（留空 = 未设置）");
      return;
    }
  }
  setRule({
    goodsId: g.goodsId,
    subGoodsId: g.subGoodsId || undefined,
    productName: g.displayName,
    amount
  });
  rules.value = listRules();
  editVisible.value = false;
  ElMessage.success(
    amount === null
      ? "已保存（未设置金额）"
      : `已保存 ${g.displayName} = ${formatAmount(amount)}`
  );
}

async function restoreLegacy(g: GoodsItem) {
  const confirmed = await ElMessageBox.confirm(
    `恢复后收入统计将使用旧系统金额${g.legacyAmount === null ? "（该商品旧系统金额未定义，将显示为未定义）" : `（${formatAmount(g.legacyAmount)}）`}。`,
    "恢复系统金额",
    { type: "warning", confirmButtonText: "恢复", cancelButtonText: "取消" }
  ).catch(() => false);
  if (!confirmed) return;
  clearRule(g.goodsId, g.subGoodsId || undefined);
  rules.value = listRules();
  ElMessage.success(`已恢复 ${g.displayName} 的系统金额`);
}

// 批量设置
const batchTargets = computed(() =>
  selectedGoods.value.length > 0
    ? selectedGoods.value
    : grouped.value.flatMap(gr => gr.items)
);

function openBatch() {
  batchAmount.value = "";
  batchVisible.value = true;
}

async function saveBatch() {
  const raw = batchAmount.value.trim();
  const amount = raw === "" ? null : Number(raw);
  if (raw !== "" && (!Number.isFinite(amount) || (amount as number) < 0)) {
    ElMessage.warning("金额需为非负数字（留空 = 未设置）");
    return;
  }
  for (const g of batchTargets.value) {
    setRule({
      goodsId: g.goodsId,
      subGoodsId: g.subGoodsId || undefined,
      productName: g.displayName,
      amount
    });
  }
  rules.value = listRules();
  batchVisible.value = false;
  ElMessage.success(`已批量设置 ${batchTargets.value.length} 个商品`);
}

function goOrders(g: GoodsItem) {
  void router.push({ path: "/order/index", query: { keyword: g.displayName } });
}
</script>

<template>
  <div v-loading="loading" class="category-page">
    <el-tabs v-model="activeTab">
      <!-- Tab 1 品类订单 -->
      <el-tab-pane label="品类订单" name="orders">
        <p class="hint">点击品类卡查看对应订单（本月口径）</p>
        <div class="cat-grid">
          <div
            v-for="c in categoryStats"
            :key="c.category"
            class="cat-card"
            @click="goOrders({ displayName: c.category } as GoodsItem)"
          >
            <span class="cat-name">{{ c.category }}</span>
            <span class="cat-meta"
              >{{ c.orderCount }} 单 · {{ formatAmount(c.income) }}</span
            >
          </div>
          <div v-if="categoryStats.length === 0" class="hint">
            本月暂无计入统计的订单
          </div>
        </div>
      </el-tab-pane>

      <!-- Tab 2 金额规则 -->
      <el-tab-pane label="金额规则" name="pricing">
        <div class="rule-toolbar">
          <el-input
            v-model="keyword"
            class="rule-search"
            placeholder="搜索商品（名称 / goodsid / 关键词，如『名片』）"
            clearable
          />
          <el-button @click="openBatch">批量设置</el-button>
        </div>
        <p class="hint">
          金额规则仅用于个人收入统计，<b>不修改旧系统订单金额</b>。"⚠
          未设置"的商品不会计入收入。
        </p>

        <div v-for="group in grouped" :key="group.group" class="goods-group">
          <h4>{{ group.group }}</h4>
          <el-table
            :data="group.items"
            size="small"
            @selection-change="selectedGoods = $event"
          >
            <el-table-column type="selection" width="42" />
            <el-table-column label="商品" min-width="140">
              <template #default="{ row }">
                {{ row.displayName }}
                <span v-if="row.subGoodsName" class="sub-name"
                  >（{{ row.goodsName }}）</span
                >
              </template>
            </el-table-column>
            <el-table-column label="goodsid" width="110">
              <template #default="{ row }">
                <span class="mono">{{ row.goodsId }}</span>
              </template>
            </el-table-column>
            <el-table-column label="系统金额" width="110" align="center">
              <template #default="{ row }">
                <span :class="{ 'amt-undefined': row.legacyAmount === null }">
                  {{ formatAmount(row.legacyAmount) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="我的金额" width="120" align="center">
              <template #default="{ row }">
                <span
                  :class="{ 'amt-unset': myAmountLabel(row) === '⚠ 未设置' }"
                >
                  {{ myAmountLabel(row) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="170" align="center">
              <template #default="{ row }">
                <el-button
                  size="small"
                  text
                  type="primary"
                  @click="openEdit(row)"
                >
                  {{ ruleOf(row) ? "修改" : "设置金额" }}
                </el-button>
                <el-button
                  v-if="ruleOf(row)"
                  size="small"
                  text
                  type="warning"
                  @click="restoreLegacy(row)"
                >
                  恢复系统金额
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
        <div v-if="grouped.length === 0" class="hint">无匹配商品</div>
      </el-tab-pane>
    </el-tabs>

    <!-- 设置金额弹窗 -->
    <el-dialog v-model="editVisible" title="设置商品金额" width="440px">
      <template v-if="editingGoods">
        <div class="edit-row">
          <span class="edit-label">商品</span>
          <b>{{ editingGoods.displayName }}</b>
        </div>
        <div class="edit-row">
          <span class="edit-label">系统金额</span>
          <span
            :class="{ 'amt-undefined': editingGoods.legacyAmount === null }"
          >
            {{ formatAmount(editingGoods.legacyAmount) }}
          </span>
        </div>
        <div class="edit-row">
          <span class="edit-label">我的统计金额</span>
          <el-input
            v-model="editAmount"
            placeholder="如 8.00；留空 = 未设置"
            class="amount-input"
          >
            <template #prepend>￥</template>
          </el-input>
        </div>
        <p class="edit-note">说明：用于个人收入统计，不修改原订单金额。</p>
      </template>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" @click="saveEdit">保存</el-button>
      </template>
    </el-dialog>

    <!-- 批量设置弹窗 -->
    <el-dialog
      v-model="batchVisible"
      :title="
        selectedGoods.length > 0
          ? `批量设置（已选 ${selectedGoods.length} 个商品）`
          : '批量设置（当前全部商品）'
      "
      width="440px"
    >
      <div class="edit-row">
        <span class="edit-label">统一金额</span>
        <el-input
          v-model="batchAmount"
          placeholder="如 8.00；留空 = 未设置"
          class="amount-input"
        >
          <template #prepend>￥</template>
        </el-input>
      </div>
      <p class="edit-note">说明：批量写入个人金额规则，不修改原订单金额。</p>
      <template #footer>
        <el-button @click="batchVisible = false">取消</el-button>
        <el-button type="primary" @click="saveBatch">应用</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.category-page {
  padding: 16px 20px;
}

.hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.cat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
  margin-top: 10px;
}

.cat-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px;
  cursor: pointer;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}

.cat-card:hover {
  border-color: var(--el-color-primary-light-5);
}

.cat-name {
  font-size: 14px;
  font-weight: 600;
}

.cat-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.rule-toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 8px;
}

.rule-search {
  width: 380px;
}

.goods-group {
  margin-top: 14px;
}

.goods-group h4 {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.sub-name {
  color: var(--el-text-color-secondary);
}

.mono {
  font-family: monospace;
  font-size: 12px;
}

.amt-undefined {
  font-style: italic;
  color: var(--el-text-color-placeholder);
}

.amt-unset {
  color: var(--el-color-warning);
}

.edit-row {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
}

.edit-label {
  width: 96px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.amount-input {
  width: 220px;
}

.edit-note {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}
</style>
