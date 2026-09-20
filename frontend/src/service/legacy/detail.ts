/**
 * Legacy Detail Adapter（Cloudflare 化后 = 新系统网关客户端）
 * 类型/提取器/映射纯函数在 legacy/detail-mapping.ts 与 legacy/types.ts
 *
 * 架构变化（Phase CF-0）：浏览器 → GET /api/orders/detail → Cloudflare Worker
 * → needsDetail2.do/needsDetail.do（透传，不解析）。旧 URL 只存在于 Worker 层。
 * 551KB HTML 的解析仍由浏览器端 detail-mapping.ts 完成（长文 §二十二 分工）。
 *
 * 主键约定 [VERIFIED]：needsDetail2(needsid) 为主详情接口；needsDetail(applyid)
 * 为兼容入口，两接口响应为同一 HTML 模板（99.97% 逐字节相同）
 * 只读纪律：仅 GET
 */
import { http } from "@/utils/http";
import type { LegacyDetailContainer } from "./types";
import { extractEmbeddedDetailJson } from "./detail-mapping";

export { extractEmbeddedDetailJson, mapLegacyDetail } from "./detail-mapping";
export type {
  LegacyDetailContainer,
  LegacyProduct,
  LegacyFileConstraint
} from "./types";

/** GET 详情（经 Worker 透传）并提取内嵌 JSON（两个详情接口共用此管道） */
async function fetchDetailHtml(
  query: string
): Promise<LegacyDetailContainer | null> {
  const html = await http.request<string>("get", `/api/orders/detail?${query}`, {
    responseType: "text",
    headers: { Accept: "text/html, */*; q=0.01" },
    timeout: 30000
  });
  return extractEmbeddedDetailJson(
    String(html)
  ) as LegacyDetailContainer | null;
}

/** 按 needsid 主键拉取详情并解析 */
export async function fetchLegacyDetailByNeedsid(
  needsid: string
): Promise<LegacyDetailContainer | null> {
  return fetchDetailHtml(`needsid=${encodeURIComponent(needsid)}`);
}

/** applyid 兼容入口（同模板，99.97% 逐字节相同 [VERIFIED]） */
export async function fetchLegacyDetailByApplyid(
  applyid: string
): Promise<LegacyDetailContainer | null> {
  return fetchDetailHtml(`applyid=${encodeURIComponent(applyid)}`);
}
