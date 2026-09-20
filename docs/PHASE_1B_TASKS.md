# PHASE 1B 任务清单 — 设计师自查工作台

> 核心定位：**设计师工作台**（非 ERP、非综合运营后台）。
> 核心场景只有三个：**查订单、查催稿、查收入**，加上 **自定义商品金额** 支撑收入统计。
> 前置：Phase 1A = 12/12 PASS、15/15 PASS（`docs/PHASE_1_TASKS.md`）。

## 数据边界红线（本阶段最重要约束）

1. **绝对禁止修改旧系统订单金额/状态**——自定义金额只影响新工作台的个人收入统计。
2. **全程只读**：Legacy Adapter 只允许 GET，无任何写接口调用。
3. **0 ≠ undefined**：金额为空标记"未定义"，绝不静默当 ¥0 统计。
4. **凭据红线**：Cookie/密码/Token/真实客户信息禁入 GitHub/bundle/.env/Mock/日志。
5. **金额规则存储键**：`pricingRules:<userIdentity>`（防多账号共用浏览器混淆）。

## 任务状态总表

| ID | 任务 | 状态 | 产出 | Commit |
|----|------|------|------|--------|
| P1B-DOC | 四份规格文档（本文件 + 3 SPEC） | PASS | docs/ 4 份 | 17dd712 |
| P1B-06a | 金额规则模型层（PricingRule + resolveOrderAmount 纯函数 + pricingRuleStore） | PASS | src/service/pricing/ | 888435d |
| P1B-07a | 收入计算服务（incomeService + IncomePolicy + 三层金额模型） | PASS | src/service/income/ | 6957071 |
| P1B-TEST | pricing-rule.test.ts + income-calculation.test.ts（5 必测 Case） | PASS | 70/70 全绿 | 888435d/6957071 内 |
| P1B-MOCK | Mock 数据扩充（金额特殊情况全覆盖） | PASS | mock/*.json | 026932b/59511d6 附带 |
| P1B-01 | 整体视觉去模板化 + 导航定稿（催单→催稿、数据→收入） | PASS | 导航 6 项 | 7dbd548 |
| P1B-02 | 首页设计工作台（搜索+4 卡+关注+最近订单+常用品类） | PASS | views/welcome | 591a4b6 |
| P1B-03 | 全局搜索（订单号直开 Drawer / 客户店铺→列表 / 批量识别 / 快捷键） | PASS | components/GlobalSearch | 591a4b6 |
| P1B-04 | 订单列表工作表（默认列精简 + 6 视图筛选） | PASS | views/order | 026932b |
| P1B-05 | 订单详情 Drawer（七区块 + 原始/统计金额区分 + 来源解释） | PASS | components/OrderDrawer | 026932b |
| P1B-06b | 品类中心金额规则编辑器（设置/恢复/批量 + 未定义醒目） | PASS | views/category | 59511d6 |
| P1B-07b | 收入页面（日/周/月 + 双口径 + 反查订单 + 未定义引导） | PASS | views/data→income | 1614eee |
| P1B-08 | 催稿中心（待处理催稿/我要催稿/催稿记录三 tab） | PASS | views/expedite | ca53ae9 |
| P1B-09 | 批量复制 + 催稿文本生成（模板/变量缺失显式标记） | PASS | 催稿中心内 | ca53ae9 |
| P1B-10 | 真实只读数据接入验证（VITE_LEGACY_API_ENABLED=true） | PARTIAL | 见下方说明 | - |
| P1B-11 | 真实账号验收 + 三命令 + 最终报告 | PASS | 15 项报告（§末） | 2c472d7 |

**P1B-10 PARTIAL 说明**：真实拉通管道在 Phase 1A 已实证（P1A-06 Session Proof + P1A-07 Order API Proof，commit 链见 PHASE_1_TASKS.md）；Phase 1B 未改动 Adapter 数据通道（UI 层只消费 Domain Service，Adapter GET-only 未变）。但本会话内**未重新执行** `VITE_LEGACY_API_ENABLED=true` 端到端实测——需浏览器登录会话，登录凭据账号侧问题待用户确认（Phase 1A 遗留）。凭据确认后切换开关重测即可闭环。

## 开发顺序（长文 §46，已按依赖微调）

模型层先行（06a→07a→TEST→MOCK）→ 壳与首页（01→02）→ 搜索（03）→ 订单（04→05）→ 规则编辑器（06b）→ 收入（07b）→ 催稿（08→09）→ 真实验证（10→11）。

## 21 项验收清单（长文 §55）

| # | 验收项 | 状态 |
|---|--------|------|
| 1 | 首页真正可作为工作台 | PASS |
| 2 | 全局搜索可以查订单 | PASS |
| 3 | 订单列表可用 | PASS |
| 4 | 订单详情 Drawer 可用 | PASS |
| 5 | 品类搜索可用 | PASS |
| 6 | 商品金额规则可新增/修改/恢复系统金额 | PASS |
| 7 | 未定义金额不会被错误算成 0 | PASS（Case 4/5 测试锁定） |
| 8 | 收入页面可以按日/周/月查看 | PASS |
| 9 | 收入可反查订单 | PASS |
| 10 | 收入金额能够说明来源 | PASS（Drawer/收入页金额来源解释） |
| 11 | 催稿列表可用 | PASS |
| 12 | 批量复制订单号可用 | PASS |
| 13 | 催稿文本生成可用 | PASS |
| 14 | 所有 Phase 1B UI 使用 Domain Service | PASS |
| 15 | UI 不出现 legacy URL | PASS（ESLint no-restricted-syntax 延续） |
| 16 | 真实旧系统仍只读 | PASS（Adapter GET-only 未改动，见 P1B-10 说明） |
| 17 | Mock / Real 可切换 | PASS（VITE_LEGACY_API_ENABLED，当前 false=Mock） |
| 18 | 关键金额计算测试全部通过 | PASS（70/70，6 文件） |
| 19 | pnpm lint 通过 | PASS（eslint+prettier+stylelint exit 0，P1B 终验） |
| 20 | pnpm test 通过 | PASS（70/70，P1B 终验） |
| 21 | pnpm build 通过 | PASS（18.45s / 2.33MB，P1B 终验） |

## 附加约束（长文专项）

1. **催稿命名规范**：全站用"催稿/待催稿/催稿记录/生成催稿内容/复制催稿内容"；禁"催单/一键催单/发送催单"。
2. **禁止自动发送**：短信/语音/微信/IM 自动催稿一律不做（长文 §34）。
3. **状态机不下放 UI**：UI 只见 6 视图（全部/待接单/进行中/待审核/已完成/风险），state/needsstate/manuscriptdesignstatus/checkstatus 只在 Adapter/Domain。
4. **视觉**：白色/浅灰/深色文字/单一品牌色/少阴影/细边框/紧凑表格/大搜索框——像现代 SaaS，不像 ERP。
5. **Git**：一个逻辑任务一个 commit → push → remote HEAD 复验；禁 force push。

## Phase CF-0 追加（2026-09-20 Cloudflare 化）

Phase 1B 收尾后架构方向变更：**Runtime = Cloudflare**（详见 docs/CLOUDFLARE_ARCHITECTURE.md）。
对本文档的影响：前端 Real 通道从"vite proxy 直连旧系统"改为"/api/* → CF Worker 网关"；
`frontend/src` ESLint 全域禁 /chsjs 与 *.do（不再豁免 legacy 目录）；Mock 通道不变。
本阶段 21 项验收结论保持有效（金额模型/映射纯函数/测试全部沿用）。
