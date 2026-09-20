/**
 * IncomePolicy —— 收入统计口径配置（docs/INCOME_CALCULATION_SPEC.md §2）
 *
 * 配置化而非写死组件：第一版固定默认值，未来允许用户设置。
 * includedStatuses 用 6 视图语义（OrderView），禁止旧 state 数字进 UI/配置。
 */
import type { OrderView } from "../types";

export interface IncomePolicy {
  /** 进入统计的订单状态（6 视图） */
  includedStatuses: OrderView[];
  /** 是否用自定义金额优先（false = 纯系统口径） */
  useOverrideAmount: boolean;
  /** 未定义金额订单是否计入统计（false = 排除并单独计数） */
  includeUndefinedAmount: boolean;
}

/**
 * 第一版默认口径 [INFERRED]：仅"已完成"（审核通过/订单完结/完结）计入。
 * 依据：进行中/待审核金额未落定；风险单（流标/超时/不良）不应计入。
 * 待办：对旧收入页专项取证后修订（修订时同步更新 INCOME_CALCULATION_SPEC §2）。
 */
export const DEFAULT_INCOME_POLICY: IncomePolicy = {
  includedStatuses: ["completed"],
  useOverrideAmount: true,
  includeUndefinedAmount: false
};
