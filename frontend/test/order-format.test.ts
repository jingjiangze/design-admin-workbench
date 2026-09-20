/**
 * P1A-10 测试 4：批量订单号复制格式（4 种分隔符，docs/BATCH_ORDER_OPERATION_SPEC.md）
 */
import { describe, expect, it } from "vitest";
import { formatOrderNos } from "@/utils/order-format";

describe("formatOrderNos — 4 种分隔符", () => {
  const nos = ["TT_001", "TT_002", "TT_003"];

  it("逐行（默认）：换行分隔", () => {
    expect(formatOrderNos(nos, "newline")).toBe("TT_001\nTT_002\nTT_003");
    expect(formatOrderNos(nos)).toBe("TT_001\nTT_002\nTT_003");
  });

  it("顿号：中文场景", () => {
    expect(formatOrderNos(nos, "dunhao")).toBe("TT_001、TT_002、TT_003");
  });

  it("逗号：Excel/表格粘贴", () => {
    expect(formatOrderNos(nos, "comma")).toBe("TT_001,TT_002,TT_003");
  });

  it("空格：扩展格式", () => {
    expect(formatOrderNos(nos, "space")).toBe("TT_001 TT_002 TT_003");
  });

  it("空值与重复项清洗（去空、去重、保序）", () => {
    expect(formatOrderNos(["A", "", " A ", "B", "A"], "comma")).toBe("A,B");
  });

  it("空数组返回空字符串", () => {
    expect(formatOrderNos([], "newline")).toBe("");
  });
});
