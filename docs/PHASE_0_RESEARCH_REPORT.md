# PHASE_0_RESEARCH_REPORT.md — Phase 0 最终报告（Final Report）

> 状态：**DEVELOPMENT READY** — 2026-09-20 收口。
> 全程只读取证（未执行催单/接单/状态变更等任何写操作）；凭据与会话数据不入库；账号全程使用用户自己的合法账号。
> 文档集：16 份，见 §7 文档清单。

## 1. 验收清单（Phase 0 = DEVELOPMENT READY 依据）

```text
[PASS] 登录机制        AUTH_MODEL.md —— RSA 登录全链路复现成功
[PASS] 页面地图        LEGACY_PAGE_MAP.md —— 13 页面全量映射
[PASS] API 地图        LEGACY_API_MAP.md —— 40+ 端点结构与参数
[PASS] 订单列表模型    ORDER_MODEL.md —— 38 字段实测 + 11 组字段账本
[PASS] 订单详情模型    ORDER_DETAIL_MODEL.md —— 17+19+27 字段三层结构
[PASS] 品类地图        LEGACY_CATEGORY_MAP.md —— 428 unique goodsid
[PASS] 催单边界        EXPEDITE_WORKFLOW_SPEC.md —— 能力边界 A/B/C 声明
[PASS] 市场方案        MARKET_OPTIONS.md —— 7 候选元数据 + 4 仓工程审计
[PASS] 技术基线        TECHNICAL_BASELINE.md —— 定稿 pure-admin-thin + Adapter
[PASS] 新 IA           NEW_INFORMATION_ARCHITECTURE.md —— 13 页逐项映射
[PASS] 首页规格        HOME_WORKBENCH_SPEC.md —— 三层结构 + 线框
[PASS] UI/UX           NEW_UI_UX_DIRECTION.md —— 数值化规范 + 3 线框
[PASS] Adapter         TECHNICAL_BASELINE.md §2 —— 分层 + lint 强制隔离
[PASS] 安全扫描        §6 —— 0 sensitive leakage
[NOT TESTED] 跨角色隔离 —— 记录为 CROSS_ROLE_ISOLATION = NOT TESTED，不阻塞开发
```

## 2. 15 个问题的最终回答

1. **现有后台实际有多少核心功能？** 子设计师端 6 大模块（订单管理/不良数据/消息通知/个人信息/收入/DIY 工具外链），13 个页面。[VERIFIED]
2. **这些功能分别在哪些页面？** LEGACY_PAGE_MAP.md 功能树 + NEW_INFORMATION_ARCHITECTURE.md §2 逐项映射表。[VERIFIED]
3. **哪些功能是真正高频？** 我的订单（153KB 核心工作台、12 态 Tab）与催单消息（全局 Badge 常驻）。结构证据充分，频次待上线后埋点校准。[INFERRED]
4. **查单现在需要多少步骤？** 旧系统 2-4 步（侧栏→Tab→筛选），无全局搜索；新系统首页 1 步直达（HOME_WORKBENCH_SPEC 第一层）。[VERIFIED 结构]
5. **催单现在到底怎么实现？** 客服侧发起 → 语音外呼+短信（计费）→ 站内收件箱（6 接口：列表/详情/已读×3/备注）→ 全局 Badge。[VERIFIED]
6. **是否存在可复用的催单 API？** 子设计师端无发送 API [VERIFIED]；读取/已读/备注接口可经 Adapter 复用。新系统"催单发送"是新增服务端能力，本期不实现、不伪造。[VERIFIED 边界]
7. **是否存在批量接口？** batchTakeover（applyidArr/needsidArr）、updateIsReadAllReminderNew、setBackgroundColor。[VERIFIED]
8. **订单对象有哪些核心字段？** 列表 38 字段 + 详情容器 17 字段 + ERP 快照 19 字段 + 版次产品行 27 字段；11 组字段账本（来源/证据等级）见 ORDER_MODEL.md。[VERIFIED]
9. **品类真实结构是什么？** 428 unique goodsid 平铺 + 详情侧两级子品类（subGoodsid"双面"）+ 品类关键词组。**口径修正：428（此前 438 系早期统计含重复项的口径错误，已全文统一并标注）**。[VERIFIED]
10. **现有权限体系如何工作？** SESSION Cookie + 路径空间分层（/child /designer /dingjin…）+ WebSocket 按用户定向订阅。CROSS_ROLE_ISOLATION = NOT TESTED（不做越权探测）。[PARTIAL，符合收口要求]
11. **原系统哪些能力必须保留？** 订单 12 态工作台、批量接单、异常/申诉/特殊申请三通道、不良数据导出、催单收件、定金单、语音触达记录——全部在 IA 映射表有去处。[VERIFIED 清单→保留判断 INFERRED 待用户复核]
12. **哪些能力适合重新实现？** 客户实体化视图（Phase 2+）、全局搜索、统一消息收件箱、订单导出、状态视图重组（12→6）、批量复制、催单文本生成。[INFERRED]
13. **哪个成熟前端方案最适合底座？** **pure-admin-thin**——四候选实际工程审计后定稿：唯一内置增强表格、源码最简（117 文件/1.6M）、Element Plus 心智匹配；soybean（无表格组件+版本激进）、Geeker（184 文件模板过重）、vben（20M 过度工程）的排除依据均来自实测。[VERIFIED 审计→结论 INFERRED]
14. **新后台建议什么信息架构？** 六模块（工作台/订单/催单/品类/数据/账户），13 个旧功能全部映射，12 态收敛 6 视图，详见 NEW_INFORMATION_ARCHITECTURE.md。[定稿]
15. **下一阶段应该先做什么？** Phase 1A 基础工程（装 pnpm→装依赖→清 demo→lint 隔离规约→复测构建）→ 1B Legacy Adapter → 1C 查单 Service → 1D 首页 → 1E 查单 → 1F 详情 Drawer → 真实账号只读验收。见 §8。

## 3. 最终技术方案（TECHNICAL_BASELINE.md 摘要）

- 模板 **pure-admin-thin v6.2.0**｜Vue 3.5｜Vite 7｜TS 5.9 strict｜Element Plus 2.11｜Pinia 3｜Router 4.6｜axios｜@pureadmin/table｜Tailwind 4｜ECharts 6
- 分层：`UI(禁 URL) → Domain Service → Legacy Adapter(旧 URL 唯一居住地) → HTTP 基建`，lint 强制
- 已知风险三件：本机装 pnpm、build 脚本跨平台修复、CDN 构建禁用（保持默认关）
- 语义错位翻译点：`erp.ordrtyp`=店铺名、`state` 12=不良/待超时复用、`isqll`、`kehu_ww` 等——只在 Adapter 内出现

## 4. 最终 IA / 首页 / 催单 / 批量（一句话版，详见各自 SPEC）

- **IA**：六模块两栏布局，13 旧页面全映射，无凭空模块。
- **首页**：三层 = 全局查单（含批量粘贴）→ 4 聚合卡 → 品类快捷（428 品类分组化，绝不平铺）。
- **催单**：收到的催单（旧系统只读）+ 我要催的订单（本地聚合+文本生成，**不发送**）+ 触达记录；三态边界声明防止能力伪造。
- **批量订单号**：跨页勾选 + 逐行/顿号/逗号一键复制 + 催单文本/客户信息/摘要三个预留位。

## 5. 新增证据（本轮 Finalize 阶段）

| 证据 | 内容 | 等级 |
| ---- | ---- | ---- |
| 订单详情全量结构 | 两详情接口同模板证明、17 字段容器、ERP 快照 19 字段、版次行 27 字段、CDR 交稿格式、S3 兼容存储、聊天/校对/历史三区块 | [VERIFIED] |
| applyid/needsid 关系 | 同体双键（响应 99.97% 同），needsid 主键判定 | [VERIFIED]+[INFERRED] |
| 4 候选工程审计 | 体积/依赖/模块/版本栈全表；thin 安装 710 包 855M；构建三坑（cmd 脚本/CDN vue-demi/rollup 兼容） | [VERIFIED] |
| SESSION 寿命 | 上轮登录 2.5h 后仍有效 | [VERIFIED] |
| 品类两级结构 | goodsid + subGoodsid（双面）+ keywords | [VERIFIED] |

## 6. 安全扫描（P0-F11，终版）

- 全历史 + 全工作区敏感词（账号/密码/手机号/令牌前缀/姓名）扫描：**0 sensitive leakage** [VERIFIED]
- README 内部认证描述已脱敏为"本地凭据管理器 / 凭据不入仓库" [VERIFIED]
- 取证样本（页面 HTML/JSON/脚本/cookies）均在 `.tmp-evidence/`（gitignore 拦截），全程未提交
- 文档中客户 PII 全部脱敏（tel/email/qq/旺旺号只记录字段存在性）
- CROSS_ROLE_ISOLATION = NOT TESTED（原则：Phase 0 是"知道新系统怎么设计"，不是"攻击旧系统"）

## 7. 最终文档集（16 份）

```text
docs/
├── PHASE_0_RESEARCH_REPORT.md      ← 本文件（Final Report）
├── LEGACY_PAGE_MAP.md              ├── LEGACY_API_MAP.md
├── LEGACY_CATEGORY_MAP.md          ├── ORDER_MODEL.md
├── ORDER_DETAIL_MODEL.md           ├── DOMAIN_MODEL.md
├── AUTH_MODEL.md                   ├── CURRENT_WORKFLOW_ANALYSIS.md
├── MARKET_OPTIONS.md               ├── TECHNICAL_BASELINE.md
├── NEW_INFORMATION_ARCHITECTURE.md ├── NEW_UI_UX_DIRECTION.md
├── HOME_WORKBENCH_SPEC.md          ├── BATCH_ORDER_OPERATION_SPEC.md
└── EXPEDITE_WORKFLOW_SPEC.md
```

## 8. Phase 1 计划（基础工程 + 首页 + 查单，非全量开发）

| 步骤 | 交付物 | 验收标准 |
| ---- | ---- | ---- |
| 1A 基础工程 | 装并启用 pnpm；thin 版重装依赖；删除全部 demo 页；建立 service/legacy 目录骨架；URL 隔离 lint 规则；设计令牌落地（UI/UX §7） | `pnpm dev` 起空白工作台；lint 拦截 `/chsjs` 字面量；`pnpm build` 成功并回填 dist 体积（补 NOT TESTED） |
| 1B Legacy Adapter | legacyOrderAdapter + 领域类型（OrderListItem/OrderDetail/OrderStatus） | 单测：getOrderList 响应 → 领域对象映射正确（含 sort=0&sorttype=1 必传、ordrtyp→shop 翻译） |
| 1C 查单 Service | orderService.list/search（含批量订单号解析器） | 单号/店铺/批量粘贴三模式单元测试通过 |
| 1D 首页 | 按HOME_WORKBENCH_SPEC 实现（mock 可先行） | 4 卡片数据 = 接口真值；品类搜索命中 keywords |
| 1E 查单接入 | 首页/订单中心走真实 Adapter（真实账号只读） | 与旧系统数据一致（同一订单字段比对）；仅 GET 请求 |
| 1F 订单详情 Drawer | 概要/版次/文件 Tabs（聊天/校对记录 Tab 骨架占位） | 字段与 ORDER_DETAIL_MODEL 一致；PII 脱敏显示 |
| 验收 | 真实账号只读走查 | 全流程无写请求；与旧系统逐字段核对通过 |

Phase 2（催单中心）→ Phase 3（品类中心）→ Phase 4（完整订单工作台）依 Phase 1 验收结果再排。

## 9. 未解决问题（仅列会阻塞开发的）

- 无阻塞性未知。以下为已识别但已给出处置的项：本机 pnpm 缺失（1A 第一件事）、构建跨平台两坑（处置方案已写入 TECHNICAL_BASELINE §1）、详情动态子接口 POST 未调用（1F 需要时与用户确认后接入）。
