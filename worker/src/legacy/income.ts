/**
 * Legacy Gateway —— 收入（/api/income/* → 六真实端点严格白名单，P1-04）
 *
 * [VERIFIED 2026-09-21] 数据源 = docs/INCOME_SOURCE_AUDIT.md 六端点：
 *   getThisMonthIncome / getAllIncome / getThisMonthFind / querySameMonthData /
 *   getIncomeList / getDeductionList（全 POST，form 参数 queryTime=yyyy-MM + layui page/limit）
 *
 * 口径冻结（docs/INCOME_CUTOVER_SPEC.md §1-§4）：
 * - 月收入 = getThisMonthIncome.moneys 直取（系统口径，Worker 不重算不覆盖）；
 * - 记账锚点 = createtime（中标时间）；明细数据键 = pageInfo.dataList（非 list）；
 * - 订单 state 不参与收入计入；罚款独立体系（getDeductionList）；
 * - 无数据月响应缺 data 字段 → systemIncome = null（禁 0，前端显示"—"）；
 * - 明细行不含 goodsId —— goodsId 解析走前端增量实证缓存（SPEC §2），Worker 禁猜。
 * - myIncome/undefinedCount 涉及用户规则，由前端 Income Service 叠加（Worker 无规则知识）。
 */
import type { Env } from "../env";
import { legacyFetch, legacyJson, LegacyError } from "./client";

/** 收入记录（任务书 §二 / SPEC §2；与前端 service 层同形契约） */
export interface IncomeRecord {
  orderNo: string;
  awardTime: string;
  issueTime?: string;
  goodsName: string;
  legacyAmount: number | null;
}

/** 扣款记录（[VERIFIED-STATIC] memberSubIncome.js parseData 行字段） */
export interface DeductionRecord {
  orderno: string;
  typename: string;
  designerDeduction: number | null;
  reason: string;
  deductTime: string;
}

export type IncomeRange = "month" | "all";

export interface IncomeQuery {
  range: IncomeRange;
  /** yyyy-MM；前端必传，缺省 = UTC 当前月（Workers 运行 UTC，前端按本地时区显式传） */
  month: string;
  page: number;
  limit: number;
}

const MONTH_RE = /^\d{4}-(?:0[1-9]|1[0-2])$/;

/** 当前月（UTC）——仅 month 缺省时兜底；前端必须显式传本地时区月 */
function currentMonthUtc(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function parseIncomeQuery(url: URL): IncomeQuery {
  const rawMonth = (url.searchParams.get("month") ?? "").trim();
  const rangeRaw = (url.searchParams.get("range") ?? "month").trim();
  const range: IncomeRange = rangeRaw === "all" ? "all" : "month";
  const month = rawMonth || currentMonthUtc();
  if (!MONTH_RE.test(month)) {
    throw new LegacyError(400, "BAD_MONTH", "month 必须为 yyyy-MM 格式");
  }
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? "20") || 20));
  return { range, month, page, limit };
}

/** moneys 归一：数字 → number；缺省/非数字 → null（禁 0，SPEC §4） */
export function normalizeMoneys(data: unknown): number | null {
  if (data == null || typeof data !== "object") return null;
  const raw = (data as Record<string, unknown>).moneys;
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** childProceeds 归一：数字 → number；空/非法 → null（禁 0） */
export function parseChildProceeds(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** 收入明细行 → IncomeRecord（ordernum 缺失行丢弃；goodsId 由前端映射，Worker 不猜） */
export function mapIncomeRecord(raw: Record<string, unknown>): IncomeRecord | null {
  const orderNo = String(raw.ordernum ?? "").trim();
  if (!orderNo) return null;
  const issueTime = String(raw.issuingtime ?? "").trim();
  return {
    orderNo,
    awardTime: String(raw.createtime ?? raw.createtimestr ?? ""),
    issueTime: issueTime || undefined,
    goodsName: String(raw.goodsname ?? ""),
    legacyAmount: parseChildProceeds(raw.childProceeds)
  };
}

/** 扣款明细行 → DeductionRecord */
export function mapDeductionRecord(raw: Record<string, unknown>): DeductionRecord {
  const amount = raw.designerDeduction;
  const n = amount == null || amount === "" ? null : Number(amount);
  return {
    orderno: String(raw.orderno ?? ""),
    typename: String(raw.typename ?? ""),
    designerDeduction: n != null && Number.isFinite(n) ? n : null,
    reason: String(raw.reason ?? ""),
    deductTime: String(raw.createTime ?? "")
  };
}

/** 折线归一：data 缺省 → 空数组（禁伪造 0 序列） */
export function normalizeTrend(data: unknown): {
  dates: string[];
  systemIncome: number[];
  deduction: number[];
} {
  if (data == null || typeof data !== "object") {
    return { dates: [], systemIncome: [], deduction: [] };
  }
  const d = data as Record<string, unknown>;
  const toNumArr = (v: unknown): number[] =>
    Array.isArray(v) ? v.map(x => Number(x) || 0) : [];
  return {
    dates: Array.isArray(d.dates) ? d.dates.map(x => String(x)) : [],
    systemIncome: toNumArr(d.incomMoneys),
    deduction: toNumArr(d.deductMoneys)
  };
}

// ── 旧系统六端点调用（每函数一个 endpoint，client.ts 白名单纪律）──

/** getThisMonthIncome（range=month）/ getAllIncome（range=all）+ getIncomeList(total) */
export async function fetchLegacyIncomeSummary(
  env: Env,
  legacyCookie: string,
  query: IncomeQuery
): Promise<Record<string, unknown>> {
  const moneysRes =
    query.range === "all"
      ? await legacyJson<{ data?: unknown }>(
          await legacyFetch(env, "/chsjs/child/getAllIncome.do", {
            legacyCookie,
            method: "POST",
            json: {}
          })
        )
      : await legacyJson<{ data?: unknown }>(
          await legacyFetch(env, "/chsjs/child/getThisMonthIncome.do", {
            legacyCookie,
            method: "POST",
            form: { queryTime: query.month }
          })
        );
  // orderCount = getIncomeList 首页 limit=1 的 pageInfo.total（不拉明细）
  const listRes = await legacyJson<{ data?: { pageInfo?: { total?: number } } }>(
    await legacyFetch(env, "/chsjs/child/getIncomeList.do", {
      legacyCookie,
      method: "POST",
      form: { queryTime: query.month, page: 1, limit: 1 }
    })
  );
  const systemIncome = normalizeMoneys(moneysRes.data);
  const orderCount = Number(listRes.data?.pageInfo?.total ?? 0);
  const avgPerOrder =
    systemIncome != null && orderCount > 0
      ? Math.round((systemIncome / orderCount) * 100) / 100
      : null;
  return {
    range: query.range === "all" ? "all" : "month",
    systemIncome,
    orderCount,
    avgPerOrder
  };
}

/** querySameMonthData → 折线（日粒度收入/罚款，按 createtime 落日 [VERIFIED 闭合]） */
export async function fetchLegacyIncomeTrend(
  env: Env,
  legacyCookie: string,
  query: IncomeQuery
): Promise<Record<string, unknown>> {
  const res = await legacyJson<{ data?: unknown }>(
    await legacyFetch(env, "/chsjs/child/querySameMonthData.do", {
      legacyCookie,
      method: "POST",
      form: { queryTime: query.month }
    })
  );
  return normalizeTrend(res.data);
}

/** getIncomeList 分页 → { list: IncomeRecord[], total } */
export async function fetchLegacyIncomeOrders(
  env: Env,
  legacyCookie: string,
  query: IncomeQuery
): Promise<Record<string, unknown>> {
  const res = await legacyJson<{ data?: { pageInfo?: Record<string, unknown> } }>(
    await legacyFetch(env, "/chsjs/child/getIncomeList.do", {
      legacyCookie,
      method: "POST",
      form: { queryTime: query.month, page: query.page, limit: query.limit }
    })
  );
  const pageInfo = res.data?.pageInfo ?? {};
  const rawList = Array.isArray(pageInfo.dataList) ? pageInfo.dataList : [];
  const list = rawList
    .map(r => mapIncomeRecord(r as Record<string, unknown>))
    .filter((r): r is IncomeRecord => r != null);
  return { list, total: Number(pageInfo.total ?? list.length) };
}

/** getDeductionList 分页 → { list: DeductionRecord[], total } */
export async function fetchLegacyIncomeDeductions(
  env: Env,
  legacyCookie: string,
  query: IncomeQuery
): Promise<Record<string, unknown>> {
  const res = await legacyJson<{ data?: { pageInfo?: Record<string, unknown> } }>(
    await legacyFetch(env, "/chsjs/child/getDeductionList.do", {
      legacyCookie,
      method: "POST",
      form: { queryTime: query.month, page: query.page, limit: query.limit }
    })
  );
  const pageInfo = res.data?.pageInfo ?? {};
  const rawList = Array.isArray(pageInfo.dataList) ? pageInfo.dataList : [];
  const list = rawList.map(r => mapDeductionRecord(r as Record<string, unknown>));
  return { list, total: Number(pageInfo.total ?? list.length) };
}

// ── Mock（LEGACY_API_ENABLED=false 显式开关，脱敏静态样本；禁隐式回退）──

export async function fetchMockIncomeSummary(): Promise<Record<string, unknown>> {
  const mod = await import("./mock-data/income.json");
  return (mod.default ?? mod).summary;
}

export async function fetchMockIncomeTrend(): Promise<Record<string, unknown>> {
  const mod = await import("./mock-data/income.json");
  return (mod.default ?? mod).trend;
}

export async function fetchMockIncomeOrders(): Promise<Record<string, unknown>> {
  const mod = await import("./mock-data/income.json");
  return (mod.default ?? mod).orders;
}

export async function fetchMockIncomeDeductions(): Promise<Record<string, unknown>> {
  const mod = await import("./mock-data/income.json");
  return (mod.default ?? mod).deductions;
}

export { LegacyError };
