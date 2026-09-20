# NEW_INFORMATION_ARCHITECTURE.md — 新系统信息架构（FINAL PROPOSED）

> 状态：**FINAL（定稿）** — 2026-09-20 基于 LEGACY_PAGE_MAP（13 页面实测）、LEGACY_API_MAP（40+ 端点）、ORDER_DETAIL_MODEL 全部取证定稿。
> 原则：旧系统每个功能都有去处；不为"好看"凭空造模块。

## 1. 最终 IA 树

```text
新后台（pure-admin-thin 布局：顶部栏 + 左侧栏 + 主区）
│
├── 工作台（首页） home/                       ← 独立规格见 HOME_WORKBENCH_SPEC.md
│   ├── 全局查单（订单号/客户/手机号/店铺/批量订单号）
│   ├── 待处理聚合卡（待接单/未反馈/交稿审核/异常）
│   ├── 待催单卡片（未反馈 + 临截稿）→ 催单中心
│   └── 品类快捷入口（业务分组 + 搜索 + 常用 + 最近使用）
│
├── 订单中心 order/
│   ├── 订单列表（核心工作台：12 态 Tab 收敛为 6 个业务视图，见 §3）
│   │     └─ 订单详情 Drawer（含版次/文件/聊天/校对记录 Tabs）
│   ├── 批量操作栏（勾选 + 复制订单号 + 生成催单文本，见 BATCH_ORDER_OPERATION_SPEC）
│   ├── 异常与申诉（异常单列表/申诉单列表/特殊申请记录 —— 合并一页，分状态 Tab）
│   └── 定金单（旧 dingjinOrder 原样迁移，低频）
│
├── 催单中心 expedite/                          ← 流程规格见 EXPEDITE_WORKFLOW_SPEC.md
│   ├── 收到的催单（旧 reminderMessage 收件箱：列表+已读+备注，只读）
│   ├── 我要催的订单（本地聚合：未反馈/临截稿 → 文本生成/复制，不发送）
│   └── 触达记录（旧语音通知 myYuyinList 迁移 + 本地复制日志）
│
├── 品类中心 category/
│   ├── 品类浏览（428 goodsid 按业务分组 + 搜索 + 常用/最近标记）
│   └── 我的品类订单（按 goodsid 聚合的订单快捷列表 = 旧筛选下拉的实体化）
│
├── 数据 data/
│   ├── 不良数据（旧 badData：按日/按段 + 导出，原样保留）
│   └── 收入统计（旧 toMemberSubIncome + 首页总收入/本日/本月单量聚合）
│
├── 消息 message/（顶栏 Badge 全局承载）
│   ├── 订单通知（旧 myMessage 四类：接单/打回/不良/超时，统一收件箱）
│   └── （催单消息归催单中心，不在此重复）
│
└── 账户 account/
    ├── 我的信息（旧 myInfo：资料 + 微信二维码，原样保留）
    └── 修改密码（旧 updatePwd 弹窗独立成页，写接口 Phase 2 接入）
```

## 2. 旧功能 → 新模块 逐项映射（全部 13 个旧页面，[VERIFIED] 旧页清单）

| 原功能 | 原页面 | 新模块 | 新入口 | 原样保留 | 增强 |
| ---- | ---- | ---- | ---- | ---- | ---- |
| 我的订单（12 态工作台） | myOrder.do | 订单中心/订单列表 | 侧栏·订单中心 | 是（状态/筛选/批量接单/详情） | 全局搜索直达、跨页勾选、批量复制、详情 Drawer、状态视图重组 |
| 申诉订单 | appealOrder.do | 订单中心/异常与申诉 | 订单中心·Tab | 是（列表） | 与异常/特殊申请合并入口；WebSocket 实时推送保留位 |
| 异常订单 | abnormalOrder.do | 订单中心/异常与申诉 | 订单中心·Tab | 是（列表+取消异常） | 同上合并 |
| 定金单 | dingjinOrder.do | 订单中心/定金单 | 订单中心·Tab | 是（低频原样） | 详情 Drawer 复用 |
| 打回订单信息 | repulse/toPage.do | 订单中心/异常与申诉（打回 Tab） | 订单中心·Tab | 是（列表+处理） | 与异常合并；与 getBackNotice 消息互链 |
| 语音通知记录 | yuyin/myCallInfo.do | 催单中心/触达记录 | 催单中心·Tab | 是（只读列表） | 与本地复制日志合并展示 |
| 不良数据 | badData.do | 数据/不良数据 | 侧栏·数据 | 是（查询+导出） | 图表化增强（ECharts 已内置） |
| 订单消息（四类通知） | myMessage.do | 消息/订单通知 | 顶栏 Badge + 侧栏 | 是（四类合并收件箱） | 类型 Tab 合并；未读计数统一 |
| 催单消息 | reminderMessage.do | 催单中心/收到的催单 | 催单中心 | 是（列表/详情/已读/备注） | 内联订单上下文卡；直达详情 Drawer |
| 会员中心首页（仪表盘） | memberCenter.do | 工作台（首页） | 默认路由 | 是（关键统计） | 全局查单 + 待催单聚合 + 品类快捷（新能力，见 HOME_WORKBENCH_SPEC） |
| 我的信息 | myInfo.do | 账户/我的信息 | 右上角头像菜单 | 是 | — |
| 我的收入 | toMemberSubIncome.do | 数据/收入统计 | 侧栏·数据 | 是（SSR 数据待 Adapter 适配） | 与首页统计合并数据源 |
| DIY 设计工具（外链） | toSampleDesign.do | 账户·工具外链（不建模块） | 右上角菜单快捷方式 | 是（外链原样） | 不在本系统内重建 |
| 登录页 | toChildLogin.do | 登录页（login/） | 路由守卫 | 是（RSA 登录复现） | 记住账号、错误提示优化 |

## 3. 订单状态视图重组（12 旧态 → 6 业务视图，[VERIFIED] 旧态枚举）

旧系统 12 个 Tab（含 state=12 复用不良/待超时 [VERIFIED]）对用户是噪音；新系统导航收敛为：

| 新视图 | 包含旧 state | 说明 |
| ---- | ---- | ---- |
| 全部 | "" | 默认 |
| 进行中 | 2 未反馈 + 3 设计中 + 4 交稿审核 | 一键切分仅在统计条显示子计数 |
| 待接单 | 1 | 强调"新工作到达" |
| 待审核 | 4（交稿审核）+ 6（审核不通过） | 不通过含打回原因直达 |
| 已完结 | 5 审核通过 + 7 订单完结 | |
| 风险单 | 8 流标 + 11 超时 + 12 不良/待超时 | **显式拆分**旧系统 state=12 复用问题（子 Tab：流标/超时/不良） |

> 保留 URL 参数 `?state=` 兼容旧心智；子计数沿用 getOrderList countInfo [VERIFIED]。

## 4. 导航与信息密度原则

- 侧栏一级 6 项（工作台/订单/催单/品类/数据/账户），两级以内，禁三级菜单（旧系统两级的深度已足够业务表达 [VERIFIED]）。
- 顶栏：全局搜索框（常驻）+ 消息 Badge + 头像菜单（信息/密码/登出/工具外链）。
- 高频路径 ≤2 步：查单（1 步：首页搜索）→ 详情（1 步：列表行点击 Drawer，不再整页跳转——旧系统详情为独立大页 [VERIFIED]，新系统 Drawer 化）。
- 低频（定金单/不良数据/触达记录）收纳进二级 Tab，不占首屏。

## 5. 与 Adapter 架构的衔接

- 每个新模块对应一个 Domain Service（orderService / expediteService / categoryService / dataService / messageService / accountService），详见 TECHNICAL_BASELINE.md §2。
- 品类中心数据源：LEGACY_CATEGORY_MAP.md 的 428 unique goodsid（旧系统无品类 API，由 Adapter 内置静态清单 + 版本化维护；如后续重新抓取发现数量变化，必须记录抓取条件与差异原因）。
