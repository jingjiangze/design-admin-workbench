/**
 * 单号历史服务契约测试（ORDER-HISTORY-AUDIT §三/§四/§十二/§十四/§十九/§二十七）
 * 覆盖：精确匹配优先、并发受控、11+ needsid 不截断、error ≠ no-block、仅重试失败项。
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  normalizeOrderNo,
  pickExactOrders,
  runWithConcurrency,
  loadDelivery,
  retryFailedDeliveries,
  type OrderHistoryResult
} from "../src/service/order-history";
import type { OrderListItem } from "../src/service/types";

vi.mock("../src/service/legacy/detail", () => ({
  fetchLegacyDetailHtml: vi.fn()
}));
vi.mock("../src/service/order", () => ({
  fetchOrders: vi.fn()
}));
vi.mock("@/utils/http", () => ({ http: { request: vi.fn() } }));

import { fetchLegacyDetailHtml } from "../src/service/legacy/detail";
const mockDetail = vi.mocked(fetchLegacyDetailHtml);

function order(orderNo: string, orderId: string): OrderListItem {
  return {
    orderId,
    applyId: "",
    orderNo,
    shop: "s",
    taskType: "",
    stateLabel: "",
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
    amountSource: "undefined" as const,
    price: 0,
    sales: 0,
    urgent: false,
    isRepulse: false,
    isRegular: false,
    productName: ""
  };
}

describe("normalizeOrderNo / 精确匹配", () => {
  it("trim + 大小写归一", () => {
    expect(normalizeOrderNo("  tt_260908007929 ")).toBe("TT_260908007929");
    expect(normalizeOrderNo("ＴＴ_123")).toBe("TT_123");
  });

  it("exact 优先：命中 exact 时丢弃包含候选（§十四）", () => {
    const orders = [
      order("TT_260908007929", "1"),
      order("TT_260908007929-xxx", "2"),
      order("XTT_260908007929X", "3")
    ];
    const picked = pickExactOrders(orders, "TT_260908007929");
    expect(picked).toHaveLength(1);
    expect(picked[0].orderId).toBe("1");
  });

  it("无 exact：保留全部包含候选并交由上层标注", () => {
    const orders = [order("TT_260908007929-xxx", "2")];
    expect(pickExactOrders(orders, "TT_260908007929")).toHaveLength(1);
  });
});

describe("runWithConcurrency", () => {
  it("结果顺序与输入一致、并发不超过上限", () => {
    let active = 0;
    let peak = 0;
    const out = runWithConcurrency(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      2,
      async n => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise(r => setTimeout(r, 5));
        active -= 1;
        return n * 10;
      }
    );
    return out.then(r => {
      expect(r).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110]);
      expect(peak).toBeLessThanOrEqual(2);
    });
  });
});

describe("loadDelivery 三态（§五）", () => {
  beforeEach(() => {
    mockDetail.mockReset();
  });

  it("ok：详情成功 + 有区块", async () => {
    mockDetail.mockResolvedValue(
      `<div class="draft-record"><div class='jiaogaojilu3'>Sep 1, 2026 1:00:00 PM 审核中</div></div>`
    );
    const d = await loadDelivery("1", "TT_1");
    expect(d.status).toBe("ok");
    expect(d.rows).toHaveLength(1);
  });

  it("no-block：详情成功但无区块 ≠ error ≠ 空", async () => {
    mockDetail.mockResolvedValue("<html>no block</html>");
    const d = await loadDelivery("1", "TT_1");
    expect(d.status).toBe("no-block");
  });

  it("error：请求失败 ≠ 无交稿（§五红线）", async () => {
    mockDetail.mockRejectedValue(new Error("HTTP 500"));
    const d = await loadDelivery("1", "TT_1");
    expect(d.status).toBe("error");
    expect(d.errorMessage).toBe("HTTP 500");
    expect(d.rows).toHaveLength(0);
  });
});

describe("retryFailedDeliveries（§十九：仅重试失败项）", () => {
  it("只重发 error 项请求，成功项不动", async () => {
    mockDetail.mockReset();
    let calls = 0;
    mockDetail.mockImplementation(async (id: string) => {
      calls += 1;
      if (id === "3") throw new Error("fail");
      return `<div class="draft-record"><div class='jiaogaojilu3'>Sep 1, 2026 1:00:00 PM 审核中</div></div>`;
    });
    const base: OrderHistoryResult = {
      orderNo: "TT_X",
      orders: [],
      exactMatch: true,
      deliveries: [],
      priceChange: null
    };
    // 模拟首轮：needsid 1/2 ok，3 error
    const d1 = await loadDelivery("1", "TT_X");
    const d2 = await loadDelivery("2", "TT_X");
    const d3 = await loadDelivery("3", "TT_X");
    const firstRun = { ...base, deliveries: [d1, d2, d3] };
    const firstCalls = calls;

    // 修复后重试：mock 改为不再抛错（保留计数）
    mockDetail.mockImplementation(async () => {
      calls += 1;
      return `<div class="draft-record"><div class='jiaogaojilu3'>Sep 1, 2026 1:00:00 PM 审核中</div></div>`;
    });
    const merged = await retryFailedDeliveries(firstRun);
    expect(calls).toBe(firstCalls + 1); // 仅 1 个新请求
    expect(merged.deliveries.map(d => d.status)).toEqual(["ok", "ok", "ok"]);
  });

  it("11+ needsid 全部装载，无 10 截断（§三）", async () => {
    mockDetail.mockReset();
    mockDetail.mockResolvedValue(`<div class="draft-record"></div>`);
    const ids = Array.from({ length: 13 }, (_, i) => String(i + 1));
    const results = await runWithConcurrency(ids, 2, id =>
      loadDelivery(id, "TT_X")
    );
    expect(results).toHaveLength(13);
    expect(new Set(results.map(r => r.needsid)).size).toBe(13);
  });
});
