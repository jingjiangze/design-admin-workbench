/**
 * 收入服务核心组装层 —— 区间预设与 Dashboard 组装
 * （纯函数，被 income.ts 门面与测试消费）
 */
import type { OrderListItem } from "../types";
import type { PricingRule } from "../pricing/pricing-rule-types";
import { enrichOrderAmounts } from "../pricing/amount-resolution";
import {
  getIncomeSummary,
  getIncomeByCategory,
  getUndefinedAmountOrders,
  startOfWeek,
  dateKey
} from "./income-calculation";
import type { IncomeSummary, CategoryIncome } from "./income-calculation";
import type { IncomePolicy } from "./income-policy";

/** 区间预设：本日 / 本周 / 本月（周 = 周一至周日） */
export const DEFAULT_RANGE_PRESETS: Record<
  string,
  () => { from: Date; to: Date }
> = {
  today: () => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return { from, to };
  },
  week: () => {
    const now = new Date();
    const from = startOfWeek(now);
    const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return { from, to };
  },
  month: () => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { from, to };
  }
};

/** 今日键（首页"今日订单"计数用：completeTime 为今日） */
export function todayKey(): string {
  return dateKey(new Date());
}

/** 总览组装：enrich 规则 → 汇总 + 品类分布 + 未定义清单 */
export function enrichScope(
  orders: OrderListItem[],
  rules: PricingRule[],
  policy: IncomePolicy,
  range: { from: Date; to: Date },
  rangeKey: string
): {
  range: string;
  policy: IncomePolicy;
  summary: IncomeSummary;
  categories: CategoryIncome[];
  undefinedOrders: OrderListItem[];
  overrideHitCount: number;
} {
  const enriched = enrichOrderAmounts(orders, rules);
  const summary = getIncomeSummary(enriched, rules, policy);
  const categories = getIncomeByCategory(enriched, rules, policy, {
    from: range.from,
    to: range.to
  });
  const undefinedOrders = getUndefinedAmountOrders(enriched, policy);
  const overrideHitCount = enriched.filter(o => o.amountSource === "override").length;
  return {
    range: rangeKey,
    policy,
    summary,
    categories,
    undefinedOrders,
    overrideHitCount
  };
}
