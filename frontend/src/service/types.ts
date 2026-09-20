/**
 * 订单领域类型 —— 38 旧字段到视图模型的映射产物
 *
 * ⚠️ 38 字段禁直出 UI：视图层只允许消费本文件声明的类型
 */

/** 旧系统 12 状态码（[VERIFIED] docs/ORDER_MODEL.md） */
export type LegacyState =
  | ""
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "11"
  | "12";

/** 新系统 6 业务视图（12 旧态收敛，docs/NEW_INFORMATION_ARCHITECTURE.md §3） */
export type OrderView =
  | "all"
  | "pending_accept"
  | "in_progress"
  | "pending_review"
  | "completed"
  | "at_risk";

/** 订单列表视图模型 —— P1A-07 在 Adapter 层完成 Legacy 字段到本类型的映射 */
export interface OrderListItem {
  /** 订单主键（needsid） */
  orderId: string;
  /** 店铺名 —— 源自旧字段 ordrtyp（语义错位），改名只发生在 Adapter */
  shop: string;
  /** 品类标题 */
  goodsTitle: string;
  /** 订单状态（旧 state 码，展示时经 STATUS_LABEL 转文案） */
  state: LegacyState;
  /** 客户姓名 */
  customerName: string;
  /** 截止时间 */
  endTime: string;
  /** 反馈/交稿时间 */
  replyTime: string;
}

/** 状态码 → 展示文案 */
export const STATUS_LABEL: Record<Exclude<LegacyState, "">, string> = {
  "1": "待接单",
  "2": "未反馈",
  "3": "设计中",
  "4": "交稿审核",
  "5": "审核通过",
  "6": "审核不通过",
  "7": "已完结",
  "8": "已流标",
  "11": "已超时",
  "12": "不良/待超时"
};
