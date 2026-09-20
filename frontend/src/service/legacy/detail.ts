/**
 * Legacy Detail Adapter —— 旧系统订单详情接口的唯一入口
 * 类型/提取器/映射纯函数在 legacy/detail-mapping.ts 与 legacy/types.ts
 *
 * 主键约定 [VERIFIED]：needsDetail2(needsid) 为主详情接口（myOrder/催稿/消息入口统一引用）；
 * needsDetail(applyid) 为兼容入口，两接口响应为同一 HTML 模板（99.97% 逐字节相同）
 * 数据形态：551KB 级 HTML，内嵌 HTML 转义 JSON（&#034; 等）
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

/** GET 详情 HTML 并提取内嵌 JSON（两个详情接口共用此管道） */
async function fetchDetailHtml(
  url: string
): Promise<LegacyDetailContainer | null> {
  const html = await http.request<string>("get", url, {
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
  return fetchDetailHtml(
    `/chsjs/child/needsDetail2.do?needsid=${encodeURIComponent(needsid)}`
  );
}

/** applyid 兼容入口（同模板，99.97% 逐字节相同 [VERIFIED]） */
export async function fetchLegacyDetailByApplyid(
  applyid: string
): Promise<LegacyDetailContainer | null> {
  return fetchDetailHtml(
    `/chsjs/child/needsDetail.do?applyid=${encodeURIComponent(applyid)}`
  );
}
