/**
 * 商品金额规则类型层（docs/PRICING_RULE_SPEC.md）
 *
 * 数据边界：自定义金额只影响新工作台的个人收入统计，
 * 绝不修改旧系统原始订单金额（legacyAmount 只读原样保存）。
 */

/** 金额来源权威定义在领域层（../types），此处 re-export 供消费方单点引用 */
import type { AmountSource } from "../types";
export type { AmountSource };

/** 商品金额规则（用户自定义，仅新系统收入统计使用） */
export interface PricingRule {
  /** 规则唯一标识 */
  id: string;
  /** 商品 ID（旧系统 goodsid，字符串形态） */
  goodsId: string;
  /** 子商品 ID（可选，精确到子品类；空 = goodsId 级规则） */
  subGoodsId?: string;
  /** 展示名（如"PVC名片"） */
  productName: string;
  /** 自定义金额；null = 未设置（区别于 0） */
  amount: number | null;
  /** 规则启用开关 */
  enabled: boolean;
  /** 来源（Phase 2+ 服务器规则预留扩展位） */
  source: "user";
  /** ISO 时间戳 */
  updatedAt: string;
}

/** 导入输入行（导出/导入 JSON 的最小形态，便于手改） */
export interface PricingRuleImportRow {
  goodsid: string;
  subGoodsid?: string;
  displayName?: string;
  amount: number | null;
}

/** 导入预览（提交前展示：新增/覆盖/跳过） */
export interface ImportPreview {
  total: number;
  added: PricingRuleImportRow[];
  updated: Array<PricingRuleImportRow & { previousAmount: number | null }>;
  skipped: Array<PricingRuleImportRow & { reason: string }>;
}

/** 导入结果 */
export interface ImportResult {
  added: number;
  updated: number;
  skipped: number;
}

/** setRule 输入（store upsert） */
export interface SetRuleInput {
  goodsId: string;
  subGoodsId?: string;
  productName: string;
  /** 金额；null = 仅建档未设金额（等同未生效） */
  amount: number | null;
}

/** 导出/导入 JSON 行的规范化键（goodsid+subGoodsid 唯一确定一条规则） */
export function ruleKey(goodsId: string, subGoodsId?: string): string {
  return subGoodsId ? `${goodsId}::${subGoodsId}` : goodsId;
}
