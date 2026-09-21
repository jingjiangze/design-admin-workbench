/**
 * 金额规则域 HTTP 客户端 —— /api/pricing/rules CRUD（P1-05 Worker→D1）
 *
 * 金额规则是新系统自有数据（D1 持久化，无旧系统对应物）：
 * - 无 Mock 通道（D1 在所有模式均可用）；服务端不可达时由 store 侧
 *   降级（本地镜像继续可读，写意图排队重试），本文件不做假数据回退
 *   （红线：API 失败禁 fallback 假数据）。
 * - 响应信封 {result, data}；非 2xx / result=false 一律 throw。
 * - CSRF：axios 请求拦截器统一注入 X-CSRF-Token（http/index.ts）。
 * - http 客户端惰性加载：测试注入传输层后不拉起 store/router 模块链。
 */
import type { PricingRule } from "./pricing-rule-types";

/** 服务端规则行形态（GET list 响应） */
interface RuleRow {
  id: string;
  goodsId: string;
  subGoodsId: string | null;
  productName: string;
  amount: number | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Envelope<T> {
  result: boolean;
  data: T;
}

export type PricingHttpMethod = "get" | "post" | "put" | "delete";

/** 传输层签名（测试注入内存实现；生产 = axios http） */
export type PricingHttpCall = (
  method: PricingHttpMethod,
  url: string,
  body?: unknown
) => Promise<Envelope<unknown>>;

async function defaultCall(
  method: PricingHttpMethod,
  url: string,
  body?: unknown
): Promise<Envelope<unknown>> {
  const { http } = await import("@/utils/http");
  const config =
    body !== undefined ? { data: body, timeout: 15000 } : { timeout: 15000 };
  const res = await http.request<Envelope<unknown>>(method, url, config);
  if (!res || res.result !== true) {
    throw new Error(
      (res as { message?: string } | null)?.message ?? "金额规则接口响应异常"
    );
  }
  return res;
}

let transport: PricingHttpCall = defaultCall;

/** 测试注入（传 null 恢复默认传输层） */
export function injectPricingHttp(fn: PricingHttpCall | null): void {
  transport = fn ?? defaultCall;
}

function rowToRule(r: RuleRow): PricingRule {
  return {
    id: r.id,
    goodsId: r.goodsId,
    subGoodsId: r.subGoodsId ?? undefined,
    productName: r.productName,
    amount: r.amount,
    enabled: Boolean(r.enabled),
    source: "user",
    updatedAt: r.updatedAt
  };
}

/** GET /api/pricing/rules —— 当前用户全部规则 */
export async function fetchRules(): Promise<PricingRule[]> {
  const res = await transport("get", "/api/pricing/rules");
  const list = ((res.data as { list?: RuleRow[] })?.list ?? []) as RuleRow[];
  return list.map(rowToRule);
}

/** POST /api/pricing/rules —— upsert（唯一键 user+goodsId+subGoodsId），返回真实行 id */
export async function pushRule(rule: {
  goodsId: string;
  subGoodsId?: string;
  productName: string;
  amount: number | null;
  enabled: boolean;
}): Promise<string> {
  const res = await transport("post", "/api/pricing/rules", {
    goodsId: rule.goodsId,
    subGoodsId: rule.subGoodsId ?? null,
    productName: rule.productName,
    amount: rule.amount,
    enabled: rule.enabled
  });
  const id = (res.data as { id?: string })?.id;
  if (!id) throw new Error("金额规则 upsert 未返回行 id");
  return id;
}

/** PUT /api/pricing/rules/:id —— 已同步行的金额/启停更新 */
export async function patchRule(
  id: string,
  patch: { amount?: number | null; enabled?: boolean }
): Promise<void> {
  await transport("put", `/api/pricing/rules/${encodeURIComponent(id)}`, patch);
}

/** DELETE /api/pricing/rules/:id —— 恢复系统金额 */
export async function deleteRule(id: string): Promise<void> {
  await transport("delete", `/api/pricing/rules/${encodeURIComponent(id)}`);
}
