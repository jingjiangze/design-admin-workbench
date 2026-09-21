/**
 * /api/acceptance/* —— 接单开关 + 定时关闭
 *
 * 路由（全部要求有效 Session；写操作另过 assertWriteOrigin 三件套）：
 *   GET    /api/acceptance/status    当前接单状态 + 定时任务 + 最近执行结果
 *   POST   /api/acceptance/toggle    {open: boolean} 立即切换（用户授权写操作）
 *   GET    /api/acceptance/schedule  查询定时关闭任务
 *   POST   /api/acceptance/schedule  {closeAt: ISO} 设置定时关闭（1min~7d）
 *   DELETE /api/acceptance/schedule  取消定时关闭任务
 *
 * 执行红线（用户 2026-09-21 指令）：实现后不真实调用 toggle 做测试；
 * 真实切换仅由用户本人点击或到期 cron 触发。
 */
import type { Env } from "../env";
import { isLegacyEnabled } from "../env";
import type { AuthContext } from "../security/auth";
import { assertWriteOrigin, jsonOk, jsonError } from "../security/auth";
import { legacyCookieOf } from "../auth/routes";
import {
  fetchLegacyWorkState,
  setLegacyWorkState,
  fetchMockWorkState,
  setMockWorkState
} from "../legacy/acceptance";
import {
  getSchedule,
  putSchedule,
  deleteSchedule,
  getScheduleResult,
  parseScheduleCloseAt
} from "./store";

export async function handleAcceptance(
  env: Env,
  request: Request,
  path: string,
  ctx: AuthContext
): Promise<Response> {
  const userKey = ctx.session.userKey;

  // ── GET /api/acceptance/status ──
  if (path === "/api/acceptance/status" && request.method === "GET") {
    let open: boolean | null = null;
    let degraded: string | null = null;
    if (isLegacyEnabled(env)) {
      try {
        const cookie = await legacyCookieOf(env, ctx);
        open = (await fetchLegacyWorkState(env, cookie)).open;
      } catch (e) {
        degraded = e instanceof Error ? e.message : "状态读取失败";
      }
    } else {
      open = fetchMockWorkState().open;
    }
    const [schedule, lastResult] = await Promise.all([
      getSchedule(env, userKey),
      getScheduleResult(env, userKey)
    ]);
    return jsonOk({ result: true, data: { open, degraded, schedule, lastResult } });
  }

  // ── POST /api/acceptance/toggle ──
  if (path === "/api/acceptance/toggle" && request.method === "POST") {
    const forbidden = await assertWriteOrigin(request, ctx);
    if (forbidden) return forbidden;

    let body: { open?: unknown };
    try {
      body = (await request.json()) as { open?: unknown };
    } catch {
      return jsonError(400, "BAD_REQUEST", "请求体必须是 JSON");
    }
    if (typeof body.open !== "boolean") {
      return jsonError(400, "BAD_REQUEST", "open 必须是 boolean");
    }

    if (isLegacyEnabled(env)) {
      const cookie = await legacyCookieOf(env, ctx);
      const r = await setLegacyWorkState(env, cookie, body.open);
      return jsonOk({ result: r.result, data: { open: r.result ? body.open : null, message: r.message } });
    }
    const r = setMockWorkState(body.open);
    return jsonOk({ result: r.result, data: { open: body.open, message: r.message } });
  }

  // ── /api/acceptance/schedule ──
  if (path === "/api/acceptance/schedule") {
    if (request.method === "GET") {
      const [schedule, lastResult] = await Promise.all([
        getSchedule(env, userKey),
        getScheduleResult(env, userKey)
      ]);
      return jsonOk({ result: true, data: { schedule, lastResult } });
    }

    if (request.method === "POST") {
      const forbidden = await assertWriteOrigin(request, ctx);
      if (forbidden) return forbidden;

      let body: { closeAt?: unknown };
      try {
        body = (await request.json()) as { closeAt?: unknown };
      } catch {
        return jsonError(400, "BAD_REQUEST", "请求体必须是 JSON");
      }
      const closeAt = parseScheduleCloseAt(body.closeAt);
      if (!closeAt) {
        return jsonError(400, "BAD_REQUEST", "closeAt 必须是未来 1 分钟 ~ 7 天内的 ISO 时间");
      }
      const schedule = await putSchedule(env, userKey, closeAt);
      return jsonOk({ result: true, data: { schedule } });
    }

    if (request.method === "DELETE") {
      const forbidden = await assertWriteOrigin(request, ctx);
      if (forbidden) return forbidden;
      await deleteSchedule(env, userKey);
      return jsonOk({ result: true, data: { cancelled: true } });
    }
  }

  return jsonError(404, "NOT_FOUND", "未知接单端点");
}
