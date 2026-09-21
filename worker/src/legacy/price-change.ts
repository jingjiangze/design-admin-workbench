/**
 * Legacy Gateway —— 改价申请/改价记录（/api/orders/price-change → editNeeds/query）
 *
 * [VERIFIED 2026-09-21 详情页取证] 旧系统详情页「改价记录」按钮调用
 * GET /chsjs/editNeeds/query?ordernum=<ordernum> →
 * {result, data:{id, ordernum, oldContent, newContent, createTime, createUser,
 *  auditingTime, auditingUser, auditingUserName, type, applyTime, checkStatus,
 *  editPriceType, ...}}；无改价记录时 result:false。
 * checkStatus 语义（详情页 JS 取证）：0=审核中 / 1=通过 / 其他=不通过。
 * 只读纪律：仅 GET；JSON 透传零解析（Free CPU 纪律）。
 */
import type { Env } from "../env";
import { legacyFetch, LegacyError } from "./client";

/** 单号白名单（TT_ 前缀形态与纯数字形态，P0 取证） */
export function parsePriceChangeQuery(url: URL): string {
  const orderNo = (url.searchParams.get("orderNo") ?? "").trim();
  const pattern = /^[A-Za-z0-9_\-]{4,64}$/;
  if (!pattern.test(orderNo)) {
    throw new LegacyError(400, "BAD_ORDERNO", "orderNo 必填且合法（4~64 位字母数字）");
  }
  return orderNo;
}

export async function fetchLegacyPriceChange(
  env: Env,
  legacyCookie: string,
  orderNo: string
): Promise<Response> {
  const res = await legacyFetch(
    env,
    `/chsjs/editNeeds/query?ordernum=${encodeURIComponent(orderNo)}`,
    { legacyCookie, accept: "application/json, */*; q=0.01" }
  );
  if (res.status === 401 || res.status === 302) {
    throw new LegacyError(401, "LEGACY_SESSION_EXPIRED", "旧系统会话已失效，请重新登录");
  }
  if (!res.ok) {
    throw new LegacyError(502, "LEGACY_HTTP_ERROR", `旧系统 HTTP ${res.status}`);
  }
  return res;
}
