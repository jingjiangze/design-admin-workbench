/**
 * Legacy Order Adapter —— 旧系统订单列表接口的唯一入口
 *
 * 隐性契约 [VERIFIED]：getOrderList.do 必传 sort=0&sorttype=1，缺省返回 flag:500
 * 只读纪律：本文件与整个 legacy/ 目录仅允许 GET / 无副作用的列表查询
 * 映射职责：38 字段 → OrderListItem（service/order.ts），视图层不接触本层类型
 */
import qs from "qs";
import { http } from "@/utils/http";
import type { LegacyOrderListItem, LegacyOrderListResponse } from "./types";
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
 * 拉取旧系统订单列表。
 * [VERIFIED] 必传 sort=0&sorttype=1（缺省 flag:500，Phase 0 三种组合实测）。
 * 表单编码与旧系统页面 jQuery 序列化行为一致。
 */
export async function fetchLegacyOrderList(
  params: LegacyOrderListParams
): Promise<LegacyOrderListResponse> {
  const form: Record<string, string | number> = {
    sort: 0,
    sorttype: 1,
    page: params.page,
    limit: params.limit,
    state: params.state ?? ""
  };
  if (params.keyword) form.keyword = params.keyword;
  return http.request<LegacyOrderListResponse>(
    "post",
    "/chsjs/child/getOrderList.do",
    {
      data: qs.stringify(form),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
      },
      timeout: 15000
    }
  );
}

/**
 * 38 字段 → OrderListItem 映射（38 字段禁直出 UI 的唯一出口）。
 * 命名说明：列表行自带 shop 字段；详情 ERP 快照中的 ordrtyp（语义错位存店铺名）
 * 改名为 shop 的逻辑同样只发生在 Adapter 层（legacy/detail.ts，P1A-08）。
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
