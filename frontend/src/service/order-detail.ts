/**
 * 订单详情领域服务 —— 视图层获取详情数据的唯一入口
 * 七区块类型见 order-detail-types.ts；映射纯函数见 legacy/detail-mapping.ts
 */
import {
  fetchLegacyDetailByApplyid,
  fetchLegacyDetailByNeedsid
} from "./legacy/detail";
import { mapLegacyDetail } from "./legacy/detail-mapping";
import { getMockOrderDetail, isLegacyRealEnabled } from "./gateway";
import type { LegacyDetailContainer } from "./legacy/types";
import type { OrderDetail } from "./order-detail-types";

export type {
  OrderDetail,
  DesignEdition,
  FileConstraintView,
  ErpSnapshotView,
  PiiMaskedView
} from "./order-detail-types";
export {
  mapLegacyDetail,
  extractEmbeddedDetailJson
} from "./legacy/detail-mapping";

/** 领域入口：按 needsid 主键取详情；applyid 兼容键可选兜底（P1A-08 Proof） */
export async function fetchOrderDetail(params: {
  needsid?: string;
  applyid?: string;
}): Promise<OrderDetail | null> {
  if (!isLegacyRealEnabled()) {
    const mock = getMockOrderDetail(
      String(params.needsid ?? params.applyid ?? "")
    );
    return mock ? mapLegacyDetail(mock) : null;
  }

  let raw: LegacyDetailContainer | null = null;
  if (params.needsid) {
    raw = await fetchLegacyDetailByNeedsid(params.needsid);
  }
  if (!raw && params.applyid) {
    raw = await fetchLegacyDetailByApplyid(params.applyid);
  }
  if (!raw) return null;
  return mapLegacyDetail(raw);
}
