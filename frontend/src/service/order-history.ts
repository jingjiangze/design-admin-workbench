/**
 * 单号历史查询领域服务（2026-09-21 用户需求）
 *
 * 输入订单号 → ① 订单记录（getOrderList ordernum 包含匹配，复用 /api/orders）
 *           → ② 交稿记录（每条需求详情 HTML 的 .draft-record 区块，多次交稿全部
 *              列出并含每次时间——重点需求；Worker 透传 HTML、浏览器解析，Free CPU 纪律）
 *           → ③ 改价申请/改价记录（/api/orders/price-change → editNeeds/query）
 * 三段数据均与单号准确关联；接口失败显式透出（禁伪装空结果）。
 */
import { fetchOrders } from "./order";
import { http } from "@/utils/http";
import { isLegacyRealEnabled } from "./gateway";
import { fetchLegacyDetailHtml } from "./legacy/detail";
import { parseDraftRecords, type DraftRecordRow } from "./legacy/draft-record";
import type { OrderListItem } from "./types";

export type { DraftRecordRow } from "./legacy/draft-record";
export { normalizeEnUsTime } from "./legacy/draft-record";

/** 改价申请+审核记录（editNeeds/query 单对象 [VERIFIED]） */
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

export interface DeliveryGroup {
  needsid: string;
  orderNo: string;
  rows: DraftRecordRow[];
  /** false = 详情页无交稿记录区块（模板变更需人工核查，显式透出） */
  blockFound: boolean;
}

export interface OrderHistoryResult {
  orderNo: string;
  orders: OrderListItem[];
  deliveries: DeliveryGroup[];
  priceChange: PriceChangeRecord | null;
}

const NEEDSID_CAP = 10;

/** 单号 → 完整历史（订单记录 / 交稿记录 / 改价记录） */
export async function fetchOrderHistory(
  orderNo: string
): Promise<OrderHistoryResult> {
  const no = orderNo.trim();
  if (!no) throw new Error("请输入订单号");

  // ① 订单记录（keyword → Worker ordernum 包含匹配 [VERIFIED]）
  const ordersRes = await fetchOrders({
    view: "all",
    page: 1,
    pageSize: 50,
    keyword: no
  });
  const orders = ordersRes.list;

  // ② 交稿记录：按需求ID逐个拉详情 HTML（并发 2，旧系统限流友好）
  const needsids = [...new Set(orders.map(o => o.orderId))].slice(
    0,
    NEEDSID_CAP
  );
  const deliveries: DeliveryGroup[] = [];
  const queue = [...needsids];
  const workers: Array<Promise<void>> = Array.from(
    { length: Math.min(2, queue.length) },
    async () => {
      for (;;) {
        const needsid = queue.shift();
        if (needsid === undefined) return;
        const order = orders.find(o => o.orderId === needsid);
        try {
          const html = await fetchLegacyDetailHtml(needsid);
          const { found, rows } = parseDraftRecords(String(html));
          deliveries.push({
            needsid,
            orderNo: order?.orderNo ?? no,
            rows,
            blockFound: found
          });
        } catch {
          // 单个需求详情失败不拖垮整页：显式记录 parseOk=false 语义
          deliveries.push({
            needsid,
            orderNo: order?.orderNo ?? no,
            rows: [],
            blockFound: false
          });
        }
      }
    }
  );
  await Promise.all(workers);
  deliveries.sort((a, b) => a.needsid.localeCompare(b.needsid));

  // ③ 改价申请/记录
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

  return { orderNo: no, orders, deliveries, priceChange };
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
    deliveries: ordersRes.list.map(o => ({
      needsid: o.orderId,
      orderNo: o.orderNo,
      rows: [],
      blockFound: false
    })),
    priceChange: null
  };
}
