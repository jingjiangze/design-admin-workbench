/**
 * 收入领域服务 —— 视图层获取收入数据的唯一入口
 * （docs/INCOME_CALCULATION_SPEC.md §7）
 *
 * 职责：拉取订单范围 + 金额规则 → 组装汇总/品类分布/未定义订单。
 * 金额计算一律委托 income-calculation 纯函数层；规则读写委托 pricingRuleStore。
 */
import { fetchOrders } from "./order";
import { listRules } from "./pricing/pricing-rule-store";
import type { PricingRule } from "./pricing/pricing-rule-types";
import {
  enrichScope,
  DEFAULT_RANGE_PRESETS
} from "./income/income-service-core";
import {
  getIncomeOrders,
  getUndefinedAmountOrders
} from "./income/income-calculation";
import type {
  IncomeSummary,
  CategoryIncome
} from "./income/income-calculation";
import type { IncomePolicy } from "./income/income-policy";
import { DEFAULT_INCOME_POLICY } from "./income/income-policy";
import type { OrderListItem } from "./types";

export type {
  IncomeSummary,
  CategoryIncome
} from "./income/income-calculation";
export { DEFAULT_INCOME_POLICY } from "./income/income-policy";
export type { IncomePolicy } from "./income/income-policy";
export { DEFAULT_RANGE_PRESETS } from "./income/income-service-core";

export type RangePresetKey = keyof typeof DEFAULT_RANGE_PRESETS;

/** 收入总览（首页卡片 + 收入页共用） */
export interface IncomeDashboard {
  range: RangePresetKey;
  policy: IncomePolicy;
  summary: IncomeSummary;
  categories: CategoryIncome[];
  /** 未定义金额订单（引导设置规则的显式清单） */
  undefinedOrders: OrderListItem[];
  /** 规则命中数（我的统计与系统金额口径差异来源） */
  overrideHitCount: number;
}

/** 拉取收入统计范围的订单（Mock 全量；Real 分页循环拉取，上限保护） */
export async function fetchIncomeScope(
  pageSize = 500,
  maxPages = 4
): Promise<OrderListItem[]> {
  const all: OrderListItem[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const res = await fetchOrders({ view: "all", page, pageSize });
    all.push(...res.list);
    if (all.length >= res.total || res.list.length === 0) break;
  }
  return all;
}

/**
 * 收入总览组装：订单范围 + 用户规则 → enrich → 汇总。
 * 默认口径 = DEFAULT_INCOME_POLICY（第一版固定，见 SPEC §2 [INFERRED] 待取证）。
 */
export async function getIncomeDashboard(
  range: RangePresetKey,
  policy: IncomePolicy = DEFAULT_INCOME_POLICY
): Promise<IncomeDashboard> {
  const [orders, rules] = await Promise.all([
    fetchIncomeScope(),
    Promise.resolve(listRules() as PricingRule[])
  ]);
  const { from, to } = DEFAULT_RANGE_PRESETS[range]();
  return enrichScope(orders, rules, policy, { from, to }, range);
}

/** 反查：区间（+品类）内的计入订单（收入 → 品类 → 订单 → Drawer 链路） */
export async function getIncomeOrderList(
  range: RangePresetKey,
  category?: string,
  policy: IncomePolicy = DEFAULT_INCOME_POLICY
): Promise<OrderListItem[]> {
  const [orders, rules] = await Promise.all([
    fetchIncomeScope(),
    Promise.resolve(listRules() as PricingRule[])
  ]);
  const { from, to } = DEFAULT_RANGE_PRESETS[range]();
  return getIncomeOrders(orders, rules, policy, { from, to }, category);
}

/** 未定义金额订单（首页"金额待完善"提醒与收入页未定义计数共用） */
export async function getUndefinedOrders(
  policy: IncomePolicy = DEFAULT_INCOME_POLICY
): Promise<OrderListItem[]> {
  const orders = await fetchIncomeScope();
  return getUndefinedAmountOrders(orders, policy);
}
