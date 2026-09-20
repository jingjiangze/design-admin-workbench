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

- **仓库已公开**（2026-09-20 由私有切换为 public）。内容红线：账号、密码、Cookie、Token、Session 等敏感数据**禁止入库**（已全历史扫描验证 0 泄露）；取证样本（页面 HTML、接口 JSON、会话凭据）一律留在本地 `.tmp-evidence/`（.gitignore 已拦截）
- 一个逻辑任务一个 commit（`docs:` / `chore:` 前缀），**每个 commit 实时推送**到 `origin/main`
- **GitHub 唯一通道 = 本地凭据管理器**（凭据只在本机与进程内流转，敏感认证信息不入仓库、不在文档展开）：
  - git 推送统一走 `scripts/sync-push.sh`（内置 TLS 吊销修复 + 静默凭据 + 失败重试 ×3）
  - API 查询统一走 `scripts/gh-api.sh`（如查远端 commit、读文件），凭据只在进程内流转，不入仓库
  - GitHub 连接器（CodeBuddy-Connector）已弃用：其令牌授权范围不足且反复要求重连授权
- 已安装 `post-commit` 钩子：手动 commit 后自动推送；临时跳过用 `NO_AUTO_PUSH=1 git commit ...`
- 推送日志：`.git/push.log`
- 不 force push、不 squash、不改写历史
- 新增前端代码在本阶段默认禁止（Phase 0 结束前不开始大规模 Vue 开发）
