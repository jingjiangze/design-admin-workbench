/**
 * 订单领域类型 —— 38 旧字段到视图模型的映射产物
 *
 * ⚠️ 38 字段禁直出 UI：视图层只允许消费本文件声明的类型
 * 映射由 legacy/order.ts（Adapter 层）完成，视图层禁止 import legacy/*
 */

/** 金额来源：override=用户规则 / legacy=旧系统设计费 / undefined=未定义（≠¥0） */
export type AmountSource = "override" | "legacy" | "undefined";

/**
 * 旧系统 6 业务视图（12 旧态收敛，docs/NEW_INFORMATION_ARCHITECTURE.md §3）
 * 全部 = ""；待接单 = 1；进行中 = 2/3；待审核 = 4/6；已完结 = 5/7；风险单 = 8/11/12
 */
export type OrderView =
  | "all"
  | "pending_accept"
  | "in_progress"
  | "pending_review"
  | "completed"
  | "at_risk";

/** 视图 → 展示文案 */
export const VIEW_LABEL: Record<OrderView, string> = {
  all: "全部",
  pending_accept: "待接单",
  in_progress: "进行中",
  pending_review: "待审核",
  completed: "已完结",
  at_risk: "风险单"
};

/**
 * 中文状态标签 → 6 视图归类。
 * 旧系统列表行 state 为中文标签（实测"审核通过"/"设计中"等），
 * 未识别标签返回 null（仅在"全部"视图出现，前端原样展示 stateLabel）。
 */
export function mapStateToView(stateLabel: string): OrderView | null {
  const table: Record<string, OrderView> = {
    待接单: "pending_accept",
    未反馈: "in_progress",
    设计中: "in_progress",
    交稿审核: "pending_review",
    审核不通过: "pending_review",
    审核通过: "completed",
    订单完结: "completed",
    完结: "completed",
    流标: "at_risk",
    超时: "at_risk",
    不良: "at_risk"
  };
  return table[stateLabel] ?? null;
}

/** 订单列表视图模型（Adapter 层 38 字段映射的产物） */
export interface OrderListItem {
  /** 订单主键（needsid） */
  orderId: string;
  /** 申请流水 ID（applyid） */
  applyId: string;
  /** 平台订单号（ordernum） */
  orderNo: string;
  /** 店铺名（列表原生 shop；详情 ERP 层 ordrtyp 的改名只发生在 Adapter） */
  shop: string;
  /** 任务类型（"标准设计" / "修改设计"） */
  taskType: string;
  /** 旧系统中文状态标签（原样透传展示） */
  stateLabel: string;
  /** 6 业务视图归类（未识别标签为 null） */
  view: OrderView | null;
  /** 客户姓名 */
  customerName: string;
  /** 客户昵称 */
  customerNick: string;
  /** 会员名 */
  memberName: string;
  /** 截止时间（timeneeds） */
  endTime: string;
  /** 需求创建时间（needscreatetime） */
  createTime: string;
  /** 完成时间 */
  completeTime: string;
  /**
   * 原始金额三层模型（docs/PRICING_RULE_SPEC.md §2-3）：
   * legacyAmount = 旧系统设计费（design_money），空 → null（未定义 ≠ ¥0），只读
   * overrideAmount = 命中用户金额规则的金额，未命中 → null
   * effectiveAmount = 最终统计金额 = resolveOrderAmount 产物
   * amountSource = "override" | "legacy" | "undefined"
   */
  legacyAmount: number | null;
  overrideAmount: number | null;
  effectiveAmount: number | null;
  amountSource: AmountSource;
  /** 商品 ID（goodsid；列表行缺省时由详情层补全，金额规则匹配用） */
  goodsId?: string;
  /** 子商品 ID（subGoodsid，精确规则匹配） */
  subGoodsId?: string;
  /** 商品名（productName，品类分布/规则展示） */
  productName?: string;
  /** 价格（money，38 字段映射保留） */
  price: number;
  /** 销售金额（sales） */
  sales: number;
  /** 加急 */
  urgent: boolean;
  /** 打回单 */
  isRepulse: boolean;
  /** 老客户 */
  isRegular: boolean;
}
