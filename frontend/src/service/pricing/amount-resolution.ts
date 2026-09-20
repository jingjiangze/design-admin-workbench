/**
 * 金额解析纯函数层（docs/PRICING_RULE_SPEC.md §4 优先级链、§5 0≠undefined）
 *
 * 无 IO 依赖（可单测），被 income 计算层与 UI 消费。
 * 组件禁止内联金额计算——一律经本层 / incomeService。
 */
import type { PricingRule, AmountSource } from "./pricing-rule-types";
import { ruleKey } from "./pricing-rule-types";
import type { OrderListItem } from "../types";

/** 金额解析产物 */
export interface AmountResolution {
  overrideAmount: number | null;
  effectiveAmount: number | null;
  amountSource: AmountSource;
}

/**
 * 旧系统金额解析：空串/null/undefined/非数字 → null（未定义），
 * 0 是合法值（明确 ¥0 ≠ 未定义）。
 */
export function parseLegacyAmount(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** 生成"仅 legacy"基线解析（Adapter 映射时使用，规则命中前） */
export function baselineResolution(
  legacyAmount: number | null
): AmountResolution {
  return {
    overrideAmount: null,
    effectiveAmount: legacyAmount,
    amountSource: legacyAmount === null ? "undefined" : "legacy"
  };
}

/**
 * 规则匹配（优先级链，docs/PRICING_RULE_SPEC.md §4）：
 * ① goodsId+subGoodsId 精确规则 → ② goodsId 级规则（一级业务品类）。
 * 仅 enabled 且 amount 非 null 的规则生效（amount=null 只建档未生效）。
 * 子品类级规则（独立品类树）为 Phase 2+ 扩展位，当前两级已覆盖优先级语义。
 */
export function findMatchingRule(
  goodsId: string | undefined,
  subGoodsId: string | undefined,
  rules: PricingRule[]
): PricingRule | null {
  if (!goodsId) return null;
  const candidates = rules.filter(r => r.enabled && r.amount !== null);
  if (subGoodsId) {
    const exact = candidates.find(
      r => r.goodsId === goodsId && r.subGoodsId === subGoodsId
    );
    if (exact) return exact;
  }
  const goodsLevel = candidates.find(
    r => r.goodsId === goodsId && !r.subGoodsId
  );
  return goodsLevel ?? null;
}

/**
 * resolveOrderAmount —— 金额解析唯一权威实现（docs/INCOME_CALCULATION_SPEC.md §1）
 *
 * IncomeAmount(order, pricingRules):
 *   1. 优先命中用户 goodsid/subGoodsid 自定义规则
 *   2. 没有规则 → 使用旧系统原始设计费 legacyAmount
 *   3. legacyAmount 为空 → "undefined"（绝不静默当 0）
 */
export function resolveOrderAmount(
  order: Pick<OrderListItem, "legacyAmount" | "goodsId" | "subGoodsId">,
  rules: PricingRule[]
): AmountResolution {
  const rule = findMatchingRule(order.goodsId, order.subGoodsId, rules);
  if (rule && rule.amount !== null) {
    return {
      overrideAmount: rule.amount,
      effectiveAmount: rule.amount,
      amountSource: "override"
    };
  }
  return baselineResolution(order.legacyAmount);
}

/**
 * 批量 enrich：把规则命中结果写回订单视图模型的派生字段。
 * 输入数组不被修改（返回新对象），原始 legacyAmount 永不变化。
 */
export function enrichOrderAmounts<T extends OrderListItem>(
  orders: T[],
  rules: PricingRule[]
): T[] {
  return orders.map(order => {
    const r = resolveOrderAmount(order, rules);
    return { ...order, ...r };
  });
}

/** 金额格式化：null → "未定义"（UI 唯一出口，禁止散落 fmt） */
export function formatAmount(amount: number | null): string {
  if (amount === null) return "未定义";
  return `¥${amount.toFixed(2).replace(/\.00$/, "")}`;
}

/** 规则集合工具：按 key 建索引（导入/匹配共用） */
export function indexRules(rules: PricingRule[]): Map<string, PricingRule> {
  const map = new Map<string, PricingRule>();
  for (const r of rules) map.set(ruleKey(r.goodsId, r.subGoodsId), r);
  return map;
}
