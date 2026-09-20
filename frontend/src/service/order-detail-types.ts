/**
 * 订单详情领域类型 —— 七区块聚合（docs/ORDER_DETAIL_MODEL.md §7 建模结论）
 * 纯类型文件，无依赖无副作用
 */

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
