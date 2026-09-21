/**
 * goodsId 增量实证缓存（docs/INCOME_CUTOVER_SPEC.md §2 / INCOME_PRICING_MAPPING_AUDIT §五）
 *
 * 收入明细不含 goodsId；唯一真实来源 = 订单详情 goodsFileParamList。
 * 全量详情 145MB/月不可接受 → 缓存形态：
 *   goodsname → {goodsId, subGoodsId} 由详情实证逐条建立（localStorage 持久，非敏感）；
 *   缓存 miss → 订单号搜索（ordernum 精确包含）取 needsid → 拉详情实证 → 回填；
 *   永不猜（审计铁律：goodsName 只作缓存键，映射值必须来自详情实证）。
 * subGoodsid=-1 归一化 null（旧系统"无子商品"第三态，审计 §三）。
 */
import { fetchOrderDetail } from "../order-detail";
import { fetchOrders } from "../order";
import type { IncomeRecord } from "./income-record";

export interface GoodsIdentity {
  goodsId: string;
  subGoodsId: string | null;
}

const STORE_PREFIX = "goodsIdMap:";

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

const defaultStorage: StorageLike =
  typeof window !== "undefined" && window.localStorage
    ? window.localStorage
    : { getItem: () => null, setItem: () => undefined };

let storage: StorageLike = defaultStorage;
let identityScope = "local";

/** 测试注入 */
export function injectGoodsIdStorage(s: StorageLike): void {
  storage = s;
}
export function resetGoodsIdStorage(): void {
  storage = defaultStorage;
  identityScope = "local";
}

/** 登录后由 auth 流程调用（与 pricingRuleStore.setUserIdentity 同节奏） */
export function setGoodsIdIdentity(userId: string): void {
  identityScope = userId || "local";
}

function storageKey(): string {
  return `${STORE_PREFIX}${identityScope}`;
}

type CacheShape = Record<
  string,
  { goodsId: string; subGoodsId: string | null }
>;

function readCache(): CacheShape {
  try {
    const raw = storage.getItem(storageKey());
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as CacheShape) : {};
  } catch {
    return {};
  }
}

function writeCache(cache: CacheShape): void {
  storage.setItem(storageKey(), JSON.stringify(cache));
}

/** subGoodsid=-1 → null 归一化 */
function normalizeSub(raw: unknown): string | null {
  const s = raw == null ? "" : String(raw).trim();
  return s && s !== "-1" ? s : null;
}

/** 缓存读取（同步；miss 返回 null） */
export function getCachedGoodsIdentity(
  goodsName: string
): GoodsIdentity | null {
  const hit = readCache()[goodsName];
  return hit ? { goodsId: hit.goodsId, subGoodsId: hit.subGoodsId } : null;
}

/** 实证回填（供测试与内部复用） */
export function putGoodsIdentity(goodsName: string, id: GoodsIdentity): void {
  const cache = readCache();
  cache[goodsName] = { goodsId: id.goodsId, subGoodsId: id.subGoodsId };
  writeCache(cache);
}

/** 详情 goodsFileParamList → 商品身份（多商品单取第一条；实证禁止猜测） */
function identityFromDetail(
  detail: Awaited<ReturnType<typeof fetchOrderDetail>>
): GoodsIdentity | null {
  const first = detail?.fileConstraints?.find(c => c.goodsId);
  if (!first?.goodsId) return null;
  return { goodsId: first.goodsId, subGoodsId: normalizeSub(first.subGoodsId) };
}

/**
 * 单个 goodsName 的实证解析（缓存 miss 时触发）：
 * ordernum 搜索（任一该商品的收入记录订单号）→ needsid → 详情 → goodsFileParamList
 * 实证失败返回 null（调用方按 goodsId=null 处理，该行仅走系统口径，绝不猜）。
 */
export async function resolveGoodsIdentity(
  goodsName: string,
  sampleOrderNo: string
): Promise<GoodsIdentity | null> {
  const cached = getCachedGoodsIdentity(goodsName);
  if (cached) return cached;

  const search = await fetchOrders({
    view: "all",
    page: 1,
    pageSize: 5,
    keyword: sampleOrderNo
  });
  const needsid = search.list[0]?.orderId;
  if (!needsid) return null;

  const detail = await fetchOrderDetail({ needsid });
  const identity = identityFromDetail(detail);
  if (identity) putGoodsIdentity(goodsName, identity);
  return identity;
}

/**
 * 批量解析：为收入记录集补全 goodsId/subGoodsId（原地标注）。
 * 每个未知 goodsName 仅实证一次（取该名下任一记录的订单号作样本）。
 * 性能（2026-09-21）：实证改为并行（此前串行 for——首次进入 10+ 个 miss
 * = 20+ 串行请求，是收入链路 15s+ 的主要元凶）。
 * 容错：单条实证失败仅影响该商品（goodsId=null，走系统口径），
 * 绝不向上 throw 打挂整个收入模块（此前无 try-catch，一次搜索/详情
 * 超时即全链失败——"收入模块加载失败"的根因）。
 */
export async function annotateRecordsWithGoodsIds(
  records: IncomeRecord[]
): Promise<void> {
  // goodsName → 首个样本订单号
  const sample = new Map<string, string>();
  for (const r of records) {
    const name = r.goodsName || "未分类";
    if (!sample.has(name) && r.orderNo) sample.set(name, r.orderNo);
  }
  // 并行实证（每名独立 try-catch；失败静默 = 该名下所有行 goodsId 留 null）
  await Promise.all(
    [...sample.entries()].map(async ([name, orderNo]) => {
      if (getCachedGoodsIdentity(name)) return;
      try {
        await resolveGoodsIdentity(name, orderNo);
      } catch {
        // 实证失败：不回填、不中断（行 goodsId=null → 仅系统口径）
      }
    })
  );
  // 回填标注（缓存命中或刚实证的；实证失败的留 null）
  for (const r of records) {
    const name = r.goodsName || "未分类";
    const id = getCachedGoodsIdentity(name);
    r.goodsId = id?.goodsId ?? null;
    r.subGoodsId = id?.subGoodsId ?? null;
  }
}
