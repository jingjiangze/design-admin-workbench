/**
 * 加密工具 —— AES-256-GCM 加密 KV 中的 legacyCookie（长文 §十四）
 * 密钥来自 Worker Secret SESSION_ENCRYPTION_KEY（绝不硬编码）。
 * 存储格式：base64url(iv).base64url(ciphertext)
 */
import type { Env } from "../env";

const enc = new TextEncoder();
const dec = new TextDecoder();

function base64UrlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importAesKey(secret: string): Promise<CryptoKey> {
  const raw = base64UrlDecode(secret.replace(/\s+/g, ""));
  if (raw.length !== 32) {
    throw new Error("SESSION_ENCRYPTION_KEY must decode to 32 bytes (AES-256)");
  }
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
    "decrypt"
  ]);
}

export async function encryptString(
  secret: string,
  plain: string
): Promise<string> {
  const key = await importAesKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    enc.encode(plain)
  );
  return `${base64UrlEncode(iv)}.${base64UrlEncode(new Uint8Array(ct))}`;
}

export async function decryptString(
  secret: string,
  payload: string
): Promise<string> {
  const [ivB64, ctB64] = payload.split(".");
  if (!ivB64 || !ctB64) throw new Error("malformed ciphertext");
  const key = await importAesKey(secret);
  const pt = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64UrlDecode(ivB64) as BufferSource
    },
    key,
    base64UrlDecode(ctB64) as BufferSource
  );
  return dec.decode(pt);
}

/** 不透明会话 id（32 字节随机，base64url）——浏览器唯一可见的会话凭证 */
export function newOpaqueId(byteLen = 32): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(byteLen)));
}

/** CSRF token 的 SHA-256（KV 只存 hash，双提交比对） */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    enc.encode(input) as BufferSource
  );
  return [...new Uint8Array(digest)]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export { base64UrlEncode, base64UrlDecode };
