/**
 * Legacy Gateway —— 订单详情（/api/orders/detail → needsDetail2.do）
 *
 * 长文 §二十二：详情响应约 551KB HTML，Worker 不做重型解析（Free CPU 10ms），
 * 只做"认证保护 + 透传"，浏览器现有纯解析器（legacy/detail-mapping.ts）负责展示解析。
 * needsid 为主详情键（needsDetail/needsDetail2 响应 99.97% 相同，P0-F1 取证）。
 *
 * 透传纪律：原样转发 Content-Type 与 body，但强制 Cache-Control: private, no-store
 * （用户私有数据禁止公共缓存 —— 长文 §三十）。
 */
import type { Env } from "../env";
import { legacyFetch, LegacyError } from "./client";

export interface DetailQuery {
  /** needsid 主键（优先）；applyid 兼容键二选一 */
  needsid?: string;
  applyid?: string;
}

export function parseDetailQuery(url: URL): DetailQuery {
  const needsid = (url.searchParams.get("needsid") ?? "").trim();
  const applyid = (url.searchParams.get("applyid") ?? "").trim();
  // 订单号形态 TT_yymmdd+seq / applyid 数字串（P0 取证），白名单字符防注入
  const idPattern = /^[A-Za-z0-9_\-]{1,64}$/;
  if (needsid && idPattern.test(needsid)) return { needsid };
  if (applyid && idPattern.test(applyid)) return { applyid };
  throw new LegacyError(400, "BAD_NEEDSID", "needsid 或 applyid 必填且合法");
}

export async function fetchLegacyOrderDetail(
  env: Env,
  legacyCookie: string,
  query: DetailQuery
): Promise<Response> {
  const path = query.needsid
    ? `/chsjs/child/needsDetail2.do?needsid=${encodeURIComponent(query.needsid)}`
    : `/chsjs/child/needsDetail.do?applyid=${encodeURIComponent(query.applyid!)}`;
  const res = await legacyFetch(env, path, {
    legacyCookie,
    accept: "text/html, */*; q=0.01"
  });
  if (res.status === 401 || res.status === 302) {
    throw new LegacyError(401, "LEGACY_SESSION_EXPIRED", "旧系统会话已失效，请重新登录");
  }
  if (!res.ok) {
    throw new LegacyError(502, "LEGACY_HTTP_ERROR", `旧系统 HTTP ${res.status}`);
  }
  return res;
}

/** Mock：详情样本 JSON（前端 detail-mapping 兼容两种形态） */
export async function fetchMockOrderDetail(_needsid: string): Promise<Response> {
  const mod = await import("./mock-data/order-detail.json");
  const sample = (mod.default ?? mod) as unknown;
  return new Response(JSON.stringify(sample), {
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}
