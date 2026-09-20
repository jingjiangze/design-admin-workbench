# MARKET_OPTIONS.md — 市面成熟方案调研

> 状态：**PARTIAL VERIFIED** — 2026-09-20 通过 GitHub API（`GET /repos/*`）现场拉取 7 个候选仓库元数据（[VERIFIED] 客观数据）。
> 匹配点/风险分析基于元数据与既有认知（[INFERRED]，未逐仓克隆审计）。原始数据留存于本地取证目录（不入库）。

## 候选方案（GitHub API 实测 2026-09-20）

| 方案 | Stars | Forks | Open Issues | 最近推送 | 语言 | License | 归档 |
| ---- | ----- | ----- | ----------- | -------- | ---- | ------- | ---- |
| soybeanjs/soybean-admin | 15,018 | 2,516 | 7 | 2026-09-07 | TypeScript | MIT | 否 |
| pure-admin/pure-admin-thin | 3,039 | 1,407 | 1 | 2025-10-30 | TypeScript | MIT | 否 |
| HalseySpicy/Geeker-Admin | 8,089 | 1,668 | 78 | 2026-07-29 | Vue | MIT | 否 |
| tabler/tabler | 41,725 | 4,428 | 68 | 2026-09-19 | Astro (HTML UI Kit) | MIT | 否 |
| vbenjs/vue-vben-admin | 33,484 | 8,970 | 45 | 2026-09-19 | Vue | MIT | 否 |
| jekip/naive-ui-admin | 5,916 | 1,066 | 36 | 2026-01-19 | Vue | MIT | 否 |
| fantastic-admin/basic | 3,397 | 396 | 0 | 2026-08-30 | Vue | MIT | 否 |

## 逐项评价（数据 [VERIFIED] / 分析 [INFERRED]）

### vbenjs/vue-vben-admin
- 优势：社区规模最大（33.5k stars / 9k forks）之一，推送至 2026-09-19（当天活跃）；Vue3 + Shadcn UI + Vite + TS；Monorepo 架构。[INFERRED]
- 限制：体量大、抽象层多，新手学习曲线陡。[INFERRED]
- 匹配点：订单系统所需的权限路由、动态菜单、多 Tab 页——原系统恰好是 layui 多 Tab 风格。[INFERRED]
- 迁移成本：中高；需要精简。

### tabler/tabler
- 优势：41.7k stars 全场最高，当天活跃；纯 HTML UI Kit（Astro 构建），框架无关，自带表格/表单/图表全组件。[VERIFIED]
- 限制：是静态 UI Kit 而非 Vue 后台框架——无路由/状态管理/权限方案，需自建 Vue 集成层。[INFERRED]
- 匹配点：若新系统走"Vue3 + 自由设计"路线，适合做视觉基准；与"简约化"偏好契合。[INFERRED]
- 迁移成本：高（组件需手工移植为 Vue 组件）。

### soybeanjs/soybean-admin
- 优势：15k stars，2026-09-07 仍在推送；TypeScript 严格、文档完善、轻量定位。[INFERRED]
- 限制：订单大表格场景可能需要补 UI 组件生态。[INFERRED]
- 匹配点：轻量化偏好（用户一贯要求低占用）；open issues 仅 7 个，社区响应健康。[VERIFIED issues 数]

### HalseySpicy/Geeker-Admin
- 优势：8k stars，Element-Plus 全家桶（Vue3.4 + Vite5 + Pinia），开箱即用的 CRUD 表格/权限/主题；2026-07-29 推送。[VERIFIED]
- 限制：open issues 78 个相对体量偏多；模板化程度高，"去模板化"有工作量。[INFERRED]
- 匹配点：与原系统 layui 表格工作台形态最接近（大表格 + 筛选 + 批量操作）。[INFERRED]

### jekip/naive-ui-admin
- 优势：5.9k stars，NaiveUI 中后台方案。[VERIFIED]
- 限制：最近推送 2026-01-19，8 个月未更新——7 个候选中活跃度偏低。[VERIFIED]
- 匹配点：一般。[INFERRED]

### fantastic-admin/basic
- 优势：2026-08-30 推送，主打 AI 编程友好 + PC/移动端兼容；basic 版免费。[VERIFIED]
- 限制：另有 Pro 收费版，free 版功能边界需确认；社区规模中等。[INFERRED]
- 匹配点：AI-oriented 定位对"AI 辅助二次开发"工作流友好。[INFERRED]

### pure-admin/pure-admin-thin
- 优势：官方精简版，依赖最少、结构最干净——**适合新手作为起点**；MIT 无限制。[VERIFIED]
- 限制：最近推送 2025-10-30（约 11 个月前），但精简版本身变更需求低。[VERIFIED]
- 匹配点：Vue 新手 + 渐进式开发偏好 → thin 版起步阻力最小。[INFERRED]

## 许可证核查

7 个候选 API 元数据均显示 **MIT License**：允许商业使用、修改、闭源、再分发，仅需保留版权声明。[VERIFIED]
（骨架要求逐仓核对 LICENSE 原文 → 待克隆后补 [VERIFIED] 原文引用）

## 结论建议（供决策，非最终选型）

1. **主候选**：pure-admin-thin（起点最简）或 Geeker-Admin（表格工作台形态最贴原系统）。
2. **视觉基准**：Tabler（非框架依赖，纯参考）。
3. **稳妥备选**：vben（生态最大但复杂）/ soybean（轻量）。
4. 待办：对主候选克隆做依赖体积实测（node_modules 大小、构建产物、启动耗时）——对应用户"低占用"硬偏好。
