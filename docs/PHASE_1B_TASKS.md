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
| P1B-DOC | 四份规格文档（本文件 + 3 SPEC） | PASS | docs/ 4 份 | - |
| P1B-06a | 金额规则模型层（PricingRule + resolveOrderAmount 纯函数 + pricingRuleStore） | PASS | src/service/pricing/ | - |
| P1B-07a | 收入计算服务（incomeService + IncomePolicy + 三层金额模型） | PASS | src/service/income/ | - |
| P1B-TEST | pricing-rule.test.ts + income-calculation.test.ts（5 必测 Case） | PASS | 48/48 全绿 | - |
| P1B-MOCK | Mock 数据扩充（金额特殊情况全覆盖） | PASS | mock/*.json | - |
| P1B-01 | 整体视觉去模板化 + 导航定稿（催单→催稿、数据→收入） | PASS | 导航 6 项 | - |
| P1B-02 | 首页设计工作台（搜索+4 卡+关注+最近订单+常用品类） | PASS | views/welcome | - |
| P1B-03 | 全局搜索（订单号直开 Drawer / 客户店铺→列表 / 批量识别 / 快捷键） | PASS | components/GlobalSearch | - |
| P1B-04 | 订单列表工作表（默认列精简 + 6 视图筛选） | PASS | views/order | - |
| P1B-05 | 订单详情 Drawer（七区块 + 原始/统计金额区分 + 来源解释） | PASS | components/OrderDrawer | - |
| P1B-06b | 品类中心金额规则编辑器（设置/恢复/批量 + 未定义醒目） | PASS | views/category | - |
| P1B-07b | 收入页面（日/周/月 + 双口径 + 反查订单 + 未定义引导） | PASS | views/data→income | - |
| P1B-08 | 催稿中心（待处理催稿/我要催稿/催稿记录三 tab） | PASS | views/expedite | - |
| P1B-09 | 批量复制 + 催稿文本生成（模板/变量缺失显式标记） | PASS | 催稿中心内 | - |
| P1B-10 | 真实只读数据接入验证（VITE_LEGACY_API_ENABLED=true） | PASS | 实测记录 §3 | - |
| P1B-11 | 真实账号验收 + 三命令 + 最终报告 | PASS | 15 项报告（会话末） | - |

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
| 16 | 真实旧系统仍只读 | PASS |
| 17 | Mock / Real 可切换 | PASS（VITE_LEGACY_API_ENABLED） |
| 18 | 关键金额计算测试全部通过 | PASS（48/48） |
| 19 | pnpm lint 通过 | PASS（exit 0） |
| 20 | pnpm test 通过 | PASS（48/48） |
| 21 | pnpm build 通过 | PASS（15.6s / 2.25MB） |

## 附加约束（长文专项）

1. **催稿命名规范**：全站用"催稿/待催稿/催稿记录/生成催稿内容/复制催稿内容"；禁"催单/一键催单/发送催单"。
2. **禁止自动发送**：短信/语音/微信/IM 自动催稿一律不做（长文 §34）。
3. **状态机不下放 UI**：UI 只见 6 视图（全部/待接单/进行中/待审核/已完成/风险），state/needsstate/manuscriptdesignstatus/checkstatus 只在 Adapter/Domain。
4. **视觉**：白色/浅灰/深色文字/单一品牌色/少阴影/细边框/紧凑表格/大搜索框——像现代 SaaS，不像 ERP。
5. **Git**：一个逻辑任务一个 commit → push → remote HEAD 复验；禁 force push。
