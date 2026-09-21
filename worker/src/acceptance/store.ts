/**
 * 接单定时关闭 —— KV 存储（acceptance-schedule）
 *
 * KV key:   acc-sched:<userKey>      值 ScheduleRecord，once 模式 7d TTL 兜底；
 *           acc-sched-result:<userKey> 最近一次执行结果（前端可查），7d TTL
 *                                    daily 模式 365d TTL（每次执行刷新）
 *
 * 模式（2026-09-21 用户指令"关闭定时接单默认是每天"）：
 * - once ：一次性到期关闭（旧行为，closeAt ISO 时间）
 * - daily：每天本地时刻 HH:mm 自动关闭（time = 用户本地时区时刻，
 *          tzOffsetMinutes = 本地相对 UTC 的分钟偏移，中国 +480）
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
/** daily 模式 TTL：KV 上限 1 年，每次执行刷新 */
const DAILY_TTL_SECONDS = 365 * 24 * 60 * 60;

export interface ScheduleRecord {
  userKey: string;
  mode: "once" | "daily";
  /** once：ISO 时间 */
  closeAt?: string;
  /** daily：用户本地时刻 HH:mm（24 小时制） */
  time?: string;
  /** daily：本地相对 UTC 的分钟偏移（本地 = UTC + 偏移；中国 +480） */
  tzOffsetMinutes?: number;
  /** daily：最近一次执行所在的用户本地日期 YYYY-MM-DD（防同日重复执行） */
  lastRunDate?: string;
  createdAt: string;
}

export interface ScheduleResultRecord {
  status: "CLOSED" | "REJECTED" | "SESSION_EXPIRED" | "ERROR";
  message?: string;
  at: string;
}

/** 校验 closeAt：必须在未来 1 分钟 ~ 7 天内（once 模式） */
export function parseScheduleCloseAt(raw: unknown): Date | null {
  if (typeof raw !== "string") return null;
  const t = new Date(raw).getTime();
  if (!Number.isFinite(t)) return null;
  const now = Date.now();
  if (t < now + 60_000 || t > now + SCHEDULE_TTL_SECONDS * 1000) return null;
  return new Date(t);
}

/** 校验 daily 输入：time = HH:mm（00:00~23:59），tzOffsetMinutes = 整数 */
export function parseDailySchedule(
  time: unknown,
  tzOffsetMinutes: unknown
): { time: string; tzOffsetMinutes: number } | null {
  if (typeof time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    return null;
  }
  let offset = 480; // 缺省按中国时区
  if (tzOffsetMinutes !== undefined) {
    if (
      typeof tzOffsetMinutes !== "number" ||
      !Number.isInteger(tzOffsetMinutes) ||
      tzOffsetMinutes < -840 ||
      tzOffsetMinutes > 840
    ) {
      return null;
    }
    offset = tzOffsetMinutes;
  }
  return { time, tzOffsetMinutes: offset };
}

/** 用户本地时刻换算：返回 {日期, 当日分钟数}（UTC 毫秒 + 偏移后取 UTC 分量） */
export function localParts(
  epochMs: number,
  tzOffsetMinutes: number
): { date: string; minutes: number } {
  const shifted = new Date(epochMs + tzOffsetMinutes * 60_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${shifted.getUTCFullYear()}-${p(shifted.getUTCMonth() + 1)}-${p(shifted.getUTCDate())}`,
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes()
  };
}

export function scheduleTtlFor(record: ScheduleRecord): number {
  return record.mode === "daily" ? DAILY_TTL_SECONDS : SCHEDULE_TTL_SECONDS;
}

export async function putSchedule(
  env: Env,
  record: ScheduleRecord
): Promise<ScheduleRecord> {
  await env.SESSIONS.put(`${SCHEDULE_PREFIX}${record.userKey}`, JSON.stringify(record), {
    expirationTtl: scheduleTtlFor(record)
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
