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
| P1A-01 | 安装 pnpm（正式安装，禁 NODE_OPTIONS 内联） | TODO | pnpm --version 数据 | - |
| P1A-02 | pure-admin-thin 干净落地 `frontend/`（并入主仓库，处理嵌套 .git） | TODO | frontend/ 目录 | - |
| P1A-03 | 清 demo（保 Layout/Router/Auth/Pinia/Axios/Theme/Permission/Error handling） | TODO | dev 看到"设计工作台"空白壳 | - |
| P1A-04 | 目录骨架（service/{order,expedite,category,message,data,account}.ts + service/legacy/* + views/* + components/*） | TODO | 骨架文件树 | - |
| P1A-05 | URL 隔离 ESLint 规则（/chsjs、\.do 只许在 src/service/legacy/） | TODO | lint 规则 + 违例演示 | - |
| P1A-06 | Session Proof（同源/跨源判断 → Vite proxy 同源方案 → 登录页 RSA → docs/SESSION_INTEGRATION_PROOF.md） | TODO | 证明文档 + Cookie 表现记录 | - |
| P1A-07 | Order API Proof（legacy/order.ts + order.ts 映射 OrderListItem；sort=0&sorttype=1 必传） | TODO | 列表拉通证明 | - |
| P1A-08 | Detail API Proof（needsid 主键 + applyid 兼容；HTML 内嵌 JSON 提取移植 TS） | TODO | 详情拉通证明 | - |
| P1A-09 | 详情 Drawer 技术 Proof（极简测试页：输入单号 → 查询 → 摘要 → 脱敏 JSON） | TODO | 测试页 | - |
| P1A-10 | 4 个测试文件（sort 默认值 / 38 字段映射 / ordrtyp→shop + state→Status / needsid+applyid / ERP Snapshot / products / 4 种分隔符） | TODO | vitest 全绿 | - |
| P1A-11 | Mock/Real 分离（VITE_LEGACY_API_ENABLED；凭据禁入 .env） | TODO | 环境开关证明 | - |
| P1A-12 | pnpm lint/test/build 数据回填 TECHNICAL_BASELINE.md（NOT TESTED → 真实值） | TODO | 回填后的基线文档 | - |

## 附加约束（长文下达，随任务落实）

1. **消息定位修正**：消息是全局能力（顶栏铃铛/通知中心），**不是第 7 个侧栏项**。若 Phase 0 文档中有相反表述（如 IA 文档将消息列为侧栏模块），随 P1A-04 同步修正。
2. **催单命名规范**：禁用"一键催单 / 发送催单"表述，统一为 **"生成催单文本 / 复制催单文本 / 加入催单清单"**。随 P1A-04 检查所有文档与代码命名。
3. **38 字段禁直出 UI**：列表接口 38 字段必须经 Adapter 映射为 `OrderListItem` 后才可进入视图层；`ordrtyp`（语义错位存店铺名）只在 Adapter 层改名为 `shop`。
4. **跨源兜底**：Session 无法稳定跨源 → P1A-06 标 BLOCKED，走最小 Vite proxy / BFF，禁止硬编码 Cookie 等不可靠方法。
5. **最小壳 UI**：侧栏 6 项（首页工作台/订单中心/催单中心/品类中心/数据中心/账户中心）+ 空白工作台。

## 15 项验收清单（全 PASS 才进 1B）

| # | 验收项 | 状态 |
|---|--------|------|
| 1 | pnpm 正式安装可用，pnpm --version 有真实数据 | TODO |
| 2 | frontend/ 并入主仓库，无嵌套 .git | TODO |
| 3 | pnpm dev 可启动，看到空白壳 | TODO |
| 4 | 清 demo 后 Layout/Router/Auth/Pinia/Axios/Theme/Permission/Error handling 保留 | TODO |
| 5 | 目录骨架符合 TECHNICAL_BASELINE 四层架构 | TODO |
| 6 | ESLint 拦截 legacy/ 之外的 /chsjs、\.do 字面量（有违例演示） | TODO |
| 7 | Session Proof：登录 → 带 Cookie 调用成功 → SESSION_INTEGRATION_PROOF.md 成文 | TODO |
| 8 | Order API Proof：sort=0&sorttype=1 拉通真实列表 | TODO |
| 9 | OrderListItem 映射：38 字段不直出 UI，ordrtyp→shop 只在 Adapter | TODO |
| 10 | Detail Proof：needsid 主键 + applyid 兼容，提取器 TS 化 | TODO |
| 11 | Drawer 技术 Proof 测试页可用（脱敏 JSON） | TODO |
| 12 | vitest 4 个测试文件全绿 | TODO |
| 13 | VITE_LEGACY_API_ENABLED 开关生效，Mock/Real 分离 | TODO |
| 14 | 全程只 GET，无任何写接口调用 | TODO |
| 15 | pnpm lint/test/build 真实数据回填 TECHNICAL_BASELINE.md | TODO |

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
