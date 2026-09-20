/**
 * Legacy Gateway —— 催稿收件箱（/api/reminders → getReminderMessageNew.do，只读）
 *
 * 能力边界 [VERIFIED]（P0-06 取证）：子设计师端无催稿发送 API，催稿由客服侧发起。
 * Worker 只暴露收件箱只读通道；updateRemark/updateIsRead 等写接口永不接入
 * （长文 §二十五禁止清单）。已读/未读状态在新系统本地维护（前端 Mock 通道现状）。
 *
 * [VERIFIED 2026-09-20 CF-REAL-03 实测]：
 * - reminderMessage.do 是 HTML 页面（JSP 渲染催单收件箱 UI），非 JSON API；
 *   对它发 POST 只会拿到 53KB HTML → legacyJson 解析失败 → 500 INTERNAL。
 * - 真实列表数据端点 = GET /chsjs/child/getReminderMessageNew.do?page=&limit=
 *   （layui table 默认 GET 分页，页面 JS 内 contextPath="/chsjs"）。
 * - 响应：{result:true, message:"操作成功", data:{pageInfo:{list,total,pageNum,pageSize,...}}}
 * - 行字段（14，实测首行）：id, memberid, isread, sendtime, needsid, noticedetail,
 *   supplyman, ordernum, state, subname, times, page, limit, shop
 *   （页面表格 cols 里的 timeout/ageing 字段实测不存在于 JSON —— 旧文档口径修正）
 * - 实测规模：total=164 条催单（2026-09-20，账号 176****6193）
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

/** 旧系统 getReminderMessageNew.do 原始响应结构 [VERIFIED] */
export interface LegacyRemindRaw {
  result?: boolean | string;
  message?: string;
  data?: {
    pageInfo?: {
      list?: Record<string, unknown>[];
      total?: number;
      pageNum?: number;
      pageSize?: number;
    } & Record<string, unknown>;
  } & Record<string, unknown>;
}

/** 规范化给前端的收件箱形态：{result, data:{list,total,pageNum,pageSize}} */
export interface RemindInbox {
  result: true;
  data: {
    list: Record<string, unknown>[];
    total: number;
    pageNum: number;
    pageSize: number;
  };
}

export function normalizeRemindInbox(raw: LegacyRemindRaw, query: RemindListQuery): RemindInbox {
  const pageInfo = raw.data?.pageInfo ?? {};
  const list = pageInfo.list ?? [];
  const total = typeof pageInfo.total === "number" ? pageInfo.total : list.length;
  const pageNum =
    typeof pageInfo.pageNum === "number" && pageInfo.pageNum > 0 ? pageInfo.pageNum : query.page;
  const pageSize =
    typeof pageInfo.pageSize === "number" && pageInfo.pageSize > 0 ? pageInfo.pageSize : query.limit;
  return { result: true, data: { list, total, pageNum, pageSize } };
}

export async function fetchLegacyRemindList(
  env: Env,
  legacyCookie: string,
  query: RemindListQuery
): Promise<LegacyRemindRaw> {
  const qs = new URLSearchParams({ page: String(query.page), limit: String(query.limit) });
  const res = await legacyFetch(env, `/chsjs/child/getReminderMessageNew.do?${qs.toString()}`, {
    legacyCookie,
    method: "GET"
  });
  return legacyJson<LegacyRemindRaw>(res);
}

/** Mock：催稿收件箱走新系统自有样本（expedite-messages 由前端域服务管理） */
export async function fetchMockRemindList(
  _query: RemindListQuery
): Promise<RemindInbox> {
  return { result: true, data: { list: [], total: 0, pageNum: _query.page, pageSize: _query.limit } };
}

export { LegacyError };
