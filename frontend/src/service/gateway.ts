/**
 * Mock/Real 分离网关（Phase CF-0 语义更新）
 *
 * VITE_LEGACY_API_ENABLED = "true" 时前端请求 /api/*（经 Cloudflare Worker 网关；
 * Mock/Real 最终由 Worker 环境变量 LEGACY_API_ENABLED 决定，前端无法篡改——长文 §四十三）；
 * 其他值（默认 false）走本地内存 Mock（脱敏真实样本，形态与真实响应一致），
 * 用于无 Worker 的纯前端开发与 vitest。
 * ⚠️ 凭据（账号/密码/Cookie/Token）禁止写入任何 .env 文件。
 * ⚠️ 前端不再出现旧系统 URL（唯一居住地 = worker/src/legacy/）。
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
