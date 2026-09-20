<template>
  <div class="expedite">
    <div class="expedite__head">
      <h1 class="expedite__title">催稿</h1>
      <span v-if="!loading" class="expedite__count app-num">
        待处理 {{ pendingCount }}
      </span>
      <button
        v-if="pendingCount > 0"
        class="expedite__read-all"
        type="button"
        @click="readAll"
      >
        全部已读
      </button>
    </div>

    <!-- 列表（§三十一：行式信息，非卡片墙） -->
    <div class="expedite__list">
      <AppSkeleton v-if="loading" :rows="5" type="table" />
      <template v-else-if="messages.length">
        <div
          v-for="m in messages"
          :key="m.id"
          class="expedite__row"
          :class="{
            'expedite__row--unread': !m.read,
            'expedite__row--selected': selected.has(m.id)
          }"
        >
          <span @click.stop>
            <ElCheckbox
              :model-value="selected.has(m.id)"
              @change="toggleSelect(m.id)"
            />
          </span>
          <div class="expedite__main" @click="openDetail(m)">
            <div class="expedite__line1">
              <span class="app-mono expedite__no">{{ m.orderNo }}</span>
              <span class="expedite__muted">{{ m.category || "—" }}</span>
              <span class="expedite__muted">{{ m.shop }}</span>
              <span v-if="!m.read" class="expedite__unread-dot" />
            </div>
            <div class="expedite__note">{{ m.note || "（无催稿备注）" }}</div>
          </div>
          <div class="expedite__meta">
            <span class="expedite__deadline app-num"
              >截稿 {{ fmtDeadline(m.deadline) }}</span
            >
            <span class="expedite__time app-num">{{
              fmtTime(m.sendTime)
            }}</span>
          </div>
          <div class="expedite__actions">
            <AppButton variant="text" size="sm" @click="openDetail(m)">
              查看订单
            </AppButton>
            <AppButton
              v-if="!m.read"
              variant="text"
              size="sm"
              icon="check"
              @click="markRead(m.id)"
            >
              标记已读
            </AppButton>
          </div>
        </div>
      </template>
      <AppEmpty v-else icon="check" text="今天没有待催稿" />
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
 * 催稿工作台（Phase UI-R1 §三十一/§三十二）
 * 重点 = 一次完成：勾选 → 生成催稿文本 → 复制。
 * ⚠️ 无"发送催稿"按钮（旧系统无发送 API，禁止出现该入口）；
 * 标记已读仅 Mock 本地（Real 通道不接写接口，长文 CF §十三）
 */
import { computed, onMounted, ref } from "vue";
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
  markAllRead,
  renderRemindTextBatch,
  type ExpediteMessage,
  type RemindTone
} from "@/service/expedite";
import { fetchOrders } from "@/service/order";
import type { OrderListItem } from "@/service/types";

defineOptions({ name: "ExpediteList" });

const TONES: Array<{ key: Exclude<RemindTone, "custom">; label: string }> = [
  { key: "gentle", label: "温和" },
  { key: "concise", label: "简洁" }
];

const loading = ref(true);
const messages = ref<ExpediteMessage[]>([]);
const selected = ref(new Set<string>());

const composerVisible = ref(false);
const tone = ref<RemindTone>("gentle");
const customTemplate = ref("");

const drawerVisible = ref(false);
const drawerId = ref<string | null>(null);
const drawerRow = ref<OrderListItem | null>(null);

const pendingCount = computed(() => messages.value.filter(m => !m.read).length);

/** 勾选顺序保持列表顺序 */
const selectedRows = computed(() =>
  messages.value.filter(m => selected.value.has(m.id))
);

async function load() {
  loading.value = true;
  try {
    messages.value = await fetchExpediteMessages();
  } catch {
    messages.value = [];
  } finally {
    loading.value = false;
  }
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

async function markRead(id: string) {
  await markMessageRead(id);
  await load();
}
async function readAll() {
  await markAllRead();
  await load();
}

function openDetail(m: ExpediteMessage) {
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
  const nos = selectedRows.value.map(m => m.orderNo);
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
    rows.map(m => ({
      shop: m.shop,
      orderNo: m.orderNo,
      category: m.category,
      deadline: m.deadline
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
