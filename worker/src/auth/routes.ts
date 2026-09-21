/**
 * /api/auth/* —— 登录 / 登出 / 会话信息
 *
 * 密码安全（长文 §十二/§十五）：
 * - 浏览器端 JSEncrypt 以旧系统公开 RSA 公钥（SPKI，非 secret）加密密码；
 * - Worker 收到的已是密文，透传给旧系统——全程不接触明文密码；
 * - D1/KV/日志/GitHub 均不保存 password（明文或密文）；
 * - 旧系统 SESSION 值加密后仅存 KV，浏览器只见 opaque __dw_session。
 *
 * 登录链路 [VERIFIED]（Phase 0 取证 djx_login.mjs 复现）：
 *   1. GET  /chsjs/child/toChildLogin.do   → Set-Cookie JSESSIONID
 *   2. POST /chsjs/child/childLogin.do     → JSON {result:true,...} + SESSION
 *
 * BLOCKED（长文 §五十一）：旧系统登录接口当前业务拒绝（账号侧待确认）。
 * 本路由实现完整但真实登录验收保持 BLOCKED，不硬编码 SESSION、不复制旧 Cookie 绕过。
 */
import type { Env } from "../env";
import { isLegacyEnabled } from "../env";
import { verifyTurnstile } from "../security/turnstile";
import {
  createSession,
  destroySession,
  sessionCookie,
  clearedSessionCookie,
  getLegacyCookie
} from "../security/session";
import { requireSession, jsonOk, jsonError, revokeCurrentSession } from "../security/auth";
import { legacyFetch } from "../legacy/client";
import { sanitizeLegacyCookie } from "../legacy/client";
import { ensureUser } from "../pricing/users";

interface LoginBody {
  username?: string;
  /** RSA(PKCS#1 v1.5) 密文 base64 —— 浏览器加密产物，Worker 不解密 */
  password?: string;
  turnstileToken?: string;
}

function collectSetCookies(res: Response): string[] {
  const get = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie;
  return typeof get === "function" ? get.call(res.headers) : [];
}

function mergeCookieJar(jar: Map<string, string>, setCookies: string[]): void {
  for (const sc of setCookies) {
    const [pair] = sc.split(";");
    const idx = pair.indexOf("=");
    if (idx > 0) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
}

function jarToCookie(jar: Map<string, string>): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

export async function handleAuth(
  env: Env,
  request: Request,
  path: string
): Promise<Response> {
  if (path === "/api/auth/login" && request.method === "POST") {
    return handleLogin(env, request);
  }
  if (path === "/api/auth/logout" && request.method === "POST") {
    const auth = await requireSession(env, request);
    if (auth.ok) await revokeCurrentSession(env, request);
    return jsonOk({ result: true }, { "Set-Cookie": clearedSessionCookie() });
  }
  if (path === "/api/auth/me" && request.method === "GET") {
    const auth = await requireSession(env, request);
    if (!auth.ok) return auth.response;
    return jsonOk({
      result: true,
      data: {
        userKey: auth.ctx.session.userKey,
        expiresAt: auth.ctx.session.expiresAt,
        csrfTokenRequired: true
      }
    });
  }
  return jsonError(404, "NOT_FOUND", "未知认证端点");
}

async function handleLogin(env: Env, request: Request): Promise<Response> {
  let body: LoginBody;
  try {
    body = (await request.json()) as LoginBody;
  } catch {
    return jsonError(400, "BAD_REQUEST", "请求体必须是 JSON");
  }
  const username = (body.username ?? "").trim();
  const password = body.password ?? "";
  if (!username || !password) {
    return jsonError(400, "BAD_REQUEST", "用户名与加密密码必填");
  }
  if (username.length > 64 || password.length > 1024) {
    return jsonError(400, "BAD_REQUEST", "字段超长");
  }

  // 1. Turnstile（公开站点登录防护）
  const ip = request.headers.get("CF-Connecting-IP");
  const ts = await verifyTurnstile(env, body.turnstileToken, ip);
  if (!ts.ok) {
    return jsonError(403, "TURNSTILE_FAILED", `人机校验未通过: ${ts.reason ?? ""}`);
  }

  // 2. Mock 模式：不触旧系统，直接发新系统会话（数据走 Mock 通道）
  if (!isLegacyEnabled(env)) {
    const { sessionId, csrfToken } = await createSession(env, username, "mock-mode");
    return jsonOk(
      { result: true, data: { mode: "mock", userKey: username, csrfToken } },
      { "Set-Cookie": sessionCookie(sessionId) }
    );
  }

  // 3. 真实登录：两步 cookie jar（长文 §十一）
  const jar = new Map<string, string>();
  try {
    const r1 = await legacyFetch(env, "/chsjs/child/toChildLogin.do", {
      legacyCookie: "",
      accept: "text/html,*/*"
    });
    mergeCookieJar(jar, collectSetCookies(r1));

    // 密码字段为浏览器 RSA 密文，原样透传
    const r2 = await legacyFetch(env, "/chsjs/child/childLogin.do", {
      legacyCookie: jarToCookie(jar),
      method: "POST",
      json: { username, password }
    });
    mergeCookieJar(jar, collectSetCookies(r2));

    const data = (await r2.json().catch(() => null)) as
      | { result?: boolean | string; [k: string]: unknown }
      | null;
    if (!data || data.result === false || data.result === "false") {
      return jsonError(401, "LEGACY_LOGIN_REJECTED", "旧系统登录被拒绝（账号侧问题待确认）");
    }

    const legacyCookie = sanitizeLegacyCookie(jarToCookie(jar));
    if (!legacyCookie) {
      return jsonError(502, "LEGACY_NO_SESSION", "旧系统未返回会话 Cookie");
    }

    // 4. 建新系统会话 + D1 登记 user（不存任何密码数据）
    const { sessionId, csrfToken } = await createSession(env, username, legacyCookie);
    try {
      await ensureUser(env.DB, username);
    } catch {
      // users 表登记失败不阻断登录（pricing 规则首次写入时再补登记）
    }
    return jsonOk(
      { result: true, data: { mode: "legacy", userKey: username, csrfToken } },
      { "Set-Cookie": sessionCookie(sessionId) }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return jsonError(502, "LEGACY_UNREACHABLE", `旧系统暂不可达: ${msg}`);
  }
}

/** 供 legacy 网关取解密后的旧 Cookie（内部用） */
export async function legacyCookieOf(
  env: Env,
  ctx: { session: import("../security/session").SessionRecord }
): Promise<string> {
  return getLegacyCookie(env, ctx.session);
}

export { destroySession };
