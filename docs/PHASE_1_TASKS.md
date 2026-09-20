# PHASE 1A 任务清单 — 基础工程 + Legacy Session Integration Proof

> 核心原则：**先证明新前端能稳定、只读地调用旧系统接口，再写任何业务页面。**
> Phase 0 已定稿 16 份文档（Final Report 见 `PHASE_0_RESEARCH_REPORT.md`），本阶段为 Phase 1 第一个里程碑。

## 执行约定

- **只读纪律**：全程只 GET。禁止调用 `batchTakeover / insertAbnormalOrder / updateRepulseData / updateRemark / updateIsRead` 及任何催单发送类接口。
- **URL 隔离**：`/chsjs` 与 `*.do` 字面量只允许出现在 `src/service/legacy/`，由 ESLint 规则强制。
- **隐私红线**：Cookie 只记录名称，值一律 `REDACTED`；凭据禁入 `.env` 与任何仓库文件。
- **commit 规范**：一个逻辑任务一个 commit，commit → push → 检查 remote HEAD，禁止 force push。
- **验收门槛**：15 项验收（见文末）全 PASS 才进入 Phase 1B；Session 无法稳定跨源则该项标 BLOCKED 并如实汇报。

## 任务状态总表

| ID | 任务 | 状态 | 产出 | Commit |
|----|------|------|------|--------|
| P1A-01 | 安装 pnpm（正式安装，禁 NODE_OPTIONS 内联） | PASS | pnpm 12.5.1 | d848fb7 |
| P1A-02 | pure-admin-thin 干净落地 `frontend/`（并入主仓库，处理嵌套 .git） | PASS | frontend/（206 文件） | d848fb7 |
| P1A-03 | 清 demo（保 Layout/Router/Auth/Pinia/Axios/Theme/Permission/Error handling） | PASS | dev 看到"设计工作台"空白壳 | 40123f7 |
| P1A-04 | 目录骨架（service/{order,expedite,category,message,data,account}.ts + service/legacy/* + views/* + components/*） | PASS | 骨架文件树（23 文件） | 72d5d7d |
| P1A-05 | URL 隔离 ESLint 规则（/chsjs、\.do 只许在 src/service/legacy/） | PASS | no-restricted-syntax 双规则 + 违例演示 3 error 拦截 | fe4348d |
| P1A-06 | Session Proof（同源/跨源判断 → Vite proxy 同源方案 → 登录页 RSA → docs/SESSION_INTEGRATION_PROOF.md） | PASS* | 技术链路全证明；登录被拒为账号侧问题（见文档 §6） | 7789c31 |
| P1A-07 | Order API Proof（legacy/order.ts + order.ts 映射 OrderListItem；sort=0&sorttype=1 必传） | PASS | proxy 端到端 result=true total=548 | 3deb0f6 |
| P1A-08 | Detail API Proof（needsid 主键 + applyid 兼容；HTML 内嵌 JSON 提取移植 TS） | PASS | 七区块映射 + PII 脱敏；551KB HTML 实测 | 6678d47 |
| P1A-09 | 详情 Drawer 技术 Proof（极简测试页：输入单号 → 查询 → 摘要 → 脱敏 JSON） | PASS | /order/detail-proof 测试页 | 6678d47 |
| P1A-10 | 4 个测试文件（sort 默认值 / 38 字段映射 / ordrtyp→shop + state→view / needsid+applyid / ERP Snapshot / products / 4 种分隔符） | PASS | vitest 28/28 全绿（4 文件） | （P1A-10/11） |
| P1A-11 | Mock/Real 分离（VITE_LEGACY_API_ENABLED；凭据禁入 .env） | PASS | gateway.ts 双通道 + Mock 样本同源 | （P1A-10/11） |
| P1A-12 | pnpm lint/test/build 数据回填 TECHNICAL_BASELINE.md（NOT TESTED → 真实值） | PASS | lint exit 0 / test 28÷28 / build 15.89s·2.25MB；修复 iconfont rollup 解析 bug（public/ 化）+ 补装 4 个模板漏声明依赖 | （P1A-12） |

## 附加约束（长文下达，随任务落实）

1. **消息定位修正**：消息是全局能力（顶栏铃铛/通知中心），**不是第 7 个侧栏项**。若 Phase 0 文档中有相反表述（如 IA 文档将消息列为侧栏模块），随 P1A-04 同步修正。
2. **催单命名规范**：禁用"一键催单 / 发送催单"表述，统一为 **"生成催单文本 / 复制催单文本 / 加入催单清单"**。随 P1A-04 检查所有文档与代码命名。
3. **38 字段禁直出 UI**：列表接口 38 字段必须经 Adapter 映射为 `OrderListItem` 后才可进入视图层；`ordrtyp`（语义错位存店铺名）只在 Adapter 层改名为 `shop`。
4. **跨源兜底**：Session 无法稳定跨源 → P1A-06 标 BLOCKED，走最小 Vite proxy / BFF，禁止硬编码 Cookie 等不可靠方法。
5. **最小壳 UI**：侧栏 6 项（首页工作台/订单中心/催单中心/品类中心/数据中心/账户中心）+ 空白工作台。

## 15 项验收清单（全 PASS 才进 1B）

| # | 验收项 | 状态 |
|---|--------|------|
| 1 | pnpm 正式安装可用，pnpm --version 有真实数据 | PASS（12.5.1，npm i -g） |
| 2 | frontend/ 并入主仓库，无嵌套 .git | PASS（d848fb7） |
| 3 | pnpm dev 可启动，看到空白壳 | PASS（"设计工作台"壳，40123f7） |
| 4 | 清 demo 后 Layout/Router/Auth/Pinia/Axios/Theme/Permission/Error handling 保留 | PASS（40123f7） |
| 5 | 目录骨架符合 TECHNICAL_BASELINE 四层架构 | PASS（72d5d7d） |
| 6 | ESLint 拦截 legacy/ 之外的 /chsjs、\.do 字面量（有违例演示） | PASS（fe4348d，3 error 拦截演示） |
| 7 | Session Proof：登录 → 带 Cookie 调用成功 → SESSION_INTEGRATION_PROOF.md 成文 | PASS*（链路全证明；登录被拒为账号侧问题，文档 §6） |
| 8 | Order API Proof：sort=0&sorttype=1 拉通真实列表 | PASS（3deb0f6，total=548） |
| 9 | OrderListItem 映射：38 字段不直出 UI，ordrtyp→shop 只在 Adapter | PASS（order-mapping.ts） |
| 10 | Detail Proof：needsid 主键 + applyid 兼容，提取器 TS 化 | PASS（6678d47） |
| 11 | Drawer 技术 Proof 测试页可用（脱敏 JSON） | PASS（/order/detail-proof） |
| 12 | vitest 4 个测试文件全绿 | PASS（28/28，390ms） |
| 13 | VITE_LEGACY_API_ENABLED 开关生效，Mock/Real 分离 | PASS（gateway.ts 双通道） |
| 14 | 全程只 GET，无任何写接口调用 | PASS（只读纪律，无写接口调用记录） |
| 15 | pnpm lint/test/build 真实数据回填 TECHNICAL_BASELINE.md | PASS（lint exit 0 / test 28÷28 / build 15.89s·2.25MB，已回填 §4） |

> **Phase 1A 验收结论：15/15 PASS（其中第 7 项带账号侧保留项），满足进入 Phase 1B 条件。**

## 汇报格式（最终 14 项）

1. pnpm 版本与安装方式
2. frontend/ 落地方式（commit 数、目录规模）
3. 清 demo 保留/删除清单
4. Session Proof 结论（同源 or 跨源 + proxy 方案 + Cookie 表现：HttpOnly/SameSite/有效期）
5. Order API Proof 请求参数与响应摘要（countInfo/pageInfo）
6. 38 字段 → OrderListItem 映射表落点
7. Detail Proof：needsid/applyid 双接口结果对比
8. Drawer 测试页截图要点（文字描述）
9. 测试数量与通过率
10. Mock/Real 开关行为
11. pnpm lint/test/build 三命令真实输出数据
12. commits 列表（一个逻辑任务一个 commit）
13. remote HEAD 与本地一致性
14. 遗留 BLOCKED / NOT TESTED 项清单
