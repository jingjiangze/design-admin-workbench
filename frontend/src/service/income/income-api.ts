/**
 * 收入域 HTTP 客户端 —— /api/income/* 四端点（P1-04 Worker 白名单）
 *
 * Real：/api/income/*（Cloudflare Worker → 六真实端点，docs/INCOME_SOURCE_AUDIT.md）
 * Mock：本地脱敏样本（VITE_LEGACY_API_ENABLED 未开启；显式开关，禁隐式回退）
 * 响应信封 {result, data}；API 失败向上 throw（红线：禁 fallback 假数据）。
 */
import qs from "qs";
import { http } from "@/utils/http";
import { isLegacyRealEnabled } from "../gateway";
import mockSample from "../mock/income.json";
import type { IncomeRecord } from "./income-record";

/** 结构化克隆，避免 Mock 引用共享可变状态 */
function mockData(): typeof mockSample {
  return structuredClone(mockSample);
}

export interface IncomeSummaryData {
  range: "month" | "all";
  systemIncome: number | null;
  orderCount: number;
  avgPerOrder: number | null;
}

export interface IncomeOrdersData {
  list: IncomeRecord[];
  total: number;
}

export interface DeductionRecord {
  orderno: string;
  typename: string;
  designerDeduction: number | null;
  reason: string;
  deductTime: string;
}

export interface IncomeDeductionsData {
  list: DeductionRecord[];
  total: number;
}

export interface IncomeTrendData {
  dates: string[];
  systemIncome: number[];
  deduction: number[];
}

export type IncomeRangeParam = "month" | "all";

export async function fetchIncomeSummary(params: {
  range: IncomeRangeParam;
  month: string;
}): Promise<IncomeSummaryData> {
  if (!isLegacyRealEnabled()) {
    return mockData().summary as IncomeSummaryData;
  }
  const body = await http.request<{ result: boolean; data: IncomeSummaryData }>(
    "get",
    `/api/income/summary?${qs.stringify({ range: params.range, month: params.month })}`,
    { timeout: 15000 }
  );
  return body.data;
}

export async function fetchIncomeTrend(
  month: string
): Promise<IncomeTrendData> {
  if (!isLegacyRealEnabled()) {
    return mockData().trend as IncomeTrendData;
  }
  const body = await http.request<{ result: boolean; data: IncomeTrendData }>(
    "get",
    `/api/income/trend?${qs.stringify({ month })}`,
    { timeout: 15000 }
  );
  return body.data;
}

/** 月明细全量拉取（分页 limit=100；上限 10 页保护——SPEC §5，超限抛错而非静默截断）
 *  性能（2026-09-21）：首页拿 total 后剩余页并发拉取（此前串行 for，
 *  3 页 = 3 倍 RTT；并发 3 对旧系统限流友好） */
export async function fetchIncomeMonthRecords(
  month: string,
  maxPages = 10
): Promise<{ list: IncomeRecord[]; total: number; truncated: boolean }> {
  if (!isLegacyRealEnabled()) {
    const m = mockData().orders as IncomeOrdersData;
    return { list: m.list, total: m.total, truncated: false };
  }
  const fetchPage = (page: number) =>
    http.request<{ result: boolean; data: IncomeOrdersData }>(
      "get",
      `/api/income/orders?${qs.stringify({ month, page, limit: 100 })}`,
      { timeout: 15000 }
    );

  const first = await fetchPage(1);
  const total = first.data.total;
  const all: IncomeRecord[] = [...(first.data.list ?? [])];
  if (all.length >= total || (first.data.list ?? []).length === 0) {
    return { list: all, total, truncated: all.length < total };
  }

  const totalPages = Math.min(maxPages, Math.ceil(total / 100));
  const rest = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, i) => fetchPage(i + 2))
  );
  for (const body of rest) all.push(...(body.data.list ?? []));
  return { list: all, total, truncated: all.length < total };
}

export async function fetchIncomeDeductions(params: {
  month: string;
  page?: number;
  limit?: number;
}): Promise<IncomeDeductionsData> {
  if (!isLegacyRealEnabled()) {
    return mockData().deductions as IncomeDeductionsData;
  }
  const body = await http.request<{
    result: boolean;
    data: IncomeDeductionsData;
  }>(
    "get",
    `/api/income/deductions?${qs.stringify({
      month: params.month,
      page: params.page ?? 1,
      limit: params.limit ?? 50
    })}`,
    { timeout: 15000 }
  );
  return body.data;
}
