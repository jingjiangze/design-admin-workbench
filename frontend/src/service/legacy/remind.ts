/**
 * Legacy Remind（催稿）Adapter（Cloudflare 化后 = 新系统网关客户端）
 *
 * 能力边界 [VERIFIED]：子设计师端无催稿发送 API；催稿由客服侧发起（语音+短信计费触达）。
 * 本系统仅提供只读接口（收件箱列表），
 * 新能力表述统一为"生成催稿文本 / 复制催稿文本 / 加入催稿清单"，
 * 禁用"一键催稿 / 发送催稿"等表述（UX-only，详见 docs/EXPEDITE_WORKFLOW_SPEC.md）。
 *
 * 只读纪律：仅 GET /api/reminders（Worker 白名单 → reminderMessage.do）；
 * updateRemark/updateIsRead 写接口在新系统任何层都不存在。
 */
import qs from "qs";
import { http } from "@/utils/http";

/** 催稿收件箱列表（经 Worker 网关，只读） */
export async function fetchLegacyRemindList(params: {
  page: number;
  limit: number;
}): Promise<{ result: boolean; data?: { list: unknown[]; total: number } }> {
  return http.request("get", `/api/reminders?${qs.stringify(params)}`, {
    timeout: 15000
  });
}
