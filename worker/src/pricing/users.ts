/**
 * users 表辅助 —— 只登记身份（user_key），绝不保存密码（长文 §十五）
 */
import type { Env } from "../env";

/** 登录成功 / 首次写规则时 upsert 用户身份行（幂等） */
export async function ensureUser(db: Env["DB"], userKey: string): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO users (user_id, user_key, created_at, last_login_at)
       VALUES (?1, ?2, ?3, ?3)
       ON CONFLICT(user_key) DO UPDATE SET last_login_at = ?3`
    )
    .bind(crypto.randomUUID(), userKey, now)
    .run();
}

/** user_key → user_id（pricing 规则外键）；不存在时自动补登记 */
export async function resolveUserId(db: Env["DB"], userKey: string): Promise<string> {
  const row = await db
    .prepare("SELECT user_id FROM users WHERE user_key = ?1")
    .bind(userKey)
    .first<{ user_id: string }>();
  if (row?.user_id) return row.user_id;
  await ensureUser(db, userKey);
  const created = await db
    .prepare("SELECT user_id FROM users WHERE user_key = ?1")
    .bind(userKey)
    .first<{ user_id: string }>();
  if (!created?.user_id) throw new Error("ensure_user_failed");
  return created.user_id;
}
