# REAL_DATA_INVENTORY —— Mock/Demo/Fallback 数据源全面审计

> 任务卡：CF-REAL-04 P0-1（任务书 §三 P0-1）
> 审计时间：2026-09-21 ｜ 方法：`frontend/src/**` + `worker/src/**` 全量扫描
> 关键词：`mock/demo/sample/fallback/fixture/fake/dummy` + `localStorage` + `catch(() => …)` 静默兜底 + `pageSize` 前端聚合模式
> 红线基线：API 失败必须显示"加载失败"，禁止 fallback 假数据；禁 null→0；Mock 必须显式开关，real 模式绝不自动 fallback。
> 证据等级：[VERIFIED]=本审计直接读码确认；[INFERRED]=由调用关系推断。

---

## 一、总览状态表（页面 × 数据 × 来源 × 状态）

| # | 页面/入口 | 数据 | 当前来源 | 目标来源 | 状态 | 任务卡 |
|---|---|---|---|---|---|---|
| 1 | 订单页 /order | 列表+total | Real: `/api/orders`（pageInfo.total） | 不变 | **REAL-READY（P0-2 取证闭环 [VERIFIED]）** | P0-2 #57 ✅ |
| 2 | 订单页/Drawer | 详情 | Real: `/api/orders/detail` | 不变 | REAL-READY | — |
| 3 | 催稿中心 /expedite | 消息列表 | **Mock 恒走**（`expedite-messages.json`） | Worker `/api/reminders`（getReminderMessageNew.do，已 VERIFIED total=164） | **MOCK-ONLY（P0 缺陷）** | P0-4 #59 |
| 4 | 催稿中心 | 已读标记 | Mock 内存态 | 待定（旧系统已读 API 是否授权待确认） | MOCK-ONLY | P0-4 #59 |
| 5 | 首页 /welcome | 未读催稿数 | Mock（经 expedite.ts） | 同 #3 | **MOCK-ONLY** | P0-4 #59 |
| 6 | 首页 | 4 统计卡+品类分组 | **pageSize=100 第一页前端算** + 收入失败显示 ¥0 | 真实聚合（服务端 total + 后续聚合 API） | **P0-DEFECT（红线）** | P1 #Home（¥0 假数据随 P0-5 口径一并修） |
| 7 | 首页/全站 | 收入数字 | **前端拉 500×4 条订单自算**（income.ts） | toMemberSubIncome.do 直连（口径待取证） | FRONTEND-CALC（待取证） | P0-5 #60 → P1 |
| 8 | 收入页 /income | 总览/分布/未定义 | 同 #7（前端自算） | 同 #7 | FRONTEND-CALC | P1 |
| 9 | 品类中心 /category | 商品目录 | **Mock 恒走**（`goods-catalog.json`） | 详情层 goodsFileParamList 聚合 | MOCK-ONLY | P1（任务书未列 P0） |
| 10 | 全局搜索 CommandPalette | 品类建议 | Mock（经 #9） | 同 #9 | MOCK-ONLY | P1 |
| 11 | 品类中心/Drawer | 金额规则 | **localStorage**（`pricingRules:<userIdentity>`） | D1（userKey 隔离） | LOCALSTORAGE（隔离失效，见 §三-4） | P1 Pricing |
| 12 | AppHeader 铃铛 | 未读催稿数 | Mock（经 expedite.ts） | 同 #3 | **MOCK-ONLY** | P0-4 #59 |
| 13 | 登录 | Turnstile 配置 | `/api/config`（失败不阻塞，Mock 环境无 key） | 不变 | OK | — |
| 14 | 接单开关 | 状态/切换/定时 | Real `/api/acceptance`（CF-REAL 已上线） | 不变 | REAL-READY | — |

`*` 已消解：P0-2 直连取证（.tmp-evidence/orders-total-forensics.mjs，5 组矩阵）+ staging 复测证明 **total 从未丢失**——`data.pageInfo.total` 真实存在（全量 549，翻页/变页 4 组一致，state 过滤联动正确）；CF-REAL-03 记录的 total=null 是 gate 脚本误读 `countInfo.total`（该字段不存在，countInfo 实为 6 状态计数器）所致。Worker 透传与前端 order.ts 读数路径均正确，零代码改动修复。

---

## 二、Mock 样本文件清单（文件级登记）

| 文件 | 内容 | 引用方 | 性质 |
|---|---|---|---|
| `frontend/src/service/mock/order-list.json` | 脱敏订单列表样本 | gateway.getMockOrderList → order.ts | ✅ 显式 Mock（VITE_LEGACY_API_ENABLED=false 才走） |
| `frontend/src/service/mock/order-detail.json` | 脱敏详情样本 | gateway.getMockOrderDetail → order-detail.ts | ✅ 显式 Mock |
| `frontend/src/service/mock/expedite-messages.json` | 脱敏催稿消息 | expedite.ts | ❌ **Real 模式也在用（缺陷 §三-1）** |
| `frontend/src/service/mock/goods-catalog.json` | 脱敏商品目录 | category.ts | ❌ **Real 模式也在用（缺陷 §三-6）** |
| `worker/src/legacy/mock-data/order-list.json` | Worker Mock 样本 | worker legacy/order.ts | ✅ 显式 Mock（LEGACY_API_ENABLED=false 时） |
| `worker/src/legacy/mock-data/order-detail.json` | Worker Mock 样本 | worker legacy/detail.ts | ✅ 显式 Mock |

Worker 侧另有无样本的 Mock 函数：`fetchMockRemindList`（remind.ts，返回空 inbox）、`fetchMockWorkState/setMockWorkState`（acceptance.ts，固定开+恒成功）——均由 `isLegacyEnabled(env)` 显式互斥守卫，符合红线。

---

## 三、缺陷明细（按红线严重度排序）

### 1. 【P0】催稿域服务恒走 Mock，无视 Real 开关 [VERIFIED]
`frontend/src/service/expedite.ts`:
- L64-72 `fetchExpediteMessages()`：`void isLegacyRealEnabled;` 显式忽略开关，恒返回 `expedite-messages.json` 映射结果。
- L75-87 `markMessageRead` / `markAllRead`：Mock 内存态（模块级副本），刷新即失。
- 讽刺点：Worker `/api/reminders`（getReminderMessageNew.do）已在 CF-REAL-03 取证并打通（staging 实测 200 / total=164 / 动态字段 readtime/timeout/ageing），**真实通道存在而前端不接**。
- 受影响 4 个调用点：welcome 首页未读数（L250）、AppHeader 铃铛（L82）、催稿中心列表（L219）。
- 附带：催稿中心 L167 注释自认"标记已读仅 Mock 本地（Real 通道不接写接口，长文 CF §十三）"——已读写接口授权状态待 P0-4 一并确认。

### 2. 【P0-红线】首页统计：pageSize=100 前端算 + 失败显示 ¥0 假数据 [VERIFIED]
`frontend/src/views/welcome/index.vue` L246-263 `onMounted`：
```js
const [ordersRes, messages, income, goods] = await Promise.all([
  fetchOrders({ view: "all", page: 1, pageSize: 100 }).catch(() => null),  // ← 任务书点名禁止
  fetchExpediteMessages().catch(() => []),      // 未读数静默 0
  getIncomeDashboard("month").catch(() => null), // ↓ 失败显示 ¥0 = fallback 假数据
  fetchGoodsCatalog().catch(() => [])            // 品类卡静默空
]);
...
monthIncome.value = income ? formatCny(income.summary.income) : formatCny(0); // ← 红线：失败≠¥0
```
- 任务书原文："首页统计禁止 pageSize=100 前端计算（第一页 ≠ 全量）"+"API 失败必须显示'加载失败'，禁止 fallback 到空数组/零值假数据"。
- 本条两处踩线：pageSize=100 前端算 + ¥0 假数据。
- 修复归属：¥0 假数据随 P0-5 收入口径取证后一并修正（P1 Home 真实聚合重构页面时落实"加载失败"态）。

### 3. 【P0-关联】催稿中心补金额同样 pageSize=100 [VERIFIED]
`frontend/src/views/expedite/index.vue` L342：`void fetchOrders({ view:"all", page:1, pageSize:100 }).catch(() => null);` —— 催稿行金额补全用第一页 100 条，>100 条外的订单金额显示缺失。随 P0-4 切换一并评估。

### 4. 【P1-前置缺陷】pricingRules 用户隔离实际失效 [VERIFIED]
`frontend/src/service/pricing/pricing-rule-store.ts`:
- L33 `setUserIdentity(userId)` **全前端无调用点**（仅定义）→ `userIdentity` 恒为 `"local"` → 存储键恒为 `pricingRules:local`，多账号互相污染。
- localStorage 存储本体是 Phase 1 设计（PRICING_RULE_SPEC §6，Phase 2 切 Server——接口已抽象 `injectStorage`，切换成本低）。
- P1 Pricing→D1 时必须：a) 补 auth 流程调用 setUserIdentity（或直传 userKey）；b) 存储迁 D1（userKey 隔离）。

### 5. 【P1】收入统计 = 前端拉全量自算 [VERIFIED]
`frontend/src/service/income.ts` L50-61 `fetchIncomeScope(pageSize=500, maxPages=4)`：分页循环拉最多 2000 条订单到前端，再按 `DEFAULT_INCOME_POLICY`（注释自标 **[INFERRED] 待取证**）+ pricingRules 前端计算。
- 任务书 P0-5：收入必须直连 `toMemberSubIncome.do` 取证字段语义/时间口径/状态口径/override 三态后再定切换方案。
- 本审计只登记现状，取证与切换见任务卡 #60（P0-5）→ P1 Income Cutover。

### 6. 【P1】商品目录恒走 Mock [VERIFIED]
`frontend/src/service/category.ts` L48-54 `fetchGoodsCatalog()`：`void isLegacyRealEnabled;` 恒返回 `goods-catalog.json`（注释"Real 通道 Phase 2 聚合接入"）。受影响：品类中心（L196）、CommandPalette（L245 `.catch(()=>[])` 静默空）、首页品类分组。任务书未列 P0，登记为 P1。

---

## 四、合规项审计（显式 Mock，符合红线，保持现状）

| 项 | 位置 | 结论 |
|---|---|---|
| 前端 Mock/Real 显式开关 | gateway.ts `isLegacyRealEnabled()`（VITE_LEGACY_API_ENABLED） | ✅ 显式开关；Mock 样本为脱敏真实样本，形态与真实响应一致 |
| 订单列表 Real 失败行为 | order.ts L47-51 `res.result===false → throw` | ✅ 失败抛错，不 fallback（符合"失败必须显示加载失败"） |
| 订单详情 Real 失败行为 | order-detail.ts（throw 由 legacy 层抛出；查无 raw 返回 null→Drawer 显示无数据） | ✅ 无假数据 |
| Worker Mock 互斥 | worker index.ts L84/101/114/127 `isLegacyEnabled(env)` 显式分支 | ✅ Mock 只在 LEGACY_API_ENABLED=false 显式生效，绝不自动 fallback |
| Worker Turnstile dev-mock 跳过 | security/turnstile.ts（仅 LEGACY=false 允许跳过） | ✅ 显式条件 |
| 账户页模式徽章 | account/index.vue L14 `"真实数据（旧系统网关）" : "演示数据（Mock）"` | ✅ 显式提示，合规 |
| 登录页 Turnstile 注释 | login/index.vue L60/98 | ✅ 注释性质 |
| 收入页错误边界 | income/index.vue `load()` catch→null 空态 / `toggleUndefined`/`goCategoryOrders` catch→[] | ⚠️ 空态而非假数据（可接受），但静默清空无"加载失败"文案——随 P1 收入切换统一为显式错误态 |
| Mock 通道 total=list.length | order.ts L38（仅 Mock 分支） | ✅ Mock 样本无分页语义，length 即全量，不涉红线 |

---

## 五、`catch(() => …)` 静默兜底全量清单 [VERIFIED]

| 位置 | 兜底值 | 风险 | 处置 |
|---|---|---|---|
| welcome L249-252（4 处） | null / [] / null / [] | 高（§三-2） | P1 Home 重构为显式错误态 |
| expedite L342 | null | 中（§三-3） | P0-4 评估 |
| CommandPalette L245 | [] | 低（搜索建议空可接受） | 保留（建议类非事实数据） |
| pricing-rule-store L63-75 listRules | [] | 低（坏数据回空，注释明确；规则为用户自建数据非 API） | 保留 |
| income 页 3 处 | null / [] / [] | 中 | P1 收入切换统一显式错误态 |
| expedite/index.vue copyOne/copyAll catch | ElMessage.error | ✅ 正确（显式报错） | 保留 |

---

## 六、切换路线图（本审计 → 后续任务卡映射）

```
P0-2 #57  orders.total 取证修复      → 表#1（REAL-READY* 转正）
P0-3 #58  Orders 搜索五态验证        → 表#1 链路加固（ordernum= 映射）
P0-4 #59  Reminder Real Cutover     → 表#3/#4/#5/#12（MOCK-ONLY → REAL）
P0-5 #60  Income Source Audit       → 表#7/#8 口径取证 → P1 Income Cutover
P1        Pricing→D1 + 隔离修复      → 表#11（含 §三-4 setUserIdentity 缺陷）
P1        Home 真实聚合              → 表#6（含 ¥0 假数据红线修复 + pageSize=100 禁令落实）
P1        Real Mode Lock            → VITE_DATA_MODE=mock 显式锁定 + real 绝不 fallback 的构建期保障
```

## 七、审计结论

- **Mock/Real 架构总体健康**：订单/详情/接单开关三条链路已真实驱动，显式开关 + 失败抛错设计符合红线。
- **两域"有真不用"**：催稿（Worker 真实通道已 VERIFIED 而前端恒 Mock）是 P0-4 唯一大切换点；商品目录属 P1。
- **两处红线踩线**：首页 ¥0 假数据 + pageSize=100 前端算统计（§三-2），随 P0-5/P1 落实修复，本审计先行登记。
- **一处隐藏缺陷**：pricingRules `setUserIdentity` 零调用 → 隔离失效（§三-4），P1 Pricing→D1 必修。

## 八、P0-2 补充取证（2026-09-21，orders.total 结案）

- **取证方法**：直连 `getOrderList.do` 五组矩阵（全量 p1/p2、state=1、limit=5、limit=200）+ staging 四步门复测。
- **[VERIFIED] 响应结构**：`{result, message, flag, data:{countInfo, pageInfo}}`。
  - `pageInfo` = PageHelper 标准全字段（total/pages/startRow/endRow/prePage/nextPage/isFirstPage/isLastPage/hasNextPage/navigatepageNums…）；
  - **total 全组稳定 = 549**（p1=549 / p2=549 / limit5=549 / limit200=549），state=1 时 total=0 正确联动（当前待接单为 0）；
  - `countInfo` = `{didnotpass:0, wait:0, nofeedback:0, badordercount:0, aftersale:0, flowmarker:65}` —— **状态计数器组，无 total 字段**。
- **[VERIFIED] staging 实测**：`/api/orders?page=1&limit=5` → 200 / total=549 / rowCount=5 / fieldCount=38 / result=true。
- **根因结案**：CF-REAL-03 记录的 `total=null` 是 gate 取证脚本误读 `data.countInfo.total`（不存在 → `?? null`）；Worker `jsonOk` 纯透传、前端 `order.ts` 读 `res.data.pageInfo.total` 路径正确——**零业务代码改动，仅修取证工具字段路径**。
- **P1 红利**：`countInfo` 六计数器是首页统计卡的真实数据源候选（无需前端拉单计算）；`flowmarker=65` 与 total=549 的语义差待 P0-5/P1 收入取证时一并厘清。
