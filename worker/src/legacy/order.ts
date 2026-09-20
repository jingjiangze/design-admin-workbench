/**
 * Legacy Gateway —— 订单列表（/api/orders → getOrderList.do）
 *
 * [VERIFIED] 隐性契约：sort=0&sorttype=1 必传，缺省 flag:500（Phase 0 实测）。
 * 响应为旧系统原始 JSON 透传（{result, data:{countInfo, pageInfo}}），
 * 38 字段 → OrderListItem 的映射保留在前端 order-mapping.ts（浏览器负责解析，
 * Worker 只做"保护和转发"，节省 Free CPU 10ms 限制 —— 长文 §二十二）。
 *
 * 只读纪律：GET /api/orders 由 Worker 转为旧系统 POST 表单（旧系统页面同款行为），
 * 不代表开放写能力——该 POST 在旧系统语义上是"查询"。
 */
import type { Env } from "../env";
import { legacyFetch, legacyJson, LegacyError } from "./client";

/** 前端可见的白名单查询参数 */
export interface OrderListQuery {
  page: number;
  limit: number;
  /** 旧系统状态过滤枚举 ""/"1".."8"/"11"/"12"（六视图映射在前端完成） */
  state: string;
  keyword?: string;
}

export function parseOrderListQuery(url: URL): OrderListQuery {
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? "20") || 20));
  const state = url.searchParams.get("state") ?? "";
  const keyword = url.searchParams.get("keyword") ?? undefined;
  // state 白名单：空 + 数字枚举，防注入
  const safeState = state === "" || /^[0-9]{1,2}$/.test(state) ? state : "";
  return { page, limit, state: safeState, keyword: keyword?.slice(0, 100) };
}

export async function fetchLegacyOrderList(
  env: Env,
  legacyCookie: string,
  query: OrderListQuery
): Promise<Record<string, unknown>> {
  // sort=0 & sorttype=1 强制注入，前端无法覆盖（隐性契约）
  const form: Record<string, string | number> = {
    sort: 0,
    sorttype: 1,
    page: query.page,
    limit: query.limit,
    state: query.state
  };
  if (query.keyword) form.keyword = query.keyword;

  const res = await legacyFetch(env, "/chsjs/child/getOrderList.do", {
    legacyCookie,
    method: "POST",
    form
  });
  return legacyJson<Record<string, unknown>>(res);
}

/** Mock 透传：LEGACY_API_ENABLED=false 时返回脱敏样本（长文 §四十二） */
export async function fetchMockOrderList(
  env: Env,
  _query: OrderListQuery
): Promise<Record<string, unknown>> {
  const mod = await import("./mock-data/order-list.json");
  const sample = (mod.default ?? mod) as Record<string, unknown>;
  return sample;
}

export { LegacyError };
