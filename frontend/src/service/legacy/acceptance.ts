/**
 * Legacy Acceptance（接单开关）Adapter（Cloudflare 化后 = 新系统网关客户端）
 *
 * 能力边界 [VERIFIED 2026-09-21]：旧系统仅提供"接单状态开关"（updateWorkState.do），
 * 无接单列表等其它读取面。本模块封装：
 * - 状态读取（GET /api/acceptance/status，只读）
 * - 立即切换（POST /api/acceptance/toggle，写操作——用户已授权；UI 有二次确认）
 * - 定时关闭（POST/GET/DELETE /api/acceptance/schedule，写操作——用户已授权；
 *   到期由 Worker Cron 自动关闭，单向只执行"关闭"，绝不自动开启）
 *
 * 执行红线：本服务不做任何自动化测试调用（用户 2026-09-21 指令），
 * 真实切换仅由用户本人点击触发。
 */
import qs from "qs";
import { http } from "@/utils/http";

export interface AcceptanceSchedule {
  userKey: string;
  closeAt: string;
  createdAt: string;
}

export interface AcceptanceLastResult {
  status: "CLOSED" | "REJECTED" | "SESSION_EXPIRED" | "ERROR";
  message?: string;
  at: string;
}

export interface AcceptanceStatus {
  open: boolean | null;
  degraded?: string | null;
  schedule: AcceptanceSchedule | null;
  lastResult: AcceptanceLastResult | null;
}

/** 当前接单状态 + 定时任务 + 最近执行结果 */
export async function fetchAcceptanceStatus(): Promise<{
  result: boolean;
  data?: AcceptanceStatus;
}> {
  return http.request("get", "/api/acceptance/status", { timeout: 20000 });
}

/** 立即切换接单开关（UI 二次确认后调用） */
export async function toggleAcceptance(open: boolean): Promise<{
  result: boolean;
  data?: { open: boolean | null; message: string };
}> {
  return http.request("post", "/api/acceptance/toggle", {
    data: { open },
    timeout: 20000
  });
}

/** 设置定时关闭（closeAt 必须是未来 1 分钟 ~ 7 天内的 ISO 时间） */
export async function setAcceptanceSchedule(closeAt: string): Promise<{
  result: boolean;
  data?: { schedule: AcceptanceSchedule };
}> {
  return http.request("post", "/api/acceptance/schedule", {
    data: { closeAt },
    timeout: 15000
  });
}

/** 取消定时关闭 */
export async function cancelAcceptanceSchedule(): Promise<{
  result: boolean;
  data?: { cancelled: boolean };
}> {
  return http.request("delete", "/api/acceptance/schedule", { timeout: 15000 });
}

/** 查询定时关闭任务 */
export async function getAcceptanceSchedule(): Promise<{
  result: boolean;
  data?: {
    schedule: AcceptanceSchedule | null;
    lastResult: AcceptanceLastResult | null;
  };
}> {
  return http.request(
    "get",
    `/api/acceptance/schedule?${qs.stringify({ _: Date.now() })}`,
    {
      timeout: 15000
    }
  );
}
