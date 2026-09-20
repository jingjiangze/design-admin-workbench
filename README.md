# design-admin-workbench — 设计师自查工作台（Cloudflare 全托管）

> **Runtime = Cloudflare**（Workers + Static Assets + KV + D1 + Turnstile）
> **Source = GitHub**（本仓库，push 触发 Workers Builds 自动部署）
> **Local machine = development only**（源代码编辑 + Git；生产不依赖任何本机服务）
>
> 阶段进度：Phase 0 = DEVELOPMENT READY → Phase 1A = 12/12 PASS → Phase 1B = 设计师自查工作台（21 项验收 20 PASS + 1 PARTIAL）→ **Phase CF-0 = Cloudflare 化迁移（架构与代码就绪）**。

## 目标

在旧设计管理后台（`https://d.jndx.net`）之上，构建一个**完全运行在 Cloudflare 上的轻量公开 Web 设计师工作台**：查订单、查催稿、查收入 + 自定义商品金额统计。

## 核心架构（Phase CF-0）

```text
GitHub → Cloudflare Workers Builds → Cloudflare Worker（API/Auth/Gateway）
                                        ├─ Static Assets（frontend/dist）
                                        ├─ KV（Session，legacyCookie 加密）
                                        └─ D1（仅金额规则/用户/设置）
                                              └→ d.jndx.net（仅 Worker 可达）
```

- 前端只见 `/api/*`；旧系统 URL 唯一居住地 = `worker/src/legacy/`（ESLint 全域强制）。
- 浏览器不接触旧系统 SESSION（opaque `__dw_session` Cookie）。
- D1 不保存旧订单与客户 PII；旧系统全程只读（无任何写接口接入）。
- 架构详情：`docs/CLOUDFLARE_ARCHITECTURE.md`；部署：`docs/CLOUDFLARE_DEPLOYMENT.md`。

## 工作原则

> **先取证，再设计；先复用，再重做；先高频，再低频；先稳定，再扩展。**

- 旧系统**只读**：不修改订单/客户/权限/配置，不发催稿，batchTakeover 等写接口永不接入
- 结论必须标注证据等级，禁止把推测写成事实
- 任何账号密码、Cookie、Token、Session、个人敏感信息、真实订单敏感数据**绝不进入本仓库**（留样一律 `<REDACTED>`）
- **0 ≠ undefined**：金额未定义显式标记，绝不静默当 ¥0 统计
- 免费额度保护：禁止高频轮询（`docs/CLOUDFLARE_RESOURCE_POLICY.md`）

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
frontend/    Vue 3 SPA（pure-admin-thin 基座；只允许 /api/* 端点）
worker/      Cloudflare Worker（auth/session/legacy gateway/pricing）
migrations/  D1 SQL 迁移
docs/        Phase 0 调研 + Phase 1 规格 + Cloudflare 五份架构文档
scripts/     推送/API 脚本（sync-push.sh / gh-api.sh）
research/    取证原始记录（脱敏）
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

## Cloud-only 政策（Phase CF-0 起）

- **禁止**把本项目作为常驻本机服务运行：`pnpm dev` / `vite` / `wrangler dev` 仅限明确短时调试
- 正常开发/预览：Cloudflare Preview / workers.dev / Production（部署见 `docs/CLOUDFLARE_DEPLOYMENT.md`）
- 本机不承担生产部署；`node_modules` / `dist` 等重型目录已从本机清除（`pnpm install` / `pnpm build` 可随时重建）
