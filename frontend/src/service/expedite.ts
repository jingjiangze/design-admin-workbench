/**
 * 催稿领域服务 —— 待处理催稿 / 我要催稿 / 催稿记录（docs/DESIGNER_WORKBENCH_SPEC.md §6）
 *
 * 命名规范：催稿 / 待催稿 / 生成催稿文本 / 复制催稿文本（禁"一键催单/发送催单"）。
 * 旧系统仅提供催稿消息读取（已读/全部已读/备注）[VERIFIED]，无发送 API——
 * "我要催稿"只做"待催稿订单筛选 → 生成文本 → 复制"，绝不自动发送。
 * P1B-09：批量复制 + 催稿文本模板（温和/简洁/自定义，变量缺失显式 <缺失:xxx>）。
 */
import { isLegacyRealEnabled } from "./gateway";
import messagesMock from "./mock/expedite-messages.json";

/** 催稿消息视图模型（旧系统催稿消息字段映射，38 字段规则同样适用） */
export interface ExpediteMessage {
  id: string;
  /** 订单主键（needsid） */
  orderId: string;
  /** 平台订单号 */
  orderNo: string;
  /** 品类名 */
  category: string;
  shop: string;
  /** 截稿时间 */
  deadline: string;
  /** 催稿备注（设计师/客户留言） */
  note: string;
  /** 消息时间 */
  sendTime: string;
  /** 已读标志（0/1） */
  read: boolean;
}

/** Mock 消息映射（消息体非 38 字段契约，直接映射视图模型） */
function mapMockMessage(raw: Record<string, unknown>): ExpediteMessage {
  return {
    id: String(raw.id ?? ""),
    orderId: String(raw.needsid ?? ""),
    orderNo: String(raw.ordernum ?? ""),
    category: String(raw.goodsname ?? ""),
    shop: String(raw.shop ?? ""),
    deadline: String(raw.timeneeds ?? ""),
    note: String(raw.remindnote ?? ""),
    sendTime: String(raw.sendtime ?? ""),
    read: Number(raw.isread ?? 0) === 1
  };
}

/** Mock 本地状态：标记已读需要跨调用保留（模块级副本） */
let mockMessages: ExpediteMessage[] | null = null;

function getMockMessages(): ExpediteMessage[] {
  if (!mockMessages) {
    mockMessages = (
      messagesMock as { data: { list: Record<string, unknown>[] } }
    ).data.list.map(mapMockMessage);
  }
  return structuredClone(mockMessages);
}

function persistMock(messages: ExpediteMessage[]): void {
  mockMessages = messages;
}

/** 拉取催稿消息（未读在前，按时间倒序） */
export async function fetchExpediteMessages(): Promise<ExpediteMessage[]> {
  // Real 通道 Phase 2 接入（旧催稿消息接口需带会话拉取，当前 Mock 先行）
  void isLegacyRealEnabled;
  const list = getMockMessages();
  return list.sort((a, b) => {
    if (a.read !== b.read) return a.read ? 1 : -1;
    return b.sendTime.localeCompare(a.sendTime);
  });
}

/** 标记单条已读 */
export async function markMessageRead(id: string): Promise<void> {
  const list = getMockMessages();
  const msg = list.find(m => m.id === id);
  if (msg) msg.read = true;
  persistMock(list);
}

/** 全部已读 */
export async function markAllRead(): Promise<void> {
  const list = getMockMessages();
  list.forEach(m => (m.read = true));
  persistMock(list);
}

// ===== 催稿文本生成（P1B-09 核心，纯函数可单测）=====

export type RemindTone = "gentle" | "concise" | "custom";

export interface RemindTemplateVars {
  shop: string;
  orderNo: string;
  category: string;
  deadline: string;
}

/** 变量缺失显式标记（禁止静默留空） */
export const MISSING_MARK = "<缺失:xxx>";

function fillVar(value: string | undefined | null, name: string): string {
  const v = value == null ? "" : String(value).trim();
  return v === "" ? `<缺失:${name}>` : v;
}

/** 单条催稿文本（温和/简洁两种内置模板；custom 由调用方传模板） */
export function renderRemindText(
  vars: RemindTemplateVars,
  tone: RemindTone = "concise",
  customTemplate?: string
): string {
  const v = {
    shop: fillVar(vars.shop, "店铺"),
    orderNo: fillVar(vars.orderNo, "订单"),
    category: fillVar(vars.category, "品类"),
    deadline: fillVar(vars.deadline, "截稿")
  };
  if (tone === "custom" && customTemplate) {
    return customTemplate
      .replaceAll("{店铺}", v.shop)
      .replaceAll("{订单}", v.orderNo)
      .replaceAll("{品类}", v.category)
      .replaceAll("{截稿}", v.deadline);
  }
  if (tone === "gentle") {
    return `您好～【${v.shop}】的订单 ${v.orderNo}（${v.category}）截稿时间为 ${v.deadline}，麻烦有空时处理一下，谢谢！`;
  }
  return `店铺：${v.shop}\n订单：${v.orderNo}（${v.category}）\n截稿：${v.deadline}`;
}

/** 批量催稿文本（多条拼接，空行分隔） */
export function renderRemindTextBatch(
  items: RemindTemplateVars[],
  tone: RemindTone = "concise",
  customTemplate?: string
): string {
  return items.map(v => renderRemindText(v, tone, customTemplate)).join("\n\n");
}
