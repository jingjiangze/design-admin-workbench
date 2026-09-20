/**
 * Legacy Gateway —— 催稿收件箱（/api/reminders → reminderMessage.do，只读）
 *
 * 能力边界 [VERIFIED]（P0-06 取证）：子设计师端无催稿发送 API，催稿由客服侧发起。
 * Worker 只暴露收件箱只读通道；updateRemark/updateIsRead 等写接口永不接入
 * （长文 §二十五禁止清单）。已读/未读状态在新系统本地维护（前端 Mock 通道现状）。
 */
import type { Env } from "../env";
import { legacyFetch, legacyJson, LegacyError } from "./client";

export interface RemindListQuery {
  page: number;
  limit: number;
}

export function parseRemindQuery(url: URL): RemindListQuery {
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? "20") || 20));
  return { page, limit };
}

export async function fetchLegacyRemindList(
  env: Env,
  legacyCookie: string,
  query: RemindListQuery
): Promise<Record<string, unknown>> {
  const res = await legacyFetch(env, "/chsjs/child/reminderMessage.do", {
    legacyCookie,
    method: "POST",
    form: { page: query.page, limit: query.limit }
  });
  return legacyJson<Record<string, unknown>>(res);
}

/** Mock：催稿收件箱走新系统自有样本（expedite-messages 由前端域服务管理） */
export async function fetchMockRemindList(
  _query: RemindListQuery
): Promise<Record<string, unknown>> {
  return { result: true, data: { list: [], total: 0 } };
}

export { LegacyError };
