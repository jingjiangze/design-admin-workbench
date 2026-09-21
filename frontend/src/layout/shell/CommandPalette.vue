<template>
  <Teleport to="body">
    <Transition name="app-palette">
      <div v-if="visible" class="app-palette__mask" @mousedown.self="close">
        <div class="app-palette" role="dialog" aria-label="全局搜索">
          <div class="app-palette__input-row">
            <AppIcon
              name="search"
              :size="17"
              class="app-palette__search-icon"
            />
            <input
              ref="inputRef"
              v-model="query"
              class="app-palette__input"
              type="text"
              placeholder="搜订单号 / 商品…"
              @keydown.down.prevent="move(1)"
              @keydown.up.prevent="move(-1)"
              @keydown.enter.prevent="chooseActive"
              @keydown.esc.prevent="close"
              @input="onQueryInput"
            />
            <button
              class="app-palette__kbd"
              type="button"
              tabindex="-1"
              @click="close"
            >
              Esc
            </button>
          </div>

          <div ref="bodyRef" class="app-palette__body">
            <template v-if="query.trim() === ''">
              <div v-if="recentSearches.length" class="app-palette__section">
                <div class="app-palette__section-title">
                  最近搜索
                  <button
                    class="app-palette__clear-recent"
                    type="button"
                    @click="clearRecent"
                  >
                    清除
                  </button>
                </div>
                <button
                  v-for="(r, i) in recentSearches"
                  :key="r"
                  class="app-palette__row"
                  :class="{
                    'app-palette__row--active': activeIndex === flatOffset + i
                  }"
                  type="button"
                  @mouseenter="activeIndex = flatOffset + i"
                  @click="applyRecent(r)"
                >
                  <AppIcon
                    name="history"
                    :size="14"
                    class="app-palette__row-icon"
                  />
                  <span class="app-palette__row-title app-mono">{{ r }}</span>
                </button>
              </div>
              <div v-else class="app-palette__hint">
                <p>输入订单号 / 店铺 / 客户 / 品类开始搜索</p>
                <p class="app-palette__hint-sub">
                  ↑↓ 选择 · Enter 打开 · Esc 关闭
                </p>
              </div>
            </template>

            <template v-else>
              <AppSkeleton v-if="searching" :rows="5" />

              <template v-else>
                <div v-if="orderHits.length" class="app-palette__section">
                  <div class="app-palette__section-title">订单</div>
                  <button
                    v-for="(o, i) in orderHits"
                    :key="`o-${o.orderId}`"
                    class="app-palette__row"
                    :class="{ 'app-palette__row--active': activeIndex === i }"
                    type="button"
                    @mouseenter="activeIndex = i"
                    @click="goOrder(o.orderNo)"
                  >
                    <span class="app-palette__row-title app-mono">{{
                      o.orderNo
                    }}</span>
                    <span class="app-palette__row-sub">{{
                      o.productName || o.taskType
                    }}</span>
                    <span class="app-palette__row-extra">{{ o.shop }}</span>
                    <AppStatus :label="o.stateLabel" />
                  </button>
                </div>

                <div v-if="goodsHits.length" class="app-palette__section">
                  <div class="app-palette__section-title">品类</div>
                  <button
                    v-for="(g, i) in goodsHits"
                    :key="`g-${g.goodsId}-${g.subGoodsId}`"
                    class="app-palette__row"
                    :class="{
                      'app-palette__row--active':
                        activeIndex === orderHits.length + i
                    }"
                    type="button"
                    @mouseenter="activeIndex = orderHits.length + i"
                    @click="goCategory(g.displayName)"
                  >
                    <span class="app-palette__row-title">{{
                      g.displayName
                    }}</span>
                    <span class="app-palette__row-sub">{{ g.group }}</span>
                  </button>
                </div>

                <AppEmpty
                  v-if="!orderHits.length && !goodsHits.length"
                  text="没有匹配的订单或品类"
                />
              </template>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * CommandPalette —— 全局搜索（Phase UI-R1 §八）
 * Command Palette 模式：最近搜索 / 订单 / 品类分区；↑↓ Enter Esc 键盘优先
 * 数据一律走 Domain Service（订单关键词服务端搜索；品类走 searchGoods）
 */
import { computed, nextTick, ref, watch } from "vue";
import { useRouter } from "vue-router";
import AppIcon from "@/components/ui/AppIcon.vue";
import AppStatus from "@/components/ui/AppStatus.vue";
import AppEmpty from "@/components/ui/AppEmpty.vue";
import AppSkeleton from "@/components/ui/AppSkeleton.vue";
import { fetchOrders, type OrderListItem } from "@/service/order";
import {
  fetchGoodsCatalog,
  searchGoods,
  type GoodsItem
} from "@/service/category";

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{ "update:visible": [v: boolean] }>();

const router = useRouter();

const RECENT_KEY = "dw:recent-searches";
const MAX_RECENT = 5;

const inputRef = ref<HTMLInputElement>();
const bodyRef = ref<HTMLElement>();
const query = ref("");
const searching = ref(false);
const orderHits = ref<OrderListItem[]>([]);
const goodsHits = ref<GoodsItem[]>([]);
const recentSearches = ref<string[]>(loadRecent());
const activeIndex = ref(0);

/** 最近搜索区在扁平导航序列中的起始偏移（无输入时只有最近区） */
const flatOffset = computed(() => 0);
const flatCount = computed(
  () =>
    orderHits.value.length +
    goodsHits.value.length +
    recentSearches.value.length
);

watch(
  () => props.visible,
  async v => {
    if (v) {
      query.value = "";
      orderHits.value = [];
      goodsHits.value = [];
      activeIndex.value = 0;
      await nextTick();
      inputRef.value?.focus();
    }
  }
);

function close() {
  emit("update:visible", false);
}

function move(step: number) {
  if (flatCount.value === 0) return;
  activeIndex.value =
    (activeIndex.value + step + flatCount.value) % flatCount.value;
  void nextTick(() => {
    bodyRef.value
      ?.querySelector(".app-palette__row--active")
      ?.scrollIntoView({ block: "nearest" });
  });
}

function chooseActive() {
  const idx = activeIndex.value;
  if (query.value.trim() === "") {
    const r = recentSearches.value[idx];
    if (r) applyRecent(r);
    return;
  }
  if (idx < orderHits.value.length) {
    goOrder(orderHits.value[idx].orderNo);
  } else {
    const g = goodsHits.value[idx - orderHits.value.length];
    if (g) goCategory(g.displayName);
  }
}

// ── 搜索（debounce 250ms；打开时查询，非轮询 §五十四） ──
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function onQueryInput() {
  activeIndex.value = 0;
  if (debounceTimer) clearTimeout(debounceTimer);
  const q = query.value.trim();
  if (!q) {
    searching.value = false;
    orderHits.value = [];
    goodsHits.value = [];
    return;
  }
  searching.value = true;
  debounceTimer = setTimeout(() => void runSearch(q), 250);
}

async function runSearch(q: string) {
  const [ordersRes, catalog] = await Promise.all([
    fetchOrders({ view: "all", page: 1, pageSize: 30, keyword: q }).catch(
      () => null
    ),
    fetchGoodsCatalog().catch(() => [])
  ]);
  // 关闭后返回的陈旧结果丢弃
  if (query.value.trim() !== q) return;
  orderHits.value = ordersRes?.list.slice(0, 6) ?? [];
  goodsHits.value = searchGoods(catalog, q).slice(0, 5);
  searching.value = false;
  activeIndex.value = 0;
}

// ── 跳转 + 最近搜索 ──
function goOrder(orderNo: string) {
  pushRecent(orderNo);
  close();
  // 订单号命中 → 直接跳全屏平铺详情页（订单/交稿/改价），与首页直查一致
  router.push({
    path: "/order-history/index",
    query: { no: orderNo }
  });
}
function goCategory(name: string) {
  pushRecent(name);
  close();
  router.push({ path: "/category/index", query: { q: name } });
}
function applyRecent(r: string) {
  query.value = r;
  onQueryInput();
}
function pushRecent(term: string) {
  const next = [term, ...recentSearches.value.filter(t => t !== term)].slice(
    0,
    MAX_RECENT
  );
  recentSearches.value = next;
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* 存储不可用时静默（搜索功能不受影响） */
  }
}
function clearRecent() {
  recentSearches.value = [];
  try {
    localStorage.removeItem(RECENT_KEY);
  } catch {
    /* 同上 */
  }
}
function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed)
      ? parsed.filter(t => typeof t === "string")
      : [];
  } catch {
    return [];
  }
}
</script>

<style scoped>
.app-palette__mask {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 14vh;
  background: var(--app-overlay-bg);
}

.app-palette {
  display: flex;
  flex-direction: column;
  width: 600px;
  max-width: calc(100vw - 48px);
  max-height: 62vh;
  overflow: hidden;
  background: var(--app-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-overlay);
}

.app-palette__input-row {
  display: flex;
  flex-shrink: 0;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-4) var(--space-4);
  border-bottom: 1px solid var(--app-border);
}

.app-palette__search-icon {
  color: var(--app-text-faint);
}

.app-palette__input {
  flex: 1;
  min-width: 0;
  font-family: inherit;
  font-size: 15px;
  color: var(--app-text);
  outline: none;
  background: transparent;
  border: none;
}

.app-palette__input::placeholder {
  color: var(--app-text-faint);
}

.app-palette__kbd {
  padding: 3px 6px;
  font-family: inherit;
  font-size: 11px;
  color: var(--app-text-faint);
  cursor: pointer;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 4px;
}

.app-palette__body {
  min-height: 120px;
  padding: var(--space-2) var(--space-2) var(--space-3);
  overflow-y: auto;
}

.app-palette__section {
  margin-top: var(--space-2);
}

.app-palette__section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-2) var(--space-1);
  font-size: 11.5px;
  font-weight: 600;
  color: var(--app-text-faint);
  letter-spacing: 0.04em;
}

.app-palette__clear-recent {
  font-family: inherit;
  font-size: 11.5px;
  color: var(--app-text-faint);
  cursor: pointer;
  background: none;
  border: none;
}

.app-palette__clear-recent:hover {
  color: var(--app-text-secondary);
}

.app-palette__row {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  width: 100%;
  padding: 9px var(--space-2);
  font-family: inherit;
  color: var(--app-text);
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: none;
  border-radius: var(--radius-md);
}

.app-palette__row--active,
.app-palette__row:hover {
  background: var(--app-surface-hover);
}

.app-palette__row-icon {
  color: var(--app-text-faint);
}

.app-palette__row-title {
  font-size: 13.5px;
  font-weight: 500;
  color: var(--app-text);
  white-space: nowrap;
}

.app-palette__row-sub {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12.5px;
  color: var(--app-text-muted);
  white-space: nowrap;
}

.app-palette__row-extra {
  margin-left: auto;
  font-size: 12.5px;
  color: var(--app-text-faint);
  white-space: nowrap;
}

.app-palette__hint {
  padding: var(--space-6) var(--space-4);
  font-size: 13px;
  color: var(--app-text-muted);
  text-align: center;
}

.app-palette__hint p {
  margin: 0 0 var(--space-1);
}

.app-palette__hint-sub {
  font-size: 12px;
  color: var(--app-text-faint);
}

/* 进出动画 150ms（§三十四：120~200ms） */
.app-palette-enter-active,
.app-palette-leave-active {
  transition: opacity 150ms ease;
}

.app-palette-enter-active .app-palette,
.app-palette-leave-active .app-palette {
  transition:
    transform 150ms ease,
    opacity 150ms ease;
}

.app-palette-enter-from,
.app-palette-leave-to {
  opacity: 0;
}

.app-palette-enter-from .app-palette,
.app-palette-leave-to .app-palette {
  opacity: 0;
  transform: translateY(-6px) scale(0.99);
}
</style>
