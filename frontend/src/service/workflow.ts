/**
 * 工作流领域服务 —— 个人防漏单标记（绿点）+ 一键接单（WORKFLOW-V2）
 *
 * 语义红线（docs/WORKFLOW_MARKER_SPEC.md 冻结）：
 * - 绿点 = "当前用户已确认完成对应操作"，不是旧系统状态 / 已读 / 已联系 / 客户状态；
 * - 门禁：旧系统动作成功（legacyActionSuccess === true）才写标记 —— Real 通道
 *   由 Worker 强制（POST /api/workflow/takeover 内部先调旧系统再写 D1）；
 *   Mock 通道由本服务的 transport 注入点保证（失败项绝不落标记）；
 * - 标记幂等（同 key 保留首次 processedAt）、按身份隔离、处理后不消失、不参与排序。
 *
 * 双通道：Real（/api/workflow/*）与 Mock（localStorage 按身份镜像，供纯前端
 * 开发与 vitest）。存储/传输均可注入（injectMarkerStorage / injectTakeoverTransport）。
 */
import { isLegacyRealEnabled } from "./gateway";
import {
  fetchGatewayMarkers,
  putGatewayMarkers,
  takeoverGateway,
  type GatewayTakeoverResult
} from "./legacy/workflow";
import { getUserIdentity } from "./pricing/pricing-rule-store";

export type MarkerItemType = "order" | "reminder";

export interface MarkerItem {
  itemType: MarkerItemType;
  itemKey: string;
}

export interface TakeoverTarget {
  /** 旧系统申请流水 ID（batchTakeover 的 applyidArr 参数） */
  applyId: string;
  /** 需求主键 needsid（标记锚定它，规格十二） */
  orderId: string;
}

export interface TakeoverResult {
  orderId: string;
  applyId: string;
  ok: boolean;
  message: string;
  processedAt?: string;
}

// ── item_key 构造（规格十二：锚定旧系统主键，禁用 ordernum） ──

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function buildMarkerKey(itemType: MarkerItemType, id: string): MarkerItem {
  if (!id || !ID_PATTERN.test(id)) {
    throw new Error(`非法标记主键: ${itemType}:${id}`);
  }
  return { itemType, itemKey: `${itemType}:${id}` };
}

/** 订单标记 key：order:{needsid} */
export function orderMarkerKey(needsid: string): MarkerItem {
  return buildMarkerKey("order", needsid);
}

/** 催稿消息标记 key：reminder:{reminderId} */
export function reminderMarkerKey(reminderId: string): MarkerItem {
  return buildMarkerKey("reminder", reminderId);
}

// ── Mock 本地存储（可注入；按身份隔离，同 pricing 镜像模式） ──

export interface MarkerStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** 内存兜底（Node/vitest 无 localStorage；仅进程内） */
const MEMORY_FALLBACK: MarkerStorageLike = (() => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k)
  };
})();

/** 惰性解析默认存储（避免无 localStorage 环境模块加载即崩） */
function resolveDefaultStorage(): MarkerStorageLike {
  try {
    return typeof localStorage !== "undefined" ? localStorage : MEMORY_FALLBACK;
  } catch {
    return MEMORY_FALLBACK;
  }
}

let storage: MarkerStorageLike | null = null;

function getStorage(): MarkerStorageLike {
  if (!storage) storage = resolveDefaultStorage();
  return storage;
}

/** 测试注入：内存存储 */
export function injectMarkerStorage(s: MarkerStorageLike): void {
  storage = s;
  cache = null;
  cacheIdentity = null;
}

function storageKey(): string {
  return `workflowMarkers:${getUserIdentity()}`;
}

/** 模块级缓存：key → processedAt（绑定身份，身份切换自动失效重载） */
let cache: Map<string, string> | null = null;
let cacheIdentity: string | null = null;

function readLocal(): Map<string, string> {
  const identity = getUserIdentity();
  if (cache && cacheIdentity === identity) return cache;
  const map = new Map<string, string>();
  try {
    const raw = getStorage().getItem(storageKey());
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, string>;
      for (const [k, v] of Object.entries(parsed)) map.set(k, v);
    }
  } catch {
    // 坏数据：按空处理（仅影响本地镜像，Real 通道以服务端为准）
  }
  cache = map;
  cacheIdentity = identity;
  return map;
}

function writeLocal(map: Map<string, string>): void {
  try {
    getStorage().setItem(storageKey(), JSON.stringify(Object.fromEntries(map)));
  } catch {
    // 存储满等异常：静默（仅影响本地镜像）
  }
  cache = map;
  cacheIdentity = getUserIdentity();
}

// ── 测试重置 ──

export function resetWorkflowForTest(): void {
  cache = null;
  cacheIdentity = null;
  transport = null;
  storage = null;
}

// ── 标记读写 ──

/** 当前用户全部标记（key → processedAt） */
export async function listHandledMarkers(): Promise<Map<string, string>> {
  if (!isLegacyRealEnabled()) {
    return new Map(readLocal());
  }
  const res = await fetchGatewayMarkers();
  const map = new Map<string, string>();
  for (const row of res.data?.list ?? []) {
    map.set(row.itemKey, row.processedAt);
  }
  cache = map; // 服务端为真相源，覆盖本地镜像
  return map;
}

/** 写"我已处理"标记（幂等） */
export async function markHandled(items: MarkerItem[]): Promise<void> {
  if (!items.length) return;
  if (!isLegacyRealEnabled()) {
    const map = readLocal();
    const now = new Date().toISOString();
    for (const it of items) if (!map.has(it.itemKey)) map.set(it.itemKey, now);
    writeLocal(map);
    return;
  }
  await putGatewayMarkers(items);
  const map = readLocal();
  const now = new Date().toISOString();
  for (const it of items) if (!map.has(it.itemKey)) map.set(it.itemKey, now);
  writeLocal(map);
}

/** 取消已处理标记（第一版无 UI 入口） */
export async function unmarkHandled(items: MarkerItem[]): Promise<void> {
  if (!items.length) return;
  const map = readLocal();
  for (const it of items) map.delete(it.itemKey);
  writeLocal(map);
  if (!isLegacyRealEnabled()) return;
  const { deleteGatewayMarkers } = await import("./legacy/workflow");
  await deleteGatewayMarkers(items);
}

// ── 一键接单（旧系统真实业务反馈；门禁在 transport 内强制） ──

type TakeoverTransport = (
  targets: TakeoverTarget[]
) => Promise<GatewayTakeoverResult[]>;

let transport: TakeoverTransport | null = null;

/** 测试/特殊场景注入 transport（null = 按通道默认） */
export function injectTakeoverTransport(fn: TakeoverTransport | null): void {
  transport = fn;
}

async function defaultTransport(
  targets: TakeoverTarget[]
): Promise<GatewayTakeoverResult[]> {
  if (isLegacyRealEnabled()) {
    const res = await takeoverGateway(targets);
    return res.data?.results ?? [];
  }
  // Mock：恒成功（绿点链路等价演示）
  const now = new Date().toISOString();
  return targets.map(t => ({
    ...t,
    ok: true,
    message: "Mock 模式：已接单（未触旧系统）",
    processedAt: now
  }));
}

/**
 * 一键接单（单条或批量）。核心门禁（规格二十四/三十）：
 * 结果 ok === false 的条目绝不写标记 —— Real 通道由 Worker 保证，
 * Mock 通道由本函数的写标记分支保证（仅 ok 项落库）。
 */
export async function takeoverOrders(
  targets: TakeoverTarget[]
): Promise<TakeoverResult[]> {
  if (!targets.length) return [];
  const results = await (transport ?? defaultTransport)(targets);

  // 仅成功项落本地镜像（Real 通道服务端已写 D1；镜像供同步读取）
  const okItems = results.filter(r => r.ok).map(r => orderMarkerKey(r.orderId));
  if (okItems.length) {
    const map = readLocal();
    for (const it of okItems) {
      const fromResult = results.find(
        r => r.ok && `order:${r.orderId}` === it.itemKey
      );
      if (!map.has(it.itemKey))
        map.set(
          it.itemKey,
          fromResult?.processedAt ?? new Date().toISOString()
        );
    }
    writeLocal(map);
  }
  return results.map(r => ({
    orderId: r.orderId,
    applyId: r.applyId,
    ok: r.ok,
    message: r.message,
    processedAt: r.processedAt
  }));
}
