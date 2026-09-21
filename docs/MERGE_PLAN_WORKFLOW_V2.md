# MERGE_PLAN_WORKFLOW_V2 — 代码合并计划（提交给主 Agent）

> 生成：2026-09-21 · 功能分支：`workbuddy/main-16f080ca`（HEAD = `baa78e5`）
> 规格：WORKFLOW-V2（docs/WORKFLOW_MARKER_SPEC.md 已冻结语义）
> 验证状态：前端 typecheck ✅ / eslint（改动文件）✅ / vitest 121/121 ✅ / 生产构建 ✅ / Worker 新增模块 tsc 0 错误 ✅

## 一、合并目标分支

- **目标：`main`**（唯一长期分支；origin/main 为其远端）。
- 来源分支 `workbuddy/main-16f080ca` 上除本次 4 个提交外，还包含此前未合入 main 的工作（订单历史查询、催稿分组等）。主 Agent 可二选一：
  - **方案 A（推荐）**：整分支合并（此前功能已各自验证过，见 git log）；
  - **方案 B**：仅 cherry-pick 本次 4 个提交（见下清单），其余工作另行决策。

## 二、本次改动文件清单（4 commits，11 文件）

| Commit | 文件 | 性质 |
| --- | --- | --- |
| `3316d20` audit | `docs/WORKFLOW_MARKER_SPEC.md`（新） | 语义冻结文档 |
| | `docs/LEGACY_API_MAP.md` | batchTakeover 审计登记更新 |
| `102be1d` feat | `migrations/0002_work_item_marker.sql`（新） | **D1 迁移（三环境均需 apply）** |
| | `worker/src/workflow/marker.ts`（新） | D1 标记存取（幂等/隔离） |
| | `worker/src/workflow/legacy-actions.ts`（新） | batchTakeover staging 网关 |
| | `worker/src/workflow/routes.ts`（新） | /api/workflow/* 路由 |
| | `worker/src/index.ts` | 路由挂载（+2 行） |
| | `worker/src/legacy/client.ts` | 仅注释（白名单纪律更新） |
| `537d28a` feat | `frontend/src/service/workflow.ts`（新） | 领域服务（双通道） |
| | `frontend/src/service/legacy/workflow.ts`（新） | /api/workflow 客户端 |
| | `frontend/src/views/order/index.vue` | 绿点 + 接单/我已处理 + 批量栏 |
| | `frontend/src/views/expedite/index.vue` | 本地标记升级 D1 + 迁移 |
| `baa78e5` test | `frontend/test/workflow-marker.test.ts`（新） | 门禁/隔离/部分失败断言 |

## 三、合并与部署顺序（按此执行）

1. **合并代码**（main ← 分支或 cherry-pick 4 commits）。
2. **D1 迁移**（先于或随部署同时进行；表为纯新增，先建表无副作用）：
   ```bash
   npx wrangler d1 migrations apply design-workbench-preview --env preview
   npx wrangler d1 migrations apply design-workbench-preview --env staging   # staging 复用 preview 库
   npx wrangler d1 migrations apply design-workbench --env production
   ```
3. **部署 Worker + 前端**：preview → staging → production 逐级。
4. **首次真实接单（staging，规格二十三）**：由用户指定 1 个测试订单 → 前端点击接单一次 → **旧系统前后状态对比** → 确认后才可在生产使用。禁止批量/循环真实测试。
5. **生产灰度观察**：先由用户本人在生产处理 1~2 单，确认绿点/列表保持/刷新持久，再日常使用。

## 四、潜在风险（按优先级）

| 级别 | 风险 | 缓解 |
| --- | --- | --- |
| P0 | batchTakeover 首次真实调用的行为未知（[VERIFIED 源码] 但未实测：响应体形态、重复接单时的返回） | staging 单订单实测 + 前后状态对比后再放开生产；网关对无法解析的响应按失败处理（不写绿点——宁可漏绿点不可假成功） |
| P0 | 批量接单逐条调用：N 条 = N 次旧系统请求，可能触发旧系统限流 | targets 上限 50；会话失效即中止；批量建议 ≤10 条/次 |
| P1 | 迁移遗漏某环境 → /api/workflow/* 全部 500 | 部署检查单含三环境 migrations apply；表为 IF NOT EXISTS 可安全重复执行 |
| P1 | 旧催稿 localStorage 标记迁移（expedite 视图） | 一次性迁移且标记幂等；迁移失败仅影响旧数据可见性，不影响新标记 |
| P2 | 旧系统 batchTakeover 单条 vs 批量参数差异（applyidArr 传单值） | 已按源码 `{applyidArr:"1"}` 单值形态调用；staging 实测确认 |
| P2 | 订单表新增"操作"列在小屏挤压 | grid 已均摊；如反馈拥挤后续做响应式收敛 |

## 五、回滚方案

1. **代码回滚**（随时可做，不影响数据）：
   - 整分支合并：`git revert -m 1 <merge-commit>`；cherry-pick：`git revert baa78e5 537d28a 102be1d 3316d20`（倒序）。
   - 前端与 Worker 可独立回滚：前端回滚仅隐藏按钮，Worker 保留标记能力。
2. **数据回滚**（work_item_marker 为纯新增表，回滚不丢旧系统数据）：
   ```sql
   DROP TABLE IF EXISTS work_item_marker;  -- 如需彻底清除绿点数据才执行
   ```
   一般无需 DROP：表无业务副作用，回滚代码后仅成为闲置表。
3. **禁止回滚项**：batchTakeover 已在旧系统产生的接单动作**不可撤销**——回滚代码不会恢复旧系统状态；这也是 staging 先行 + 单订单实测的原因。

## 六、验收对照（规格三十四 PASS 清单）

- ✅ 一键接单调用真实旧接口（batchTakeover，staging 网关就绪）
- ✅ 已联系/订单处理/催单处理：无原生接口 → 不伪造（仅"我已处理"本地防漏单标记）
- ✅ 成功才产生绿点 / 失败不产生（vitest 断言 + Worker 门禁）
- ✅ 批量部分失败逐项准确 / 处理后不消失 / 不改排序
- ✅ 绿点刷新保留 / 用户隔离 / 幂等
- ⏳ 待 staging 实测：batchTakeover 真实响应与旧系统状态对比（用户授权 + 指定测试订单后）
