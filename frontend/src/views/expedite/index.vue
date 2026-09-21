<template>
  <div class="expedite">
    <div class="expedite__head">
      <h1 class="expedite__title">催稿</h1>
      <span v-if="!loading" class="expedite__count app-num">
        待处理 {{ pendingGroupCount }}
      </span>
      <button
        class="expedite__read-all"
        type="button"
        :class="{ 'expedite__read-all--on': showAll }"
        @click="showAll = !showAll"
      >
        {{ showAll ? "只看昨天今天" : "显示全部历史" }}
      </button>
      <button
        v-if="pendingGroupCount > 0"
        class="expedite__read-all expedite__process-all"
        type="button"
        @click="markVisibleProcessed"
      >
        一键处理已完成
      </button>
    </div>

    <!-- 列表（§三十一：行式信息；同单号合并为一组，显示最新一条 + 催 N 次） -->
    <div class="expedite__list">
      <AppSkeleton v-if="loading" :rows="5" type="table" />
      <AppEmpty
        v-else-if="loadError"
        icon="close"
        text="加载失败——旧系统催稿消息暂时无法读取，请稍后重试"
      >
        <AppButton variant="ghost" size="sm" @click="load">重试</AppButton>
      </AppEmpty>
      <template v-else-if="visibleGroups.length">
        <div
          v-for="g in visibleGroups"
          :key="g.key"
          class="expedite__row"
          :class="{
            'expedite__row--unread': !isGroupDone(g),
            'expedite__row--selected': selected.has(g.key),
            'expedite__row--done': isGroupDone(g)
          }"
        >
          <span @click.stop>
            <ElCheckbox
              :model-value="selected.has(g.key)"
              @change="toggleSelect(g.key)"
            />
          </span>
          <div class="expedite__main" @click="openDetail(g)">
            <div class="expedite__line1">
              <span class="app-mono expedite__no">{{
                g.orderNo || g.orderId
              }}</span>
              <span v-if="g.count > 1" class="expedite__repeat app-num"
                >催 {{ g.count }} 次</span
              >
              <span class="expedite__muted">{{ g.category || "—" }}</span>
              <span class="expedite__muted">{{ g.shop }}</span>
              <span class="expedite__status">{{
                isGroupDone(g) ? "已处理" : "未处理"
              }}</span>
            </div>
            <div class="expedite__note">
              {{ g.latest.note || "（无催稿备注）" }}
            </div>
          </div>
          <div class="expedite__meta">
            <span class="expedite__deadline app-num"
              >截稿 {{ fmtDeadline(g.deadline) }}</span
            >
            <span class="expedite__time app-num">{{
              fmtTime(g.latest.sendTime)
            }}</span>
          </div>
          <div class="expedite__actions">
            <AppButton variant="text" size="sm" @click="openDetail(g)">
              查看订单
            </AppButton>
            <AppButton
              v-if="!isRealMode && !isGroupDone(g)"
              variant="text"
              size="sm"
              icon="check"
              @click="markRead(g.latest.id)"
            >
              标记已读
            </AppButton>
          </div>
        </div>
      </template>
      <AppEmpty
        v-else
        icon="check"
        text="昨天今天没有待催稿（可点「显示全部历史」查看更早记录）"
      />
    </div>

    <!-- 浮现式批量栏（§三十二） -->
    <Transition name="expedite-bar">
      <div v-if="selected.size > 0" class="expedite__bulk">
        <span class="expedite__bulk-count app-num"
          >已选择 {{ selected.size }} 个订单</span
        >
        <i class="expedite__sep" />
        <AppButton variant="ghost" size="sm" icon="copy" @click="bulkCopyNos">
          复制订单号
        </AppButton>
        <AppButton variant="solid" size="sm" icon="bell" @click="openComposer">
          生成催稿文本
        </AppButton>
        <button
          class="expedite__bulk-close"
          type="button"
          aria-label="取消选择"
          @click="clearSelection"
        >
          <AppIcon name="close" :size="14" />
        </button>
      </div>
    </Transition>

    <!-- 催稿文本 Drawer（§三十二 右侧预览 + 复制全部；无发送按钮） -->
    <AppDrawer v-model="composerVisible" :size="520" title="生成催稿文本">
      <div class="composer">
        <div class="composer__tones">
          <button
            v-for="t in TONES"
            :key="t.key"
            class="composer__tone"
            :class="{ 'composer__tone--active': tone === t.key }"
            type="button"
            @click="tone = t.key"
          >
            {{ t.label }}
          </button>
        </div>

        <div v-if="tone === 'custom'" class="composer__custom">
          <ElInput
            v-model="customTemplate"
            type="textarea"
            :rows="3"
            placeholder="自定义模板：{店铺} {订单} {品类} {截稿}"
          />
          <p class="composer__var-hint">
            可用变量：{店铺} {订单} {品类} {截稿} · 缺失将显式标记
            <span class="app-mono">&lt;缺失:xxx&gt;</span>
          </p>
        </div>

        <div class="composer__preview">
          <div
            v-for="(text, i) in composedTexts"
            :key="i"
            class="composer__item"
          >
            <div class="composer__item-head">
              <span class="app-mono">{{ selectedRows[i]?.orderNo }}</span>
              <button
                class="composer__item-copy"
                type="button"
                @click="copyOne(text)"
              >
                复制
              </button>
            </div>
            <p class="composer__item-text">{{ text }}</p>
          </div>
        </div>
      </div>

      <template #footer>
        <AppButton variant="solid" icon="copy" @click="copyAll">
          复制全部（{{ composedTexts.length }}）
        </AppButton>
      </template>
    </AppDrawer>

    <OrderDrawer
      v-model="drawerVisible"
      :order-id="drawerId"
      :order-row="drawerRow"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * 催稿工作台（Phase UI-R1 §三十一/§三十二；2026-09-21 用户指令改版）
 * - 相同订单号催稿合并为一组（显示最新一条 + 催 N 次）；
 * - 默认只显示昨天和今天的催稿，可切「显示全部」；
 * - 已接收默认按已处理显示（用户指令）；「一键处理已完成」为本地标记
 *   （旧系统无已读/发送写 API [VERIFIED]，处理态仅本系统视图，按身份持久化）；
 * - 重点 = 一次完成：勾选 → 生成催稿文本 → 复制；无"发送催稿"入口。
 */
import { computed, onMounted, ref, watch } from "vue";
import { ElCheckbox, ElInput, ElMessage } from "element-plus";
import {
  AppButton,
  AppDrawer,
  AppEmpty,
  AppIcon,
  AppSkeleton
} from "@/components/ui";
import OrderDrawer from "@/components/OrderDrawer/index.vue";
import {
  fetchExpediteMessages,
  markMessageRead,
  renderRemindTextBatch,
  type ExpediteMessage,
  type RemindTone
} from "@/service/expedite";
import { fetchOrders } from "@/service/order";
import { isLegacyRealEnabled } from "@/service/gateway";
import { getUserIdentity } from "@/service/pricing/pricing-rule-store";
import type { OrderListItem } from "@/service/types";

defineOptions({ name: "ExpediteList" });

const TONES: Array<{ key: Exclude<RemindTone, "custom">; label: string }> = [
  { key: "gentle", label: "温和" },
  { key: "concise", label: "简洁" }
];

const loading = ref(true);
const messages = ref<ExpediteMessage[]>([]);
const selected = ref(new Set<string>());
/** [P0-4] 真实通道无已读/发送写接口——Mock 通道保留本地已读演示 */
const isRealMode = isLegacyRealEnabled();
/** [红线] API 失败必须显式显示，禁止静默空列表 */
const loadError = ref(false);

/** 默认只显示昨天+今天（用户指令）；「显示全部」切换 */
const showAll = ref(false);
/** 本地处理态：按身份持久化（旧系统无写 API，诚实标注"本地标记"） */
const processedIds = ref<Set<string>>(new Set());
const PROCESSED_KEY = `expediteProcessed:${getUserIdentity()}`;

function loadProcessed(): Set<string> {
  try {
    const raw = localStorage.getItem(PROCESSED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function persistProcessed(): void {
  try {
    localStorage.setItem(
      PROCESSED_KEY,
      JSON.stringify([...processedIds.value])
    );
  } catch {
    // 存储满等异常：静默（仅影响本地标记持久化）
  }
}

watch(
  () => getUserIdentity(),
  () => {
    processedIds.value = loadProcessed();
  }
);

/** 催稿组（同单号合并） */
interface ExpediteGroup {
  key: string;
  orderNo: string;
  orderId: string;
  category: string;
  shop: string;
  deadline: string;
  /** 最新一条催稿（组展示与文本生成都用它） */
  latest: ExpediteMessage;
  count: number;
  /** 组内全部消息 id（本地处理态按此记录） */
  allIds: string[];
  /** 组内最新 sendTime（排序/过滤） */
  lastTime: string;
}

function groupMessages(list: ExpediteMessage[]): ExpediteGroup[] {
  const map = new Map<string, ExpediteGroup>();
  for (const m of list) {
    const key = m.orderNo || m.orderId || m.id;
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      existing.allIds.push(m.id);
      // sendTime 倒序入参（fetch 已排），首见即最新
      if (m.sendTime > existing.lastTime) {
        existing.lastTime = m.sendTime;
        existing.latest = m;
      }
    } else {
      map.set(key, {
        key,
        orderNo: m.orderNo,
        orderId: m.orderId,
        category: m.category,
        shop: m.shop,
        deadline: m.deadline,
        latest: m,
        count: 1,
        allIds: [m.id],
        lastTime: m.sendTime
      });
    }
  }
  return [...map.values()];
}

function dayOffsetOf(sendTime: string): number | null {
  if (!sendTime) return null;
  const d = new Date(sendTime.replace(/-/g, "/"));
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - day.getTime()) / 86_400_000);
}

const allGroups = computed(() => groupMessages(messages.value));

const visibleGroups = computed(() =>
  allGroups.value.filter(g => {
    if (showAll.value) return true;
    const offset = dayOffsetOf(g.lastTime);
    return offset !== null && offset >= 0 && offset <= 1; // 今天+昨天
  })
);

/** 组是否"已处理"：已处理/已接收（默认视为已处理）或本地已标记 */
function isGroupDone(g: ExpediteGroup): boolean {
  const s = g.latest.status;
  if (s === "已处理" || s === "已接收") return true;
  return g.allIds.every(id => processedIds.value.has(id));
}

const pendingGroupCount = computed(
  () => visibleGroups.value.filter(g => !isGroupDone(g)).length
);

const composerVisible = ref(false);
const tone = ref<RemindTone>("gentle");
const customTemplate = ref("");

const drawerVisible = ref(false);
const drawerId = ref<string | null>(null);
const drawerRow = ref<OrderListItem | null>(null);

/** 勾选顺序保持列表顺序（组） */
const selectedRows = computed(() =>
  visibleGroups.value.filter(g => selected.value.has(g.key))
);

async function load() {
  loading.value = true;
  loadError.value = false;
  try {
    messages.value = await fetchExpediteMessages();
    processedIds.value = loadProcessed();
  } catch {
    messages.value = [];
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

function toggleSelect(key: string) {
  const next = new Set(selected.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  selected.value = next;
}
function clearSelection() {
  selected.value = new Set();
}

/** 一键处理已完成：本地标记当前可见全部组（旧系统无写 API，仅本系统视图） */
function markVisibleProcessed() {
  const targets = visibleGroups.value.filter(g => !isGroupDone(g));
  if (!targets.length) {
    ElMessage.info("当前列表没有待处理的催稿");
    return;
  }
  const next = new Set(processedIds.value);
  for (const g of targets) for (const id of g.allIds) next.add(id);
  processedIds.value = next;
  persistProcessed();
  ElMessage.success(
    `已本地标记 ${targets.length} 组为已处理（不影响旧系统状态）`
  );
}

async function markRead(id: string) {
  await markMessageRead(id);
  await load();
}

function openDetail(g: ExpediteMessage | ExpediteGroup) {
  const m = "latest" in g ? g.latest : g;
  // 消息仅含列表级字段 → 组装最小行供 Drawer 展示；详情本体按 needsid 拉取
  const row = {
    orderId: m.orderId,
    applyId: "",
    orderNo: m.orderNo,
    shop: m.shop,
    taskType: "",
    stateLabel: "",
    view: null,
    customerName: "",
    customerNick: "",
    memberName: "",
    endTime: m.deadline,
    createTime: "",
    completeTime: "",
    legacyAmount: null,
    overrideAmount: null,
    effectiveAmount: null,
    amountSource: "undefined" as const,
    price: 0,
    sales: 0,
    urgent: false,
    isRepulse: false,
    isRegular: false,
    productName: m.category
  } satisfies OrderListItem;
  drawerId.value = m.orderId;
  drawerRow.value = row;
  drawerVisible.value = true;
}

// ── 批量 ──
async function bulkCopyNos() {
  const nos = selectedRows.value.map(g => g.orderNo);
  try {
    await navigator.clipboard.writeText(nos.join("\n"));
    ElMessage.success(`已复制 ${nos.length} 个订单号`);
  } catch {
    ElMessage.error("复制失败");
  }
}

function openComposer() {
  composerVisible.value = true;
}

/** 生成的分段文本（缺失变量由 service 显式 <缺失:xxx>） */
const composedTexts = computed(() => {
  const rows = selectedRows.value;
  if (!rows.length) return [];
  return renderRemindTextBatch(
    rows.map(g => ({
      shop: g.shop,
      orderNo: g.orderNo,
      category: g.category,
      deadline: g.deadline
    })),
    tone.value === "custom" ? "custom" : tone.value,
    tone.value === "custom" ? customTemplate.value : undefined
  ).split("\n\n");
});

async function copyOne(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    ElMessage.success("已复制");
  } catch {
    ElMessage.error("复制失败");
  }
}
async function copyAll() {
  const text = composedTexts.value.join("\n\n");
  try {
    await navigator.clipboard.writeText(text);
    ElMessage.success(`已复制全部 ${composedTexts.value.length} 条`);
  } catch {
    ElMessage.error("复制失败");
  }
}

function fmtDeadline(t: string): string {
  if (!t) return "—";
  const d = new Date(t.replace(/-/g, "/"));
  if (Number.isNaN(d.getTime())) return t;
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${hm}`;
}
function fmtTime(t: string): string {
  if (!t) return "";
  return t;
}

onMounted(async () => {
  await load();
  // 催稿行不含金额规则信息；拉一次订单列表补全「查看订单」行的金额展示
  void fetchOrders({ view: "all", page: 1, pageSize: 100 }).catch(() => null);
});
</script>

<style scoped>
.expedite {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.expedite__head {
  display: flex;
  gap: var(--space-3);
  align-items: baseline;
}

.expedite__title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--app-text);
}

.expedite__count {
  font-size: 13px;
  color: var(--app-text-muted);
}

.expedite__read-all {
  margin-left: auto;
  font-family: inherit;
  font-size: 12.5px;
  color: var(--app-text-muted);
  cursor: pointer;
  background: none;
  border: none;
}

.expedite__read-all:hover {
  color: var(--app-text);
}

.expedite__read-all--on {
  color: var(--app-accent);
}

.expedite__process-all {
  color: var(--app-accent);
  font-weight: 500;
}

.expedite__process-all:hover {
  color: var(--app-danger);
}

.expedite__repeat {
  padding: 1px 8px;
  font-size: 11.5px;
  color: var(--app-accent);
  background: var(--app-accent-soft);
  border-radius: var(--radius-md, 6px);
}

.expedite__row--done {
  opacity: 0.55;
}

/* 列表行 */
.expedite__list {
  display: flex;
  flex-direction: column;
}

.expedite__row {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-3);
  border-bottom: 1px solid var(--app-border);
  border-radius: var(--radius-sm);
  transition: background-color 140ms ease;
}

.expedite__row:hover {
  background: var(--app-surface-hover);
}

.expedite__row--selected {
  background: var(--app-accent-soft);
}

.expedite__main {
  flex: 1;
  min-width: 0;
  cursor: pointer;
}

.expedite__line1 {
  display: flex;
  gap: var(--space-3);
  align-items: center;
}

.expedite__no {
  font-size: 13px;
  font-weight: 500;
  color: var(--app-text);
}

.expedite__muted {
  font-size: 12.5px;
  color: var(--app-text-muted);
}

.expedite__unread-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  background: var(--app-danger);
  border-radius: 50%;
}

/* [P0-4] 真实通道状态 pill（已接收=待处理 / 已处理=完成流转） */
.expedite__status {
  padding: 1px 8px;
  font-size: 11.5px;
  color: var(--app-text-muted);
  background: var(--app-surface-hover);
  border-radius: var(--radius-md, 6px);
}

.expedite__row--unread .expedite__status {
  color: var(--app-danger);
  background: color-mix(in srgb, var(--app-danger) 10%, transparent);
}

.expedite__note {
  max-width: 520px;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12.5px;
  color: var(--app-text-faint);
  white-space: nowrap;
}

.expedite__meta {
  display: flex;
  flex-shrink: 0;
  flex-direction: column;
  gap: 2px;
  align-items: flex-end;
}

.expedite__deadline {
  font-size: 12.5px;
  color: var(--app-text-secondary);
}

.expedite__time {
  font-size: 11.5px;
  color: var(--app-text-faint);
}

.expedite__actions {
  display: flex;
  flex-shrink: 0;
  gap: var(--space-1);
}

/* 浮现批量栏 */
.expedite__bulk {
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

.expedite__bulk-count {
  font-size: 13px;
  font-weight: 600;
  color: var(--app-text);
}

.expedite__bulk-close {
  display: inline-flex;
  padding: 4px;
  color: var(--app-text-faint);
  cursor: pointer;
  background: transparent;
  border: none;
  border-radius: 50%;
}

.expedite__bulk-close:hover {
  color: var(--app-text);
  background: var(--app-surface-hover);
}

.expedite__sep {
  display: inline-block;
  width: 3px;
  height: 3px;
  background: var(--app-text-faint);
  border-radius: 50%;
}

.expedite-bar-enter-active,
.expedite-bar-leave-active {
  transition:
    opacity 150ms ease,
    transform 150ms ease;
}

.expedite-bar-enter-from,
.expedite-bar-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}

/* 催稿文本 Drawer */
.composer {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.composer__tones {
  display: flex;
  gap: var(--space-1);
}

.composer__tone {
  padding: 5px 12px;
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

.composer__tone:hover {
  color: var(--app-text);
  background: var(--app-surface-hover);
}

.composer__tone--active {
  font-weight: 500;
  color: var(--app-text);
  background: var(--app-accent-soft);
}

.composer__custom {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.composer__var-hint {
  margin: 0;
  font-size: 12px;
  color: var(--app-text-faint);
}

.composer__preview {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.composer__item {
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--app-border);
  border-radius: var(--radius-md);
}

.composer__item-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-1);
}

.composer__item-head .app-mono {
  font-size: 12.5px;
  color: var(--app-text-muted);
}

.composer__item-copy {
  font-family: inherit;
  font-size: 12px;
  color: var(--app-text-muted);
  cursor: pointer;
  background: none;
  border: none;
}

.composer__item-copy:hover {
  color: var(--app-text);
}

.composer__item-text {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.7;
  color: var(--app-text);
  word-break: break-all;
  white-space: pre-wrap;
}
</style>
