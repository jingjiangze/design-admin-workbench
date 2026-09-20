<script setup lang="ts">
/**
 * 全局搜索（P1B-03，docs/DESIGNER_WORKBENCH_SPEC.md §3）
 *
 * 顶栏常驻；快捷键 / 聚焦、Enter 执行、Esc 清焦。
 * 行为：单个订单号 → 直接打开订单 Drawer；批量（4 分隔符）/ 关键词 → 订单页过滤。
 * 数据经 Domain Service（order.ts），UI 零 legacy 引用。
 */
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import OrderDrawer from "@/components/OrderDrawer/index.vue";
import { fetchOrders } from "@/service/order";
import { formatOrderNos } from "@/utils/order-format";
import type { OrderListItem } from "@/service/types";

defineOptions({
  name: "GlobalSearch"
});

const router = useRouter();
const keyword = ref("");
const inputRef = ref();

const drawerVisible = ref(false);
const drawerOrderId = ref<string | null>(null);
const drawerRow = ref<OrderListItem | null>(null);

function focusInput() {
  inputRef.value?.focus?.();
}

function onKeydown(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement)?.tagName;
  const inEditable = tag === "INPUT" || tag === "TEXTAREA";
  if (e.key === "/" && !inEditable) {
    e.preventDefault();
    focusInput();
  }
}

onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));

async function onEnter() {
  const raw = keyword.value.trim();
  if (!raw) return;
  const parts = formatOrderNos(raw.split(/[\n、,，\s]+/), "newline").split(
    /[\n、,，\s]+/
  );
  // 批量（≥2 个有效订单号）→ 订单页批量过滤
  if (parts.length >= 2) {
    void router.push({
      path: "/order/index",
      query: { orderNos: parts.join(",") }
    });
    keyword.value = "";
    return;
  }
  // 单条：像订单号（TT_ 前缀或纯数字长串）→ 查命中后开 Drawer
  const kw = parts[0] ?? raw;
  const looksLikeOrderNo = /^TT_/i.test(kw) || /^\d{6,}$/.test(kw);
  if (looksLikeOrderNo) {
    const res = await fetchOrders({
      view: "all",
      page: 1,
      pageSize: 500,
      keyword: kw
    });
    const hit = res.list.find(o => o.orderNo === kw) ?? res.list[0];
    if (hit && (hit.orderNo === kw || hit.orderNo.includes(kw))) {
      drawerRow.value = hit;
      drawerOrderId.value = hit.orderId;
      drawerVisible.value = true;
      keyword.value = "";
      return;
    }
    ElMessage.warning(`未找到订单 ${kw}`);
    return;
  }
  // 客户/店铺等关键词 → 订单页模糊过滤
  void router.push({ path: "/order/index", query: { keyword: kw } });
}

function onEsc(e: KeyboardEvent) {
  if (e.key === "Escape") {
    keyword.value = "";
    inputRef.value?.blur?.();
  }
}
</script>

<template>
  <div class="global-search">
    <el-input
      ref="inputRef"
      v-model="keyword"
      size="default"
      placeholder="🔍 搜订单、客户、店铺…（按 / 聚焦）"
      class="gs-input"
      clearable
      @keyup.enter="onEnter"
      @keydown.esc="onEsc"
    />
    <OrderDrawer
      v-model="drawerVisible"
      :order-id="drawerOrderId"
      :order-row="drawerRow"
    />
  </div>
</template>

<style scoped>
.global-search {
  display: flex;
  align-items: center;
  width: 320px;
}

.gs-input {
  width: 100%;
}
</style>
