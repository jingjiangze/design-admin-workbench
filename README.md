# design-admin-workbench — 设计管理后台现代化改造

> **Phase 0 进行中**：现有系统全量审计 + 市面方案调研 + 新系统架构规划。
> 现阶段以**调研、取证、分析、规划**为主，不重写、不重构、不动线上业务。

## 目标

完整摸清现有设计管理/会员中心后台（`https://d.jndx.net/chsjs/child/memberCenter.do`）的功能、页面、接口、数据结构与业务流程，再结合成熟开源后台框架，设计一套简洁、现代、高效、可长期扩展的新工作台。

## 工作原则

> **先取证，再设计；先复用，再重做；先高频，再低频；先稳定，再扩展。**

- 本阶段**只读**：不修改订单/客户/权限/配置，不发真实催单，不触发有副作用的接口
- 结论必须标注证据等级，禁止把推测写成事实
- 任何账号密码、Cookie、Token、Session、个人敏感信息、真实订单敏感数据**绝不进入本仓库**（留样一律 `<REDACTED>`）

## 证据等级

| 标记 | 含义 |
| --- | --- |
| `[VERIFIED]` | 真实页面/API/实际行为验证 |
| `[PARTIAL]` | 已验证一部分 |
| `[INFERRED]` | 根据现有证据推断 |
| `[UNKNOWN]` | 暂时无法确认 |
| `[NOT TESTED]` | 需要后续测试 |

## 仓库结构

```text
docs/    Phase 0 调研产出文档（页面地图、API 地图、数据模型、方案对比等）
research/ 取证原始记录（脱敏后的 JSON 样本、截图说明、请求结构）
```

## Phase 0 必须产出

`PHASE_0_RESEARCH_REPORT` / `LEGACY_PAGE_MAP` / `LEGACY_API_MAP` / `LEGACY_CATEGORY_MAP` / `ORDER_MODEL` / `DOMAIN_MODEL` / `AUTH_MODEL` / `CURRENT_WORKFLOW_ANALYSIS` / `MARKET_OPTIONS` / `NEW_INFORMATION_ARCHITECTURE` / `NEW_UI_UX_DIRECTION` / `TECHNICAL_BASELINE`（均位于 `docs/`）。

## 同步约定

- 一个逻辑任务一个 commit（`docs:` / `chore:` 前缀），**每个 commit 实时推送**到 `origin/main`
- 不 force push、不 squash、不改写历史
- 新增前端代码在本阶段默认禁止（Phase 0 结束前不开始大规模 Vue 开发）
