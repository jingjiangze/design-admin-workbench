/**
 * P1-07 收入记录域测试（真实口径：中标记录 + 双口径 + 三态矩阵）
 * 三态矩阵 = 任务书 §十一 Case A/B/C/D（必须保留并通过）
 */
import { describe, expect, it } from "vitest";
import {
  resolveRecordAmount,
  getRecordSummary,
  groupRecordsByGoods,
  filterRecordsInRange,
  getRecordsByGoods,
  type IncomeRecord
} from "@/service/income/income-record";
import type { PricingRule } from "@/service/pricing/pricing-rule-types";

function rec(overrides: Partial<IncomeRecord>): IncomeRecord {
  return {
    orderNo: "5127764437280024701",
    awardTime: "2026-09-20 16:31:15",
    goodsName: "名片",
    legacyAmount: 10,
    ...overrides
  };
}

function rule(overrides: Partial<PricingRule>): PricingRule {
  return {
    id: "r1",
    goodsId: "548890581",
    subGoodsId: undefined,
    productName: "名片",
    amount: 20,
    enabled: true,
    source: "user",
    updatedAt: "2026-09-01T00:00:00Z",
    ...overrides
  };
}

describe("resolveRecordAmount — 金额三态矩阵（任务书 §十一）", () => {
  const noRules: PricingRule[] = [];

  it("Case A: legacy=null, override=null → effective=null, source=undefined", () => {
    const r = resolveRecordAmount(rec({ legacyAmount: null }), noRules);
    expect(r.effectiveAmount).toBeNull();
    expect(r.amountSource).toBe("undefined");
  });

  it("Case B: legacy=null, override=35 → effective=35, source=override", () => {
    const r = resolveRecordAmount(
      rec({ legacyAmount: null, goodsId: "548890581" }),
      [rule({ amount: 35 })]
    );
    expect(r.effectiveAmount).toBe(35);
    expect(r.amountSource).toBe("override");
  });

  it("Case C: legacy=20, override=null（无规则）→ effective=20, source=legacy", () => {
    const r = resolveRecordAmount(rec({ legacyAmount: 20 }), noRules);
    expect(r.effectiveAmount).toBe(20);
    expect(r.amountSource).toBe("legacy");
  });

  it("Case D: legacy=20, override=35 → effective=35, source=override", () => {
    const r = resolveRecordAmount(
      rec({ legacyAmount: 20, goodsId: "548890581" }),
      [rule({ amount: 35 })]
    );
    expect(r.effectiveAmount).toBe(35);
    expect(r.amountSource).toBe("override");
  });

  it("规则 amount=null ≠ 未设置 0：不生效，回落 legacy（禁 null→0）", () => {
    const r = resolveRecordAmount(
      rec({ legacyAmount: 20, goodsId: "548890581" }),
      [rule({ amount: null })]
    );
    expect(r.effectiveAmount).toBe(20);
    expect(r.amountSource).toBe("legacy");
  });

  it("disabled 规则不生效", () => {
    const r = resolveRecordAmount(
      rec({ legacyAmount: 20, goodsId: "548890581" }),
      [rule({ enabled: false, amount: 35 })]
    );
    expect(r.amountSource).toBe("legacy");
  });

  it("goodsId=null 的行（映射不可得）不命中规则，走 legacy", () => {
    const r = resolveRecordAmount(rec({ legacyAmount: 20, goodsId: null }), [
      rule({ amount: 35 })
    ]);
    expect(r.amountSource).toBe("legacy");
  });

  it("subGoodsId 级规则优先精确匹配；-1 归一化 null 后命中 goodsId 级规则", () => {
    const records = rec({
      goodsId: "548890581",
      subGoodsId: null,
      legacyAmount: 10
    });
    const rSub = resolveRecordAmount(records, [
      rule({ subGoodsId: "1604601457", amount: 50 })
    ]);
    expect(rSub.amountSource).toBe("legacy"); // 子商品规则不匹配 null 子商品行
    const rParent = resolveRecordAmount(records, [
      rule({ subGoodsId: undefined, amount: 25 })
    ]);
    expect(rParent).toEqual({ effectiveAmount: 25, amountSource: "override" });
  });
});

describe("getRecordSummary — 双口径汇总", () => {
  it("无覆盖：myIncome = systemIncome（不伪装差异）", () => {
    const records = [
      rec({ legacyAmount: 10 }),
      rec({ legacyAmount: 5, orderNo: "X2" })
    ];
    const s = getRecordSummary(records, []);
    expect(s.myIncome).toBe(15);
    expect(s.systemIncome).toBe(15);
    expect(s.overrideHitCount).toBe(0);
    expect(s.orderCount).toBe(2);
    expect(s.avgPerOrder).toBe(7.5);
  });

  it("有覆盖：双口径分离（系统 1368 语义 / 我的按规则）", () => {
    const records = [
      rec({ legacyAmount: 10, goodsId: "548890581" }),
      rec({
        legacyAmount: 5,
        orderNo: "X2",
        goodsName: "PVC名片",
        goodsId: "1717812924"
      })
    ];
    const s = getRecordSummary(records, [
      rule({ goodsId: "548890581", amount: 20 })
    ]);
    expect(s.systemIncome).toBe(15);
    expect(s.myIncome).toBe(25); // 20(override) + 5(legacy)
    expect(s.overrideHitCount).toBe(1);
  });

  it("undefined 行不入求和、显式计数（禁 null→0）", () => {
    const records = [
      rec({ legacyAmount: 10 }),
      rec({ legacyAmount: null, orderNo: "X2" })
    ];
    const s = getRecordSummary(records, []);
    expect(s.systemIncome).toBe(10); // null 不贡献系统口径
    expect(s.myIncome).toBe(10);
    expect(s.undefinedCount).toBe(1);
  });

  it("空清单：avgPerOrder=null（非 0）", () => {
    const s = getRecordSummary([], []);
    expect(s.avgPerOrder).toBeNull();
    expect(s.orderCount).toBe(0);
  });
});

describe("groupRecordsByGoods — 品类分布", () => {
  it("按 goodsName 分组并排序（systemIncome 降序），双口径各自累计", () => {
    const rows = groupRecordsByGoods(
      [
        rec({ legacyAmount: 10, goodsId: "548890581" }),
        rec({
          legacyAmount: 3,
          goodsName: "宣传单",
          goodsId: "548890565",
          orderNo: "X3"
        }),
        rec({
          legacyAmount: 8,
          goodsName: "宣传单",
          goodsId: "548890565",
          orderNo: "X4"
        }),
        rec({
          legacyAmount: 5,
          goodsName: "PVC名片",
          goodsId: "1717812924",
          orderNo: "X5"
        })
      ],
      []
    );
    expect(rows.map(r => r.goodsName)).toEqual(["宣传单", "名片", "PVC名片"]);
    expect(rows[0]).toMatchObject({
      orderCount: 2,
      systemIncome: 11,
      myIncome: 11
    });
  });

  it("空商品名归'未分类'", () => {
    const rows = groupRecordsByGoods(
      [rec({ goodsName: "", legacyAmount: 4 })],
      []
    );
    expect(rows[0].goodsName).toBe("未分类");
  });
});

describe("filterRecordsInRange / getRecordsByGoods — 时间过滤（今日/本周语义）", () => {
  const records = [
    rec({ orderNo: "D1", awardTime: "2026-09-21 08:00:00" }),
    rec({ orderNo: "D2", awardTime: "2026-09-15 12:00:00" }),
    rec({ orderNo: "D3", awardTime: "2026-09-01 00:00:00" }),
    rec({ orderNo: "D4", awardTime: "bogus" })
  ];

  it("区间过滤含端点；非法时间行被排除", () => {
    const out = filterRecordsInRange(records, {
      from: new Date(2026, 8, 1),
      to: new Date(2026, 8, 30, 23, 59, 59)
    });
    expect(out.map(r => r.orderNo)).toEqual(["D1", "D2", "D3"]);
  });

  it("品类反查 = 时间过滤 + goodsName 精确匹配", () => {
    const out = getRecordsByGoods(
      [
        ...records,
        rec({
          orderNo: "D5",
          awardTime: "2026-09-21 09:00:00",
          goodsName: "PVC名片"
        })
      ],
      { from: new Date(2026, 8, 21), to: new Date(2026, 8, 21, 23, 59, 59) },
      "PVC名片"
    );
    expect(out.map(r => r.orderNo)).toEqual(["D5"]);
  });
});
