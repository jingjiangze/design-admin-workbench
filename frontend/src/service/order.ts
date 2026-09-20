/**
 * 订单领域服务 —— 视图层获取订单数据的唯一入口
 *
 * 四层架构：UI → Domain Service（本层）→ Legacy Adapter → HTTP
 * 视图层禁止：import "@/service/legacy/*"、出现 /chsjs 或 *.do 字面量
 * P1A-11：isLegacyRealEnabled() 决定 Mock（脱敏样本）/ Real（旧系统）双通道
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

/** 列表查询（6 视图 + 分页 + 关键词） */
export async function fetchOrders(params: {
  view: OrderView;
  page: number;
  pageSize: number;
  keyword?: string;
}): Promise<{ total: number; list: OrderListItem[] }> {
  const state = params.view === "all" ? "" : STATE_PARAM[params.view];

  if (!isLegacyRealEnabled()) {
    // Mock 通道：脱敏真实样本 → 同一映射管道（保证映射逻辑被 Mock 数据同样校验）
    const mock = getMockOrderList();
    const list = mock.data?.pageInfo?.list?.map(mapLegacyOrderListItem) ?? [];
    return { total: list.length, list };
  }

  const res = await fetchLegacyOrderList({
    page: params.page,
    limit: params.pageSize,
    state,
    keyword: params.keyword
  });
  if (res.result === false || !res.data?.pageInfo) {
    throw new Error(
      `旧系统订单列表返回异常: flag=${res.flag ?? "-"} message=${res.message ?? "-"}`
    );
  }
  return {
    total: res.data.pageInfo.total,
    list: res.data.pageInfo.list.map(mapLegacyOrderListItem)
  };
}
