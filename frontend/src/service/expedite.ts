/**
 * 催单领域服务 —— 命名规范：生成催单文本 / 复制催单文本 / 加入催单清单
 * 禁用"一键催单 / 发送催单"（子设计师端无发送 API [VERIFIED]）
 * 工作流规格见 docs/EXPEDITE_WORKFLOW_SPEC.md
 */

/** P1B 实现：催单清单本地状态管理 + 催单文本模板渲染 */
export const EXPEDITE_TEXT_TEMPLATE_NOTE =
  "模板见 docs/EXPEDITE_WORKFLOW_SPEC.md §模板";
