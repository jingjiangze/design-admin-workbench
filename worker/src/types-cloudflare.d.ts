/**
 * Cloudflare Workers 运行时类型 —— 最小子集自包含声明
 *
 * 设计决策：不依赖 @cloudflare/workers-types（pnpm 严格布局 + worker/ 目录
 * 独立于 frontend/，跨目录类型解析在 CF Build 环境有不确定性）。
 * 本文件只声明本项目实际用到的接口子集。首次 Cloudflare Build 验证后，
 * 如需完整类型可切换为官方 types 包（docs/CLOUDFLARE_DEPLOYMENT.md §验证清单）。
 */

/** KV 命名空间（仅用于 Session，见 docs/SESSION_STORAGE_SPEC.md） */
export interface KVNamespaceListResult {
  keys: { name: string; expiration?: number; metadata?: Record<string, unknown> }[];
  list_complete: boolean;
  cursor?: string;
}

export interface KVNamespace {
  get(key: string, options?: { type?: "text" | "json" }): Promise<unknown>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number; metadata?: Record<string, unknown> }
  ): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: {
    prefix?: string;
    cursor?: string;
    limit?: number;
  }): Promise<KVNamespaceListResult>;
}

/** D1 数据库（仅用于 pricing_rules / users / user_settings） */
export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<{ results: unknown[] }>;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

export interface D1Result<T> {
  results: T[];
  success: boolean;
  meta: Record<string, unknown>;
}

/** Static Assets 绑定（frontend/dist） */
export interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

/** Workers 定时/请求执行上下文（本项目仅用 passThroughOnException 占位） */
export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

/** Cron Trigger 执行事件（scheduled handler 参数，仅用到 cron 表达式） */
export interface ScheduledController {
  cron: string;
  scheduledTime: number;
}

export type { KVNamespace as KVNamespaceAlias };
