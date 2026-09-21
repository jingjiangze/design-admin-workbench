/**
 * work_item_marker —— D1 个人防漏单标记存储（WORKFLOW-V2 规格十一/十二/十三）
 *
 * 语义红线：
 * - 标记只表示"当前用户已确认完成对应操作"（绿点），不是旧系统状态、
 *   不是已读、不是已联系、不是客户状态；
 * - item_key 锚定旧系统主键：order:{needsid} / reminder:{reminderId}，
 *   禁用 ordernum（一个订单号可能对应多个需求）；
 * - 幂等：唯一索引 (user_key, item_type, item_key)，重复标记保留首次 processed_at；
 * - 用户隔离：user_key 一律取自 Worker Session，绝不信前端传参。
 */
import type { D1Database } from "../types-cloudflare";

export const MARKER_ITEM_TYPES = new Set(["order", "reminder"]);

/** item_key 形态：order:{needsid} / reminder:{reminderId}（主键为数字 ID） */
const ITEM_KEY_PATTERN = /^(order|reminder):[A-Za-z0-9_-]{1,64}$/;

export interface MarkerItem {
  itemType: string;
  itemKey: string;
}

export interface MarkerRow {
  itemType: string;
  itemKey: string;
  processedAt: string;
}

/** 校验并归一化前端传入的标记条目；非法返回 null（调用方决定拒绝策略） */
export function validateMarkerItem(raw: unknown): MarkerItem | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { itemType, itemKey } = raw as Record<string, unknown>;
  if (typeof itemType !== "string" || !MARKER_ITEM_TYPES.has(itemType)) {
    return null;
  }
  if (typeof itemKey !== "string" || !ITEM_KEY_PATTERN.test(itemKey)) {
    return null;
  }
  // key 前缀必须与 type 同源（防 order 类型携带 reminder:key）
  if (!itemKey.startsWith(`${itemType}:`)) return null;
  return { itemType, itemKey };
}

export function validateMarkerItems(raw: unknown): MarkerItem[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 200) return null;
  const out: MarkerItem[] = [];
  for (const item of raw) {
    const valid = validateMarkerItem(item);
    if (!valid) return null;
    out.push(valid);
  }
  return out;
}

/** 列出当前用户的全部标记（可选按类型过滤） */
export async function listMarkers(
  db: D1Database,
  userKey: string,
  itemType?: string
): Promise<MarkerRow[]> {
  const stmt = itemType
    ? db
        .prepare(
          `SELECT item_type, item_key, processed_at FROM work_item_marker
           WHERE user_key = ?1 AND item_type = ?2 ORDER BY processed_at DESC`
        )
        .bind(userKey, itemType)
    : db
        .prepare(
          `SELECT item_type, item_key, processed_at FROM work_item_marker
           WHERE user_key = ?1 ORDER BY processed_at DESC`
        )
        .bind(userKey);
  const rows = await stmt.all();
  return rows.results.map(r => ({
    itemType: String(r.item_type),
    itemKey: String(r.item_key),
    processedAt: String(r.processed_at)
  }));
}

/**
 * 批量写入标记（幂等）：已存在的 (user,type,key) 保留首次 processed_at。
 * 返回本次写入使用的 processed_at（ISO）。
 */
export async function putMarkers(
  db: D1Database,
  userKey: string,
  items: MarkerItem[]
): Promise<string> {
  const now = new Date().toISOString();
  const stmts = items.map(item =>
    db
      .prepare(
        `INSERT INTO work_item_marker
           (id, user_key, item_type, item_key, processed_at, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5, ?5)
         ON CONFLICT (user_key, item_type, item_key) DO NOTHING`
      )
      .bind(
        crypto.randomUUID(),
        userKey,
        item.itemType,
        item.itemKey,
        now
      )
  );
  await db.batch(stmts);
  return now;
}

/** 批量删除标记（用户明确"取消已处理标记"时用；第一版无 UI 入口） */
export async function deleteMarkers(
  db: D1Database,
  userKey: string,
  items: MarkerItem[]
): Promise<void> {
  const stmts = items.map(item =>
    db
      .prepare(
        `DELETE FROM work_item_marker
         WHERE user_key = ?1 AND item_type = ?2 AND item_key = ?3`
      )
      .bind(userKey, item.itemType, item.itemKey)
  );
  await db.batch(stmts);
}
