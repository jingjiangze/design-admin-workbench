/**
 * KV Session 存储（长文 §十三/§十四）
 *
 * KV key:   sess:<opaque-random-id>
 * KV value: { userKey, legacyCookie(加密), createdAt, expiresAt, csrfTokenHash }
 *
 * 浏览器只拿到 __dw_session=<opaque-id>（HttpOnly/Secure/SameSite=Lax/Path=/），
 * 绝不接触 d.jndx.net 的 SESSION 值。legacyCookie AES-256-GCM 加密后落 KV。
 */
import type { Env } from "../env";
import { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from "../env";
import { encryptString, decryptString, newOpaqueId, sha256Hex } from "./crypto";

export interface SessionRecord {
  /** 用户标识（旧系统登录名；D1 users.user_key 同源） */
  userKey: string;
  /** 旧系统 Cookie 串（AES-GCM 密文，仅 Worker 可解） */
  legacyCookieEnc: string;
  createdAt: string;
  expiresAt: string;
  /** 写请求 CSRF token 的 sha256（双提交） */
  csrfTokenHash: string;
}

export interface NewSessionResult {
  sessionId: string;
  csrfToken: string;
  record: SessionRecord;
}

export function sessionCookie(sessionId: string): string {
  // Secure 属性：workers.dev 与正式域名均 HTTPS，恒可加
  return `${SESSION_COOKIE_NAME}=${sessionId}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

function readSessionCookie(request: Request): string | null {
  const header = request.headers.get("Cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === SESSION_COOKIE_NAME && rest.length > 0) return rest.join("=");
  }
  return null;
}

export async function createSession(
  env: Env,
  userKey: string,
  legacyCookie: string
): Promise<NewSessionResult> {
  if (!env.SESSION_ENCRYPTION_KEY) {
    throw new Error("SESSION_ENCRYPTION_KEY secret not configured");
  }
  const sessionId = newOpaqueId();
  const csrfToken = newOpaqueId(24);
  const now = new Date();
  const record: SessionRecord = {
    userKey,
    legacyCookieEnc: await encryptString(env.SESSION_ENCRYPTION_KEY, legacyCookie),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_TTL_SECONDS * 1000).toISOString(),
    csrfTokenHash: await sha256Hex(csrfToken)
  };
  await env.SESSIONS.put(
    `sess:${sessionId}`,
    JSON.stringify(record),
    { expirationTtl: SESSION_TTL_SECONDS }
  );
  return { sessionId, csrfToken, record };
}

export async function getSession(
  env: Env,
  request: Request
): Promise<SessionRecord | null> {
  const sessionId = readSessionCookie(request);
  if (!sessionId) return null;
  const raw = await env.SESSIONS.get(`sess:${sessionId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionRecord;
  } catch {
    return null;
  }
}

export async function destroySession(
  env: Env,
  request: Request
): Promise<void> {
  const sessionId = readSessionCookie(request);
  if (sessionId) await env.SESSIONS.delete(`sess:${sessionId}`);
}

/** 解密旧系统 Cookie（仅 Worker 内部使用，绝不返回给浏览器） */
export async function getLegacyCookie(
  env: Env,
  record: SessionRecord
): Promise<string> {
  if (!env.SESSION_ENCRYPTION_KEY) {
    throw new Error("SESSION_ENCRYPTION_KEY secret not configured");
  }
  return decryptString(env.SESSION_ENCRYPTION_KEY, record.legacyCookieEnc);
}

/**
 * 按 userKey 反查最新有效 Session（无 request 上下文的场景：cron 定时任务）。
 * KV list 前缀遍历 —— 当前用户量极小（单团队工具），可接受；
 * 用户规模增长后再引入 userKey→sessionId 二级索引。
 */
export async function findLatestSessionByUserKey(
  env: Env,
  userKey: string
): Promise<SessionRecord | null> {
  let cursor: string | undefined;
  let best: SessionRecord | null = null;
  do {
    const page = await env.SESSIONS.list({ prefix: "sess:", cursor });
    for (const key of page.keys) {
      const raw = await env.SESSIONS.get(key.name);
      if (!raw) continue;
      let record: SessionRecord;
      try {
        record = JSON.parse(raw) as SessionRecord;
      } catch {
        continue;
      }
      if (record.userKey !== userKey) continue;
      if (new Date(record.expiresAt).getTime() <= Date.now()) continue;
      if (!best || new Date(record.createdAt) > new Date(best.createdAt)) {
        best = record;
      }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return best;
}
