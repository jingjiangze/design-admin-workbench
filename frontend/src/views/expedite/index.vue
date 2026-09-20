<script setup lang="ts">
/**
 * 催稿中心（P1B-08/09，docs/DESIGNER_WORKBENCH_SPEC.md §6）
 *
 * 三 tab：待处理催稿（消息卡片+标记已读）/ 我要催稿（筛选勾选→生成文本→复制，
 * 不发送）/ 催稿记录（本次会话内已复制历史）。
 * 命名规范：催稿 / 待催稿 / 生成催稿文本 / 复制催稿内容（禁"一键催单/发送催单"）。
 * 变量缺失显式 <缺失:xxx>（renderRemindText，禁止静默留空）。
 * ⚠️ 本阶段禁止任何自动发送通道（短信/语音/微信/IM）。
 */
import { computed, onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import OrderDrawer from "@/components/OrderDrawer/index.vue";
import {
  fetchExpediteMessages,
  markMessageRead,
  markAllRead,
  renderRemindTextBatch
} from "@/service/expedite";
import type { ExpediteMessage, RemindTone } from "@/service/expedite";
import { fetchOrders } from "@/service/order";
import { enrichOrderAmounts } from "@/service/pricing/amount-resolution";
import { listRules } from "@/service/pricing/pricing-rule-store";
import { formatOrderNos, COPY_FORMAT_LABEL } from "@/utils/order-format";
import type { CopyFormat } from "@/utils/order-format";
import type { OrderListItem } from "@/service/types";

defineOptions({
  name: "Expedite"
});

const activeTab = ref("inbox");
const loading = ref(true);

// ===== Tab1 待处理催稿 =====
const messages = ref<ExpediteMessage[]>([]);

// ===== Tab2 我要催稿 =====
const orders = ref<OrderListItem[]>([]);
const selectedOrders = ref<OrderListItem[]>([]);
const tone = ref<RemindTone>("concise");
const customTemplate = ref("");
const remindText = ref("");
const remindDialogVisible = ref(false);
const copyFormat = ref<CopyFormat>("newline");

// ===== Tab3 催稿记录（会话内） =====
interface RemindRecord {
  time: string;
  count: number;
  text: string;
  tone: RemindTone;
}
const records = ref<RemindRecord[]>([]);

// Drawer
const drawerVisible = ref(false);
const drawerOrderId = ref<string | null>(null);
const drawerRow = ref<OrderListItem | null>(null);

async function load() {
  loading.value = true;
  try {
    const [msgs, res] = await Promise.all([
      fetchExpediteMessages(),
      fetchOrders({ view: "all", page: 1, pageSize: 500 })
    ]);
    messages.value = msgs;
    // 待催稿候选：活跃单（待接单/进行中/待审核）
    orders.value = enrichOrderAmounts(res.list, listRules()).filter(o =>
      ["pending_accept", "in_progress", "pending_review"].includes(o.view ?? "")
    );
  } finally {
    loading.value = false;
  }
}

onMounted(load);

const unreadCount = computed(() => messages.value.filter(m => !m.read).length);

async function viewOrder(msg: ExpediteMessage) {
  const row = orders.value.find(o => o.orderId === msg.orderId) ?? null;
  drawerRow.value = row;
  drawerOrderId.value = msg.orderId;
  drawerVisible.value = true;
  if (!msg.read) {
    await markMessageRead(msg.id);
    messages.value = await fetchExpediteMessages();
  }
}

async function readAll() {
  await markAllRead();
  messages.value = await fetchExpediteMessages();
  ElMessage.success("已全部标记为已读");
}

/** 候选默认勾选：临近截稿（24h 内） */
function quickSelectNearDeadline() {
  selectedOrders.value = orders.value.filter(o => {
    const d = o.endTime
      ? new Date(o.endTime.replace(/-/g, "/")).getTime()
      : NaN;
    return (
      !Number.isNaN(d) &&
      d - Date.now() > 0 &&
      d - Date.now() < 24 * 3600 * 1000
    );
  });
}

/** 生成催稿文本（变量缺失显式 <缺失:xxx>） */
function generateText() {
  if (selectedOrders.value.length === 0) {
    ElMessage.info("请先勾选要催稿的订单");
    return;
  }
  remindText.value = renderRemindTextBatch(
    selectedOrders.value.map(o => ({
      shop: o.shop,
      orderNo: o.orderNo,
      category: o.productName ?? "",
      deadline: o.endTime
    })),
    tone.value,
    tone.value === "custom" ? customTemplate.value : undefined
  );
  remindDialogVisible.value = true;
}

async function copyRemindText() {
  try {
    await navigator.clipboard.writeText(remindText.value);
    ElMessage.success(`已复制 ${selectedOrders.value.length} 条催稿内容`);
    records.value.unshift({
      time: new Date().toLocaleString("zh-CN"),
      count: selectedOrders.value.length,
      text: remindText.value,
      tone: tone.value
    });
    remindDialogVisible.value = false;
  } catch {
    ElMessage.warning("复制失败，请在文本框中手动复制");
  }
}

async function copyOrderNos() {
  const nos = selectedOrders.value.map(o => o.orderNo);
  if (nos.length === 0) {
    ElMessage.info("请先勾选订单");
    return;
  }
  try {
    await navigator.clipboard.writeText(formatOrderNos(nos, copyFormat.value));
    ElMessage.success(
      `已复制 ${nos.length} 个订单号（${COPY_FORMAT_LABEL[copyFormat.value]}）`
    );
  } catch {
    ElMessage.warning("复制失败");
  }
}

function reCopy(text: string) {
  navigator.clipboard
    .writeText(text)
    .then(() => ElMessage.success("已重新复制"))
    .catch(() => ElMessage.warning("复制失败"));
}

const TONE_LABEL: Record<RemindTone, string> = {
  gentle: "温和",
  concise: "简洁",
  custom: "自定义"
};

function fmtTime(t: string): string {
  const m = t.match(/\d{2}-\d{2} \d{2}:\d{2}/);
  return m ? m[0] : t || "—";
}
</script>

<template>
  <div v-loading="loading" class="expedite-page">
    <el-tabs v-model="activeTab">
      <!-- Tab 1 待处理催稿 -->
      <el-tab-pane :label="`待处理催稿（${unreadCount}）`" name="inbox">
        <div class="tab-toolbar">
          <el-button
            size="small"
            :disabled="unreadCount === 0"
            @click="readAll"
          >
            全部已读
          </el-button>
        </div>
        <div class="msg-list">
          <div
            v-for="msg in messages"
            :key="msg.id"
            class="msg-card"
            :class="{ unread: !msg.read }"
          >
            <div class="msg-head">
              <span class="msg-cat">{{ msg.category }}</span>
              <span class="mono">{{ msg.orderNo }}</span>
              <el-tag v-if="!msg.read" size="small" type="danger" effect="plain"
                >未读</el-tag
              >
            </div>
            <div class="msg-meta">
              店铺：{{ msg.shop }} · 截稿：{{ fmtTime(msg.deadline) }} ·
              {{ fmtTime(msg.sendTime) }}
            </div>
            <div v-if="msg.note" class="msg-note">
              设计师备注：{{ msg.note }}
            </div>
            <div class="msg-actions">
              <el-button
                size="small"
                type="primary"
                plain
                @click="viewOrder(msg)"
                >查看订单</el-button
              >
              <el-button
                v-if="!msg.read"
                size="small"
                @click="markMessageRead(msg.id).then(load)"
              >
                标记已读
              </el-button>
            </div>
          </div>
          <div v-if="messages.length === 0" class="empty-hint">
            暂无催稿消息
          </div>
        </div>
      </el-tab-pane>

      <!-- Tab 2 我要催稿 -->
      <el-tab-pane label="我要催稿" name="mine">
        <div class="tab-toolbar">
          <el-button size="small" @click="quickSelectNearDeadline">
            勾选 24h 内截稿
          </el-button>
          <el-select v-model="copyFormat" size="small" class="fmt-select">
            <el-option
              v-for="(label, key) in COPY_FORMAT_LABEL"
              :key="key"
              :label="`订单号·${label}`"
              :value="key"
            />
          </el-select>
          <el-button size="small" @click="copyOrderNos">复制订单号</el-button>
          <el-radio-group v-model="tone" size="small">
            <el-radio-button
              v-for="(label, key) in TONE_LABEL"
              :key="key"
              :value="key"
            >
              {{ label }}
            </el-radio-button>
          </el-radio-group>
          <el-button size="small" type="primary" @click="generateText">
            生成催稿文本（{{ selectedOrders.length }}）
          </el-button>
        </div>
        <p class="hint">
          当前系统不支持发送催稿——生成文本后自行粘贴给店铺/客服。变量缺失会显示
          <code>&lt;缺失:xxx&gt;</code>。
        </p>
        <el-table
          :data="orders"
          size="small"
          class="compact-table"
          @selection-change="selectedOrders = $event"
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
          <el-table-column label="截稿" width="110">
            <template #default="{ row }">{{ fmtTime(row.endTime) }}</template>
          </el-table-column>
          <el-table-column prop="stateLabel" label="状态" width="90" />
        </el-table>
      </el-tab-pane>

      <!-- Tab 3 催稿记录 -->
      <el-tab-pane :label="`催稿记录（${records.length}）`" name="history">
        <div v-if="records.length === 0" class="empty-hint">
          本次会话暂无记录（生成并复制催稿文本后在此留存，Phase 2 持久化）
        </div>
        <div v-for="(rec, i) in records" :key="i" class="record-card">
          <div class="record-head">
            <span>{{ rec.time }}</span>
            <span>{{ rec.count }} 条 · {{ TONE_LABEL[rec.tone] }}</span>
            <el-button
              size="small"
              text
              type="primary"
              @click="reCopy(rec.text)"
            >
              重新复制
            </el-button>
          </div>
          <pre class="record-text">{{ rec.text }}</pre>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 生成文本弹窗 -->
    <el-dialog
      v-model="remindDialogVisible"
      title="催稿文本（生成后复制，不自动发送）"
      width="520px"
    >
      <el-input v-model="remindText" type="textarea" :rows="10" />
      <template #footer>
        <el-button @click="remindDialogVisible = false">关闭</el-button>
        <el-button type="primary" @click="copyRemindText"
          >复制催稿内容</el-button
        >
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
.expedite-page {
  padding: 16px 20px;
}

.tab-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-bottom: 10px;
}

.fmt-select {
  width: 130px;
}

.hint {
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.hint code {
  color: var(--el-color-warning);
}

.msg-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.msg-card {
  padding: 12px 14px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}

.msg-card.unread {
  background: var(--el-color-danger-light-9);
  border-color: var(--el-color-danger-light-5);
}

.msg-head {
  display: flex;
  gap: 10px;
  align-items: center;
  font-size: 14px;
  font-weight: 500;
}

.msg-cat {
  color: var(--el-color-primary);
}

.mono {
  font-family: monospace;
}

.msg-meta {
  margin-top: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.msg-note {
  margin-top: 6px;
  font-size: 13px;
}

.msg-actions {
  margin-top: 10px;
}

.record-card {
  padding: 10px 12px;
  margin-bottom: 10px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}

.record-head {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.record-text {
  margin: 8px 0 0;
  font-family: inherit;
  font-size: 12px;
  line-height: 1.7;
  word-break: break-all;
  white-space: pre-wrap;
}

.compact-table {
  width: 100%;
}

.empty-hint {
  padding: 16px 0;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}
</style>
