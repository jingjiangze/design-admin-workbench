/**
 * SWR 缓存 —— stale-while-revalidate（2026-09-21 用户指令）
 *
 * 语义：进入页面先渲染 localStorage 缓存（毫秒级），后台静默刷新后无缝更新。
 * 背景：真实数据链路（Worker → 旧系统 POST）单请求 0.3~1.5s，收入/订单链路
 * 串行瀑布可达 20+ 请求，无缓存时每次进入全量重拉 —— 第二次进入仍然慢。
 *
 * 设计约束：
 * - 身份隔离：key = `swr:<identity>:<name>`（与 pricing/goodsIdMap 同节奏，防串账号）；
 * - 刷新节流：fresh 窗口内（默认 60s）跳过后台刷新 —— 旧系统限流友好，
 *   避免路由来回切换狂打 6 页订单请求；
 * - 非敏感数据 only：聚合数字与列表视图模型，不含 Cookie/Token/PII 全量；
 * - 容量保护：单条 >2MB 丢弃不缓存（防御异常膨胀）。
 */

import { getUserIdentity } from "./user-identity";

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

const defaultStorage: StorageLike =
  typeof window !== "undefined" && window.localStorage
    ? window.localStorage
    : {
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => undefined
      };

let storage: StorageLike = defaultStorage;

/** 测试注入 */
export function injectSwrStorage(s: StorageLike): void {
  storage = s;
}
export function resetSwrStorage(): void {
  storage = defaultStorage;
}

const PREFIX = "swr:";
/** 单条上限 2MB（序列化后） */
const MAX_ENTRY_BYTES = 2 * 1024 * 1024;

export interface SwrEntry<T> {
  /** 写入时间戳（ms） */
  at: number;
  data: T;
}

function storageKey(name: string): string {
  return `${PREFIX}${getUserIdentity() || "local"}:${name}`;
}

/** 读缓存（无 / 损坏 / 值为空 → null；原始类型数字/字符串与对象/数组均合法） */
export function swrRead<T>(name: string): SwrEntry<T> | null {
  try {
    const raw = storage.getItem(storageKey(name));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SwrEntry<T>;
    if (!parsed || typeof parsed.at !== "number" || parsed.data == null) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** 写缓存（超 2MB 静默丢弃——缓存缺失只影响速度，不影响正确性） */
export function swrWrite<T>(name: string, data: T): void {
  try {
    const entry: SwrEntry<T> = { at: Date.now(), data };
    const raw = JSON.stringify(entry);
    if (raw.length > MAX_ENTRY_BYTES) return;
    storage.setItem(storageKey(name), raw);
  } catch {
    // 配额满/序列化失败 → 放弃缓存（stale 语义可容忍）
  }
}

export function swrRemove(name: string): void {
  try {
    storage.removeItem(storageKey(name));
  } catch {
    // 忽略
  }
}

/** 缓存是否仍在 fresh 窗口内（fresh → 跳过后台刷新节流） */
export function swrIsFresh(
  entry: SwrEntry<unknown> | null,
  maxAgeMs: number
): boolean {
  return !!entry && Date.now() - entry.at < maxAgeMs;
}

/** 默认 fresh 窗口 60s */
export const SWR_FRESH_MS = 60_000;
