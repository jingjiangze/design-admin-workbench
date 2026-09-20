/**
 * P1A-11 Mock/Real 分离网关
 *
 * VITE_LEGACY_API_ENABLED = "true" 时走真实旧系统（经 proxy / Nginx 反代）；
 * 其他值（默认 false）走 Mock（脱敏真实样本，形态与真实响应一致）。
 * ⚠️ 凭据（账号/密码/Cookie/Token）禁止写入任何 .env 文件——
 *    真实会话由浏览器自动携带（SESSION Cookie），与凭据无关。
 */

/** Mock 数据源（脱敏真实样本，与 vitest fixtures 同源） */
import listSample from "./mock/order-list.json";
import detailSample from "./mock/order-detail.json";
import type {
  LegacyOrderListResponse,
  LegacyDetailContainer
} from "./legacy/types";

export function isLegacyRealEnabled(): boolean {
  return String(import.meta.env.VITE_LEGACY_API_ENABLED ?? "false") === "true";
}

/** Mock：订单列表（克隆避免测试间/请求间共享可变引用） */
export function getMockOrderList(): LegacyOrderListResponse {
  return structuredClone(listSample) as unknown as LegacyOrderListResponse;
}

/** Mock：订单详情 */
export function getMockOrderDetail(
  _needsid: string
): LegacyDetailContainer | null {
  return structuredClone(detailSample) as unknown as LegacyDetailContainer;
}

/** Mock 模式说明（测试页可见） */
export const MOCK_NOTICE =
  "MOCK 模式：数据为脱敏真实样本（VITE_LEGACY_API_ENABLED 未开启）";
