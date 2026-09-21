/**
 * design-admin-workbench Worker —— 主路由
 *
 * 架构（docs/CLOUDFLARE_ARCHITECTURE.md）：
 *   /api/*  → Worker（run_worker_first）：auth / orders / reminders / pricing / health
 *   其余    → Static Assets（frontend/dist，SPA fallback）
 *
 * 路由白名单（长文 §二十四）：每条 API 显式映射一个 legacy endpoint，
 * 无 /api/proxy?url= 开放代理。GET-only 纪律见 legacy/client.ts。
 */
import type { Env } from "./env";
import { isLegacyEnabled } from "./env";
import { handleAuth, legacyCookieOf } from "./auth/routes";
import { handlePricingRules } from "./pricing/routes";
import { requireSession, jsonOk, jsonError, type AuthContext } from "./security/auth";
import { parseOrderListQuery, fetchLegacyOrderList, fetchMockOrderList } from "./legacy/order";
import { parseDetailQuery, fetchLegacyOrderDetail, fetchMockOrderDetail } from "./legacy/detail";
import { parseRemindQuery, fetchLegacyRemindList, fetchMockRemindList, normalizeRemindInbox } from "./legacy/remind";
import {
  parseIncomeQuery,
  fetchLegacyIncomeSummary,
  fetchLegacyIncomeTrend,
  fetchLegacyIncomeOrders,
  fetchLegacyIncomeDeductions,
  fetchMockIncomeSummary,
  fetchMockIncomeTrend,
  fetchMockIncomeOrders,
  fetchMockIncomeDeductions
} from "./legacy/income";
import { handleAcceptance } from "./acceptance/routes";
import { handleScheduledAcceptance } from "./acceptance/cron";
import { handleWorkflow } from "./workflow/routes";
import {
  parsePriceChangeQuery,
  fetchLegacyPriceChange
} from "./legacy/price-change";
import { LegacyError } from "./legacy/client";

export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // ── CORS 预检（同源部署正常用不到；预留显式拒绝而非开放） ──
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204 });
    }

    try {
      // ── 健康检查：无认证 ──
      if (path === "/api/health" && request.method === "GET") {
        return jsonOk({
          result: true,
          data: {
            status: "ok",
            mode: isLegacyEnabled(env) ? "legacy" : "mock",
            time: new Date().toISOString()
          }
        });
      }

      // ── 公开配置（无认证）：登录页读取 Turnstile site key 与运行模式 ──
      if (path === "/api/config" && request.method === "GET") {
        return jsonOk({
          result: true,
          data: {
            mode: isLegacyEnabled(env) ? "legacy" : "mock",
            turnstileSiteKey: env.TURNSTILE_SITE_KEY ?? null
          }
        });
      }

      // ── 认证（login 无会话要求；logout/me 内部自行校验） ──
      if (path.startsWith("/api/auth/")) {
        return await handleAuth(env, request, path);
      }

      // ── 以下全部要求有效 Session（长文 §二十七） ──
      const auth = await requireSession(env, request);
      if (!auth.ok) return auth.response;
      const ctx: AuthContext = auth.ctx;

      // ── 金额规则（D1 纯业务） ──
      if (path.startsWith("/api/pricing/rules")) {
        return await handlePricingRules(env, request, path, ctx);
      }

      // ── 订单列表（GET /api/orders）──
      if (path === "/api/orders" && request.method === "GET") {
        const query = parseOrderListQuery(url);
        if (isLegacyEnabled(env)) {
          const cookie = await legacyCookieOf(env, ctx);
          const data = await fetchLegacyOrderList(env, cookie, query);
          return jsonOk(data);
        }
        return jsonOk(await fetchMockOrderList(env, query));
      }

      // ── 订单详情（GET /api/orders/detail?needsid=|applyid=）── HTML 透传
      if (path === "/api/orders/detail" && request.method === "GET") {
        const query = parseDetailQuery(url);
        if (isLegacyEnabled(env)) {
          const cookie = await legacyCookieOf(env, ctx);
          const upstream = await fetchLegacyOrderDetail(env, cookie, query);
          const headers = new Headers({
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff"
          });
          const upstreamType = upstream.headers.get("Content-Type");
          headers.set("Content-Type", upstreamType ?? "text/html; charset=utf-8");
          return new Response(upstream.body, { status: 200, headers });
        }
        return withNoStore(await fetchMockOrderDetail(query.needsid ?? query.applyid ?? ""));
      }

      // ── 改价申请/改价记录（GET /api/orders/price-change?orderNo=）── JSON 透传
      // [VERIFIED 2026-09-21] 上游 = GET /chsjs/editNeeds/query?ordernum=（详情页改价记录按钮）
      if (path === "/api/orders/price-change" && request.method === "GET") {
        const orderNo = parsePriceChangeQuery(url);
        if (isLegacyEnabled(env)) {
          const cookie = await legacyCookieOf(env, ctx);
          const upstream = await fetchLegacyPriceChange(env, cookie, orderNo);
          return jsonOk((await upstream.json()) as unknown);
        }
        return jsonOk({ result: false, message: "MOCK 模式无改价记录" });
      }

      // ── 催稿收件箱（GET /api/reminders）──
      // [VERIFIED 2026-09-20] 上游 = getReminderMessageNew.do（GET 分页 JSON）；
      // reminderMessage.do 是 HTML 页面，不能作为数据源。此处做 pageInfo → {list,total} 适配。
      if (path === "/api/reminders" && request.method === "GET") {
        const query = parseRemindQuery(url);
        if (isLegacyEnabled(env)) {
          const cookie = await legacyCookieOf(env, ctx);
          const raw = await fetchLegacyRemindList(env, cookie, query);
          return jsonOk(normalizeRemindInbox(raw, query));
        }
        return jsonOk(await fetchMockRemindList(query));
      }

      // ── 收入域（GET /api/income/summary|trend|orders|deductions）──
      // P1-04：真实六端点严格白名单（docs/INCOME_SOURCE_AUDIT.md / INCOME_CUTOVER_SPEC.md §4），
      // 取代原 getOrderList 语义别名（已删除）。myIncome/undefinedCount 由前端规则引擎叠加填充
      //（Worker 无规则知识，Free CPU 纪律）。无开放代理能力。
      if (path.startsWith("/api/income/")) {
        if (request.method !== "GET") return jsonError(405, "METHOD_NOT_ALLOWED", "仅 GET");
        const incomeQuery = parseIncomeQuery(url);
        if (isLegacyEnabled(env)) {
          const cookie = await legacyCookieOf(env, ctx);
          switch (path) {
            case "/api/income/summary":
              return jsonOk(await fetchLegacyIncomeSummary(env, cookie, incomeQuery));
            case "/api/income/trend":
              return jsonOk(await fetchLegacyIncomeTrend(env, cookie, incomeQuery));
            case "/api/income/orders":
              return jsonOk(await fetchLegacyIncomeOrders(env, cookie, incomeQuery));
            case "/api/income/deductions":
              return jsonOk(await fetchLegacyIncomeDeductions(env, cookie, incomeQuery));
            default:
              return jsonError(404, "NOT_FOUND", "收入端点不存在（summary/trend/orders/deductions）");
          }
        }
        switch (path) {
          case "/api/income/summary":
            return jsonOk(await fetchMockIncomeSummary());
          case "/api/income/trend":
            return jsonOk(await fetchMockIncomeTrend());
          case "/api/income/orders":
            return jsonOk(await fetchMockIncomeOrders());
          case "/api/income/deductions":
            return jsonOk(await fetchMockIncomeDeductions());
          default:
            return jsonError(404, "NOT_FOUND", "收入端点不存在（summary/trend/orders/deductions）");
        }
      }

      // ── 接单开关 + 定时关闭（GET status / POST toggle / schedule CRUD）──
      // 写操作已获用户授权（2026-09-21，updateWorkState.do）；不真实测试切换。
      if (path.startsWith("/api/acceptance")) {
        return await handleAcceptance(env, request, path, ctx);
      }

      // ── 业务反馈 + 个人防漏单标记（WORKFLOW-V2：markers / takeover）──
      if (path.startsWith("/api/workflow")) {
        return await handleWorkflow(env, request, path, ctx);
      }

      // ── 其余 /api/* 一律 404（白名单之外不存在任何代理能力） ──
      if (path.startsWith("/api/")) {
        return jsonError(404, "NOT_FOUND", "API 端点不存在");
      }

      // ── 非 /api 请求 → Static Assets（含 SPA fallback） ──
      return env.ASSETS.fetch(request);
    } catch (e) {
      if (e instanceof LegacyError) {
        return jsonError(e.status, e.code, e.message);
      }
      return jsonError(500, "INTERNAL", "网关内部错误");
    }
  },

  // ── Cron Trigger：每 5 分钟检查到期定时关闭任务（acceptance/store.ts KV）──
  async scheduled(
    _event: ScheduledController,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<void> {
    await handleScheduledAcceptance(env);
  }
};

function withNoStore(res: Response): Response {
  const headers = new Headers(res.headers);
  headers.set("Cache-Control", "private, no-store");
  return new Response(res.body, { status: res.status, headers });
}
