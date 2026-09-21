/**
 * Legacy Gateway —— 接单开关（/api/acceptance/* → membersub/updateWorkState.do）
 *
 * [VERIFIED 2026-09-21 取证]（.tmp-evidence/memberCenter_auth.html 行 1169-1193 + 1534-1554）：
 * - UI：旧首页"接单状态" layui switch（lay-text 开启|关闭）；页面提示文案：
 *   "开启按钮即表示可接单，开启接单按钮，方便发单员直接指定订单或自动分单，
 *    不接单时请记得关闭按钮，如30分钟在平台未进行操作，系统自动关闭按钮"
 *   —— 旧系统自带 30 分钟无操作自动关单机制。
 * - 切换接口：POST /chsjs/membersub/updateWorkState.do，表单 {workstate: 1|2}
 *   （checked=true → workstate=1 开启；unchecked → workstate=2 关闭）；
 *   响应 {result: boolean, message: string}。⚠️ 前缀是 /membersub/ 而非 /child/。
 * - 当前状态无独立读取 API：旧首页 SSR 渲染 checkbox 初始 checked ——
 *   Worker 解析 memberCenter.do HTML 推断。
 *   [INFERRED] 关闭态渲染形式未验证（仅持有开启态样本）：解析不到 checked
 *   且标签存在 → open=false；整个标签缺失 → open=null（未知）。
 *
 * 写操作授权登记（2026-09-21）：updateWorkState.do 由用户明确授权接入
 * （开关接单 + 定时关闭两个用途）；其余旧系统写接口仍禁（legacy/client.ts 白名单）。
 * 执行红线：实现后不真实调用切换接口做测试，真实切换仅由用户本人或到期 cron 触发。
 */
import type { Env } from "../env";
import { legacyFetch, LegacyError } from "./client";

export interface WorkStateResult {
  result: boolean;
  message: string;
}

export interface WorkStateStatus {
  /** true=开启接单 false=关闭 null=无法解析（旧页结构变化） */
  open: boolean | null;
}

/** 解析 memberCenter.do SSR 中的接单开关初始状态 */
export function parseWorkStateFromHtml(html: string): boolean | null {
  const m = html.match(/<input[^>]*name=["']open["'][^>]*>/i);
  if (!m) return null; // 标签缺失：结构变化或非登录态页面
  return /\bchecked\b/i.test(m[0]);
}

/** 读取当前接单状态（GET 首页 HTML，只读） */
export async function fetchLegacyWorkState(
  env: Env,
  legacyCookie: string
): Promise<WorkStateStatus> {
  const res = await legacyFetch(env, "/chsjs/child/memberCenter.do", {
    legacyCookie,
    method: "GET",
    accept: "text/html,application/xhtml+xml,*/*"
  });
  if (!res.ok) {
    throw new LegacyError(502, "LEGACY_HTTP_ERROR", `旧系统 HTTP ${res.status}`);
  }
  const html = await res.text();
  return { open: parseWorkStateFromHtml(html) };
}

/** 切换接单开关（POST updateWorkState.do，写操作——用户授权） */
export async function setLegacyWorkState(
  env: Env,
  legacyCookie: string,
  open: boolean
): Promise<WorkStateResult> {
  try {
    const res = await legacyFetch(env, "/chsjs/membersub/updateWorkState.do", {
      legacyCookie,
      method: "POST",
      form: { workstate: open ? 1 : 2 }
    });
    if (!res.ok) {
      throw new LegacyError(502, "LEGACY_HTTP_ERROR", `旧系统 HTTP ${res.status}`);
    }
    const data = (await res.json().catch(() => null)) as
      | { result?: boolean | string; message?: string }
      | null;
    if (!data) {
      return { result: false, message: "旧系统响应无法解析" };
    }
    const ok = data.result !== false && data.result !== "false";
    return { result: ok, message: data.message ?? (ok ? "操作成功" : "旧系统拒绝") };
  } catch (e) {
    if (e instanceof LegacyError) {
      // legacyJson 的业务拒绝也归一为 {result:false}（不丢 message 语义）
      return { result: false, message: e.message };
    }
    throw e;
  }
}

/** Mock：状态固定开启，切换恒成功（Mock 环境不触旧系统） */
export function fetchMockWorkState(): WorkStateStatus {
  return { open: true };
}

export function setMockWorkState(_open: boolean): WorkStateResult {
  return { result: true, message: "Mock 模式：已记录（未触旧系统）" };
}
