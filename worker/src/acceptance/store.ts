/**
 * 接单定时关闭 —— KV 存储（acceptance-schedule）
 *
 * KV key:   acc-sched:<userKey>      值 {userKey, closeAt, createdAt}，7d TTL 兜底自动清理
 *           acc-sched-result:<userKey> 最近一次执行结果（前端可查），7d TTL
 *
 * 执行方：Worker Cron Trigger（每 5 分钟，acceptance/cron.ts）。
 * 安全：schedule 记录不含任何凭据；cron 执行时实时反查该 userKey 的有效
 * Session 解密 Cookie（session.ts findLatestSessionByUserKey）。
 */
import type { Env } from "../env";

const SCHEDULE_PREFIX = "acc-sched:";
const RESULT_PREFIX = "acc-sched-result:";
/** 兜底 TTL：7 天后未执行的定时任务自动清理（防止永不触达的僵尸任务） */
const SCHEDULE_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface ScheduleRecord {
  userKey: string;
  /** ISO 时间 */
  closeAt: string;
  createdAt: string;
}

export interface ScheduleResultRecord {
  status: "CLOSED" | "REJECTED" | "SESSION_EXPIRED" | "ERROR";
  message?: string;
  at: string;
}

/** 校验 closeAt：必须在未来 1 分钟 ~ 7 天内 */
export function parseScheduleCloseAt(raw: unknown): Date | null {
  if (typeof raw !== "string") return null;
  const t = new Date(raw).getTime();
  if (!Number.isFinite(t)) return null;
  const now = Date.now();
  if (t < now + 60_000 || t > now + SCHEDULE_TTL_SECONDS * 1000) return null;
  return new Date(t);
}

export async function putSchedule(
  env: Env,
  userKey: string,
  closeAt: Date
): Promise<ScheduleRecord> {
  const record: ScheduleRecord = {
    userKey,
    closeAt: closeAt.toISOString(),
    createdAt: new Date().toISOString()
  };
  await env.SESSIONS.put(`${SCHEDULE_PREFIX}${userKey}`, JSON.stringify(record), {
    expirationTtl: SCHEDULE_TTL_SECONDS
  });
  return record;
}

export async function getSchedule(
  env: Env,
  userKey: string
): Promise<ScheduleRecord | null> {
  const raw = await env.SESSIONS.get(`${SCHEDULE_PREFIX}${userKey}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ScheduleRecord;
  } catch {
    return null;
  }
}

export async function deleteSchedule(env: Env, userKey: string): Promise<void> {
  await env.SESSIONS.delete(`${SCHEDULE_PREFIX}${userKey}`);
}

/** cron 全量列出未到期/待执行的定时任务（数量极小，直接全列） */
export async function listSchedules(env: Env): Promise<ScheduleRecord[]> {
  let cursor: string | undefined;
  const out: ScheduleRecord[] = [];
  do {
    const page = await env.SESSIONS.list({ prefix: SCHEDULE_PREFIX, cursor });
    for (const key of page.keys) {
      const raw = await env.SESSIONS.get(key.name);
      if (!raw) continue;
      try {
        out.push(JSON.parse(raw) as ScheduleRecord);
      } catch {
        // 跳过坏记录
      }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out;
}

export async function putScheduleResult(
  env: Env,
  userKey: string,
  result: ScheduleResultRecord
): Promise<void> {
  await env.SESSIONS.put(`${RESULT_PREFIX}${userKey}`, JSON.stringify(result), {
    expirationTtl: SCHEDULE_TTL_SECONDS
  });
}

export async function getScheduleResult(
  env: Env,
  userKey: string
): Promise<ScheduleResultRecord | null> {
  const raw = await env.SESSIONS.get(`${RESULT_PREFIX}${userKey}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ScheduleResultRecord;
  } catch {
    return null;
  }
}
