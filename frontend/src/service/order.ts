/**
 * 订单领域服务 —— 视图层获取订单数据的唯一入口
 *
 * 四层架构（Phase CF-0）：UI → Domain Service（本层）→ /api/* → CF Worker → 旧系统
 * 视图层禁止：import "@/service/legacy/*"；前端全域禁 /chsjs 与 *.do 字面量
 * （ESLint 强制，worker/src/legacy/ 是旧 URL 唯一居住地）。
 * VITE_LEGACY_API_ENABLED 决定 Mock（脱敏样本）/ Real（/api/* 网关）双通道。
 */
import { fetchLegacyOrderList, mapLegacyOrderListItem } from "./legacy/order";
import { getMockOrderList, isLegacyRealEnabled } from "./gateway";
import type { OrderListItem, OrderView } from "./types";

export type { OrderListItem, OrderView } from "./types";
export { VIEW_LABEL, mapStateToView } from "./types";

/** 视图 → 旧系统 state 过滤参数（服务端过滤枚举 1..8/11/12） */
const STATE_PARAM: Record<Exclude<OrderView, "all">, string> = {
  pending_accept: "1",
  in_progress: "2", // 服务端按最小态过滤；2/3 合并展示由前端聚合
  pending_review: "4",
  completed: "5",
  at_risk: "8"
};

/** 列表查询（6 视图 + 分页 + 关键词 + 日期范围） */
export async function fetchOrders(params: {
  view: OrderView;
  page: number;
  pageSize: number;
  keyword?: string;
  /** 下单日期范围（yyyy-MM-dd，Real 通道透传服务端过滤；Mock 通道忽略） */
  beginDate?: string;
  endDate?: string;
}): Promise<{
  total: number;
  list: OrderListItem[];
  /** 6 状态计数器（countInfo：wait/nofeedback/didnotpass/badordercount/aftersale/flowmarker）；
   *  [VERIFIED] 无 total 字段（total 在 pageInfo），首页聚合真实源 */
  countInfo?: Record<string, number>;
}> {
  const state = params.view === "all" ? "" : STATE_PARAM[params.view];

  if (!isLegacyRealEnabled()) {
    // Mock 通道：脱敏真实样本 → 同一映射管道（保证映射逻辑被 Mock 数据同样校验）
    const mock = getMockOrderList();
    const list = mock.data?.pageInfo?.list?.map(mapLegacyOrderListItem) ?? [];
    return {
      total: list.length,
      list,
      countInfo: mock.data?.countInfo
    };
  }

  const res = await fetchLegacyOrderList({
    page: params.page,
    limit: params.pageSize,
    state,
    keyword: params.keyword,
    beginDate: params.beginDate,
    endDate: params.endDate
  });
  if (res.result === false || !res.data?.pageInfo) {
    throw new Error(
      `旧系统订单列表返回异常: flag=${res.flag ?? "-"} message=${res.message ?? "-"}`
    );
  }
  return {
    total: res.data.pageInfo.total,
    list: res.data.pageInfo.list.map(mapLegacyOrderListItem),
    countInfo: res.data.countInfo
  };
}
