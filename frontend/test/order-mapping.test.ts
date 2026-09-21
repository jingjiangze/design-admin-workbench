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

  it("金额三层模型基线：design_money → legacyAmount + 派生字段（P1B）", () => {
    const m = mapLegacyOrderListItem(raw);
    // legacyAmount：有值 → number 且派生 effective=legacy、source=legacy
    if (m.legacyAmount === null) {
      expect(m.amountSource).toBe("undefined");
      expect(m.effectiveAmount).toBeNull();
    } else {
      expect(typeof m.legacyAmount).toBe("number");
      expect(m.effectiveAmount).toBe(m.legacyAmount);
      expect(m.amountSource).toBe("legacy");
    }
    expect(m.overrideAmount).toBeNull(); // Adapter 基线无规则命中
    expect(typeof m.price).toBe("number");
    expect(typeof m.sales).toBe("number");
  });

  it("design_money 空值形态 → legacyAmount=null（未定义 ≠ ¥0）", () => {
    for (const empty of [null, "", undefined]) {
      const m = mapLegacyOrderListItem({
        ...raw,
        design_money: empty
      } as LegacyOrderListItem);
      expect(m.legacyAmount).toBeNull();
      expect(m.amountSource).toBe("undefined");
    }
    // 0 是合法值
    const zero = mapLegacyOrderListItem({
      ...raw,
      design_money: 0
    } as LegacyOrderListItem);
    expect(zero.legacyAmount).toBe(0);
    expect(zero.amountSource).toBe("legacy");
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
