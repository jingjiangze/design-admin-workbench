/**
 * /api/pricing/rules —— 自定义金额规则 CRUD（D1，新系统自有数据）
 *
 * 安全模型（长文 §四十九）：user_id 一律取自 Worker Session（session.userKey →
 * users.user_id），绝不信前端传参；全部 WHERE user_id = session 归属，防 IDOR。
 * 写请求（POST/PUT/DELETE）须过 assertWriteOrigin（SameSite + Origin + CSRF）。
 *
 * 语义对齐前端 pricing-rule-store：
 * - amount = null 表示"未设置"（UNDEFINED，绝不落 0 —— 长文 §二十）；
 * - 同一 (user, goodsId, subGoodsId) 唯一（表达式唯一索引，防 NULL 重复）；
 * - DELETE = 恢复系统金额（清除规则行）。
 */
import type { Env } from "../env";
import type { AuthContext } from "../security/auth";
import {
  jsonOk,
  jsonError,
  assertWriteOrigin
} from "../security/auth";
import { resolveUserId } from "./users";

interface RuleBody {
  goodsId?: string;
  subGoodsId?: string | null;
  productName?: string;
  /** null = 未设置（显式区分 0） */
  amount?: number | null;
  enabled?: boolean;
}

const MAX_RULES_PER_USER = 500;

function validateAmount(amount: number | null | undefined): number | null {
  if (amount === null || amount === undefined) return null;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0 || amount > 10_000_000) {
    throw new Error("BAD_AMOUNT");
  }
  return amount;
}

/** 非抛出版：非法返回 undefined（与 null=未设置 区分） */
function validateAmountSafe(amount: number | null | undefined): number | null | undefined {
  if (amount === null) return null;
  if (amount === undefined) return undefined;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0 || amount > 10_000_000) {
    return undefined;
  }
  return amount;
}

function validateGoodsId(id: string | undefined, field: string): string {
  if (!id || !/^[A-Za-z0-9_\-]{1,64}$/.test(id)) {
    throw new Error(`BAD_${field}`);
  }
  return id;
}

export async function handlePricingRules(
  env: Env,
  request: Request,
  path: string,
  ctx: AuthContext
): Promise<Response> {
  const db = env.DB;

  // GET /api/pricing/rules —— 当前用户全部规则
  if (request.method === "GET" && path === "/api/pricing/rules") {
    const userId = await resolveUserId(db, ctx.session.userKey);
    const rows = await db
      .prepare(
        `SELECT id, goods_id, sub_goods_id, product_name, amount, enabled, created_at, updated_at
         FROM pricing_rules WHERE user_id = ?1 ORDER BY updated_at DESC`
      )
      .bind(userId)
      .all();
    return jsonOk({
      result: true,
      data: {
        list: rows.results.map(r => ({
          id: r.id,
          goodsId: r.goods_id,
          subGoodsId: r.sub_goods_id ?? null,
          productName: r.product_name,
          amount: r.amount, // null = 未设置
          enabled: Number(r.enabled) === 1,
          createdAt: r.created_at,
          updatedAt: r.updated_at
        }))
      }
    });
  }

  // POST /api/pricing/rules —— upsert（按 user+goodsId+subGoodsId 唯一键）
  if (request.method === "POST" && path === "/api/pricing/rules") {
    const csrf = await assertWriteOrigin(request, ctx);
    if (csrf) return csrf;

    let body: RuleBody;
    try {
      body = (await request.json()) as RuleBody;
    } catch {
      return jsonError(400, "BAD_REQUEST", "请求体必须是 JSON");
    }
    let goodsId: string;
    let amount: number | null;
    try {
      goodsId = validateGoodsId(body.goodsId, "GOODSID");
      amount = validateAmount(body.amount);
    } catch (e) {
      const code = e instanceof Error ? e.message : "BAD_REQUEST";
      return jsonError(400, code, "参数非法（goodsId/amount）");
    }
    if (!body.productName || body.productName.length > 200) {
      return jsonError(400, "BAD_PRODUCT_NAME", "productName 必填且 ≤200 字符");
    }
    const subGoodsId =
      body.subGoodsId && /^[A-Za-z0-9_\-]{1,64}$/.test(body.subGoodsId)
        ? body.subGoodsId
        : null;

    const userId = await resolveUserId(db, ctx.session.userKey);
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    // 限额保护（Free 档 rows write 100k/天）——插入前预检，拒绝即不落行
    const count = await db
      .prepare("SELECT COUNT(*) AS c FROM pricing_rules WHERE user_id = ?1")
      .bind(userId)
      .first<{ c: number }>();
    if ((count?.c ?? 0) >= MAX_RULES_PER_USER) {
      return jsonError(429, "RULE_LIMIT", "规则数量超限（500）");
    }

    // 唯一键冲突 → 覆盖更新（upsert 语义）；RETURNING 返回真实行 id
    //（冲突时新 UUID 不落库，响应必须带既有行 id 供后续 PUT/DELETE）
    const upserted = await db
      .prepare(
        `INSERT INTO pricing_rules
           (id, user_id, goods_id, sub_goods_id, product_name, amount, enabled, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
         ON CONFLICT(user_id, goods_id, COALESCE(sub_goods_id, '')) DO UPDATE SET
           product_name = excluded.product_name,
           amount = excluded.amount,
           enabled = excluded.enabled,
           updated_at = excluded.updated_at
         RETURNING id`
      )
      .bind(id, userId, goodsId, subGoodsId, body.productName, amount, body.enabled === false ? 0 : 1, now)
      .first<{ id: string }>();

    return jsonOk({
      result: true,
      data: { id: upserted?.id ?? id, upserted: true }
    });
  }

  // DELETE /api/pricing/rules/:id —— 恢复系统金额
  const deleteMatch = /^\/api\/pricing\/rules\/([A-Za-z0-9\-]{1,64})$/.exec(path);
  if (request.method === "DELETE" && deleteMatch) {
    const csrf = await assertWriteOrigin(request, ctx);
    if (csrf) return csrf;
    const userId = await resolveUserId(db, ctx.session.userKey);
    const del = await db
      .prepare("DELETE FROM pricing_rules WHERE id = ?1 AND user_id = ?2")
      .bind(deleteMatch[1], userId)
      .run();
    if (!del.success || del.meta.changes === 0) {
      return jsonError(404, "RULE_NOT_FOUND", "规则不存在或不属于当前用户");
    }
    return jsonOk({ result: true, data: { deleted: deleteMatch[1] } });
  }

  // PUT /api/pricing/rules/:id —— 启用/禁用或改金额
  const putMatch = /^\/api\/pricing\/rules\/([A-Za-z0-9\-]{1,64})$/.exec(path);
  if (request.method === "PUT" && putMatch) {
    const csrf = await assertWriteOrigin(request, ctx);
    if (csrf) return csrf;
    let body: Partial<RuleBody>;
    try {
      body = (await request.json()) as Partial<RuleBody>;
    } catch {
      return jsonError(400, "BAD_REQUEST", "请求体必须是 JSON");
    }
    const userId = await resolveUserId(db, ctx.session.userKey);
    const now = new Date().toISOString();
    // 匿名占位符（?）按 SQL 出现顺序绑定——编号占位符（?N）在"单字段更新"
    // 时会出现索引断裂（?3 不在 SQL 中但 bind 有第 3 个值），D1 按
    // sqlite 参数序号映射会错位，因此这里必须用匿名占位符。
    const idParam = putMatch[1];
    const amountParam = body.amount !== undefined ? validateAmountSafe(body.amount) : undefined;
    if (body.amount !== undefined && amountParam === undefined && body.amount !== null) {
      return jsonError(400, "BAD_AMOUNT", "amount 非法");
    }
    const hasAmount = body.amount !== undefined;
    const hasEnabled = body.enabled !== undefined;
    if (!hasAmount && !hasEnabled) {
      return jsonError(400, "NOTHING_TO_UPDATE", "无可更新字段");
    }
    const sets: string[] = ["updated_at = ?"];
    const params: (string | number | null)[] = [now];
    if (hasAmount) {
      sets.push("amount = ?");
      params.push(amountParam ?? null);
    }
    if (hasEnabled) {
      sets.push("enabled = ?");
      params.push(body.enabled ? 1 : 0);
    }
    params.push(idParam, userId);
    const upd = await db
      .prepare(
        `UPDATE pricing_rules SET ${sets.join(", ")}
         WHERE id = ? AND user_id = ?`
      )
      .bind(...params)
      .run();
    if (!upd.success || upd.meta.changes === 0) {
      return jsonError(404, "RULE_NOT_FOUND", "规则不存在或不属于当前用户");
    }
    return jsonOk({ result: true, data: { updated: putMatch[1] } });
  }

  return jsonError(404, "NOT_FOUND", "未知规则端点");
}
