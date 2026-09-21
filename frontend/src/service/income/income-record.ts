/**
 * 收入记录纯函数域（真实口径，docs/INCOME_CUTOVER_SPEC.md §2-§3）
 *
 * 数据源 = getIncomeList 中标记录（awardTime=createtime 锚点），非订单列表。
 * 铁律：override > legacy > undefined；null ≠ 0；系统口径恒 = Σ legacyAmount。
 * 真实收入源下 legacyAmount（childProceeds）恒有值（审计 VERIFIED），
 * amountSource="undefined" 仅剩规则 amount=null 的理论语义（测试保留）。
 */
import type { PricingRule } from "../pricing/pricing-rule-types";
import { ruleKey } from "../pricing/pricing-rule-types";
import type { AmountSource } from "../types";

/** 收入记录（与 worker/src/legacy/income.ts 同形契约 + goodsId 映射字段） */
export interface IncomeRecord {
  orderNo: string;
  /** 中标时间（记账锚点，"yyyy-MM-dd HH:mm:ss"） */
  awardTime: string;
  /** 发单时间（辅助列，可缺省） */
  issueTime?: string;
  /** 商品名（可为复合拼接名 "A/B"，来自收入明细） */
  goodsName: string;
  /** 中标金额 childProceeds（真实源恒有值；null = 异常防御，禁 0） */
  legacyAmount: number | null;
  /** 商品规则键（增量实证缓存解析；null = 映射不可得，仅走系统口径） */
  goodsId?: string | null;
  subGoodsId?: string | null;
}

/** 单行金额解析（三态；规则须 enabled） */
export function resolveRecordAmount(
  record: IncomeRecord,
  rules: PricingRule[]
): { effectiveAmount: number | null; amountSource: AmountSource } {
  const rule = rules.find(
    r =>
      r.enabled &&
      record.goodsId != null &&
      ruleKey(r.goodsId, r.subGoodsId) ===
        ruleKey(record.goodsId as string, record.subGoodsId ?? undefined)
  );
  if (rule && rule.amount !== null) {
    return { effectiveAmount: rule.amount, amountSource: "override" };
  }
  if (record.legacyAmount !== null) {
    return { effectiveAmount: record.legacyAmount, amountSource: "legacy" };
  }
  return { effectiveAmount: null, amountSource: "undefined" };
}

export interface IncomeRangeQuery {
  from?: Date | null;
  to?: Date | null;
}

/** 中标时间解析（失败 → null，该行不参与时间过滤） */
export function parseAwardTime(record: IncomeRecord): Date | null {
  const raw = record.awardTime;
  if (!raw) return null;
  const d = new Date(raw.replace(/-/g, "/"));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 时间区间过滤（含端点） */
export function filterRecordsInRange(
  records: IncomeRecord[],
  query: IncomeRangeQuery
): IncomeRecord[] {
  return records.filter(r => {
    const d = parseAwardTime(r);
    if (!d) return false;
    if (query.from && d < query.from) return false;
    if (query.to && d > query.to) return false;
    return true;
  });
}

export interface RecordSummary {
  /** 我的统计（Σ effectiveAmount，undefined 行不计入） */
  myIncome: number;
  /** 系统口径（Σ legacyAmount，恒等于旧系统 moneys 语义） */
  systemIncome: number;
  /** 收入记录数（中标记录） */
  orderCount: number;
  /** 我的口径均单（orderCount=0 → null） */
  avgPerOrder: number | null;
  /** undefined 行数（真实源恒 0，保留显式计数语义） */
  undefinedCount: number;
  /** override 命中行数（双口径差异来源） */
  overrideHitCount: number;
}

/** 汇总：双口径 + 未定义/覆盖计数（禁止 null→0：undefined 行不入求和） */
export function getRecordSummary(
  records: IncomeRecord[],
  rules: PricingRule[]
): RecordSummary {
  let myIncome = 0;
  let systemIncome = 0;
  let undefinedCount = 0;
  let overrideHitCount = 0;
  for (const r of records) {
    systemIncome += r.legacyAmount ?? 0;
    const { effectiveAmount, amountSource } = resolveRecordAmount(r, rules);
    if (amountSource === "undefined") {
      undefinedCount += 1;
      continue;
    }
    myIncome += effectiveAmount ?? 0;
    if (amountSource === "override") overrideHitCount += 1;
  }
  return {
    myIncome,
    systemIncome,
    orderCount: records.length,
    avgPerOrder:
      records.length > 0
        ? Math.round((myIncome / records.length) * 100) / 100
        : null,
    undefinedCount,
    overrideHitCount
  };
}

export interface GoodsIncomeRow {
  /** 商品名（明细原样，含复合名） */
  goodsName: string;
  orderCount: number;
  myIncome: number;
  systemIncome: number;
}

/** 按商品名分组（明细原样分组，复合名整体一行；条目级规则匹配在 resolve 层） */
export function groupRecordsByGoods(
  records: IncomeRecord[],
  rules: PricingRule[]
): GoodsIncomeRow[] {
  const map = new Map<string, GoodsIncomeRow>();
  for (const r of records) {
    const name = r.goodsName || "未分类";
    const { effectiveAmount, amountSource } = resolveRecordAmount(r, rules);
    const row = map.get(name) ?? {
      goodsName: name,
      orderCount: 0,
      myIncome: 0,
      systemIncome: 0
    };
    row.orderCount += 1;
    row.systemIncome += r.legacyAmount ?? 0;
    if (amountSource !== "undefined") row.myIncome += effectiveAmount ?? 0;
    map.set(name, row);
  }
  return [...map.values()].sort((a, b) => b.systemIncome - a.systemIncome);
}

/** 反查：区间（+商品名）内的收入记录（返回记录本身，金额解释由 UI 层 resolve） */
export function getRecordsByGoods(
  records: IncomeRecord[],
  query: IncomeRangeQuery,
  goodsName?: string
): IncomeRecord[] {
  return filterRecordsInRange(records, query).filter(
    r => !goodsName || (r.goodsName || "未分类") === goodsName
  );
}
