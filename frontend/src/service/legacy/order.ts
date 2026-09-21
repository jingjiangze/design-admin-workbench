/**
 * Legacy Order Adapter（Cloudflare 化后 = 新系统网关客户端）
 *
 * 架构变化（Phase CF-0，docs/CLOUDFLARE_ARCHITECTURE.md §八）：
 *   浏览器 → GET /api/orders → Cloudflare Worker → 旧系统 getOrderList.do
 * 本文件不再出现旧系统 URL——/chsjs 与 *.do 的唯一居住地是 worker/src/legacy/。
 * 响应仍为旧系统原始 JSON 形态（Worker 透传），38 字段映射管道不变。
 * sort=0&sorttype=1 隐性契约由 Worker 强制注入（前端无法覆盖）。
 */
import qs from "qs";
import { http } from "@/utils/http";
import type { LegacyOrderListResponse } from "./types";
import {
  mapLegacyOrderListItem,
  type LegacyOrderListParams
} from "./order-mapping";

export { mapLegacyOrderListItem };
export type { LegacyOrderListParams };

/** 经新系统网关拉取订单列表（旧系统契约由 Worker 层维护） */
export async function fetchLegacyOrderList(
  params: LegacyOrderListParams
): Promise<LegacyOrderListResponse> {
  return http.request<LegacyOrderListResponse>(
    "get",
    `/api/orders?${qs.stringify({
      page: params.page,
      limit: params.limit,
      state: params.state ?? "",
      ...(params.keyword ? { keyword: params.keyword } : {}),
      ...(params.beginDate ? { beginDate: params.beginDate } : {}),
      ...(params.endDate ? { endDate: params.endDate } : {})
    })}`,
    { timeout: 15000 }
  );
}
