/**
 * /api/workflow/* —— 业务反馈 + 个人防漏单标记（WORKFLOW-V2）
 *
 * 路由（全部要求有效 Session；写操作另过 assertWriteOrigin 三件套）：
 *   GET    /api/workflow/markers          当前用户全部绿点标记（?type=order|reminder 可选过滤）
 *   POST   /api/workflow/markers          {items:[{itemType,itemKey}]} 写本地"我已处理"标记
 *   DELETE /api/workflow/markers          {items:[...]} 取消标记（第一版无 UI 入口）
 *   POST   /api/workflow/takeover         {targets:[{applyId,orderId}]} 一键接单（旧系统真实写）
 *
 * 核心门禁（规格二十四/三十，最重要的防错条件）：
 *   legacyActionSuccess === false → 绝不写 localProcessedAt（绿点）；
 *   legacyActionSuccess === true  → 才写标记。门禁在 Worker 侧强制执行，
 *   前端无法绕过（标记写入只发生在旧系统成功分支内）。
 *
 * 接单批量策略：逐条调用 batchTakeover（单条 = 单元素批次），
 * 以获得逐项成败；部分失败时仅成功项写标记（规格九）。
 */
import type { Env } from "../env";
import { isLegacyEnabled } from "../env";
import type { AuthContext } from "../security/auth";
import { assertWriteOrigin, jsonOk, jsonError } from "../security/auth";
import { legacyCookieOf } from "../auth/routes";
import {
  validateMarkerItems,
  listMarkers,
  putMarkers,
  deleteMarkers,
  type MarkerItem
} from "./marker";
import { legacyTakeoverOne, mockTakeoverOne } from "./legacy-actions";

const ID_PATTERN = /^\d{1,20}$/;

interface TakeoverTarget {
  applyId: string;
  /** needsid（订单主键；标记锚定它而非 ordernum —— 规格十二） */
  orderId: string;
}

function parseTakeoverTargets(raw: unknown): TakeoverTarget[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 50) return null;
  const out: TakeoverTarget[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) return null;
    const { applyId, orderId } = item as Record<string, unknown>;
    if (
      typeof applyId !== "string" ||
      typeof orderId !== "string" ||
      !ID_PATTERN.test(applyId) ||
      !ID_PATTERN.test(orderId)
    ) {
      return null;
    }
    out.push({ applyId, orderId });
  }
  return out;
}

export async function handleWorkflow(
  env: Env,
  request: Request,
  path: string,
  ctx: AuthContext
): Promise<Response> {
  const userKey = ctx.session.userKey;

  // ── GET /api/workflow/markers ──
  if (path === "/api/workflow/markers" && request.method === "GET") {
    const url = new URL(request.url);
    const type = url.searchParams.get("type");
    if (type !== null && type !== "order" && type !== "reminder") {
      return jsonError(400, "BAD_REQUEST", "type 仅支持 order|reminder");
    }
    const list = await listMarkers(env.DB, userKey, type ?? undefined);
    return jsonOk({ result: true, data: { list } });
  }

  // ── POST /api/workflow/markers（本地"我已处理"，无旧系统调用） ──
  if (path === "/api/workflow/markers" && request.method === "POST") {
    const forbidden = await assertWriteOrigin(request, ctx);
    if (forbidden) return forbidden;

    let body: { items?: unknown };
    try {
      body = (await request.json()) as { items?: unknown };
    } catch {
      return jsonError(400, "BAD_REQUEST", "请求体必须是 JSON");
    }
    const items = validateMarkerItems(body.items);
    if (!items) {
      return jsonError(
        400,
        "BAD_REQUEST",
        "items 必须是 1~200 个 {itemType: order|reminder, itemKey: type:数字ID}"
      );
    }
    const processedAt = await putMarkers(env.DB, userKey, items as MarkerItem[]);
    return jsonOk({ result: true, data: { marked: items.length, processedAt } });
  }

  // ── DELETE /api/workflow/markers（取消已处理标记；第一版无 UI 入口） ──
  if (path === "/api/workflow/markers" && request.method === "DELETE") {
    const forbidden = await assertWriteOrigin(request, ctx);
    if (forbidden) return forbidden;

    let body: { items?: unknown };
    try {
      body = (await request.json()) as { items?: unknown };
    } catch {
      return jsonError(400, "BAD_REQUEST", "请求体必须是 JSON");
    }
    const items = validateMarkerItems(body.items);
    if (!items) {
      return jsonError(400, "BAD_REQUEST", "items 校验失败");
    }
    await deleteMarkers(env.DB, userKey, items as MarkerItem[]);
    return jsonOk({ result: true, data: { removed: items.length } });
  }

  // ── POST /api/workflow/takeover（旧系统真实接单；成功项才写绿点） ──
  if (path === "/api/workflow/takeover" && request.method === "POST") {
    const forbidden = await assertWriteOrigin(request, ctx);
    if (forbidden) return forbidden;

    let body: { targets?: unknown };
    try {
      body = (await request.json()) as { targets?: unknown };
    } catch {
      return jsonError(400, "BAD_REQUEST", "请求体必须是 JSON");
    }
    const targets = parseTakeoverTargets(body.targets);
    if (!targets) {
      return jsonError(
        400,
        "BAD_REQUEST",
        "targets 必须是 1~50 个 {applyId: 数字ID, orderId: 数字ID(needsid)}"
      );
    }

    const results: Array<{
      orderId: string;
      applyId: string;
      ok: boolean;
      message: string;
      processedAt?: string;
    }> = [];

    if (isLegacyEnabled(env)) {
      const cookie = await legacyCookieOf(env, ctx);
      for (const t of targets) {
        const r = await legacyTakeoverOne(env, cookie, t.applyId);
        if (r.ok) {
          // 门禁：只有旧系统成功才写标记（规格二十四）
          const processedAt = await putMarkers(env.DB, userKey, [
            { itemType: "order", itemKey: `order:${t.orderId}` }
          ]);
          results.push({ ...t, ok: true, message: r.message, processedAt });
        } else {
          results.push({ ...t, ok: false, message: r.message });
        }
        // 会话失效：剩余条目必然同样失败，立即中止（不循环重试旧系统）
        if (r.code === "LEGACY_SESSION_EXPIRED") break;
      }
    } else {
      // Mock 环境：不触旧系统，等价演示完整链路（含绿点）
      for (const t of targets) {
        const r = mockTakeoverOne(t.applyId);
        const processedAt = await putMarkers(env.DB, userKey, [
          { itemType: "order", itemKey: `order:${t.orderId}` }
        ]);
        results.push({ ...t, ok: r.ok, message: r.message, processedAt });
      }
    }

    return jsonOk({ result: true, data: { results } });
  }

  return jsonError(404, "NOT_FOUND", "未知 workflow 端点");
}
