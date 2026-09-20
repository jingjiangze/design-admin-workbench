/**
 * 收入计算纯函数层（docs/INCOME_CALCULATION_SPEC.md）
 *
 * 无 IO 依赖（可单测）。组件禁止内联金额计算——一律经本层 / incomeService。
 * 时间归属：订单 completeTime（完成时间）；周 = 周一至周日。
 */
import type { OrderListItem } from "../types";
import type { PricingRule } from "../pricing/pricing-rule-types";
import { resolveOrderAmount } from "../pricing/amount-resolution";
import type { AmountResolution } from "../pricing/amount-resolution";
import type { IncomePolicy } from "./income-policy";

/** 汇总指标（docs/INCOME_CALCULATION_SPEC.md §5） */
export interface IncomeSummary {
  /** 计入统计的收入合计（我的统计口径） */
  income: number;
  /** 系统金额口径合计（legacyAmount 求和，仅 includedStatuses） */
  systemIncome: number;
  /** 计入统计的订单数 */
  orderCount: number;
  /** 平均每单金额（分母不含未定义单；无计入订单时为 null） */
  avgPerOrder: number | null;
  /** 金额未定义订单数（命中统计状态但不计入收入） */
  undefinedCount: number;
  /** 参与口径判定的订单总数（过滤后） */
  scopedCount: number;
}

/** 品类分布行 */
export interface CategoryIncome {
  /** 品类名（productName，空归"未分类"） */
  category: string;
  orderCount: number;
  income: number;
}

/** 日收入行 */
export interface DailyIncome {
  date: string;
  income: number;
  orderCount: number;
}

/** 单订单金额解析（含双口径），供 enrich 与明细解释复用 */
export function resolveOrderIncome(
  order: OrderListItem,
  rules: PricingRule[],
  policy: IncomePolicy
): { mine: AmountResolution; system: number | null } {
  const mine = resolveOrderAmount(order, rules);
  if (!policy.useOverrideAmount) {
    return { mine: { ...mine, effectiveAmount: order.legacyAmount, overrideAmount: null, amountSource: order.legacyAmount === null ? "undefined" : "legacy" }, system: order.legacyAmount };
  }
  return { mine, system: order.legacyAmount };
}

/** 订单是否命中统计状态 */
export function isIncluded(order: OrderListItem, policy: IncomePolicy): boolean {
  return order.view !== null && policy.includedStatuses.includes(order.view);
}

/**
 * 订单在口径内的金额贡献：
 * - useOverrideAmount=false → 纯系统口径（只用 legacyAmount，规则不生效）
 * - 未定义（effective=null）：includeUndefinedAmount=false → 排除（显式计数）
 * - 0 元是合法贡献（明确 ¥0 ≠ 未定义）
 */
export function orderContribution(
  order: OrderListItem,
  rules: PricingRule[],
  policy: IncomePolicy
): { included: boolean; amount: number | null; undefinedOrder: boolean } {
  if (!isIncluded(order, policy)) {
    return { included: false, amount: null, undefinedOrder: false };
  }
  if (!policy.useOverrideAmount) {
    // 纯系统口径：规则不生效，仅 legacyAmount
    if (order.legacyAmount === null) {
      return {
        included: policy.includeUndefinedAmount,
        amount: null,
        undefinedOrder: true
      };
    }
    return { included: true, amount: order.legacyAmount, undefinedOrder: false };
  }
  const r = resolveOrderAmount(order, rules);
  if (r.amountSource === "undefined") {
    return {
      included: policy.includeUndefinedAmount,
      amount: null,
      undefinedOrder: true
    };
  }
  return { included: true, amount: r.effectiveAmount, undefinedOrder: false };
}

/** 汇总：双口径 + 未定义计数（fn 核心入口 getIncomeSummary） */
export function getIncomeSummary(
  orders: OrderListItem[],
  rules: PricingRule[],
  policy: IncomePolicy
): IncomeSummary {
  let income = 0;
  let systemIncome = 0;
  let orderCount = 0;
  let undefinedCount = 0;
  for (const order of orders) {
    const c = orderContribution(order, rules, policy);
    if (c.undefinedOrder) {
      if (policy.includeUndefinedAmount) {
        // 显式选择计入：按 0 贡献统计（不再单独计数）
        orderCount += 1;
      } else {
        undefinedCount += 1;
      }
      continue;
    }
    if (!c.included) continue;
    income += c.amount ?? 0;
    systemIncome += order.legacyAmount ?? 0;
    orderCount += 1;
  }
  return {
    income,
    systemIncome,
    orderCount,
    avgPerOrder: orderCount > 0 ? income / orderCount : null,
    undefinedCount,
    scopedCount: orders.filter(o => isIncluded(o, policy)).length
  };
}

/** 解析订单完成时间（容忍空值/非日期，失败 → null） */
export function parseCompleteTime(order: OrderListItem): Date | null {
  const raw = order.completeTime;
  if (!raw) return null;
  const d = new Date(raw.replace(/-/g, "/"));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 日期 → 本地 YYYY-MM-DD 键 */
export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 周一 00:00（中国工作习惯：周 = 周一至周日） */
export function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - diff);
  return monday;
}

/** 日期区间过滤（含端点；任一端为 null = 不限） */
export function inRange(d: Date | null, from: Date | null, to: Date | null): boolean {
  if (!d) return false;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

export interface IncomeRangeQuery {
  from?: Date | null;
  to?: Date | null;
}

/** 区间内汇总 */
export function getIncomeInRange(
  orders: OrderListItem[],
  rules: PricingRule[],
  policy: IncomePolicy,
  query: IncomeRangeQuery
): IncomeSummary {
  const scoped = orders.filter(o => {
    const d = parseCompleteTime(o);
    return inRange(d, query.from ?? null, query.to ?? null);
  });
  return getIncomeSummary(scoped, rules, policy);
}

/** 按品类分布（区间内；可再按品类名过滤） */
export function getIncomeByCategory(
  orders: OrderListItem[],
  rules: PricingRule[],
  policy: IncomePolicy,
  query: IncomeRangeQuery
): CategoryIncome[] {
  const map = new Map<string, CategoryIncome>();
  for (const order of orders) {
    const d = parseCompleteTime(order);
    if (!inRange(d, query.from ?? null, query.to ?? null)) continue;
    const c = orderContribution(order, rules, policy);
    if (c.undefinedOrder || !c.included) continue;
    const name = order.productName || "未分类";
    const row = map.get(name) ?? { category: name, orderCount: 0, income: 0 };
    row.orderCount += 1;
    row.income += c.amount ?? 0;
    map.set(name, row);
  }
  return [...map.values()].sort((a, b) => b.income - a.income);
}

/** 按日分布（区间内） */
export function getIncomeByDate(
  orders: OrderListItem[],
  rules: PricingRule[],
  policy: IncomePolicy,
  query: IncomeRangeQuery
): DailyIncome[] {
  const map = new Map<string, DailyIncome>();
  for (const order of orders) {
    const d = parseCompleteTime(order);
    if (!inRange(d, query.from ?? null, query.to ?? null)) continue;
    const c = orderContribution(order, rules, policy);
    if (c.undefinedOrder || !c.included) continue;
    const key = dateKey(d as Date);
    const row = map.get(key) ?? { date: key, income: 0, orderCount: 0 };
    row.income += c.amount ?? 0;
    row.orderCount += 1;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** 反查：区间（+品类）内的计入订单（收入 → 品类 → 订单链路） */
export function getIncomeOrders(
  orders: OrderListItem[],
  rules: PricingRule[],
  policy: IncomePolicy,
  query: IncomeRangeQuery,
  category?: string
): OrderListItem[] {
  return orders.filter(order => {
    const d = parseCompleteTime(order);
    if (!inRange(d, query.from ?? null, query.to ?? null)) return false;
    const c = orderContribution(order, rules, policy);
    if (!c.included || c.undefinedOrder) return false;
    if (category && (order.productName || "未分类") !== category) return false;
    return true;
  });
}

/** 未定义金额订单（命中统计状态但不计入收入 → 显式提醒 + 引导设置规则） */
export function getUndefinedAmountOrders(
  orders: OrderListItem[],
  policy: IncomePolicy
): OrderListItem[] {
  return orders.filter(
    o => isIncluded(o, policy) && resolveOrderAmount(o, []).amountSource === "undefined"
  );
}
