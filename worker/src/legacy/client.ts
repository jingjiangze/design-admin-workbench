/**
 * Legacy HTTP 客户端 —— 旧系统（d.jndx.net）的唯一出口
 *
 * 纪律（长文 §二十四/§二十五）：
 * - 只有白名单函数可调用 legacyGet/legacyPost，每个函数对应一个旧 endpoint；
 * - 第一阶段仅允许只读：getOrderList / needsDetail2 / getReminderMessageNew / childLogin（登录）
 *   （[VERIFIED 2026-09-20] reminderMessage.do 是 HTML 页面，数据 API 是 getReminderMessageNew.do）；
 * - batchTakeover/updateRemark/updateIsRead/insertAbnormalOrder/updateRepulseData 等写接口禁止接入；
 * - 禁止任何 /api/proxy?url= 形态的开放代理。
 *
 * 凭据红线：旧 Cookie 只在内存中流转（KV 密文 → 解密 → 请求头），绝不写日志。
 */
import type { Env } from "../env";

const DEFAULT_BASE = "https://d.jndx.net";
const TIMEOUT_MS = 15_000;
const ALLOWED_COOKIE_NAMES = new Set(["SESSION", "JSESSIONID"]);

export class LegacyError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** 只保留会话相关 Cookie（绝不把用户其他站点 Cookie 转发出去） */
export function sanitizeLegacyCookie(raw: string): string {
  return raw
    .split(";")
    .map(part => part.trim())
    .filter(part => {
      const name = part.split("=")[0]?.trim() ?? "";
      return ALLOWED_COOKIE_NAMES.has(name) && part.includes("=");
    })
    .join("; ");
}

interface LegacyInit {
  /** 旧系统 Cookie（来自 KV Session 解密） */
  legacyCookie: string;
  method?: "GET" | "POST";
  /** POST 表单体（application/x-www-form-urlencoded） */
  form?: Record<string, string | number>;
  /** POST JSON 体（登录用） */
  json?: unknown;
  accept?: string;
}

export async function legacyFetch(
  env: Env,
  path: string,
  init: LegacyInit
): Promise<Response> {
  const base = (env.LEGACY_BASE_URL ?? DEFAULT_BASE).replace(/\/$/, "");
  const url = base + path;
  const headers: Record<string, string> = {
    Cookie: sanitizeLegacyCookie(init.legacyCookie),
    "X-Requested-With": "XMLHttpRequest",
    "User-Agent": "design-admin-workbench-gateway/1.0",
    Referer: `${base}/chsjs/child/memberCenter.do`,
    Accept: init.accept ?? "application/json, text/javascript, */*; q=0.01"
  };
  let body: string | undefined;
  if (init.json !== undefined) {
    headers["Content-Type"] = "application/json;charset=UTF-8";
    body = JSON.stringify(init.json);
  } else if (init.form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8";
    body = new URLSearchParams(
      Object.entries(init.form).map(([k, v]) => [k, String(v)])
    ).toString();
  }

  try {
    return await fetch(url, {
      method: init.method ?? "GET",
      headers,
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    throw new LegacyError(502, "LEGACY_UNREACHABLE", `旧系统请求失败: ${msg}`);
  }
}

/** 旧系统 JSON 响应统一校验：非 2xx / result=false → 规范化错误 */
export async function legacyJson<T>(res: Response): Promise<T> {
  if (res.status === 401 || res.status === 302) {
    throw new LegacyError(401, "LEGACY_SESSION_EXPIRED", "旧系统会话已失效，请重新登录");
  }
  if (!res.ok) {
    throw new LegacyError(502, "LEGACY_HTTP_ERROR", `旧系统 HTTP ${res.status}`);
  }
  const data = (await res.json()) as { result?: boolean | string; flag?: number } & Record<string, unknown>;
  if (data.result === false || data.result === "false" || data.flag === 500) {
    throw new LegacyError(502, "LEGACY_BIZ_ERROR", "旧系统业务拒绝（result=false/flag:500）");
  }
  return data as T;
}
