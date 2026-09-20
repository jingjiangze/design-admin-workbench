/**
 * API 安全中间件
 *
 * 1. requireSession：除 /api/auth/login 与 /api/health 外，全部 /api/* 必须有有效
 *    Session；身份一律取自 Worker Session（userKey），绝不信前端传参（长文 §二十七/§四十九）。
 * 2. assertWriteOrigin：写请求（POST/PUT/DELETE）三件套校验 ——
 *    SameSite Cookie（session cookie 已带）+ Origin 同源 + CSRF 双提交（长文 §二十八）。
 */
import type { Env } from "../env";
import type { SessionRecord } from "./session";
import { getSession, destroySession } from "./session";
import { sha256Hex } from "./crypto";

export interface AuthContext {
  session: SessionRecord;
  sessionId: string;
}

export type AuthResult =
  | { ok: true; ctx: AuthContext }
  | { ok: false; response: Response };

export function jsonError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ result: false, code, message }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store" }
  });
}

export function jsonOk(data: unknown, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
      ...extraHeaders
    }
  });
}

function readSessionId(request: Request): string | null {
  const header = request.headers.get("Cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === "__dw_session" && rest.length > 0) return rest.join("=");
  }
  return null;
}

export async function requireSession(
  env: Env,
  request: Request
): Promise<AuthResult> {
  const record = await getSession(env, request);
  if (!record) {
    return { ok: false, response: jsonError(401, "UNAUTHENTICATED", "登录会话无效或已过期") };
  }
  const sessionId = readSessionId(request);
  if (!sessionId) {
    return { ok: false, response: jsonError(401, "UNAUTHENTICATED", "会话 Cookie 缺失") };
  }
  return { ok: true, ctx: { session: record, sessionId } };
}

/** Origin 必须与请求 Host 同源（防跨站写）；CSRF token 双提交比对 */
export async function assertWriteOrigin(
  request: Request,
  ctx: AuthContext
): Promise<Response | null> {
  const origin = request.headers.get("Origin");
  const host = request.headers.get("Host") ?? new URL(request.url).host;
  if (!origin) return jsonError(403, "ORIGIN_MISSING", "写请求缺少 Origin");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return jsonError(403, "ORIGIN_INVALID", "Origin 非法");
  }
  if (originHost !== host) {
    return jsonError(403, "ORIGIN_MISMATCH", "Origin 与站点不一致");
  }

  const token = request.headers.get("X-CSRF-Token");
  if (!token) return jsonError(403, "CSRF_MISSING", "缺少 X-CSRF-Token");
  const hash = await sha256Hex(token);
  if (hash !== ctx.session.csrfTokenHash) {
    return jsonError(403, "CSRF_MISMATCH", "CSRF 校验失败");
  }
  return null;
}

/** 会话过期清理辅助（logout 等场景） */
export async function revokeCurrentSession(env: Env, request: Request): Promise<void> {
  await destroySession(env, request);
}
