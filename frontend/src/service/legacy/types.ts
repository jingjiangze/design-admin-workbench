/**
 * Legacy 类型声明 —— 旧系统（d.jndx.net/chsjs）接口的原始数据形状
 *
 * ⚠️ URL 隔离红线：/chsjs 与 *.do 字面量只允许出现在 src/service/legacy/
 * ⚠️ 38 字段禁直出 UI：LegacyOrderListItem 只能被 Adapter 消费
 *
 * 字段来源：2026-09-20 真实响应实测（order_list_full.json，与 Phase 0
 * api_order_withsort.json 样本字段完全一致），语义以实测值定稿。
 */

/** 列表接口 getOrderList.do 响应中的单行（实测 38 字段） */
export interface LegacyOrderListItem {
  // ===== 标识 =====
  /** 订单主键（详情接口 needsDetail2 的入参） */
  needsid: string;
  /** 申请流水 ID（详情接口 needsDetail 的兼容入参） */
  applyid: string;
  /** 平台订单号（如 TT_260908007929 或数字长串） */
  ordernum: string;
  /** 主会员 ID */
  memberid: number;
  /** 子会员 ID */
  submemberid: number;

  // ===== 状态 =====
  /** 中文状态标签（实测："审核通过" | "设计中" | ...） */
  state: string;
  /** 数字状态码（实测样本为 0；1-8/11/12 为请求过滤参数枚举） */
  needsstate: number;
  /** 子视图状态 */
  subviewstate: number;
  /** 稿件设计状态码 */
  manuscriptdesignstatus: number;
  /** 稿件设计状态名（实测："请选择" | "其他"） */
  manuscriptdesignstatusname: string;
  /** 审核状态 */
  checkstatus: number;
  /** 是否打回订单 */
  isrepulsedata: boolean;
  /** 是否最后一版 */
  islast: boolean;
  /** 是否新单标志 */
  isnew: number;
  /** 加急标志 */
  urgent: number;

  // ===== 客户/店铺 =====
  /** 店铺名（实测："益好旗舰店" 等；详情 ERP 层对应 ordrtyp 字段） */
  shop: string;
  /** 客户昵称/称呼 */
  kehu_name: string;
  /** 客户旺旺号 */
  kehu_ww: string;
  /** 客户姓名 */
  name: string;
  /** 会员名 */
  membername: string;
  /** 是否绑定微信（0/1 标志位，非微信号） */
  bindwechat: number;
  /** 大买家标志 */
  big_buyer_flag: string;
  /** 是否老客户 */
  is_regular_customer: boolean;

  // ===== 品类/任务 =====
  /** 标识标签（实测："普通"） */
  sign: string;
  /** 任务类型（实测："标准设计" | "修改设计"） */
  tasktype: string;
  /** 需求类型码（实测：1 | 4） */
  needtype: number;
  /** 色彩类型码 */
  colorType: number;
  /** 底色类型码 */
  backgroundcolour: number;
  /** 千里马/申请状态（实测："未申请"） */
  isqll: string;

  // ===== 时间 =====
  /** 需求截止时间（实测格式 "2026-09-21 11:43:16"） */
  timeneeds: string;
  /** 需求创建时间 */
  needscreatetime: string;
  /** ERP 创建时间 */
  erpcreatetime: string;
  /** 完成时间 */
  completetime: string;

  // ===== 金额 =====
  /** 销售金额（实测 0 | 79.31 | ...） */
  sales: number;
  /** 价格 */
  money: number;
  /** 设计费 */
  design_money: number;

  // ===== 排序 =====
  /** 排序号（回显请求的 sort 参数） */
  sort: number;

  /** 兜底索引（未声明字段不进视图层） */
  [key: string]: unknown;
}

/** getOrderList.do 整体响应结构 */
export interface LegacyOrderListResponse {
  result: boolean;
  flag?: number;
  message?: string;
  data?: {
    countInfo: Record<string, number>;
    pageInfo: {
      total: number;
      list: LegacyOrderListItem[];
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
}

/** 详情容器（needsDetail2/needsid 主键，17 顶层字段实测键名） */
export interface LegacyDetailContainer {
  applyid: string;
  needsid: string;
  ordernum: string;
  /** ERP 原始推单对象（二次嵌套 JSON 字符串，含语义错位 ordrtyp 与 PII） */
  erpOrderJson: string;
  /** 多版设计产品行（与 erp.Products 同构） */
  products: LegacyProduct[];
  goodsFileParamList: LegacyFileConstraint[];
  decidingPapersFile: Record<string, unknown>;
  s3url: string;
  s3Largeurl: string;
  isbeol: boolean;
  isModel: number;
  isMultipleUpload: boolean;
  isPackgeUpload: boolean;
  isPackgeUploadShow: boolean;
  isOnlyDesignOfOrder: boolean;
  isConnectShow: boolean;
  spotColor: boolean;
  [key: string]: unknown;
}

/** 版次产品行（ERP Products，27 字段核心子集） */
export interface LegacyProduct {
  spmc: string;
  designNo: string;
  def1Name: string;
  chang: number;
  wide: number;
  attrs: string;
  def8: string;
  sizeName: string;
  guige: string;
  spsl: number;
  danwei: string;
  je: number;
  outer_sku_id: string;
  [key: string]: unknown;
}

/** 文件上传约束（goodsFileParamList 元素） */
export interface LegacyFileConstraint {
  checkFileSuffix: string;
  checkSimilar: number;
  edition: number;
  editionFileParamList: Array<Record<string, unknown>>;
  goodsid: string;
  goodsname: string;
  subGoodsid: string;
  subGoodsname: string;
  keywords: string;
  sizeName: string;
  detailId: string;
  [key: string]: unknown;
}
