/**
 * Legacy 类型声明 —— 旧系统（d.jndx.net/chsjs）接口的原始数据形状
 *
 * ⚠️ URL 隔离红线：/chsjs 与 *.do 字面量只允许出现在 src/service/legacy/
 * ⚠️ 38 字段禁直出 UI：LegacyOrderListItem 只能被 Adapter 消费
 * 字段全账本见 docs/ORDER_MODEL.md（列表）与 docs/ORDER_DETAIL_MODEL.md（详情）
 */

/** 列表接口 getOrderList.do 响应中的单行（38 字段，此处声明已验证核心字段） */
export interface LegacyOrderListItem {
  /** 申请流水 ID（详情接口 needsDetail 的入参） */
  applyid: string;
  /** 订单主键（详情接口 needsDetail2 的入参，详情主键） */
  needsid: string;
  /** 品类 goodsid */
  goodsid: string;
  /** 品类标题 */
  goodstitle: string;
  /**
   * ⚠️ 语义错位字段：字段名为 ordrtyp（疑似 order type），实际存储的是店铺名。
   * 只允许在 Adapter 层改名为 shop，禁止以 ordrtyp 出现在任何视图层代码。
   */
  ordrtyp: string;
  /** 订单状态码：""=全部/1 待接单/2 未反馈/3 设计中/4 交稿审核/5 通过/6 不通过/7 完结/8 流标/11 超时/12 不良与待超时复用 */
  state: string;
  /** 客户姓名 */
  name: string;
  /** 反馈/交稿时间 */
  replytime: string;
  /** 截止时间 */
  endtime: string;
  // P1A-07: 补全 38 字段完整声明（以 docs/ORDER_MODEL.md 字段账本为准）
  [key: string]: unknown;
}

/** getOrderList.do 整体响应结构 */
export interface LegacyOrderListResponse {
  result: number;
  data: {
    countInfo: Record<string, number>;
    pageInfo: {
      total: number;
      list: LegacyOrderListItem[];
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
}

/** 详情容器（needsDetail2/needsid 主键，17 字段层级 + erpOrderJson + 版次 Products） */
export interface LegacyOrderDetail {
  [key: string]: unknown;
}
