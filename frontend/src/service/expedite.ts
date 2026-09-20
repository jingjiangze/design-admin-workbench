/**
 * 催稿领域服务 —— 命名规范：生成催稿文本 / 复制催稿文本 / 待催稿清单
 * 禁用"一键催单 / 发送催单"（子设计师端无发送 API [VERIFIED]，
 * 旧系统内部术语为"催单"，本产品文案统一为"催稿"）
 * 工作流规格见 docs/EXPEDITE_WORKFLOW_SPEC.md 与 docs/DESIGNER_WORKBENCH_SPEC.md §6
 */

/** P1B 实现：待催稿清单本地状态管理 + 催稿文本模板渲染（温和/简洁/自定义） */
export const EXPEDITE_TEXT_TEMPLATE_NOTE =
  "模板见 docs/EXPEDITE_WORKFLOW_SPEC.md §模板；变量缺失显式 <缺失:xxx>";
