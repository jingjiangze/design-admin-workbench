/**
 * workflow-marker —— WORKFLOW-V2 个人防漏单标记契约测试
 *
 * 覆盖（docs/WORKFLOW_MARKER_SPEC.md §测试门禁）：
 * - item_key 构造与校验（锚定 needsid/reminderId，禁 ordernum）；
 * - 标记幂等 / 身份隔离 / 持久化；
 * - 核心门禁（规格三十，最重要防错条件）：
 *     legacyActionSuccess === false → 绝无标记；
 *     legacyActionSuccess === true  → 标记存在；
 * - 批量部分失败：仅成功项落标记，失败项保持未处理。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// 隔离 app 依赖链（同 order-cache.test.ts）：传输层在 Mock 通道不参与
vi.mock("@/utils/http", () => ({ http: { request: vi.fn() } }));

import {
  orderMarkerKey,
  reminderMarkerKey,
  listHandledMarkers,
  markHandled,
  unmarkHandled,
  takeoverOrders,
  injectMarkerStorage,
  injectTakeoverTransport,
  resetWorkflowForTest
} from "@/service/workflow";
import { setUserIdentity } from "@/service/pricing/pricing-rule-store";

function memStorage(): {
  storage: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
  };
  map: Map<string, string>;
} {
  const map = new Map<string, string>();
  return {
    map,
    storage: {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k)
    }
  };
}

beforeEach(() => {
  resetWorkflowForTest();
  const { storage } = memStorage();
  injectMarkerStorage(storage);
  setUserIdentity("tester-a");
});

describe("marker key 构造（规格十二）", () => {
  it("订单标记锚定 needsid", () => {
    expect(orderMarkerKey("123456")).toEqual({
      itemType: "order",
      itemKey: "order:123456"
    });
  });

  it("催稿标记锚定 reminderId", () => {
    expect(reminderMarkerKey("88")).toEqual({
      itemType: "reminder",
      itemKey: "reminder:88"
    });
  });

  it("非法主键显式拒绝（空串 / 含冒号 / 超长）", () => {
    expect(() => orderMarkerKey("")).toThrow();
    expect(() => orderMarkerKey("TT_260908007929:extra")).toThrow();
    expect(() => reminderMarkerKey("a".repeat(65))).toThrow();
  });
});

describe("标记读写：幂等 / 隔离 / 持久化（规格十四/十五/十一）", () => {
  it("写入后可读，重复写入保留首次 processedAt（幂等）", async () => {
    await markHandled([orderMarkerKey("101")]);
    const first = await listHandledMarkers();
    expect(first.get("order:101")).toBeTruthy();

    // 模拟稍后再标一次
    await new Promise(r => setTimeout(r, 5));
    await markHandled([orderMarkerKey("101")]);
    const second = await listHandledMarkers();
    expect(second.get("order:101")).toBe(first.get("order:101"));
    expect(second.size).toBe(1);
  });

  it("用户隔离：换身份互不可见，切回后标记仍在", async () => {
    await markHandled([orderMarkerKey("201")]);
    expect((await listHandledMarkers()).has("order:201")).toBe(true);

    setUserIdentity("tester-b");
    expect((await listHandledMarkers()).has("order:201")).toBe(false);

    await markHandled([orderMarkerKey("202")]);
    expect((await listHandledMarkers()).has("order:202")).toBe(true);

    setUserIdentity("tester-a");
    const back = await listHandledMarkers();
    expect(back.has("order:201")).toBe(true);
    expect(back.has("order:202")).toBe(false);
  });

  it("取消标记后可重新标记（unmarkHandled）", async () => {
    await markHandled([reminderMarkerKey("301")]);
    await unmarkHandled([reminderMarkerKey("301")]);
    expect((await listHandledMarkers()).has("reminder:301")).toBe(false);
    await markHandled([reminderMarkerKey("301")]);
    expect((await listHandledMarkers()).has("reminder:301")).toBe(true);
  });
});

describe("一键接单门禁（规格二十四/三十 —— 最重要防错条件）", () => {
  it("旧系统成功 → 标记存在（processedAt 返回）", async () => {
    injectTakeoverTransport(async targets =>
      targets.map(t => ({
        ...t,
        ok: true,
        message: "操作成功",
        processedAt: "2026-09-21T08:42:00.000Z"
      }))
    );
    const results = await takeoverOrders([
      { applyId: "9001", orderId: "7001" }
    ]);
    expect(results[0].ok).toBe(true);
    const markers = await listHandledMarkers();
    expect(markers.get("order:7001")).toBe("2026-09-21T08:42:00.000Z");
  });

  it("旧系统失败 → 绝无标记（核心断言：legacyActionSuccess===false ⇒ 无 localProcessedAt）", async () => {
    injectTakeoverTransport(async targets =>
      targets.map(t => ({ ...t, ok: false, message: "旧系统拒绝" }))
    );
    const results = await takeoverOrders([
      { applyId: "9002", orderId: "7002" }
    ]);
    expect(results[0].ok).toBe(false);
    const markers = await listHandledMarkers();
    expect(markers.has("order:7002")).toBe(false);
  });

  it("批量部分失败：仅成功项亮绿点（规格九：失败项不能变绿）", async () => {
    const failOrderIds = new Set(["7004", "7005"]);
    injectTakeoverTransport(async targets =>
      targets.map(t =>
        failOrderIds.has(t.orderId)
          ? { ...t, ok: false, message: "已被他人接单" }
          : {
              ...t,
              ok: true,
              message: "操作成功",
              processedAt: "2026-09-21T09:00:00.000Z"
            }
      )
    );
    const results = await takeoverOrders([
      { applyId: "1", orderId: "7003" },
      { applyId: "2", orderId: "7004" },
      { applyId: "3", orderId: "7005" },
      { applyId: "4", orderId: "7006" },
      { applyId: "5", orderId: "7007" }
    ]);
    expect(results.filter(r => r.ok)).toHaveLength(3);
    expect(results.filter(r => !r.ok)).toHaveLength(2);

    const markers = await listHandledMarkers();
    expect(markers.has("order:7003")).toBe(true);
    expect(markers.has("order:7004")).toBe(false);
    expect(markers.has("order:7005")).toBe(false);
    expect(markers.has("order:7006")).toBe(true);
    expect(markers.has("order:7007")).toBe(true);
  });

  it("空入参 no-op", async () => {
    expect(await takeoverOrders([])).toEqual([]);
    expect((await listHandledMarkers()).size).toBe(0);
  });
});
