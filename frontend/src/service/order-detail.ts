/**
 * 订单详情领域模型 —— 七区块聚合（docs/ORDER_DETAIL_MODEL.md §7 建模结论）
 *
 * 1. identity   标识区块（needsid 主键 + applyid 兼容键 + ordernum 业务主号）
 * 2. preview    预览区块（小样/大图 URL，自建云存储）
 * 3. flags      容器标志（后道/专色/模板单/打包上传等印刷业务标志）
 * 4. editions   版次区块（一等公民：designNo 内嵌版次语义）
 * 5. files      文件约束（checkFileSuffix 含 CDR；两级品类 + keywords）
 * 6. erpSnapshot ERP 快照（只读审计；ordrtyp→shop 改名只在此层；bz=工单轨迹）
 * 7. pii        客户隐私（tel/email/company/qq/buyer_open_uid，一律脱敏出 Adapter）
 */
import {
  fetchLegacyDetailByApplyid,
  fetchLegacyDetailByNeedsid,
  type LegacyDetailContainer,
  type LegacyFileConstraint,
  type LegacyProduct
} from "./legacy/detail";

/** 版次（DesignEdition 实体） */
export interface DesignEdition {
  editionIndex: number;
  designNo: string;
  productName: string;
  spec: string;
  width: number;
  height: number;
  attrs: string;
  material: string;
  quantity: number;
  unit: string;
  amount: number;
}

/** 文件约束（视图模型） */
export interface FileConstraintView {
  /** 允许的交稿格式（实测含 cdr——CorelDRAW 工作流） */
  acceptedSuffixes: string[];
  similarCheck: boolean;
  editionCount: number;
  goodsId: string;
  goodsName: string;
  subGoodsId: string;
  subGoodsName: string;
  keywords: string[];
}

/** ERP 快照（只读审计，PII 已剥离） */
export interface ErpSnapshotView {
  erpOrderId: string;
  /** 旧字段 ordrtyp 语义错位存店铺名，此处改名落定 */
  shop: string;
  orderState: number;
  erpCreateTime: string;
  groupCount: number;
  sales: string;
  customerNote: string;
  /** 业务备注 = 客服署名 + 时间戳 + 工单轨迹（非普通备注） */
  serviceTrace: string;
}

/** PII 脱敏视图（值为掩码；原值不出 Adapter） */
export interface PiiMaskedView {
  telMasked: string;
  emailMasked: string;
  companyMasked: string;
  qqMasked: string;
  buyerOpenUidMasked: string;
}

/** OrderDetail 七区块聚合 */
export interface OrderDetail {
  identity: {
    needsid: string;
    applyid: string;
    ordernum: string;
  };
  preview: {
    smallUrl: string;
    largeUrl: string;
  };
  flags: {
    isBeol: boolean;
    spotColor: boolean;
    isModel: boolean;
    isOnlyDesign: boolean;
    multipleUpload: boolean;
    packageUpload: boolean;
    connectShow: boolean;
  };
  editions: DesignEdition[];
  fileConstraints: FileConstraintView[];
  erpSnapshot: ErpSnapshotView | null;
  pii: PiiMaskedView | null;
}

/** 通用掩码：保留前 keep 头后 keep 尾（不足 4 位全掩码） */
function mask(value: unknown, keep = 2): string {
  const s = String(value ?? "").trim();
  if (!s) return "";
  if (s.length <= keep * 2) return "*".repeat(s.length);
  return s.slice(0, keep) + "*".repeat(s.length - keep * 2) + s.slice(-keep);
}

function mapProduct(p: LegacyProduct, index: number): DesignEdition {
  return {
    editionIndex: index + 1,
    designNo: String(p.designNo ?? ""),
    productName: String(p.spmc ?? ""),
    spec: String(p.def1Name ?? ""),
    width: Number(p.chang ?? 0),
    height: Number(p.wide ?? 0),
    attrs: String(p.attrs ?? ""),
    material: String(p.sizeName ?? p.def8 ?? ""),
    quantity: Number(p.spsl ?? 0),
    unit: String(p.danwei ?? ""),
    amount: Number(p.je ?? 0)
  };
}

function mapFileConstraint(c: LegacyFileConstraint): FileConstraintView {
  return {
    acceptedSuffixes: String(c.checkFileSuffix ?? "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean),
    similarCheck: Number(c.checkSimilar ?? 0) === 1,
    editionCount: Number(c.edition ?? 0),
    goodsId: String(c.goodsid ?? ""),
    goodsName: String(c.goodsname ?? ""),
    subGoodsId: String(c.subGoodsid ?? ""),
    subGoodsName: String(c.subGoodsname ?? ""),
    keywords: String(c.keywords ?? "")
      .split(/[，,]/)
      .map(s => s.trim())
      .filter(Boolean)
  };
}

/**
 * 详情容器 → OrderDetail 七区块（38 字段禁直出原则在详情层的对应实现）。
 * erpOrderJson 二次解析；ordrtyp→shop 改名与 PII 脱敏只发生在本函数。
 */
export function mapLegacyDetail(raw: LegacyDetailContainer): OrderDetail {
  let erp: Record<string, unknown> | null = null;
  try {
    if (raw.erpOrderJson) erp = JSON.parse(raw.erpOrderJson);
  } catch {
    erp = null;
  }
  return {
    identity: {
      needsid: String(raw.needsid ?? ""),
      applyid: String(raw.applyid ?? ""),
      ordernum: String(raw.ordernum ?? "")
    },
    preview: {
      smallUrl: String(raw.s3url ?? ""),
      largeUrl: String(raw.s3Largeurl ?? "")
    },
    flags: {
      isBeol: Boolean(raw.isbeol),
      spotColor: Boolean(raw.spotColor),
      isModel: Number(raw.isModel ?? 0) === 1,
      isOnlyDesign: Boolean(raw.isOnlyDesignOfOrder),
      multipleUpload: Boolean(raw.isMultipleUpload),
      packageUpload: Boolean(raw.isPackgeUpload),
      connectShow: Boolean(raw.isConnectShow)
    },
    editions: Array.isArray(raw.products) ? raw.products.map(mapProduct) : [],
    fileConstraints: Array.isArray(raw.goodsFileParamList)
      ? raw.goodsFileParamList.map(mapFileConstraint)
      : [],
    erpSnapshot: erp
      ? {
          erpOrderId: String(erp.orderid ?? ""),
          shop: String(erp.ordrtyp ?? ""),
          orderState: Number(erp.orderState ?? 0),
          erpCreateTime: String(erp.creattime ?? ""),
          groupCount: Number(erp.num ?? 0),
          sales: String(erp.sales ?? ""),
          customerNote: String(erp.notes ?? ""),
          serviceTrace: String(erp.bz ?? "")
        }
      : null,
    pii: erp
      ? {
          telMasked: mask(erp.tel, 3),
          emailMasked: mask(erp.email, 2),
          companyMasked: mask(erp.company, 2),
          qqMasked: mask(erp.qq, 2),
          buyerOpenUidMasked: mask(erp.buyer_open_uid, 4)
        }
      : null
  };
}

/** 领域入口：按 needsid 主键取详情；applyid 兼容键可选兜底（P1A-08 Proof） */
export async function fetchOrderDetail(params: {
  needsid?: string;
  applyid?: string;
}): Promise<OrderDetail | null> {
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
