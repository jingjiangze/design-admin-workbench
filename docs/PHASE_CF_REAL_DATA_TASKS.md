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
| CF-REAL-02 | 建立 staging env | **SKELETON / BLOCKED ON CF CREDENTIALS** | wrangler.jsonc 已加 `env.staging`（LEGACY_API_ENABLED=true）；KV namespace 创建（`wrangler kv namespace create SESSIONS --env staging`）+ ID 回填 + secret put 需 API token |
| CF-REAL-03 | staging 真实登录 | TODO（依赖 02） | Gate 任务；若 LEGACY_LOGIN_REJECTED 复现 → 报告 REAL_LOGIN=BLOCKED，继续 04+ 不阻塞（§七） |
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
| Cloudflare API token（上轮临时 token 已按惯例删除） | CF-REAL-02 KV 创建 / staging+dark 部署 / CF-REAL-03+ | 用户提供 token（临时使用、用后即删） |
| 真实账号登录曾 LEGACY_LOGIN_REJECTED | CF-REAL-03 | staging 重试；仍失败则如实报告 BLOCKED 并推进 04+ 中不依赖登录的部分 |

## 附：当前待部署差量

- production 线上仍是 UI-R1 亮色版（index-Cofm_pVY.js）；本地已就绪 UI-DARK（index-BapO2cNE.js，双主题验收全绿）。token 就绪后随 production 部署一并上线。
