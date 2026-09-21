/**
 * 单号历史查询领域服务（2026-09-21 用户需求；ORDER-HISTORY-AUDIT 加固）
 *
 * 输入订单号 → ① 订单记录（getOrderList ordernum 包含匹配，复用 /api/orders，
 *              分页拉全直到 total，仅本查询分页、不改普通订单页策略）
 *            → 精确匹配优先：输入完整订单号时，exact orderNo 命中则只取 exact，
 *              否则保留包含匹配候选并显式标注"未找到精确匹配"
 *            → ② 交稿记录（每条需求详情 HTML 的 .draft-record 区块，多次交稿全部
 *              列出并含每次时间——重点需求；Worker 透传 HTML、浏览器解析，Free CPU 纪律）
 *            → ③ 最近一次改价（/api/orders/price-change → editNeeds/query）
 *
 * 语义红线（审计 §五/§十九/§二十）：
 * - 请求失败 ≠ 无交稿：DeliveryGroup.status = "ok" | "no-block" | "error"
 * - 单需求失败不拖垮整页，支持仅重试失败项
 * - 同会话同单号短生命周期内存缓存（不做 localStorage 持久化，防 PII 落盘）
 */
import { fetchOrders } from "./order";
import { http } from "@/utils/http";
import { isLegacyRealEnabled } from "./gateway";
import { fetchLegacyDetailHtml } from "./legacy/detail";
import { parseDraftRecords, type DraftRecordRow } from "./legacy/draft-record";
import type { OrderListItem } from "./types";

export type { DraftRecordRow } from "./legacy/draft-record";
export { normalizeEnUsTime } from "./legacy/draft-record";

/** 改价申请+审核记录（editNeeds/query 单对象 [VERIFIED]：最新一条，非全量历史） */
export interface PriceChangeRecord {
  ordernum?: string;
  oldContent?: string;
  newContent?: string;
  editPriceType?: string;
  notes?: string;
  remark?: string;
  createTime?: string;
  applyTime?: string;
  auditingTime?: string;
  auditingUserName?: string;
  /** 0=审核中 / 1=通过 / 其他=不通过（详情页 JS 取证） */
  checkStatus?: number;
  [key: string]: unknown;
}

/** 交稿记录装载状态（审计 §五：失败 ≠ 无区块 ≠ 无记录） */
export type DeliveryLoadStatus = "ok" | "no-block" | "error";

export interface DeliveryGroup {
  needsid: string;
  orderNo: string;
  rows: DraftRecordRow[];
  /** ok=详情成功且有区块；no-block=详情成功但无区块；error=请求/解析失败 */
  status: DeliveryLoadStatus;
  /** error 时的错误摘要（如 HTTP 500 / SESSION 失效） */
  errorMessage?: string;
}

export interface OrderHistoryResult {
  /** 归一化后的查询输入 */
  orderNo: string;
  /** 全量订单记录（分页拉全，无截断） */
  orders: OrderListItem[];
  /** 是否存在与输入完全一致的订单号（精确匹配优先） */
  exactMatch: boolean;
  deliveries: DeliveryGroup[];
  /** 最近一次改价申请（旧系统 editNeeds/query 语义：仅最新一条） */
  priceChange: PriceChangeRecord | null;
}

/** 单详情并发上限（旧系统限流友好，审计 §四） */
export const DETAIL_CONCURRENCY = 2;

/** 订单列表单页上限：与普通订单页同参数，超出走分页 */
const PAGE_SIZE = 50;

/** 订单号归一化：trim + 全角转半角 + 大写 TT 前缀统一（大小写不敏感匹配，不改旧系统数据） */
export function normalizeOrderNo(raw: string): string {
  return raw.trim().replace(/Ｔ/g, "T").replace(/ｔ/g, "t").toUpperCase();
}

/** 从订单列表中找与输入精确一致的订单号（大小写不敏感） */
export function pickExactOrders(
  orders: OrderListItem[],
  normalizedInput: string
): OrderListItem[] {
  const exact = orders.filter(
    o => normalizeOrderNo(o.orderNo ?? "") === normalizedInput
  );
  return exact.length ? exact : orders;
}

/** 拉全单号搜索结果：total > 已加载则继续翻页（仅历史查询用，普通订单页不受影响） */
export async function fetchAllOrdersByNo(
  orderNo: string,
  onPage?: (loaded: number, total: number) => void
): Promise<OrderListItem[]> {
  const all: OrderListItem[] = [];
  let page = 1;
  let total = Infinity;
  while (all.length < total && page <= 20) {
    const res = await fetchOrders({
      view: "all",
      page,
      pageSize: PAGE_SIZE,
      keyword: orderNo
    });
    total = res.total ?? res.list.length;
    all.push(...res.list);
    onPage?.(all.length, total);
    if (!res.list.length) break; // 防御：空页退出避免死循环
    page += 1;
  }
  return all;
}

/**
 * 并发受控执行：同时最多 `concurrency` 个任务，保持结果顺序与输入一致。
 * 单任务失败由 worker 返回值表达，不抛出。
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      for (;;) {
        const i = cursor;
        cursor += 1;
        if (i >= items.length) return;
        results[i] = await worker(items[i]);
      }
    }
  );
  await Promise.all(runners);
  return results;
}

/** 单需求交稿记录装载（status 三态，禁把 error 当空） */
export async function loadDelivery(
  needsid: string,
  orderNo: string
): Promise<DeliveryGroup> {
  try {
    const html = await fetchLegacyDetailHtml(needsid);
    const { found, rows } = parseDraftRecords(String(html));
    return { needsid, orderNo, rows, status: found ? "ok" : "no-block" };
  } catch (e) {
    return {
      needsid,
      orderNo,
      rows: [],
      status: "error",
      errorMessage: e instanceof Error ? e.message : String(e)
    };
  }
}

// ── 同会话内存缓存（短生命周期，仅当前页面会话；不落 localStorage） ──
const historyCache = new Map<string, OrderHistoryResult>();

/** 最近一次改价（轻量单查，供订单详情 Drawer 内嵌；语义=最新一条 [VERIFIED]） */
export async function fetchLatestPriceChange(
  orderNo: string
): Promise<PriceChangeRecord | null> {
  const pc = await http.request<{
    result?: boolean;
    data?: PriceChangeRecord | null;
  }>("get", `/api/orders/price-change?orderNo=${encodeURIComponent(orderNo)}`, {
    timeout: 20000
  });
  if (pc?.result === true && pc.data && typeof pc.data === "object") {
    return pc.data;
  }
  return null;
}

/** 单号 → 完整历史（订单记录 / 交稿记录 / 最近一次改价） */
export async function fetchOrderHistory(
  orderNo: string
): Promise<OrderHistoryResult> {
  const no = orderNo.trim();
  if (!no) throw new Error("请输入订单号");
  const cached = historyCache.get(no);
  if (cached) return cached;

  // ① 订单记录：分页拉全（无截断）→ 精确匹配优先
  const all = await fetchAllOrdersByNo(no);
  const normalized = normalizeOrderNo(no);
  const exactHit = all.some(
    o => normalizeOrderNo(o.orderNo ?? "") === normalized
  );
  const orders = pickExactOrders(all, normalized);

  // ② 交稿记录：每需求 1 个详情请求，并发 2
  const needsids = [...new Set(orders.map(o => o.orderId))];
  const deliveries = await runWithConcurrency(
    needsids,
    DETAIL_CONCURRENCY,
    needsid =>
      loadDelivery(
        needsid,
        orders.find(o => o.orderId === needsid)?.orderNo ?? no
      )
  );

  // ③ 最近一次改价
  let priceChange: PriceChangeRecord | null = null;
  const pc = await http.request<{
    result?: boolean;
    data?: PriceChangeRecord | null;
  }>("get", `/api/orders/price-change?orderNo=${encodeURIComponent(no)}`, {
    timeout: 20000
  });
  if (pc?.result === true && pc.data && typeof pc.data === "object") {
    priceChange = pc.data;
  }

  const result: OrderHistoryResult = {
    orderNo: no,
    orders,
    exactMatch: exactHit,
    deliveries,
    priceChange
  };
  historyCache.set(no, result);
  return result;
}

/** 仅重试失败项（审计 §十九：不全部重新请求） */
export async function retryFailedDeliveries(
  result: OrderHistoryResult
): Promise<OrderHistoryResult> {
  const failedIdx = result.deliveries
    .map((d, i) => (d.status === "error" ? i : -1))
    .filter(i => i >= 0);
  if (!failedIdx.length) return result;
  const retried = await runWithConcurrency(
    failedIdx,
    DETAIL_CONCURRENCY,
    async i => {
      const d = result.deliveries[i];
      return loadDelivery(d.needsid, d.orderNo);
    }
  );
  const merged = { ...result, deliveries: [...result.deliveries] };
  failedIdx.forEach((idx, k) => {
    merged.deliveries[idx] = retried[k];
  });
  historyCache.set(result.orderNo, merged);
  return merged;
}

/** Mock 通道可用的历史查询（本地样本过滤，供无 Worker 开发与 vitest） */
export async function fetchOrderHistoryMock(
  orderNo: string
): Promise<OrderHistoryResult> {
  void isLegacyRealEnabled;
  const ordersRes = await fetchOrders({
    view: "all",
    page: 1,
    pageSize: 50,
    keyword: orderNo.trim()
  });
  return {
    orderNo: orderNo.trim(),
    orders: ordersRes.list,
    exactMatch: false,
    deliveries: ordersRes.list.map(o => ({
      needsid: o.orderId,
      orderNo: o.orderNo,
      rows: [],
      status: "no-block" as const
    })),
    priceChange: null
  };
}
