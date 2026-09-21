/**
 * 接单定时关闭 —— Cron Trigger 执行器
 *
 * 触发：wrangler.jsonc triggers.crons = ["*\/5 * * * *"]（每 5 分钟）。
 * 行为：
 * - once ：acc-sched:* 到期 → 关闭接单（updateWorkState.do workstate=2）→
 *          成功删任务；失败保留任务下次重试（7d TTL 兜底清理）。
 * - daily：每天用户本地 HH:mm 自动关闭（2026-09-21 用户指令"默认是每天"）——
 *          用户本地时刻起 10 分钟窗口内执行一次，成功/业务拒绝后记 lastRunDate
 *          防同日重复；Session 过期/瞬时错误窗口内下轮重试，跨日重置。
 *
 * 安全边界：
 * - 仅 LEGACY=ON 的环境执行（mock/preview 绝不触旧系统）；
 * - 只执行"关闭"方向（单向安全操作，绝不自动开启接单）；
 * - Session 过期不删任务（用户重新登录后可重试），但记 SESSION_EXPIRED 结果；
 * - 无 KV 任务时空转（部署即上线也不会有任何真实写动作）。
 */
import type { Env } from "../env";
import { isLegacyEnabled } from "../env";
import { findLatestSessionByUserKey, getLegacyCookie } from "../security/session";
import { setLegacyWorkState } from "../legacy/acceptance";
import {
  listSchedules,
  deleteSchedule,
  putSchedule,
  putScheduleResult,
  localParts,
  type ScheduleRecord,
  type ScheduleResultRecord
} from "./store";

/** daily 窗口宽度（分钟）：cron 每 5 分钟一轮，10 分钟保证至少命中一轮 */
const DAILY_WINDOW_MINUTES = 10;

/** 判断 daily 任务当前是否应执行 */
export function isDailyDue(schedule: ScheduleRecord, nowMs: number): boolean {
  if (!schedule.time || typeof schedule.tzOffsetMinutes !== "number") {
    return false;
  }
  const local = localParts(nowMs, schedule.tzOffsetMinutes);
  if (schedule.lastRunDate === local.date) return false; // 今天已执行过
  const [hh, mm] = schedule.time.split(":").map(Number);
  const schedMinutes = hh * 60 + mm;
  return (
    local.minutes >= schedMinutes &&
    local.minutes < schedMinutes + DAILY_WINDOW_MINUTES
  );
}

export async function handleScheduledAcceptance(env: Env): Promise<void> {
  if (!isLegacyEnabled(env)) return;

  const schedules = await listSchedules(env);
  const now = Date.now();

  for (const schedule of schedules) {
    const mode = schedule.mode ?? "once"; // 兼容旧记录（无 mode = once）
    if (mode === "daily") {
      if (!isDailyDue(schedule, now)) continue;
    } else {
      if (!schedule.closeAt || new Date(schedule.closeAt).getTime() > now) {
        continue; // 未到期
      }
    }

    let result: ScheduleResultRecord;
    try {
      const record = await findLatestSessionByUserKey(env, schedule.userKey);
      if (!record) {
        // 无有效 Session：保留任务（用户重新登录后 cron 可用新 Session 重试）
        result = {
          status: "SESSION_EXPIRED",
          message: "登录会话已过期，重新登录后将自动重试关闭",
          at: new Date().toISOString()
        };
        await putScheduleResult(env, schedule.userKey, result);
        continue;
      }

      const legacyCookie = await getLegacyCookie(env, record);
      const r = await setLegacyWorkState(env, legacyCookie, false);
      if (r.result) {
        result = { status: "CLOSED", message: r.message, at: new Date().toISOString() };
      } else {
        result = { status: "REJECTED", message: r.message, at: new Date().toISOString() };
      }
    } catch (e) {
      // 网络/加密等瞬时错误：保留任务下次 cron 重试
      result = {
        status: "ERROR",
        message: e instanceof Error ? e.message : "unknown",
        at: new Date().toISOString()
      };
    }

    if (mode === "daily") {
      // daily 是常驻任务：CLOSED/REJECTED 视为今天已处理（防重复），
      // SESSION_EXPIRED/ERROR 保留待窗口内重试；TTL 每次写回刷新
      if (result.status === "CLOSED" || result.status === "REJECTED") {
        const tz = schedule.tzOffsetMinutes ?? 480;
        schedule.lastRunDate = localParts(now, tz).date;
      }
      await putSchedule(env, schedule);
    } else if (result.status === "CLOSED" || result.status === "REJECTED") {
      // once：成功/业务拒绝后任务终结
      await deleteSchedule(env, schedule.userKey);
    }
    await putScheduleResult(env, schedule.userKey, result);
  }
}
