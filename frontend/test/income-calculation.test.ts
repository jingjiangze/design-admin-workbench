/**
 * 收入计算测试（docs/INCOME_CALCULATION_SPEC.md）
 *
 * 覆盖：状态过滤 / 双口径 / 未定义显式计数（不计入）/ 0 元计入 /
 * 日周月区间 / 品类分布 / 反查订单。
 */
import { describe, it, expect } from "vitest";
import {
  getIncomeSummary,
  getIncomeByCategory,
  getIncomeByDate,
  getIncomeOrders,
  getUndefinedAmountOrders,
  orderContribution,
  inRange,
  startOfWeek,
  dateKey
} from "@/service/income/income-calculation";
import {
  DEFAULT_RANGE_PRESETS,
  enrichScope
} from "@/service/income/income-service-core";
import { DEFAULT_INCOME_POLICY } from "@/service/income/income-policy";
import type { IncomePolicy } from "@/service/income/income-policy";
import type { PricingRule } from "@/service/pricing/pricing-rule-types";
import type { OrderListItem } from "@/service/types";

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
    goodsId: "G1",
    subGoodsId: undefined,
    productName: "PVC名片",
    amount: 8,
    enabled: true,
    source: "user",
    updatedAt: "2026-09-20T10:00:00.000Z",
    ...overrides
  };
}

describe("状态过滤（IncomePolicy.includedStatuses）", () => {
  const policy = DEFAULT_INCOME_POLICY; // completed 才计入

  it("审核通过/订单完结（completed）计入；进行中/待审核/风险不计入", () => {
    expect(orderContribution(makeOrder({ view: "completed" }), [], policy).included).toBe(true);
    expect(orderContribution(makeOrder({ view: "in_progress" }), [], policy).included).toBe(false);
    expect(orderContribution(makeOrder({ view: "pending_review" }), [], policy).included).toBe(false);
    expect(orderContribution(makeOrder({ view: "at_risk" }), [], policy).included).toBe(false);
    expect(orderContribution(makeOrder({ view: "pending_accept" }), [], policy).included).toBe(false);
  });

  it("view=null（未识别标签）不计入", () => {
    expect(orderContribution(makeOrder({ view: null }), [], policy).included).toBe(false);
  });

  it("useOverrideAmount=false → 纯系统口径（规则不生效）", () => {
    const sysPolicy: IncomePolicy = { ...policy, useOverrideAmount: false };
    const rules = [makeRule({ amount: 8 })];
    const c = orderContribution(
      makeOrder({ legacyAmount: 10, goodsId: "G1" }),
      rules,
      sysPolicy
    );
    expect(c.amount).toBe(10);
  });
});

describe("getIncomeSummary（双口径 + 未定义显式计数）", () => {
  const policy = DEFAULT_INCOME_POLICY;

  it("多订单合计 + 系统口径对照", () => {
    const orders = [
      makeOrder({ orderId: "a", legacyAmount: 10 }),
      makeOrder({ orderId: "b", legacyAmount: 15 }),
      makeOrder({ orderId: "c", legacyAmount: 10, view: "in_progress" }) // 不计入
    ];
    const s = getIncomeSummary(orders, [], policy);
    expect(s.income).toBe(25);
    expect(s.systemIncome).toBe(25);
    expect(s.orderCount).toBe(2);
    expect(s.avgPerOrder).toBe(12.5);
  });

  it("规则命中 → 我的统计与系统金额分化", () => {
    const orders = [
      makeOrder({ orderId: "a", legacyAmount: 10, goodsId: "G1" }),
      makeOrder({ orderId: "b", legacyAmount: 15 })
    ];
    const s = getIncomeSummary(orders, [makeRule({ amount: 8 })], policy);
    expect(s.income).toBe(23); // 8 + 15
    expect(s.systemIncome).toBe(25); // 10 + 15
  });

  it("未定义订单：显式计数、不计入收入、不进分母", () => {
    const orders = [
      makeOrder({ orderId: "ok", legacyAmount: 10 }),
      makeOrder({ orderId: "undef", legacyAmount: null }) // undefined
    ];
    const s = getIncomeSummary(orders, [], policy);
    expect(s.income).toBe(10); // undefined 未计入
    expect(s.orderCount).toBe(1);
    expect(s.undefinedCount).toBe(1);
    expect(s.avgPerOrder).toBe(10);
  });

  it("0 元订单计入统计（金额 0，订单数 +1）", () => {
    const orders = [
      makeOrder({ orderId: "a", legacyAmount: 10, goodsId: "G1" }),
      makeOrder({ orderId: "zero", legacyAmount: 5, goodsId: "G0" })
    ];
    const rules = [
      makeRule({ goodsId: "G1", amount: 8 }),
      makeRule({ goodsId: "G0", amount: 0 }) // 明确 ¥0
    ];
    const s = getIncomeSummary(orders, rules, policy);
    expect(s.income).toBe(8); // 8 + 0
    expect(s.orderCount).toBe(2); // 0 元单计入数量
    expect(s.undefinedCount).toBe(0);
  });

  it("includeUndefinedAmount=true 时未定义计入为 0 并停止单独计数", () => {
    const p: IncomePolicy = { ...policy, includeUndefinedAmount: true };
    const orders = [makeOrder({ orderId: "undef", legacyAmount: null })];
    const s = getIncomeSummary(orders, [], p);
    expect(s.undefinedCount).toBe(0);
    expect(s.orderCount).toBe(1);
    expect(s.income).toBe(0);
  });
});

describe("日期区间（本日/本周/本月）", () => {
  const policy = DEFAULT_INCOME_POLICY;

  it("本周预设 = 周一起始", () => {
    // 2026-09-20 是周日 → 周一为 2026-09-14
    const { from } = DEFAULT_RANGE_PRESETS.week();
    expect(dateKey(from)).toBe("2026-09-14");
  });

  it("本月预设 = 1 号起始", () => {
    const { from } = DEFAULT_RANGE_PRESETS.month();
    expect(from.getDate()).toBe(1);
  });

  it("区间过滤：仅区间内 completed 订单计入", () => {
    const orders = [
      makeOrder({ orderId: "in", completeTime: "2026-09-19 10:00:00" }),
      makeOrder({ orderId: "out", completeTime: "2026-08-01 10:00:00" }),
      makeOrder({ orderId: "noTime", completeTime: "", legacyAmount: 99 })
    ];
    const s = getIncomeSummary(
      orders,
      [],
      policy,
      ) as never; // 直接用 getIncomeInRange 等价逻辑：预置过滤
    void s;
    const scoped = orders.filter(o => {
      const d = o.completeTime ? new Date(o.completeTime.replace(/-/g, "/")) : null;
      return inRange(d, new Date(2026, 8, 1), new Date(2026, 8, 30, 23, 59, 59));
    });
    const summary = getIncomeSummary(scoped, [], policy);
    expect(summary.orderCount).toBe(1);
    expect(summary.income).toBe(10);
  });

  it("completeTime 为空的订单不进入任何区间", () => {
    const d = null;
    expect(inRange(d, new Date(2026, 0, 1), new Date(2026, 11, 31))).toBe(false);
  });

  it("startOfWeek：周日 → 前一周一；周一 → 当天", () => {
    expect(dateKey(startOfWeek(new Date(2026, 8, 20)))).toBe("2026-09-14"); // 周日
    expect(dateKey(startOfWeek(new Date(2026, 8, 14)))).toBe("2026-09-14"); // 周一
  });
});

describe("品类分布与反查", () => {
  const policy = DEFAULT_INCOME_POLICY;
  const orders = [
    makeOrder({ orderId: "a", legacyAmount: 10, productName: "名片", completeTime: "2026-09-20 10:00:00" }),
    makeOrder({ orderId: "b", legacyAmount: 8, goodsId: "G1", productName: "PVC名片", completeTime: "2026-09-20 11:00:00" }),
    makeOrder({ orderId: "c", legacyAmount: null, goodsId: "G-UNDEF", productName: "PVC名片", completeTime: "2026-09-20 12:00:00" })
  ];
  const rules = [makeRule({ goodsId: "G1", amount: 8 })];

  it("品类分布合计与排序", () => {
    const rows = getIncomeByCategory(orders, rules, policy, {
      from: new Date(2026, 8, 1),
      to: new Date(2026, 8, 30, 23, 59, 59)
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ category: "名片", orderCount: 1, income: 10 });
    expect(rows[1]).toMatchObject({ category: "PVC名片", orderCount: 1, income: 8 });
  });

  it("品类分布排除未定义订单（不静默算 0）", () => {
    const noRules = getIncomeByCategory(orders, [], policy, {
      from: new Date(2026, 8, 1),
      to: new Date(2026, 8, 30, 23, 59, 59)
    });
    const pvc = noRules.find(r => r.category === "PVC名片");
    expect(pvc?.orderCount).toBe(1); // c 单未定义被排除
    expect(pvc?.income).toBe(8);
  });

  it("反查：按品类过滤计入订单", () => {
    const list = getIncomeOrders(
      orders,
      rules,
      policy,
      { from: new Date(2026, 8, 1), to: new Date(2026, 8, 30, 23, 59, 59) },
      "PVC名片"
    );
    expect(list).toHaveLength(1);
    expect(list[0].orderId).toBe("b");
  });

  it("按日分布", () => {
    const rows = getIncomeByDate(orders, rules, policy, {
      from: new Date(2026, 8, 1),
      to: new Date(2026, 8, 30, 23, 59, 59)
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ date: "2026-09-20", income: 18, orderCount: 2 });
  });

  it("未定义订单清单（getUndefinedAmountOrders）", () => {
    const undef = getUndefinedAmountOrders(orders, policy);
    expect(undef).toHaveLength(1);
    expect(undef[0].orderId).toBe("c");
  });
});

describe("enrichScope 总览组装", () => {
  it("区间 + 规则 → summary/categories/undefinedOrders 一体产出", () => {
    const orders = [
      makeOrder({ orderId: "a", legacyAmount: 10, goodsId: "G1", completeTime: "2026-09-20 10:00:00" }),
      makeOrder({ orderId: "b", legacyAmount: null, completeTime: "2026-09-20 11:00:00" })
    ];
    const { from, to } = DEFAULT_RANGE_PRESETS.month();
    const dash = enrichScope(orders, [makeRule({ amount: 8 })], DEFAULT_INCOME_POLICY, { from, to }, "month");
    expect(dash.range).toBe("month");
    expect(dash.summary.income).toBe(8); // a 命中规则 8；b 未定义不计入
    expect(dash.summary.systemIncome).toBe(10); // 系统口径：a 的 legacy=10
    expect(dash.summary.undefinedCount).toBe(1);
    expect(dash.overrideHitCount).toBe(1);
    expect(dash.undefinedOrders).toHaveLength(1);
  });
});
