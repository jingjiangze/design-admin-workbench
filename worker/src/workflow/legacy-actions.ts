/**
 * Legacy Gateway —— 一键接单（batchTakeover.do）staging 网关
 * （WORKFLOW-V2 规格三/六/二十一/二十三）
 *
 * 取证登记 [VERIFIED 源码 2026-09-20，docs/LEGACY_API_MAP.md]：
 * - POST /chsjs/child/batchTakeover.do，JSON {applyidArr: "1,2,3"}（或 needsidArr 变体）；
 * - 旧系统 myOrder 待接单 Tab 的批量接单按钮即此接口；
 * - 语义 = 接单（业务动作由旧系统负责），新系统不伪造"已联系"（旧系统无该原生接口）。
 *
 * 执行红线（规格二十二/二十三）：
 * - 仅 LEGACY_API_ENABLED=true 的环境（staging/production）可触达；
 * - 逐条调用（单条 = batch of 1）以获得逐项成败，支持"部分失败不写绿点"；
 * - 真实测试必须由用户本人点击 + 指定测试订单，禁止 Agent 自动化调用/循环测试；
 * - 首次真实调用前后须对比旧系统状态（规格二十三）。
 */
import type { Env } from "../env";
import { legacyFetch, LegacyError } from "../legacy/client";

export interface LegacyActionResult {
  ok: boolean;
  message: string;
  /** LegacyError code（SESSION_EXPIRED 时调用方中止剩余批次） */
  code?: string;
}

/** 单条接单（batchTakeover 的单元素批次）——旧系统返回成功才算成功 */
export async function legacyTakeoverOne(
  env: Env,
  legacyCookie: string,
  applyId: string
): Promise<LegacyActionResult> {
  try {
    const res = await legacyFetch(env, "/chsjs/child/batchTakeover.do", {
      legacyCookie,
      method: "POST",
      json: { applyidArr: applyId }
    });
    if (!res.ok) {
      return { ok: false, message: `旧系统 HTTP ${res.status}`, code: "LEGACY_HTTP_ERROR" };
    }
    const data = (await res.json().catch(() => null)) as
      | { result?: boolean | string; message?: string }
      | null;
    if (!data) {
      return { ok: false, message: "旧系统响应无法解析", code: "LEGACY_BIZ_ERROR" };
    }
    const ok = data.result !== false && data.result !== "false";
    return {
      ok,
      message: data.message ?? (ok ? "操作成功" : "旧系统拒绝"),
      code: ok ? undefined : "LEGACY_BIZ_ERROR"
    };
  } catch (e) {
    if (e instanceof LegacyError) {
      return { ok: false, message: e.message, code: e.code };
    }
    throw e;
  }
}

/** Mock：恒成功（Mock 环境不触旧系统；绿点语义在 Mock 下等价演示） */
export function mockTakeoverOne(_applyId: string): LegacyActionResult {
  return { ok: true, message: "Mock 模式：已接单（未触旧系统）" };
}
