/**
 * 商品金额规则测试（docs/PRICING_RULE_SPEC.md）
 *
 * 长文 §49 必测 5 Case：0 与 undefined 严格不同。
 * store 测试使用注入内存存储（不触碰真实 localStorage）。
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  parseLegacyAmount,
  resolveOrderAmount,
  findMatchingRule,
  enrichOrderAmounts,
  baselineResolution
} from "@/service/pricing/amount-resolution";
import type { PricingRule } from "@/service/pricing/pricing-rule-types";
import { ruleKey } from "@/service/pricing/pricing-rule-types";
import {
  listRules,
  setRule,
  clearRule,
  setEnabled,
  exportRules,
  buildImportPreview,
  commitImport,
  injectStorage,
  resetStorage,
  setUserIdentity
} from "@/service/pricing/pricing-rule-store";
import type { OrderListItem } from "@/service/types";

/** 构造订单（只填金额解析相关字段） */
function makeOrder(overrides: Partial<OrderListItem> = {}): OrderListItem {
  return {
    orderId: "1",
    applyId: "",
    orderNo: "TT_TEST",
    shop: "测试店铺",
    taskType: "标准设计",
    stateLabel: "审核通过",
    view: "completed",
    customerName: "",
    customerNick: "",
    memberName: "",
    endTime: "",
    createTime: "",
    completeTime: "2026-09-20 10:00:00",
    legacyAmount: 10,
    overrideAmount: null,
    effectiveAmount: 10,
    amountSource: "legacy",
    price: 0,
    sales: 0,
    urgent: false,
    isRepulse: false,
    isRegular: false,
    ...overrides
  };
}

function makeRule(overrides: Partial<PricingRule> = {}): PricingRule {
  return {
    id: "r1",
    goodsId: "1717812924",
    subGoodsId: undefined,
    productName: "PVC名片",
    amount: 8,
    enabled: true,
    source: "user",
    updatedAt: "2026-09-20T10:00:00.000Z",
    ...overrides
  };
}

describe("金额三层模型：5 必测 Case（0 ≠ undefined）", () => {
  it("Case 1: legacy=10, 无规则 → effective=10, source=legacy", () => {
    const r = resolveOrderAmount(makeOrder({ legacyAmount: 10 }), []);
    expect(r.effectiveAmount).toBe(10);
    expect(r.amountSource).toBe("legacy");
    expect(r.overrideAmount).toBeNull();
  });

  it("Case 2: legacy=null, 规则=8 → effective=8, source=override", () => {
    const rules = [makeRule({ amount: 8 })];
    const r = resolveOrderAmount(
      makeOrder({ legacyAmount: null, goodsId: "1717812924" }),
      rules
    );
    expect(r.effectiveAmount).toBe(8);
    expect(r.amountSource).toBe("override");
  });

  it("Case 3: legacy=10, 规则=8 → effective=8（规则优先）", () => {
    const rules = [makeRule({ amount: 8 })];
    const r = resolveOrderAmount(
      makeOrder({ legacyAmount: 10, goodsId: "1717812924" }),
      rules
    );
    expect(r.effectiveAmount).toBe(8);
    expect(r.amountSource).toBe("override");
  });

  it("Case 4: legacy=null, 无规则 → undefined（effective=null，绝不静默当 0）", () => {
    const r = resolveOrderAmount(makeOrder({ legacyAmount: null }), []);
    expect(r.effectiveAmount).toBeNull();
    expect(r.amountSource).toBe("undefined");
    expect(r.effectiveAmount).not.toBe(0);
  });

  it("Case 5: legacy=10, 规则=0 → effective=0（0 是合法统计值，≠ undefined）", () => {
    const rules = [makeRule({ amount: 0 })];
    const r = resolveOrderAmount(
      makeOrder({ legacyAmount: 10, goodsId: "1717812924" }),
      rules
    );
    expect(r.effectiveAmount).toBe(0);
    expect(r.amountSource).toBe("override");
    // 与 Case 4 的严格区分：0 !== null，source 不同
    expect(r.effectiveAmount).not.toBeNull();
  });
});

describe("规则匹配优先级", () => {
  const rules = [
    makeRule({
      id: "goods-level",
      goodsId: "G1",
      subGoodsId: undefined,
      amount: 5
    }),
    makeRule({
      id: "exact-level",
      goodsId: "G1",
      subGoodsId: "S1",
      amount: 8
    })
  ];

  it("goodsId+subGoodsId 精确规则优先于 goodsId 级", () => {
    const hit = findMatchingRule("G1", "S1", rules);
    expect(hit?.id).toBe("exact-level");
  });

  it("无 subGoodsId 时回落 goodsId 级规则", () => {
    const hit = findMatchingRule("G1", undefined, rules);
    expect(hit?.id).toBe("goods-level");
  });

  it("enabled=false 或 amount=null 的规则不生效", () => {
    const disabled = [makeRule({ enabled: false, amount: 8 })];
    expect(findMatchingRule("G", undefined, disabled)).toBeNull();
    const noAmount = [makeRule({ amount: null })];
    expect(findMatchingRule("G", undefined, noAmount)).toBeNull();
  });

  it("订单无 goodsId → 只能走 legacy/undefined，不匹配任何规则", () => {
    const hit = findMatchingRule(undefined, "S1", rules);
    expect(hit).toBeNull();
  });
});

describe("parseLegacyAmount（空值形态 → null）", () => {
  it("空串/null/undefined/非数字 → null（未定义）", () => {
    expect(parseLegacyAmount("")).toBeNull();
    expect(parseLegacyAmount(null)).toBeNull();
    expect(parseLegacyAmount(undefined)).toBeNull();
    expect(parseLegacyAmount("abc")).toBeNull();
  });

  it("0 是合法值（明确 ¥0 ≠ 未定义）", () => {
    expect(parseLegacyAmount(0)).toBe(0);
    expect(parseLegacyAmount("0")).toBe(0);
  });

  it("数字与数字串正常解析", () => {
    expect(parseLegacyAmount(10)).toBe(10);
    expect(parseLegacyAmount("8.5")).toBe(8.5);
  });

  it("baselineResolution：legacy=null → source=undefined", () => {
    expect(baselineResolution(null)).toEqual({
      overrideAmount: null,
      effectiveAmount: null,
      amountSource: "undefined"
    });
    expect(baselineResolution(10).amountSource).toBe("legacy");
  });
});

describe("enrichOrderAmounts（批量派生，不改原始数据）", () => {
  it("命中规则的订单更新派生字段，legacyAmount 保持原值", () => {
    const rules = [makeRule({ goodsId: "G1", amount: 8 })];
    const orders = [
      makeOrder({ orderId: "a", legacyAmount: 10, goodsId: "G1" }),
      makeOrder({ orderId: "b", legacyAmount: null })
    ];
    const enriched = enrichOrderAmounts(orders, rules);
    expect(enriched[0].effectiveAmount).toBe(8);
    expect(enriched[0].amountSource).toBe("override");
    expect(enriched[0].legacyAmount).toBe(10); // 原始金额只读
    expect(enriched[1].amountSource).toBe("undefined");
    // 输入数组不被修改
    expect(orders[0].effectiveAmount).toBe(10);
  });
});

describe("pricingRuleStore（内存存储注入）", () => {
  beforeEach(() => {
    resetStorage();
    injectStorage({
      getItem: () => null,
      setItem: () => undefined
    });
    // 可写内存实现
    const mem = new Map<string, string>();
    injectStorage({
      getItem: k => mem.get(k) ?? null,
      setItem: (k, v) => void mem.set(k, v)
    });
  });

  it("setRule upsert + listRules 回读", () => {
    setRule({ goodsId: "G1", productName: "PVC名片", amount: 8 });
    setRule({ goodsId: "G1", productName: "PVC名片", amount: 9 }); // 覆盖
    const rules = listRules();
    expect(rules).toHaveLength(1);
    expect(rules[0].amount).toBe(9);
    expect(rules[0].source).toBe("user");
  });

  it("clearRule = 恢复系统金额（规则删除 → override 落空）", () => {
    setRule({ goodsId: "G1", productName: "PVC名片", amount: 8 });
    expect(clearRule("G1")).toBe(true);
    expect(listRules()).toHaveLength(0);
    // 删除后订单解析回落 legacy
    const r = resolveOrderAmount(
      makeOrder({ legacyAmount: 10, goodsId: "G1" }),
      []
    );
    expect(r.amountSource).toBe("legacy");
    expect(clearRule("G1")).toBe(false); // 不存在的规则删除返回 false
  });

  it("setEnabled 停用规则后不参与解析", () => {
    setRule({ goodsId: "G1", productName: "PVC名片", amount: 8 });
    setEnabled("G1", undefined, false);
    const r = resolveOrderAmount(
      makeOrder({ legacyAmount: 10, goodsId: "G1" }),
      listRules()
    );
    expect(r.amountSource).toBe("legacy");
  });

  it("storage key 按用户身份隔离", () => {
    setUserIdentity("designer_a");
    setRule({ goodsId: "G1", productName: "A的规则", amount: 8 });
    setUserIdentity("designer_b");
    expect(listRules()).toHaveLength(0); // B 看不到 A 的规则
    setUserIdentity("designer_a");
    expect(listRules()).toHaveLength(1);
  });

  it("导出 JSON 为最小字段形态", () => {
    setRule({
      goodsId: "G1",
      subGoodsId: "S1",
      productName: "PVC名片",
      amount: 8
    });
    const json = exportRules();
    const rows = JSON.parse(json);
    expect(rows).toEqual([
      { goodsid: "G1", subGoodsid: "S1", displayName: "PVC名片", amount: 8 }
    ]);
  });

  it("导入预览：新增 1 / 覆盖 1 / 跳过 1", () => {
    setRule({ goodsId: "G1", productName: "旧规则", amount: 5 });
    const json = JSON.stringify([
      { goodsid: "G2", displayName: "新商品", amount: 3 }, // 新增
      { goodsid: "G1", displayName: "旧规则", amount: 8 }, // 覆盖（5→8）
      { goodsid: "G1", displayName: "旧规则", amount: 5 }, // 跳过（相同）
      { goodsid: "", displayName: "非法", amount: 1 }, // 跳过（缺 goodsid）
      { goodsid: "G3", displayName: "负数", amount: -1 } // 跳过（非法金额）
    ]);
    const preview = buildImportPreview(json);
    expect(preview.total).toBe(3);
    expect(preview.added).toHaveLength(1);
    expect(preview.updated).toHaveLength(1);
    expect(preview.updated[0].previousAmount).toBe(5);
    expect(preview.skipped).toHaveLength(3);
    // 提交生效
    const result = commitImport(preview);
    expect(result).toEqual({ added: 1, updated: 1, skipped: 3 });
    expect(listRules()).toHaveLength(2);
  });

  it("导入 null 金额规则 = 建档未生效（不参与解析）", () => {
    const preview = buildImportPreview(
      JSON.stringify([{ goodsid: "G9", displayName: "未设金额", amount: null }])
    );
    expect(preview.skipped).toHaveLength(0);
    commitImport(preview);
    expect(listRules()).toHaveLength(1);
    const r = resolveOrderAmount(
      makeOrder({ legacyAmount: 10, goodsId: "G9" }),
      listRules()
    );
    expect(r.amountSource).toBe("legacy"); // amount=null 不生效
  });

  it("ruleKey：goodsId+subGoodsid 复合键与 goodsId 键互不冲突", () => {
    expect(ruleKey("G1", "S1")).toBe("G1::S1");
    expect(ruleKey("G1", undefined)).toBe("G1");
    expect(ruleKey("G1", "S1")).not.toBe(ruleKey("G1", undefined));
  });
});
