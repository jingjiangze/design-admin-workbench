<template>
  <div class="orders">
    <div class="orders__head">
      <h1 class="orders__title">订单</h1>
      <span v-if="!loading" class="orders__count app-num">{{ total }}</span>
    </div>

    <!-- 视图 Tab（§二十二：轻量行内，非后台页签） -->
    <div class="orders__views">
      <button
        v-for="(label, key) in VIEW_LABEL"
        :key="key"
        class="orders__view"
        :class="{ 'orders__view--active': view === key }"
        type="button"
        @click="switchView(key as OrderView)"
      >
        {{ label }}
      </button>
    </div>

    <!-- 筛选行（§二十二：不做厚重 Toolbar） -->
    <div class="orders__filters">
      <AppSearch
        v-model="keywordInput"
        size="sm"
        placeholder="搜订单号 / 店铺"
        class="orders__keyword"
        @enter="applyKeyword"
      />
      <ElSelect
        v-model="categoryFilter"
        size="small"
        placeholder="品类"
        clearable
        class="orders__select"
      >
        <ElOption v-for="c in categoryOptions" :key="c" :label="c" :value="c" />
      </ElSelect>
      <ElSelect
        v-model="timeFilter"
        size="small"
        placeholder="时间"
        class="orders__select"
      >
        <ElOption label="全部时间" value="all" />
        <ElOption label="今日" value="today" />
        <ElOption label="本周" value="week" />
        <ElOption label="本月" value="month" />
      </ElSelect>
    </div>

    <!-- 表格（§二十二） -->
    <div class="orders__table">
      <div class="orders__table-head">
        <ElCheckbox
          :model-value="isAllSelected"
          :indeterminate="isIndeterminate"
          aria-label="全选"
          @change="toggleAll"
        />
        <span>订单号</span>
        <span>品类</span>
        <span>店铺</span>
        <span>设计费</span>
        <span>状态</span>
        <span class="orders__right">截稿</span>
      </div>

      <AppSkeleton v-if="loading" :rows="6" type="table" />

      <template v-else-if="displayList.length">
        <div
          v-for="o in displayList"
          :key="o.orderId"
          class="orders__row"
          :class="{ 'orders__row--selected': selected.has(o.orderId) }"
          @click="openDetail(o)"
        >
          <span @click.stop>
            <ElCheckbox
              :model-value="selected.has(o.orderId)"
              @change="toggleSelect(o.orderId)"
            />
          </span>
          <span class="app-mono orders__no">{{ o.orderNo }}</span>
          <span class="orders__muted">{{
            o.productName || o.taskType || "—"
          }}</span>
          <span class="orders__muted">{{ o.shop || "—" }}</span>
          <span class="orders__amount app-num">{{ amountText(o) }}</span>
          <span><AppStatus :label="o.stateLabel" /></span>
          <span class="orders__muted orders__right app-num">
            {{ fmtDeadline(o.endTime) }}
          </span>
        </div>
      </template>

      <AppEmpty v-else icon="inbox" text="没有符合条件的订单" />
    </div>

    <!-- 极简分页 -->
    <div v-if="!loading && total > pageSize" class="orders__pagination">
      <ElPagination
        layout="prev, pager, next"
        :total="total"
        :page-size="pageSize"
        :current-page="page"
        @current-change="onPageChange"
      />
    </div>

    <!-- 浮现式批量操作栏（§二十三：只有勾选后才出现） -->
    <Transition name="orders-bar">
      <div v-if="selected.size > 0" class="orders__bulk">
        <span class="orders__bulk-count app-num"
          >已选择 {{ selected.size }}</span
        >
        <i class="odr-sep" />
        <AppButton variant="ghost" size="sm" icon="copy" @click="bulkCopyNos">
          复制订单号
        </AppButton>
        <AppButton
          variant="solid"
          size="sm"
          icon="bell"
          @click="bulkRemindText"
        >
          生成催稿文本
        </AppButton>
        <button
          class="orders__bulk-close"
          type="button"
          aria-label="取消选择"
          @click="clearSelection"
        >
          <AppIcon name="close" :size="14" />
        </button>
      </div>
    </Transition>

    <OrderDrawer
      v-model="drawerVisible"
      :order-id="drawerId"
      :order-row="drawerRow"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * 订单工作台（Phase UI-R1 §二十二/§二十三/§三十三）
 * 6 视图行内 Tab + 轻筛选 + 极简线表 + 浮现式批量栏
 * 品类/时间筛选在当前结果上过滤（Real 服务端分页下仅作用于当前页，
 * 全量筛选待 CF-REAL-05 真实搜索升级——诚实标注，不伪造全量能力）
 */
import { computed, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import {
  ElCheckbox,
  ElMessage,
  ElPagination,
  ElSelect,
  ElOption
} from "element-plus";
import {
  AppButton,
  AppEmpty,
  AppIcon,
  AppSearch,
  AppSkeleton,
  AppStatus
} from "@/components/ui";
import OrderDrawer from "@/components/OrderDrawer/index.vue";
import { fetchOrders, VIEW_LABEL } from "@/service/order";
import type { OrderListItem, OrderView } from "@/service/types";
import {
  renderRemindTextBatch,
  type RemindTemplateVars
} from "@/service/expedite";

defineOptions({ name: "OrderList" });

const route = useRoute();

const loading = ref(true);
const view = ref<OrderView>("all");
const list = ref<OrderListItem[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = 30;

const keywordInput = ref("");
const keyword = ref("");
const categoryFilter = ref<string>("");
const timeFilter = ref("all");

const selected = ref(new Set<string>());
const drawerVisible = ref(false);
const drawerId = ref<string | null>(null);
const drawerRow = ref<OrderListItem | null>(null);

// ── 数据加载（打开/查询时请求，非轮询 §五十四） ──
async function load() {
  loading.value = true;
  try {
    const res = await fetchOrders({
      view: view.value,
      page: page.value,
      pageSize,
      keyword: keyword.value || undefined
    });
    list.value = res.list;
    total.value = res.total;
  } catch {
    list.value = [];
    total.value = 0;
    ElMessage.error("订单暂时无法加载");
  } finally {
    loading.value = false;
  }
}

function switchView(v: OrderView) {
  view.value = v;
  page.value = 1;
  clearSelection();
  void load();
}

function onPageChange(p: number) {
  page.value = p;
  clearSelection();
  void load();
}

function applyKeyword() {
  keyword.value = keywordInput.value.trim();
  page.value = 1;
  void load();
}

/** Palette 跳转带入 keyword */
onMounted(() => {
  const q = route.query.keyword;
  if (typeof q === "string" && q) {
    keywordInput.value = q;
    keyword.value = q;
  }
  void load();
});

// ── 客户端筛选（品类/时间，作用于当前结果集） ──
const displayList = computed(() => {
  let arr = list.value;
  if (categoryFilter.value) {
    arr = arr.filter(o => (o.productName || "") === categoryFilter.value);
  }
  if (timeFilter.value !== "all") {
    const now = new Date();
    let from: Date;
    if (timeFilter.value === "today") {
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (timeFilter.value === "week") {
      const d = new Date(now);
      const day = (d.getDay() + 6) % 7; // 周一为一周开始
      from = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
    } else {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    arr = arr.filter(o => {
      const t = o.createTime ? new Date(o.createTime.replace(/-/g, "/")) : null;
      return t ? t.getTime() >= from.getTime() : false;
    });
  }
  return arr;
});

const categoryOptions = computed(() => {
  const set = new Set<string>();
  for (const o of list.value) {
    const name = o.productName || o.taskType;
    if (name) set.add(name);
  }
  return [...set];
});

// ── 展示工具 ──
function amountText(o: OrderListItem): string {
  if (o.amountSource === "undefined") return "未定义";
  return `¥${o.effectiveAmount ?? "—"}`;
}

function fmtDeadline(endTime: string): string {
  if (!endTime) return "—";
  const d = new Date(endTime.replace(/-/g, "/"));
  if (Number.isNaN(d.getTime())) return endTime;
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${hm}`;
}

// ── Drawer ──
function openDetail(o: OrderListItem) {
  drawerId.value = o.orderId;
  drawerRow.value = o;
  drawerVisible.value = true;
}

// ── 批量选择（§二十三/§三十三：浮现式） ──
const isAllSelected = computed(
  () =>
    displayList.value.length > 0 &&
    displayList.value.every(o => selected.value.has(o.orderId))
);
const isIndeterminate = computed(() => {
  const n = displayList.value.filter(o => selected.value.has(o.orderId)).length;
  return n > 0 && n < displayList.value.length;
});

function toggleAll(checked: unknown) {
  if (checked) {
    displayList.value.forEach(o => selected.value.add(o.orderId));
  } else {
    displayList.value.forEach(o => selected.value.delete(o.orderId));
  }
  selected.value = new Set(selected.value);
}
function toggleSelect(id: string) {
  const next = new Set(selected.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selected.value = next;
}
function clearSelection() {
  selected.value = new Set();
}

function selectedRows(): OrderListItem[] {
  return displayList.value.filter(o => selected.value.has(o.orderId));
}

async function bulkCopyNos() {
  const nos = selectedRows().map(o => o.orderNo);
  if (!nos.length) return;
  try {
    await navigator.clipboard.writeText(nos.join("\n"));
    ElMessage.success(`已复制 ${nos.length} 个订单号`);
  } catch {
    ElMessage.error("复制失败");
  }
}

/** 批量生成催稿文本并复制（本地工作流，不发送——长文 CF §十四） */
async function bulkRemindText() {
  const rows = selectedRows();
  if (!rows.length) return;
  const vars: RemindTemplateVars[] = rows.map(o => ({
    shop: o.shop ?? "",
    orderNo: o.orderNo ?? "",
    category: o.productName || o.taskType || "",
    deadline: o.endTime ?? ""
  }));
  const text = renderRemindTextBatch(vars, "gentle");
  try {
    await navigator.clipboard.writeText(text);
    ElMessage.success(`已生成 ${rows.length} 条催稿文本并复制`);
  } catch {
    ElMessage.error("复制失败");
  }
}
</script>

<style scoped>
.orders {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.orders__head {
  display: flex;
  gap: var(--space-3);
  align-items: baseline;
}

.orders__title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--app-text);
}

.orders__count {
  font-size: 13px;
  color: var(--app-text-muted);
}

/* 视图行内 Tab */
.orders__views {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.orders__view {
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

.orders__view:hover {
  color: var(--app-text);
  background: var(--app-surface-hover);
}

.orders__view--active {
  font-weight: 500;
  color: var(--app-text);
  background: var(--app-accent-soft);
}

/* 筛选行 */
.orders__filters {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}

.orders__keyword {
  width: 240px;
}

.orders__select {
  width: 130px;
}

.orders__select :deep(.el-select__wrapper) {
  min-height: 30px;
  border-radius: var(--radius-sm);
}

/* 极简线表 */
.orders__table {
  display: flex;
  flex-direction: column;
}

.orders__table-head,
.orders__row {
  display: grid;
  grid-template-columns: 36px 1.5fr 1fr 1.1fr 0.8fr 0.9fr 1fr;
  gap: var(--space-2);
  align-items: center;
  padding: var(--space-2) var(--space-3);
  font-size: 13px;
}

.orders__table-head {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--app-text-faint);
  letter-spacing: 0.03em;
  border-bottom: 1px solid var(--app-border);
}

.orders__row {
  cursor: pointer;
  border-bottom: 1px solid var(--app-border);
  border-radius: var(--radius-sm);
  transition: background-color 140ms ease;
}

.orders__row:hover {
  background: var(--app-surface-hover);
}

.orders__row--selected {
  background: var(--app-accent-soft);
}

.orders__no {
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--app-text);
  white-space: nowrap;
}

.orders__muted {
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--app-text-secondary);
  white-space: nowrap;
}

.orders__amount {
  color: var(--app-text);
}

.orders__right {
  text-align: right;
}

.orders__pagination {
  display: flex;
  justify-content: flex-end;
  padding-top: var(--space-2);
}

/* 浮现式批量栏（§二十三：轻量、不占永久空间） */
.orders__bulk {
  position: fixed;
  bottom: var(--space-6);
  left: 50%;
  z-index: 100;
  display: flex;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-2) var(--space-4);
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 999px;
  box-shadow: var(--shadow-overlay-soft);
  transform: translateX(-50%);
}

.orders__bulk-count {
  font-size: 13px;
  font-weight: 600;
  color: var(--app-text);
}

.orders__bulk-close {
  display: inline-flex;
  padding: 4px;
  color: var(--app-text-faint);
  cursor: pointer;
  background: transparent;
  border: none;
  border-radius: 50%;
}

.orders__bulk-close:hover {
  color: var(--app-text);
  background: var(--app-surface-hover);
}

.orders-bar-enter-active,
.orders-bar-leave-active {
  transition:
    opacity 150ms ease,
    transform 150ms ease;
}

.orders-bar-enter-from,
.orders-bar-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}

.odr-sep {
  display: inline-block;
  width: 3px;
  height: 3px;
  background: var(--app-text-faint);
  border-radius: 50%;
}
</style>
