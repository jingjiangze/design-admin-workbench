<script setup lang="ts">
/**
 * 订单工作表（P1B-04，docs/DESIGNER_WORKBENCH_SPEC.md §4）
 *
 * 默认列：□ / 订单号 / 品类 / 店铺 / 类型 / 设计费 / 状态 / 截稿时间 / 操作
 * 6 视图筛选（全部/待接单/进行中/待审核/已完成/风险），不暴露旧 state 数字。
 * 行点击 → 详情 Drawer；多选 → 批量复制（4 分隔符）。
 * 数据经 Domain Service（order.ts），UI 零 legacy 引用。
 */
import { computed, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { ElMessage } from "element-plus";
import OrderDrawer from "@/components/OrderDrawer/index.vue";
import { fetchOrders, VIEW_LABEL } from "@/service/order";
import type { OrderListItem, OrderView } from "@/service/types";
import {
  enrichOrderAmounts,
  formatAmount
} from "@/service/pricing/amount-resolution";
import { listRules } from "@/service/pricing/pricing-rule-store";
import { formatOrderNos, COPY_FORMAT_LABEL } from "@/utils/order-format";
import type { CopyFormat } from "@/utils/order-format";

defineOptions({
  name: "Order"
});

const route = useRoute();

const loading = ref(true);
const allOrders = ref<OrderListItem[]>([]);
const view = ref<OrderView>("all");
const keyword = ref("");
const selected = ref<OrderListItem[]>([]);

// Drawer
const drawerVisible = ref(false);
const drawerOrderId = ref<string | null>(null);
const drawerRow = ref<OrderListItem | null>(null);

// 批量复制
const copyFormat = ref<CopyFormat>("newline");
const copyPreviewVisible = ref(false);

const VIEW_ORDER: OrderView[] = [
  "all",
  "pending_accept",
  "in_progress",
  "pending_review",
  "completed",
  "at_risk"
];

async function load() {
  loading.value = true;
  try {
    const res = await fetchOrders({ view: "all", page: 1, pageSize: 500 });
    allOrders.value = enrichOrderAmounts(res.list, listRules());
  } finally {
    loading.value = false;
  }
}

onMounted(load);

// 首页/全局搜索跳入（?keyword= / ?view= / ?orderNos=）
watch(
  () => route.query,
  q => {
    if (q.view && VIEW_ORDER.includes(q.view as OrderView)) {
      view.value = q.view as OrderView;
    }
    if (typeof q.keyword === "string") keyword.value = q.keyword;
  },
  { immediate: true }
);

const filtered = computed(() => {
  let list = allOrders.value;
  if (view.value !== "all") list = list.filter(o => o.view === view.value);
  const kw = keyword.value.trim().toLowerCase();
  if (kw) {
    // 支持批量订单号（换行/顿号/逗号/空格）
    const parts = kw.split(/[\n、,，\s]+/).filter(Boolean);
    if (parts.length > 1) {
      list = list.filter(o =>
        parts.some(p => o.orderNo.toLowerCase().includes(p))
      );
    } else {
      list = list.filter(o =>
        [o.orderNo, o.shop, o.customerName, o.customerNick, o.productName ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(kw)
      );
    }
  }
  return list;
});

const selectedNos = computed(() => selected.value.map(o => o.orderNo));
const copyText = computed(() =>
  formatOrderNos(selectedNos.value, copyFormat.value)
);

function openDrawer(row: OrderListItem) {
  drawerRow.value = row;
  drawerOrderId.value = row.orderId;
  drawerVisible.value = true;
}

function copyOrderNo(row: OrderListItem) {
  navigator.clipboard
    .writeText(row.orderNo)
    .then(() => ElMessage.success(`已复制 ${row.orderNo}`))
    .catch(() => ElMessage.warning("复制失败"));
}

async function copySelected() {
  if (selectedNos.value.length === 0) {
    ElMessage.info("请先勾选订单");
    return;
  }
  try {
    await navigator.clipboard.writeText(copyText.value);
    ElMessage.success(
      `已复制 ${selectedNos.value.length} 个订单号（${COPY_FORMAT_LABEL[copyFormat.value]}）`
    );
    copyPreviewVisible.value = false;
  } catch {
    copyPreviewVisible.value = true; // 剪贴板不可用时弹窗手动复制
  }
}

function fmtTime(t: string): string {
  const m = t.match(/\d{2}-\d{2} \d{2}:\d{2}/);
  return m ? m[0] : t || "—";
}
</script>

<template>
  <div class="order-page">
    <!-- 视图筛选 + 搜索 -->
    <div class="filter-bar">
      <el-radio-group v-model="view" size="default">
        <el-radio-button v-for="v in VIEW_ORDER" :key="v" :value="v">
          {{ VIEW_LABEL[v] }}
        </el-radio-button>
      </el-radio-group>
      <el-input
        v-model="keyword"
        class="kw-input"
        placeholder="筛选：订单号 / 客户 / 店铺 / 品类（可粘贴多个订单号）"
        clearable
      />
    </div>

    <!-- 批量操作条 -->
    <div v-if="selected.length > 0" class="batch-bar">
      已选 <b>{{ selected.length }}</b> 单
      <el-select v-model="copyFormat" size="small" class="fmt-select">
        <el-option
          v-for="(label, key) in COPY_FORMAT_LABEL"
          :key="key"
          :label="label"
          :value="key"
        />
      </el-select>
      <el-button size="small" type="primary" @click="copySelected">
        复制订单号
      </el-button>
      <el-button size="small" @click="selected = []">取消选择</el-button>
    </div>

    <!-- 列表 -->
    <el-table
      v-loading="loading"
      :data="filtered"
      size="default"
      class="work-table"
      @row-click="openDrawer"
      @selection-change="selected = $event"
    >
      <el-table-column type="selection" width="42" />
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
      <el-table-column label="品类" width="110">
        <template #default="{ row }">{{ row.productName || "—" }}</template>
      </el-table-column>
      <el-table-column
        prop="shop"
        label="店铺"
        min-width="110"
        show-overflow-tooltip
      />
      <el-table-column prop="taskType" label="类型" width="90" />
      <el-table-column label="设计费" width="100" align="right">
        <template #default="{ row }">
          <span :class="{ 'amt-undefined': row.amountSource === 'undefined' }">
            {{ formatAmount(row.effectiveAmount) }}
          </span>
        </template>
      </el-table-column>
      <el-table-column prop="stateLabel" label="状态" width="90">
        <template #default="{ row }">
          <el-tag
            size="small"
            effect="plain"
            :type="
              row.view === 'completed'
                ? 'success'
                : row.view === 'at_risk'
                  ? 'danger'
                  : 'warning'
            "
          >
            {{ row.stateLabel }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="截稿时间" width="110">
        <template #default="{ row }">{{ fmtTime(row.endTime) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="120" align="center" fixed="right">
        <template #default="{ row }">
          <el-button
            size="small"
            text
            type="primary"
            @click.stop="openDrawer(row)"
            >详情</el-button
          >
          <el-button size="small" text @click.stop="copyOrderNo(row)"
            >复制</el-button
          >
        </template>
      </el-table-column>
    </el-table>

    <!-- 批量复制预览弹窗（剪贴板不可用手动复制兜底） -->
    <el-dialog v-model="copyPreviewVisible" title="复制订单号" width="420px">
      <el-input v-model="copyText" type="textarea" :rows="6" />
      <template #footer>
        <el-button @click="copyPreviewVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <OrderDrawer
      v-model="drawerVisible"
      :order-id="drawerOrderId"
      :order-row="drawerRow"
    />
  </div>
</template>

<style scoped>
.order-page {
  padding: 16px 20px;
}

.filter-bar {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
}

.kw-input {
  width: 320px;
}

.batch-bar {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 12px;
  margin-bottom: 12px;
  font-size: 13px;
  background: var(--el-color-primary-light-9);
  border-radius: 6px;
}

.fmt-select {
  width: 90px;
}

.work-table {
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
</style>
