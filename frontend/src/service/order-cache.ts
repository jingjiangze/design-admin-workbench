/**
 * 订单全量缓存 + 渐进加载（2026-09-21 用户指令）
 *
 * 策略（SWR + 渐进）：
 * 1. 先拉最近订单（page1，服务端默认排序 = 最新在前）快速展示；
 * 2. 全部订单后台默认拉取（limit=100，并发 2，549 条 ≈ 6 页）→ SWR 缓存；
 * 3. Tab 切换/翻页优先本地过滤（stateLabel→state 映射，[VERIFIED] 枚举表），
 *    fresh 窗口外后台 prefetchAll 静默刷新；
 * 4. 搜索（keyword）始终走服务端（ordernum 包含匹配语义权威）。
 *
 * 诚实性边界：本地 Tab 过滤基于列表行中文标签（stateLabel）映射，个别
 * 未收录标签只会出现在"全部"Tab（与旧 mapStateToView 行为一致）；
 * 全量缓存 = 服务端 state="" 真实全量，不存在伪造数据。
 */

import { fetchOrders } from "./order";
import { stateLabelToState, type OrderListItem } from "./types";
import {
  swrRead,
  swrWrite,
  swrIsFresh,
  SWR_FRESH_MS,
  type SwrEntry
} from "./swr-cache";

const ALL_CACHE_KEY = "orders:all";
/** 后台全量拉取每页条数（Worker 上限 200，100 对旧系统友好） */
const PREFETCH_PAGE_SIZE = 100;
/** 并发页数（旧系统限流友好） */
const PREFETCH_CONCURRENCY = 2;

export interface OrdersAllCache {
  list: OrderListItem[];
  total: number;
}

export function readOrdersAll(): SwrEntry<OrdersAllCache> | null {
  return swrRead<OrdersAllCache>(ALL_CACHE_KEY);
}

export function isOrdersAllFresh(): boolean {
  return swrIsFresh(readOrdersAll(), SWR_FRESH_MS);
}

/**
 * 后台全量拉取：page1 先行（拿到 total），剩余页小并发拉取。
 * 全部成功才写缓存（不完整数据禁冒充全量）；失败返回 null（保留旧缓存）。
 * onPage 回调用于渐进展示（已加载 x / 总 y）。
 */
export async function prefetchAllOrders(opts?: {
  force?: boolean;
  onPage?: (loaded: number, total: number) => void;
}): Promise<OrdersAllCache | null> {
  const cached = readOrdersAll();
  // fresh → 直接用缓存；stale / 无缓存 / force → 重新拉取
  if (cached && !opts?.force && swrIsFresh(cached, SWR_FRESH_MS)) {
    return cached.data;
  }

  const fetchPage = (page: number) =>
    fetchOrders({ view: "all", page, pageSize: PREFETCH_PAGE_SIZE });

  let first: Awaited<ReturnType<typeof fetchOrders>>;
  try {
    first = await fetchPage(1);
  } catch {
    return null;
  }
  const total = first.total;
  const list: OrderListItem[] = [...first.list];
  opts?.onPage?.(list.length, total);
  if (list.length >= total || first.list.length === 0) {
    const data: OrdersAllCache = { list, total };
    swrWrite(ALL_CACHE_KEY, data);
    return data;
  }

  const totalPages = Math.min(200, Math.ceil(total / PREFETCH_PAGE_SIZE));
  const restPages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
  // 小并发分批拉取
  let failed = false;
  for (let i = 0; i < restPages.length && !failed; i += PREFETCH_CONCURRENCY) {
    const batch = restPages.slice(i, i + PREFETCH_CONCURRENCY);
    const results = await Promise.allSettled(batch.map(fetchPage));
    for (const r of results) {
      if (r.status === "fulfilled") {
        list.push(...r.value.list);
        opts?.onPage?.(list.length, total);
      } else {
        failed = true; // 任何页失败 → 全量不完整，放弃写缓存
      }
    }
  }
  if (failed) return null;
  const data: OrdersAllCache = { list, total };
  swrWrite(ALL_CACHE_KEY, data);
  return data;
}

/**
 * 本地 Tab 过滤：state 枚举 ↔ 列表行中文标签映射。
 * "" = 全部原样返回；未知标签不匹配任何 Tab（仅"全部"可见）。
 */
export function filterOrdersByState(
  list: OrderListItem[],
  state: string
): OrderListItem[] {
  if (!state) return list;
  return list.filter(o => stateLabelToState(o.stateLabel) === state);
}

/** 本地分页 */
export function paginateOrders(
  list: OrderListItem[],
  page: number,
  pageSize: number
): OrderListItem[] {
  const start = (page - 1) * pageSize;
  return list.slice(start, start + pageSize);
}
