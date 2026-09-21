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
  /** 本月实际发生收入的商品中，未设置个人金额规则的 distinct 商品数
   *  （首页"金额未设置"关注项真实源；无规则映射可得的商品也计入未覆盖） */
  uncoveredGoodsCount: number;
  /** 明细增强数据降级标志（2026-09-21）：月明细拉取/实证失败时 true，
   *  my/categories/uncovered 按系统口径兜底显示，UI 注记"按系统口径"。
   *  红线软化依据：用户指令"金额数据暂时使用系统现有默认金额，无需等待真实数据" */
  detailDegraded: boolean;
}

function rangeLabel(range: RangePresetKey): string {
  return range === "today" ? "今日" : range === "week" ? "本周" : "本月";
}

/**
 * 首页快速路径：只拉 summary（Worker 内 2 个旧系统请求），不等月明细。
 * 首页本月收入卡专用 —— 完整 dashboard（my 口径/品类/关注项）走
 * getIncomeDashboard 或 SWR 缓存，后台补齐。
 */
export async function getIncomeSummaryFast(): Promise<IncomeSummaryData> {
  const { monthKey } = monthRange();
  return fetchIncomeSummary({ range: "month", month: monthKey });
}

/**
 * 收入总览组装（2026-09-21 重构）：
 * - summary 失败 → throw（唯一硬失败点，UI 显式错误态）
 * - 月明细失败/超限 → 降级 degraded=true，my 口径按系统金额兜底（不整体失败）
 *   （此前：明细任何一环失败 = 整个收入模块"加载失败"——根因已修）
 * - today/week：同 month 拉月明细后按 createtime 前端过滤（SPEC §5，scopeNote 标注）
 */
export async function getIncomeDashboard(
  range: RangePresetKey
): Promise<IncomeDashboard> {
  const { monthKey } = monthRange();
  const summary = await fetchIncomeSummary({ range: "month", month: monthKey });
  const rules = listRules() as PricingRule[];

  // 明细增强：失败降级（SPEC §5 truncated throw 在此转为降级语义）
  let records: IncomeRecord[] = [];
  let truncated = false;
  let detailDegraded = false;
  try {
    const month = await loadMonthRecords(monthKey);
    records = month.list;
    truncated = month.truncated;
  } catch {
    detailDegraded = true;
  }
  if (!detailDegraded) {
    await annotateRecordsWithGoodsIds(records); // 已并行化 + 单名容错
  }

  const rangeQ =
    range === "today" ? todayRange() : range === "week" ? weekRange() : null;
  const scoped = rangeQ ? filterRecordsInRange(records, rangeQ) : records;

  // 降级兜底：my 口径 = 系统口径（Worker moneys 直取），禁 0 伪装、显式注记
  const my: RecordSummary = detailDegraded
    ? {
        myIncome: summary.systemIncome ?? 0,
        systemIncome: summary.systemIncome ?? 0,
        orderCount: summary.orderCount,
        avgPerOrder: summary.avgPerOrder,
        undefinedCount: 0,
        overrideHitCount: 0
      }
    : getRecordSummary(scoped, rules);
  const categories = detailDegraded ? [] : groupRecordsByGoods(scoped, rules);

  // 未设置个人金额的商品（真实源）：本月明细 distinct 商品键 ∉ enabled 且 amount!=null 的规则键
  let uncoveredGoodsCount = 0;
  if (!detailDegraded) {
    const coveredKeys = new Set(
      rules
        .filter(r => r.enabled && r.amount !== null)
        .map(r => `${r.goodsId}|${r.subGoodsId ?? ""}`)
    );
    const uncoveredGoods = new Set<string>();
    for (const r of records) {
      if (r.goodsId == null) {
        uncoveredGoods.add(r.goodsName); // 规则映射不可得 = 必然未覆盖
        continue;
      }
      if (!coveredKeys.has(`${r.goodsId}|${r.subGoodsId ?? ""}`))
        uncoveredGoods.add(r.goodsName);
    }
    uncoveredGoodsCount = uncoveredGoods.size;
  }

  return {
    range,
    summary:
      range === "month" ? summary : { ...summary, orderCount: scoped.length },
    my,
    categories,
    scopeNote: detailDegraded
      ? "按中标时间统计 · 明细加载失败，金额按系统口径显示"
      : range === "month"
        ? "按中标时间统计"
        : `按中标时间统计 · ${rangeLabel(range)}数据为当月明细的前端时间过滤`,
    truncated,
    uncoveredGoodsCount,
    detailDegraded
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
