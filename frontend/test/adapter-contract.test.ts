/**
 * P1A-10 测试 1：getOrderList.do 请求契约
 * [VERIFIED] 隐性契约：sort=0&sorttype=1 必传，缺省 flag:500
 */
import { describe, expect, it } from "vitest";
import { buildOrderListQuery } from "@/service/legacy/order-mapping";

describe("buildOrderListQuery — 请求契约", () => {
  it("任何参数组合下 sort=0 与 sorttype=1 恒存在（数字型）", () => {
    const q = buildOrderListQuery({ page: 1, limit: 10 });
    expect(q.sort).toBe(0);
    expect(q.sorttype).toBe(1);
    expect(typeof q.sort).toBe("number");
    expect(typeof q.sorttype).toBe("number");
  });

  it("state 缺省时序列化为空字符串（= 全部视图）", () => {
    const q = buildOrderListQuery({ page: 1, limit: 10 });
    expect(q.state).toBe("");
  });

  it("显式 state 与 keyword 正确透传", () => {
    const q = buildOrderListQuery({
      page: 2,
      limit: 20,
      state: "3",
      keyword: "TT_TEST"
    });
    expect(q.state).toBe("3");
    expect(q.keyword).toBe("TT_TEST");
    expect(q.page).toBe(2);
    expect(q.limit).toBe(20);
  });

  it("keyword 为空字符串时不进入表单（与页面 jQuery 行为一致）", () => {
    const q = buildOrderListQuery({ page: 1, limit: 10, keyword: "" });
    expect("keyword" in q).toBe(false);
  });
});
