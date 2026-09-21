/**
 * SWR 缓存 + 订单本地过滤契约测试（2026-09-21 性能优化 Wave）
 * 覆盖：swr 读写/fresh 判定/损坏容错、stateLabel→state 映射、
 *       本地 Tab 过滤与分页（订单渐进加载的纯函数核心）
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// 断链：order-cache → service/order → legacy/order → @/utils/http 会拉起
// store/router 初始化链（vitest 无 vite env 时 getHistoryMode 崩溃）。
// 本测试只覆盖纯函数（映射/过滤/分页/swr），不触真实传输层。
vi.mock("@/utils/http", () => ({ http: { request: vi.fn() } }));

import {
  swrRead,
  swrWrite,
  swrIsFresh,
  injectSwrStorage,
  resetSwrStorage
} from "@/service/swr-cache";
import { filterOrdersByState, paginateOrders } from "@/service/order-cache";
import { stateLabelToState, LEGACY_ORDER_TABS } from "@/service/types";
import type { OrderListItem } from "@/service/types";

/** 内存 localStorage 适配器（与 pricing-sync.test 同模式） */
function makeMemStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k)
  };
}

/** 最小订单行（仅测试所需字段） */
function row(stateLabel: string, i: number): OrderListItem {
  return {
    orderId: `id-${i}`,
    applyId: `ap-${i}`,
    orderNo: `NO${1000 + i}`,
    shop: "店",
    taskType: "标准设计",
    stateLabel,
    view: null,
    customerName: "",
    customerNick: "",
    memberName: "",
    endTime: "",
    createTime: "",
    completeTime: "",
    legacyAmount: null,
    overrideAmount: null,
    effectiveAmount: null,
    amountSource: "undefined",
    price: 0,
    sales: 0,
    urgent: false,
    isRepulse: false,
    isRegular: false
  };
}

describe("swr-cache", () => {
  beforeEach(() => {
    injectSwrStorage(makeMemStorage());
  });
  it("写后可读，at 为当前时间", () => {
    swrWrite("k1", { a: 1 });
    const e = swrRead<{ a: number }>("k1");
    expect(e?.data).toEqual({ a: 1 });
    expect(typeof e?.at).toBe("number");
  });
  it("fresh 判定：刚写入在窗口内，过期不在", () => {
    swrWrite("k2", 5);
    expect(swrIsFresh(swrRead("k2"), 60_000)).toBe(true);
    const stale = swrRead("k2");
    expect(swrIsFresh(stale, -1)).toBe(false);
  });
  it("损坏 JSON 返回 null 不抛", () => {
    const s = makeMemStorage();
    injectSwrStorage(s);
    swrWrite("k3", 1);
    // 直接破坏存储内容
    (s as unknown as Map<string, string>).set?.("x", "y");
    injectSwrStorage({
      getItem: () => "{broken",
      setItem: () => undefined,
      removeItem: () => undefined
    });
    expect(swrRead("k3")).toBeNull();
  });
  it("未写入返回 null", () => {
    expect(swrRead("nope")).toBeNull();
  });
  it("resetSwrStorage 恢复默认存储不抛", () => {
    // node 环境 defaultStorage 为 no-op（无 window）：仅验证不抛、读取安全
    expect(() => resetSwrStorage()).not.toThrow();
    expect(swrRead("k4")).toBeNull();
    injectSwrStorage(makeMemStorage());
  });
});

describe("legacy order tabs mapping", () => {
  it("Tab 表 = 原系统枚举（9=售后停用不设）", () => {
    const states = LEGACY_ORDER_TABS.map(t => t.state);
    expect(states).toEqual([
      "",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "11",
      "12"
    ]);
  });
  it("中文标签 → state 映射覆盖全部 Tab（含别名）", () => {
    expect(stateLabelToState("待接单")).toBe("1");
    expect(stateLabelToState("未反馈")).toBe("2");
    expect(stateLabelToState("设计中")).toBe("3");
    expect(stateLabelToState("交稿审核")).toBe("4");
    expect(stateLabelToState("审核通过")).toBe("5");
    expect(stateLabelToState("审核不通过")).toBe("6");
    expect(stateLabelToState("订单完结")).toBe("7");
    expect(stateLabelToState("完结")).toBe("7");
    expect(stateLabelToState("流标")).toBe("8");
    expect(stateLabelToState("超时")).toBe("11");
    expect(stateLabelToState("订单超时")).toBe("11");
    expect(stateLabelToState("不良")).toBe("12");
    expect(stateLabelToState("未知标签")).toBeNull();
  });
});

describe("order-cache local filter & pagination", () => {
  const all = [
    row("待接单", 1),
    row("设计中", 2),
    row("审核通过", 3),
    row("流标", 4),
    row("审核通过", 5)
  ];
  it("state=空 → 全部原样", () => {
    expect(filterOrdersByState(all, "")).toHaveLength(5);
  });
  it("state=5 → 仅审核通过", () => {
    const r = filterOrdersByState(all, "5");
    expect(r).toHaveLength(2);
    expect(r.every(o => o.stateLabel === "审核通过")).toBe(true);
  });
  it("state=11 → 超时/订单超时别名都命中", () => {
    const r = filterOrdersByState([row("超时", 1), row("订单超时", 2)], "11");
    expect(r).toHaveLength(2);
  });
  it("分页：第 2 页取剩余", () => {
    expect(paginateOrders(all, 1, 3)).toHaveLength(3);
    expect(paginateOrders(all, 2, 3)).toHaveLength(2);
    expect(paginateOrders(all, 3, 3)).toHaveLength(0);
  });
});
