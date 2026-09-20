/**
 * Order 映射纯函数 —— 无 IO 依赖（可单测），被 legacy/order.ts 消费
 * [VERIFIED] 隐性契约：getOrderList.do 必传 sort=0&sorttype=1，缺省 flag:500
 */
import type { LegacyOrderListItem } from "./types";
import type { OrderListItem } from "../types";
import { mapStateToView } from "../types";

/** 列表查询参数（state 传旧系统过滤枚举 ""/1..8/11/12，keyword 走服务端模糊） */
export interface LegacyOrderListParams {
  page: number;
  limit: number;
  /** 旧系统状态过滤枚举；"" = 全部 */
  state?: string;
  keyword?: string;
}

/**
 * 构造列表请求表单（纯函数，便于契约测试）。
 * [VERIFIED] sort=0&sorttype=1 必传（缺省 flag:500，Phase 0 三种请求组合实测）。
 */
export function buildOrderListQuery(
  params: LegacyOrderListParams
): Record<string, string | number> {
  const form: Record<string, string | number> = {
    sort: 0,
    sorttype: 1,
    page: params.page,
    limit: params.limit,
    state: params.state ?? ""
  };
  if (params.keyword) form.keyword = params.keyword;
  return form;
}

/**
 * 38 字段 → OrderListItem 映射（38 字段禁直出 UI 的唯一出口）。
 * 命名说明：列表行自带 shop 字段；详情 ERP 快照中的 ordrtyp（语义错位存店铺名）
 * 改名为 shop 的逻辑同样只发生在 Adapter 层（legacy/detail-mapping.ts）。
 */
export function mapLegacyOrderListItem(
  raw: LegacyOrderListItem
): OrderListItem {
  return {
    orderId: String(raw.needsid ?? ""),
    applyId: String(raw.applyid ?? ""),
    orderNo: String(raw.ordernum ?? ""),
    shop: String(raw.shop ?? ""),
    taskType: String(raw.tasktype ?? ""),
    stateLabel: String(raw.state ?? ""),
    view: mapStateToView(String(raw.state ?? "")),
    customerName: String(raw.name ?? ""),
    customerNick: String(raw.kehu_name ?? ""),
    memberName: String(raw.membername ?? ""),
    endTime: String(raw.timeneeds ?? ""),
    createTime: String(raw.needscreatetime ?? ""),
    completeTime: String(raw.completetime ?? ""),
    designFee: Number(raw.design_money ?? 0),
    price: Number(raw.money ?? 0),
    sales: Number(raw.sales ?? 0),
    urgent: Number(raw.urgent ?? 0) === 1,
    isRepulse: Boolean(raw.isrepulsedata),
    isRegular: Boolean(raw.is_regular_customer)
  };
}
