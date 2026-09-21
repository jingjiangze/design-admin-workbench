/**
 * 收入领域服务 —— 视图层获取收入数据的唯一入口（P1-07 真实源版）
 *
 * 数据源 = /api/income/*（getIncomeList 中标记录，awardTime 中标时间锚点）。
 * 口径冻结：docs/INCOME_CUTOVER_SPEC.md；
 * 红线：禁拉订单列表自算收入（fetchIncomeScope 已退役）；禁 null→0；
 *       API 失败 throw → UI 显式"加载失败"（禁 mock fallback）。
 * 今日/本周 = 当月明细的前端时间过滤（SPEC §5，UI 须标注数据来源语义）。
 */
import { listRules } from "./pricing/pricing-rule-store";
import type { PricingRule } from "./pricing/pricing-rule-types";
import {
  fetchIncomeSummary,
  fetchIncomeMonthRecords,
  type IncomeSummaryData
} from "./income/income-api";
import {
  getRecordSummary,
  groupRecordsByGoods,
  getRecordsByGoods,
  filterRecordsInRange,
  type IncomeRecord,
  type RecordSummary,
  type GoodsIncomeRow
} from "./income/income-record";
import { annotateRecordsWithGoodsIds } from "./income/goods-id-map";
import { monthRange, todayRange, weekRange } from "./income/time-utils";

export type {
  IncomeRecord,
  RecordSummary,
  GoodsIncomeRow
} from "./income/income-record";
export type { IncomeSummaryData } from "./income/income-api";

export type RangePresetKey = "today" | "week" | "month";

/** 收入总览（首页卡片 + 收入页共用） */
export interface IncomeDashboard {
  range: RangePresetKey;
  /** Worker summary（系统口径：moneys 直取） */
  summary: IncomeSummaryData;
  /** 我的统计（Σ effectiveAmount，规则覆盖后；无覆盖 = systemIncome） */
  my: RecordSummary;
  categories: GoodsIncomeRow[];
  /** 今日/本周 = 月度明细上的前端时间过滤（数据诚实性标注） */
  scopeNote: string;
  /** 明细是否因超上限被截断（>10 页时 true，UI 须提示） */
  truncated: boolean;
}

function rangeLabel(range: RangePresetKey): string {
  return range === "today" ? "今日" : range === "week" ? "本周" : "本月";
}

/**
 * 收入总览组装：
 * - month：Worker summary（系统口径）+ 全月明细 → My 口径（规则覆盖）+ 品类分布
 * - today/week：同 month 拉月明细后按 createtime 前端过滤（SPEC §5，scopeNote 标注）
 */
export async function getIncomeDashboard(
  range: RangePresetKey
): Promise<IncomeDashboard> {
  const { monthKey } = monthRange();
  const [summary, month] = await Promise.all([
    fetchIncomeSummary({ range: "month", month: monthKey }),
    loadMonthRecords(monthKey)
  ]);
  const records = month.list;
  const rules = listRules() as PricingRule[];
  await annotateRecordsWithGoodsIds(records);

  const rangeQ =
    range === "today" ? todayRange() : range === "week" ? weekRange() : null;
  const scoped = rangeQ ? filterRecordsInRange(records, rangeQ) : records;
  const my = getRecordSummary(scoped, rules);
  const categories = groupRecordsByGoods(scoped, rules);

  return {
    range,
    summary:
      range === "month" ? summary : { ...summary, orderCount: scoped.length },
    my,
    categories,
    scopeNote:
      range === "month"
        ? "按中标时间统计"
        : `按中标时间统计 · ${rangeLabel(range)}数据为当月明细的前端时间过滤`,
    truncated: month.truncated
  };
}

/** 反查：区间（+品类）内的收入记录（收入 → 品类 → 订单 Drawer 链路） */
export async function getIncomeRecordList(
  range: RangePresetKey,
  category?: string
): Promise<IncomeRecord[]> {
  const { monthKey } = monthRange();
  const { list: records } = await loadMonthRecords(monthKey);
  await annotateRecordsWithGoodsIds(records);
  const rangeQ =
    range === "today" ? todayRange() : range === "week" ? weekRange() : null;
  return getRecordsByGoods(records, rangeQ ?? {}, category);
}

/** 未定义金额记录（真实源下 legacyAmount 恒有值 → 恒为空清单；保留显式语义防静默） */
export async function getUndefinedRecords(): Promise<IncomeRecord[]> {
  const { monthKey } = monthRange();
  const { list: records } = await loadMonthRecords(monthKey);
  return records.filter(r => r.legacyAmount === null);
}

/** 月明细加载（truncated 时 throw——SPEC §5：超上限降级需显式处理，禁静默截断冒充全量） */
async function loadMonthRecords(monthKey: string): Promise<{
  list: IncomeRecord[];
  truncated: boolean;
}> {
  const { list, total, truncated } = await fetchIncomeMonthRecords(monthKey);
  if (truncated) {
    throw new Error(
      `收入明细超出拉取上限（total=${total}），已拒绝截断统计（SPEC §5）`
    );
  }
  return { list, truncated };
}
