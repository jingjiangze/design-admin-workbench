/**
 * 接单定时关闭 —— Cron Trigger 执行器
 *
 * 触发：wrangler.jsonc triggers.crons = ["*\/5 * * * *"]（每 5 分钟）。
 * 行为：扫描 acc-sched:* 到期任务 → 关闭接单（updateWorkState.do workstate=2）→
 *       成功删任务；失败保留任务下次重试（7d TTL 兜底清理）。
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
  putScheduleResult,
  type ScheduleResultRecord
} from "./store";

export async function handleScheduledAcceptance(env: Env): Promise<void> {
  if (!isLegacyEnabled(env)) return;

  const schedules = await listSchedules(env);
  const now = Date.now();

  for (const schedule of schedules) {
    if (new Date(schedule.closeAt).getTime() > now) continue; // 未到期

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
        await deleteSchedule(env, schedule.userKey);
        result = { status: "CLOSED", message: r.message, at: new Date().toISOString() };
      } else {
        // 旧系统业务拒绝：重试无意义，删任务并记录
        await deleteSchedule(env, schedule.userKey);
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
    await putScheduleResult(env, schedule.userKey, result);
  }
}
