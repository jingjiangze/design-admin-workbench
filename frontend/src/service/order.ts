/**
 * 订单领域服务 —— 视图层获取订单数据的唯一入口
 *
 * 四层架构：UI → Domain Service（本层）→ Legacy Adapter → HTTP
 * 视图层禁止：import "@/service/legacy/*"、出现 /chsjs 或 *.do 字面量
 */
import type { OrderListItem, OrderView } from "./types";

export type { OrderListItem, OrderView };

/** P1A-07 实现：经 Adapter 拉取并映射为 OrderListItem 的列表查询 */
export async function fetchOrders(_params: {
  view: OrderView;
  page: number;
  pageSize: number;
  keyword?: string;
}): Promise<{ total: number; list: OrderListItem[] }> {
  throw new Error("P1A-07 待实现");
}
