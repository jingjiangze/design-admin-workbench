# P1-05/06 Pricing → D1 迁移与用户隔离实测证据

> 任务书 §九/§十二 交付物。状态：**PASS（21/21 实测断言全绿）**
> 日期：2026-09-21 · 环境：wrangler dev 本地 mock 模式 + 本地 SQLite D1（migrations/0001_init.sql 已应用）

## 一、改动清单

| 层 | 文件 | 内容 |
| --- | --- | --- |
| Worker | `worker/src/pricing/routes.ts` | ① PUT 改匿名占位符（修复单字段更新时编号占位符 `?N` 断裂错位）；② POST upsert 改 `RETURNING id`（修复冲突时返回新 UUID 而非既有行 id）；③ 限额检查改插入前预检 |
| 前端 | `frontend/src/service/pricing/pricing-api.ts`（新） | /api/pricing/rules 四端点客户端；传输层可注入（测试不拉起 store/router 链） |
| 前端 | `frontend/src/service/pricing/pricing-rule-store.ts`（重写） | 内存 cache + localStorage 镜像 + 服务端同步队列；同步 API 签名不变（5 个消费方零改动）；意图按 `identity::key` 去重 last-write-wins；微任务调度合并同步写块；id 回填；`getSyncStatus()`/`onSyncError()` |
| 前端 | `frontend/src/service/user-identity.ts`（新） | 登录/恢复/登出三时点统一挂身份（pricing scope + goodsId scope） |
| 接线 | `store/modules/user.ts`、`main.ts` | 登录成功 + 刷新恢复双钩子；登出回落 local。**修复 setUserIdentity 全工程零调用缺陷**（REAL_DATA_INVENTORY P0-1 审计项） |
| UI | `views/category/index.vue` | 同步失败 ElMessage 透出（本地已保存，恢复后自动重试） |
| 测试 | `frontend/test/pricing-sync.test.ts`（新，11 用例） | hydrate 覆盖 / POST-PUT-DELETE 路由 / id 回填 / 失败保留重试 / last-write-wins / 身份竞态守卫 |

提交链：`f8fc4ed` fix(pricing) worker → `e2fd124` feat(pricing) D1-backed store（均已推送）。

## 二、P1-06 双用户隔离实测（任务书 §十二）

- 脚本：`.tmp-evidence/pricing-isolation-verify.mjs`（Node 22 原生 fetch，gitignored）
- 输出：`.tmp-evidence/pricing-isolation-result.txt`（exit 0，21/21 PASS）
- 登录：mock 模式（`wrangler dev --var LEGACY_API_ENABLED:false --var TURNSTILE_SECRET_KEY:1x00…AA`，本地 .dev.vars 真实 secret 会被 localhost 拒绝，需 CLI 覆盖）；登录回显 username=userKey → iso-user-a / iso-user-b 双会话

### 实测矩阵结果

| # | 断言 | 结果 |
| --- | --- | --- |
| 1 | A goods X = 35 建档 → 200 | PASS |
| 2 | **B GET 不可见 A 的规则**（隔离正向） | PASS |
| 3 | **B 同商品建 50，与 A 行 id 不同、并存** | PASS |
| 4 | **A GET 仍 35，B 写入不泄漏**（隔离反向） | PASS |
| 5 | PUT amount=36 生效 | PASS |
| 6 | **PUT 单字段 enabled=false**（金额保持 36 不被清） | PASS |
| 7 | POST 同唯一键 upsert → 仍 1 行、enabled 复位 | PASS |
| 8 | DELETE 自己规则 → GET 0 行；B 不受影响 | PASS |
| 9 | **A DELETE B 的规则 → 404 RULE_NOT_FOUND（防越权）** | PASS |
| 10 | **A PUT B 的规则 → 404（防越权写）** | PASS |
| 11 | POST 无 X-CSRF-Token → 403 | PASS |
| 12 | subGoodsId=null 同键两次 POST → 1 行（COALESCE 唯一索引） | PASS |

## 三、验证链（P1-05 全绿）

- vitest **100/100**（pricing-sync 11 新增 + pricing-rule 22 保留 + income-record 16 + income-gateway 22 + detail-mapping 11 + order-mapping 8 + order-format 6 + adapter-contract 4）
- `vue-tsc --noEmit` exit 0 · eslint/prettier 干净 · `vite build` ✓ · `wrangler deploy --dry-run --env staging` bundle ✓

## 四、已知边界

- staging/production 远端 D1 需 `wrangler d1 migrations apply --remote`（待 CF token 就绪，随 P1 收尾部署一起做）
- localStorage 存量规则不自动迁移上云（本地镜像仅作离线兜底；服务端为事实源——避免把测试期 "local" 垃圾数据推上 D1）
- 意图队列跨身份保留：A 未同步完登出 → 意图原地挂起，A 重新登录 hydrate 时补 flush（不串账号）
