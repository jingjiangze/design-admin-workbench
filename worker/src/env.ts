/**
 * Worker 环境绑定声明（wrangler.jsonc 对应）
 *
 * Secret（wrangler secret put，绝不入库/入 jsonc/.env）：
 *   SESSION_ENCRYPTION_KEY   AES-256-GCM 密钥（base64 32 字节，加密 KV 中的 legacyCookie）
 *   TURNSTILE_SECRET_KEY     Turnstile 服务端校验密钥（可选：未配置时仅 dev/mock 跳过校验）
 *
 * Vars（wrangler.jsonc，非敏感）：
 *   LEGACY_API_ENABLED       "true"=转发旧系统；其他=Mock（生产必须 true，长文 §四十三）
 *   LEGACY_BASE_URL          旧系统根地址（默认 https://d.jndx.net）
 *   TURNSTILE_SITE_KEY       前端 Turnstile site key（公开，非 secret）
 */
import type { D1Database, KVNamespace, Fetcher } from "./types-cloudflare";

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  SESSIONS: KVNamespace;

  LEGACY_API_ENABLED?: string;
  LEGACY_BASE_URL?: string;
  TURNSTILE_SITE_KEY?: string;

  SESSION_ENCRYPTION_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
}

/** 会话有效期（秒）：旧系统会话实测 >24h，对齐 24h 固定 TTL */
export const SESSION_TTL_SECONDS = 24 * 60 * 60;

/** 新系统会话 Cookie 名（opaque id，绝不携带旧 SESSION 值） */
export const SESSION_COOKIE_NAME = "__dw_session";

/** 是否走真实旧系统（生产必须 true；由 Worker env 控制，前端无法篡改） */
export function isLegacyEnabled(env: Env): boolean {
  return String(env.LEGACY_API_ENABLED ?? "false") === "true";
}
