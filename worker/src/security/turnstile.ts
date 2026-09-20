/**
 * Turnstile 服务端校验（长文 §二十六）
 * TURNSTILE_SECRET_KEY 未配置时：仅 LEGACY_API_ENABLED=false（dev/mock）允许跳过；
 * 生产（legacy=on）必须配置 secret，否则登录直接 500 拒绝。
 */
import type { Env } from "../env";

export interface TurnstileResult {
  ok: boolean;
  reason?: string;
}

export async function verifyTurnstile(
  env: Env,
  token: string | undefined,
  remoteIp: string | null
): Promise<TurnstileResult> {
  if (!env.TURNSTILE_SECRET_KEY) {
    if (String(env.LEGACY_API_ENABLED ?? "false") !== "true") {
      return { ok: true, reason: "skipped-dev-mock-mode" };
    }
    return { ok: false, reason: "turnstile_secret_missing_in_production" };
  }
  if (!token) return { ok: false, reason: "turnstile_token_missing" };

  const body = new FormData();
  body.append("secret", env.TURNSTILE_SECRET_KEY);
  body.append("response", token);
  if (remoteIp) body.append("remoteip", remoteIp);

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body
    });
    const data = (await res.json()) as { success: boolean; "error-codes"?: string[] };
    return data.success
      ? { ok: true }
      : { ok: false, reason: `turnstile_rejected:${(data["error-codes"] ?? []).join(",")}` };
  } catch {
    return { ok: false, reason: "turnstile_verify_unreachable" };
  }
}
