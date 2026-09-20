/**
 * P1A-10 测试 2：38 字段 → OrderListItem 映射（fixture 为脱敏真实样本）
 */
import { describe, expect, it } from "vitest";
import { mapLegacyOrderListItem } from "@/service/legacy/order-mapping";
import type {
  LegacyOrderListItem,
  LegacyOrderListResponse
} from "@/service/legacy/types";
import fixture from "@/service/mock/order-list.json";

const res = fixture as unknown as LegacyOrderListResponse;
const raw = res.data.pageInfo.list[0];

describe("mapLegacyOrderListItem — 38 字段映射", () => {
  it("fixture 单行为 38 字段（与实测契约一致）", () => {
    expect(Object.keys(raw).length).toBe(38);
  });

  it("标识字段：needsid/applyid/ordernum 正确落位", () => {
    const m = mapLegacyOrderListItem(raw);
    expect(m.orderId).toBe(String(raw.needsid));
    expect(m.applyId).toBe(String(raw.applyid));
    expect(m.orderNo).toBe(String(raw.ordernum));
  });

  it("shop 直接来自列表原生 shop 字段（非 ordrtyp）", () => {
    const m = mapLegacyOrderListItem(raw);
    expect(m.shop).toBe(raw.shop);
    expect(m.shop.length).toBeGreaterThan(0);
  });

  it("state 中文标签原样透传；view 按 6 视图归类", () => {
    const m = mapLegacyOrderListItem(raw);
    expect(m.stateLabel).toBe(raw.state);
    // fixture 首行 state 为"审核通过" → completed
    expect(m.view).toBe("completed");
  });

  it("金额字段数值化：design_money/money/sales → number", () => {
    const m = mapLegacyOrderListItem(raw);
    expect(typeof m.designFee).toBe("number");
    expect(typeof m.price).toBe("number");
    expect(typeof m.sales).toBe("number");
  });

  it("布尔字段语义化：urgent=1 → urgent；isrepulsedata 透传", () => {
    const row = {
      ...raw,
      urgent: 1,
      isrepulsedata: true
    } as LegacyOrderListItem;
    const m = mapLegacyOrderListItem(row);
    expect(m.urgent).toBe(true);
    expect(m.isRepulse).toBe(true);
  });

  it("整表映射 10 行无空 orderId（主键完整性）", () => {
    for (const r of res.data.pageInfo.list) {
      const m = mapLegacyOrderListItem(r);
      expect(m.orderId.length).toBeGreaterThan(0);
    }
  });
});
