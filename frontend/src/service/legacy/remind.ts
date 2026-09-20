/**
 * Legacy Remind（催稿）Adapter —— 旧系统催稿相关接口的唯一入口
 *
 * 能力边界 [VERIFIED]：子设计师端无催稿发送 API；催稿由客服侧发起（语音+短信计费触达）。
 * 本系统仅提供只读取证接口（收件箱列表/详情/已读/备注），
 * 新能力表述统一为"生成催稿文本 / 复制催稿文本 / 加入催稿清单"，
 * 禁用"一键催稿 / 发送催稿"等表述（UX-only，详见 docs/EXPEDITE_WORKFLOW_SPEC.md）。
 *
 * 只读纪律：仅允许列表/详情 GET；updateRemark/updateIsRead 写接口暂不接入。
 */

/** P1B 实现：催稿收件箱列表（reminderMessage.do，只读） */
export async function fetchLegacyRemindList(_params: {
  page: number;
  limit: number;
}) {
  throw new Error("P1B 待实现");
}
