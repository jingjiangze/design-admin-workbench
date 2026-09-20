# Phase CF-REAL 数据任务板

> 目标（长文 §一）：把"Cloudflare 假数据演示站"逐步变成"真实设计师自查工作台"。
> 核心场景只有四个：查订单 / 查催稿 / 查收入 / 自定义商品金额。不做 ERP。
> 开发顺序铁律（§五十二）：真实登录 → 真实订单 → 详情 → 催稿 → 收入取证 → 收入计算 → 金额规则 → 首页 → 订单工作台 → 催稿工作台 → 正式部署。
> 红线：真实凭据不写 GitHub；旧系统只读（唯一允许 POST = childLogin）；登录失败报告 BLOCKED 不阻塞其余任务；禁 force push。

## 环境定义（§四）

| env | Legacy | Mock | KV | D1 | 用途 |
|---|---|---|---|---|---|
| development | OFF | ON | 顶层 SESSIONS | design-workbench | 开发/单测/视觉 |
| preview | OFF | ON | preview SESSIONS | design-workbench-preview | 公开预览/PR 验收 |
| **staging（新增）** | **ON** | **OFF** | **独立 SESSIONS（待建）** | 复用 preview | 真实旧系统集成测试 |
| production | ON | OFF | 顶层 SESSIONS | design-workbench | 正式服务 |

## 任务清单（§五十一）

| # | 任务 | 状态 | 证据/备注 |
|---|---|---|---|
| CF-REAL-01 | 停止本机常驻任务 | **DONE 2026-09-20** | headless chrome(9222)/wrangler dev(8787) 已停；netstat 无项目监听端口；残余 chrome 为用户日常浏览器非项目实例 |
| CF-REAL-02 | 建立 staging env | **DONE 2026-09-20 深夜** | staging KV `c95b950e…`（API 创建）；deploy --env staging 成功（Version 25e2f58d）；KV=独立/DB=复用 preview（显式声明，见下"继承陷阱"）；secrets：SESSION_ENCRYPTION_KEY + TURNSTILE_SECRET_KEY（dummy）已 put；URL https://design-admin-workbench-staging.yuehuibu5561.workers.dev |
| CF-REAL-03 | staging 真实登录 | **CHAIN-VERIFIED（差真实账号）** | 全链已验证：/api/config 下发 siteKey → 前端渲染 Turnstile（CDP 截图"成功!"态）→ RSA 密文 POST /api/auth/login → Turnstile 校验过 → 旧系统两步登录（d.jndx.net）→ 假凭据 401 LEGACY_LOGIN_REJECTED 完整透出到 UI。**仅剩真实账号凭据验证**；若账号仍被拒 → 报告 REAL_LOGIN=BLOCKED 继续 04+（§七） |
| CF-REAL-04 | 真实订单 API | TODO（依赖 03） | GET /api/orders 必须来自 d.jndx.net；验证 total/countInfo/pageInfo/list/38 fields；sort=0&sorttype=1 Worker 强制注入 |
| CF-REAL-05 | 真实订单搜索 | TODO（依赖 04） | 第一版订单号/店铺；直接映射旧系统查询参数（ordernum=），禁暴力翻页全量抓取（§十一） |
| CF-REAL-06 | 真实订单详情 | TODO（依赖 04） | needsid 主详情键；九字段新旧一致性比对 → REAL_ORDER_PROOF |
| CF-REAL-07 | 真实催稿读取 | TODO（依赖 03） | getReminderMessageNew.do 只读；列表/未读数/详情；标记已读暂不接入（§十三） |
| CF-REAL-08 | 真实收入页面取证 | TODO（依赖 03） | toMemberSubIncome.do 只读取证（SSR/HTML/隐藏变量完整记录） |
| CF-REAL-09 | 收入来源审计 | TODO（依赖 08） | 三源比对（旧收入页 vs 订单设计费 vs 个人规则）→ docs/INCOME_SOURCE_AUDIT.md；不一致不得擅自裁决 |
| CF-REAL-10 | Income Service 重构 | TODO（依赖 09） | 废除 getOrderList 别名实现；effectiveAmount/amountSource 三态模型（0≠null） |
| CF-REAL-11 | Pricing Rules staging | TODO（依赖 02） | CRUD 在 staging/preview 验收 |
| CF-REAL-12 | Pricing 用户隔离 | TODO（依赖 11） | Session.userKey→D1 user_id；A 不能读写 B |
| CF-REAL-13 | 首页真实数据 | TODO（依赖 04） | 禁硬编码假数据 |
| CF-REAL-14 | 订单工作台 | TODO（依赖 04/05/06） | |
| CF-REAL-15 | 订单详情 Drawer | TODO（依赖 06） | |
| CF-REAL-16 | 催稿工作台 | TODO（依赖 07） | 我要催稿=本地工作流不发送（§十四） |
| CF-REAL-17 | 收入工作台 | TODO（依赖 10） | 收入数字在 10 完成前不得作为正式产品事实展示（§五十） |
| CF-REAL-18 | 金额未定义提醒 | TODO（依赖 10） | 首页"金额待完善 N" + 收入页反查 |
| CF-REAL-19 | Workers Builds | TODO（依赖 02） | GitHub main→自动 build deploy；构建命令 `cd frontend && pnpm install --frozen-lockfile && pnpm build` + `npx wrangler deploy`；以实际 monorepo/root 配置验证（§四十二）；本机禁参与生产发布（§四十三） |
| CF-REAL-20 | 正式域名 | TODO（依赖 19） | workers.dev 先验证，全部真实数据通过后再绑（§四十四） |
| CF-REAL-21 | Production 最终验收 | TODO | §五十六 21 项 checklist |

## 阻塞登记

| 阻塞项 | 影响任务 | 解除条件 |
|---|---|---|
| ~~Cloudflare API token~~ | ~~CF-REAL-02 / 部署~~ | **已解除**（2026-09-20 深夜新 token 到位并完成部署链，用后即删） |
| 真实账号凭据（staging 登录门最后一环） | CF-REAL-03 | 用户提供凭据跑一次真实登录；或用户自行在 staging 页面登录测试；仍被拒则报告 BLOCKED 推进 04+ |
| production SESSION_ENCRYPTION_KEY | CF-REAL-19 前的 --env production 部署 | production worker 未建（secret put 404 实测）；首次 --env production 部署时生成新 key 并 put |

## 2026-09-20 深夜进展（CF-REAL-02 完成夜）

1. ** 🔥 发现并修复"假登录"架构缺陷**：`vite-plugin-fake-server`（enableProd:true）在产物内注入 service worker，拦截 /login、/get-async-routes 返回模板假 JWT——**此前 UI 上一切"Mock 登录成功"均为客户端仿真，从未触达 Worker**（curl 实测 POST /login = 405 证实）。已移除插件 + 删除 mock/ 三文件；getAsyncRoutes 改本地 resolve（initRouter 无 .catch，禁打网络）。
2. **登录真实接线**：前端 login → POST /api/auth/login；密码浏览器侧 RSA(PKCS#1 v1.5) 加密（jsencrypt + 旧系统公开公钥，utils/legacy-crypto.ts）；响应适配 UserResult（accessToken 存 csrfToken，真会话在 HttpOnly __dw_session）；补 .catch 错误透出；Turnstile 组件按 /api/config 下发的 siteKey 条件渲染 + 失败重置。
3. **Worker 新增 GET /api/config**（无认证白名单）：下发 {mode, turnstileSiteKey}。
4. **wrangler 4 资源继承陷阱（实测）**：d1_databases/kv_namespaces **不被 --env 环境继承**——staging 首次部署警告暴露；已为 staging 显式声明 D1（复用 preview 库）、为 production 显式声明 KV+D1（同顶层），否则 --env production 部署会静默丢绑定。
5. **staging Turnstile 用官方 dummy 测试键**（site 1x00000000000000000000AA / secret 1x0000…AA，文档公开恒通过）：token 无 Turnstile Edit 权限（API 建 widget 403），production 前须在 dashboard 建真 widget 换真钥。
6. **部署链**：顶层（Mock + 夜间模式 + 新登录）已上线 index-LRGJGM5A.js；staging Version 25e2f58d。CDP 登录门验证 PASS（gate-01/02 截图 + gate-report.json）。
7. 已知小坑：本机 wrangler deploy/secret put 间歇性挂起（输出完成后不退出），部署实际成功——用 API 探测确认后杀进程即可；secrets 可直接 curl REST API 写（秒级）。

## 附：部署状态

- production 入口（design-admin-workbench.yuehuibu5561.workers.dev，顶层 Mock 模式）：2026-09-20 深夜已上线 UI-DARK + 真实登录接线（index-LRGJGM5A.js）。
- staging（design-admin-workbench-staging…，Legacy ON）：Version 25e2f58d，登录门链路验证完成。
- --env production（Legacy ON 的正式环境）：**尚未部署**——等 CF-REAL-03 真实账号通过后执行；部署时需生成新 SESSION_ENCRYPTION_KEY 并 put（worker 存在后），且 Turnstile 换真钥。
