/**
 * P1-04 收入网关契约测试（Worker 纯函数，相对导入 worker/src）
 * 口径冻结：docs/INCOME_CUTOVER_SPEC.md §2/§4
 */
import { describe, expect, it } from "vitest";
import {
  parseIncomeQuery,
  normalizeMoneys,
  parseChildProceeds,
  mapIncomeRecord,
  mapDeductionRecord,
  normalizeTrend
} from "../../worker/src/legacy/income";
import { LegacyError } from "../../worker/src/legacy/client";

function urlOf(qs: string): URL {
  return new URL(`https://x.test/api/income/orders?${qs}`);
}

describe("parseIncomeQuery — 参数白名单", () => {
  it("month 合法格式直通", () => {
    const q = parseIncomeQuery(urlOf("month=2026-09"));
    expect(q.month).toBe("2026-09");
    expect(q.range).toBe("month");
  });

  it("month 缺省 → UTC 当前月兜底（前端按本地时区显式传）", () => {
    const q = parseIncomeQuery(urlOf(""));
    expect(q.month).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
  });

  it.each(["2026-13", "2026-00", "26-09", "2026/09", "2026-9", "2026-091", "DROP TABLE"])(
    "month 非法格式 (%s) → 400 BAD_MONTH",
    bad => {
      expect(() => parseIncomeQuery(urlOf(`month=${encodeURIComponent(bad)}`))).toThrow(LegacyError);
      try {
        parseIncomeQuery(urlOf(`month=${encodeURIComponent(bad)}`));
      } catch (e) {
        expect((e as LegacyError).code).toBe("BAD_MONTH");
        expect((e as LegacyError).status).toBe(400);
      }
    }
  );

  it("range 仅识别 all；其余一律归一为 month", () => {
    expect(parseIncomeQuery(urlOf("range=all")).range).toBe("all");
    expect(parseIncomeQuery(urlOf("range=week")).range).toBe("month");
    expect(parseIncomeQuery(urlOf("")).range).toBe("month");
  });

  it("page/limit 边界钳制（下限 1，limit 上限 100）", () => {
    expect(parseIncomeQuery(urlOf("page=0&limit=-5")).page).toBe(1);
    expect(parseIncomeQuery(urlOf("page=0&limit=-5")).limit).toBe(1);
    expect(parseIncomeQuery(urlOf("limit=9999")).limit).toBe(100);
  });
});

describe("normalizeMoneys — 无数据月 = null（禁 0）", () => {
  it("正常 moneys 直通", () => {
    expect(normalizeMoneys({ moneys: 1368 })).toBe(1368);
    expect(normalizeMoneys({ moneys: "626" })).toBe(626);
  });

  it("data 缺省（C5 形态 {result:true}）→ null 而非 0", () => {
    expect(normalizeMoneys(undefined)).toBeNull();
    expect(normalizeMoneys(null)).toBeNull();
    expect(normalizeMoneys({})).toBeNull();
    expect(normalizeMoneys({ moneys: null })).toBeNull();
  });

  it("非数字 moneys → null", () => {
    expect(normalizeMoneys({ moneys: "abc" })).toBeNull();
  });
});

describe("parseChildProceeds / mapIncomeRecord — 明细行归一", () => {
  it("完整行映射（ordernum→orderNo、createtime→awardTime、childProceeds→legacyAmount）", () => {
    const rec = mapIncomeRecord({
      ordernum: "5127764437280024733",
      createtime: "2026-09-20 16:31:15",
      createtimestr: "2026-09-20 16:31",
      issuingtime: "2026-09-19 09:03:16",
      goodsname: "名片",
      childProceeds: 10
    });
    expect(rec).not.toBeNull();
    expect(rec!.orderNo).toBe("5127764437280024733");
    expect(rec!.awardTime).toBe("2026-09-20 16:31:15");
    expect(rec!.issueTime).toBe("2026-09-19 09:03:16");
    expect(rec!.goodsName).toBe("名片");
    expect(rec!.legacyAmount).toBe(10);
    expect(rec).not.toHaveProperty("goodsId"); // Worker 不猜 goodsId（SPEC §2）
  });

  it("childProceeds 空/非法 → legacyAmount=null（禁 0），行保留", () => {
    expect(parseChildProceeds(null)).toBeNull();
    expect(parseChildProceeds("")).toBeNull();
    expect(parseChildProceeds("abc")).toBeNull();
    expect(parseChildProceeds(0)).toBe(0); // 0 是合法值（与 null 严格区分）
    const rec = mapIncomeRecord({ ordernum: "X", childProceeds: "" });
    expect(rec?.legacyAmount).toBeNull();
  });

  it("ordernum 缺失行丢弃", () => {
    expect(mapIncomeRecord({ childProceeds: 5 })).toBeNull();
    expect(mapIncomeRecord({ ordernum: "  ", childProceeds: 5 })).toBeNull();
  });

  it("issuingtime 空 → issueTime undefined（不落空串）", () => {
    const rec = mapIncomeRecord({ ordernum: "X", issuingtime: "" });
    expect(rec?.issueTime).toBeUndefined();
  });
});

describe("mapDeductionRecord — 扣款行归一（[VERIFIED-STATIC] 行字段）", () => {
  it("五字段归一", () => {
    const d = mapDeductionRecord({
      orderno: "TT_26***7929",
      typename: "错别字",
      designerDeduction: 20,
      reason: "客户投诉",
      createTime: "2026-09-15 10:00:00"
    });
    expect(d.orderno).toBe("TT_26***7929");
    expect(d.typename).toBe("错别字");
    expect(d.designerDeduction).toBe(20);
    expect(d.reason).toBe("客户投诉");
    expect(d.deductTime).toBe("2026-09-15 10:00:00");
  });

  it("designerDeduction 缺省 → null（禁 0）", () => {
    expect(mapDeductionRecord({ orderno: "X" }).designerDeduction).toBeNull();
  });
});

describe("normalizeTrend — 折线归一", () => {
  it("querySameMonthData 原始键归一（incomMoneys→systemIncome）", () => {
    const t = normalizeTrend({
      dates: ["9.1", "9.2"],
      incomMoneys: [52, 0],
      deductMoneys: [0, 3]
    });
    expect(t.dates).toEqual(["9.1", "9.2"]);
    expect(t.systemIncome).toEqual([52, 0]);
    expect(t.deduction).toEqual([0, 3]);
  });

  it("data 缺省 → 空数组（禁伪造 0 序列）", () => {
    const t = normalizeTrend(undefined);
    expect(t.dates).toEqual([]);
    expect(t.systemIncome).toEqual([]);
    expect(t.deduction).toEqual([]);
  });
});
