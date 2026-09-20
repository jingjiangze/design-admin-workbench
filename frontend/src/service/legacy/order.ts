/**
 * Legacy Order Adapter —— 旧系统订单列表接口的唯一入口
 *
 * 隐性契约 [VERIFIED]：getOrderList.do 必传 sort=0&sorttype=1，缺省返回 flag:500
 * 只读纪律：本文件与整个 legacy/ 目录仅允许 GET 请求
 */
import { http } from "@/utils/http";
import type {
  LegacyOrderListItem,
  LegacyOrderListResponse
} from "./types";

/** P1A-07 实现：拉取旧系统订单列表（sort=0&sorttype=1 必传） */
export async function fetchLegacyOrderList(
  _params: Partial<{
    page: number;
    limit: number;
    state: string;
    keyword: string;
  }>
): Promise<LegacyOrderListResponse> {
  // P1A-07: http.request<LegacyOrderListResponse>("post", "/chsjs/child/getOrderList.do", {...})
  // 必传参数 sort=0, sorttype=1（数字类型，与页面默认参数一致）
  throw new Error("P1A-07 待实现");
}

/** P1A-07 实现：ordrtyp（语义错位存店铺名）→ shop，仅在此层发生 */
export function mapLegacyOrderListItem(
  _raw: LegacyOrderListItem
): Record<string, unknown> {
  // P1A-07: 返回 OrderListItem（service/order.ts），ordrtyp → shop 改名发生在此处
  throw new Error("P1A-07 待实现");
}
