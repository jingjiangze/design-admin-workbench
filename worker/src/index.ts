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
import { parseRemindQuery, fetchLegacyRemindList, fetchMockRemindList } from "./legacy/remind";
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

      // ── 催稿收件箱（GET /api/reminders）──
      if (path === "/api/reminders" && request.method === "GET") {
        const query = parseRemindQuery(url);
        if (isLegacyEnabled(env)) {
          const cookie = await legacyCookieOf(env, ctx);
          return jsonOk(await fetchLegacyRemindList(env, cookie, query));
        }
        return jsonOk(await fetchMockRemindList(query));
      }

      // ── 收入统计（GET /api/income/*）——语义别名：数据同 /api/orders，
      //    effectiveAmount 计算在前端 Domain Service（长文 §四十七 前端聚合），
      //    Worker 不重复实现收入逻辑（Free CPU 保护）。
      if (path === "/api/income/summary" || path === "/api/income/orders") {
        if (request.method !== "GET") return jsonError(405, "METHOD_NOT_ALLOWED", "仅 GET");
        const query = parseOrderListQuery(url);
        if (isLegacyEnabled(env)) {
          const cookie = await legacyCookieOf(env, ctx);
          return jsonOk(await fetchLegacyOrderList(env, cookie, query));
        }
        return jsonOk(await fetchMockOrderList(env, query));
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
  }
};

function withNoStore(res: Response): Response {
  const headers = new Headers(res.headers);
  headers.set("Cache-Control", "private, no-store");
  return new Response(res.body, { status: res.status, headers });
}
