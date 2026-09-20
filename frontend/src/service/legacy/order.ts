/**
 * Legacy Order Adapter —— 旧系统订单列表接口的唯一入口
 * 映射纯函数在 legacy/order-mapping.ts（无 IO 依赖，可单测）
 * 只读纪律：本文件与整个 legacy/ 目录仅允许 GET / 无副作用的列表查询
 */
import qs from "qs";
import { http } from "@/utils/http";
import type { LegacyOrderListResponse } from "./types";
import {
  buildOrderListQuery,
  mapLegacyOrderListItem,
  type LegacyOrderListParams
} from "./order-mapping";

export { buildOrderListQuery, mapLegacyOrderListItem };
export type { LegacyOrderListParams };

/** 拉取旧系统订单列表。表单编码与旧系统页面 jQuery 序列化行为一致。 */
export async function fetchLegacyOrderList(
  params: LegacyOrderListParams
): Promise<LegacyOrderListResponse> {
  return http.request<LegacyOrderListResponse>(
    "post",
    "/chsjs/child/getOrderList.do",
    {
      data: qs.stringify(buildOrderListQuery(params)),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
      },
      timeout: 15000
    }
  );
}
