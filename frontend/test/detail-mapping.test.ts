/**
 * P1A-10 测试 3：详情提取 + 七区块映射（needsid/applyid、ordrtyp→shop、
 * ERP Snapshot、products 版次、PII 脱敏）
 */
import { describe, expect, it } from "vitest";
import {
  extractEmbeddedDetailJson,
  mapLegacyDetail
} from "@/service/legacy/detail-mapping";
import { mapStateToView } from "@/service/types";
import type { LegacyDetailContainer } from "@/service/legacy/types";
import fixture from "@/service/mock/order-detail.json";

/** 将已提取的详情 JSON 还原为"HTML 内嵌转义"形态（模拟旧系统响应） */
function wrapAsLegacyHtml(obj: object): string {
  const escaped = JSON.stringify(obj).replace(/"/g, "&#034;");
  return `<html><body><script>var detail = ${escaped};</script></body></html>`;
}

const raw = fixture as unknown as LegacyDetailContainer;

describe("extractEmbeddedDetailJson — HTML 内嵌 JSON 提取", () => {
  it("从转义 HTML 中完整还原 17 键容器", () => {
    const html = wrapAsLegacyHtml(fixture);
    const out = extractEmbeddedDetailJson(html) as LegacyDetailContainer;
    expect(Object.keys(out).length).toBe(Object.keys(raw).length);
    expect(out.needsid).toBe(raw.needsid);
    expect(out.applyid).toBe(raw.applyid);
  });

  it("无内嵌 JSON 的 HTML 返回 null（容错）", () => {
    expect(
      extractEmbeddedDetailJson("<html><body>login</body></html>")
    ).toBeNull();
  });
});

describe("mapLegacyDetail — 七区块映射", () => {
  const detail = mapLegacyDetail(raw);

  it("区块 1 identity：needsid 主键 + applyid 兼容键同时保留", () => {
    expect(detail.identity.needsid).toBe(raw.needsid);
    expect(detail.identity.applyid).toBe(raw.applyid);
    expect(detail.identity.ordernum).toBe(raw.ordernum);
  });

  it("区块 2 preview：小样/大图 URL 落位", () => {
    expect(detail.preview.smallUrl).toBe(raw.s3url);
    expect(detail.preview.largeUrl).toBe(raw.s3Largeurl);
  });

  it("区块 3 flags：印刷业务标志布尔化", () => {
    expect(detail.flags.isBeol).toBe(false);
    expect(detail.flags.spotColor).toBe(false);
    expect(typeof detail.flags.isModel).toBe("boolean");
  });

  it("区块 4 editions：版次数量与 designNo 一等公民映射", () => {
    expect(detail.editions.length).toBe(raw.products.length);
    expect(detail.editions[0].designNo).toBe(raw.products[0].designNo);
    expect(detail.editions[0].productName).toBe(raw.products[0].spmc);
    expect(detail.editions[0].editionIndex).toBe(1);
  });

  it("区块 5 files：交稿格式含 cdr + 两级品类 + keywords 拆分", () => {
    const c = detail.fileConstraints[0];
    expect(c.acceptedSuffixes).toContain("cdr");
    expect(c.goodsName).toBe(raw.goodsFileParamList[0].goodsname);
    expect(c.subGoodsName).toBe(raw.goodsFileParamList[0].subGoodsname);
    expect(Array.isArray(c.keywords)).toBe(true);
    expect(c.similarCheck).toBe(
      Number(raw.goodsFileParamList[0].checkSimilar) === 1
    );
  });

  it("区块 6 erpSnapshot：ordrtyp→shop 改名落定 + bz 工单轨迹透传", () => {
    const erp = JSON.parse(raw.erpOrderJson);
    expect(detail.erpSnapshot?.shop).toBe(erp.ordrtyp);
    expect(detail.erpSnapshot?.shop.length).toBeGreaterThan(0);
    expect(detail.erpSnapshot?.serviceTrace).toBe(erp.bz);
    expect(detail.erpSnapshot?.orderState).toBe(erp.orderState);
  });

  it("区块 7 pii：全部掩码且不等于原值", () => {
    const erp = JSON.parse(raw.erpOrderJson);
    expect(detail.pii?.telMasked).not.toBe(erp.tel);
    expect(detail.pii?.telMasked).toContain("***");
    expect(detail.pii?.emailMasked).not.toBe(erp.email);
    expect(detail.pii?.qqMasked).not.toBe(erp.qq);
    expect(detail.pii?.buyerOpenUidMasked).not.toBe(erp.buyer_open_uid);
  });
});

describe("mapStateToView — 中文标签 → 6 视图", () => {
  it("12 旧态关键标签全部归类", () => {
    expect(mapStateToView("待接单")).toBe("pending_accept");
    expect(mapStateToView("未反馈")).toBe("in_progress");
    expect(mapStateToView("设计中")).toBe("in_progress");
    expect(mapStateToView("交稿审核")).toBe("pending_review");
    expect(mapStateToView("审核不通过")).toBe("pending_review");
    expect(mapStateToView("审核通过")).toBe("completed");
    expect(mapStateToView("订单完结")).toBe("completed");
    expect(mapStateToView("流标")).toBe("at_risk");
    expect(mapStateToView("超时")).toBe("at_risk");
    expect(mapStateToView("不良")).toBe("at_risk");
  });

  it("未识别标签返回 null（仅出现在全部视图）", () => {
    expect(mapStateToView("未知状态")).toBeNull();
  });
});
