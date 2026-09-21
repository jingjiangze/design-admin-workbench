# ORDER-HISTORY-AUDIT — 单号查历史 · 完整性审计记录（2026-09-21）

> 审计对象：commit `1af0ab5` 引入的单号查历史功能。
> 加固落地：`edb3a11`（服务）/ `036a179`（测试）/ `e1ac5f0`（proof 探测）。
> 方法：真实旧系统只读取证 + fixture 单测 + staging 真实 E2E。禁止伪造数据。

## 一、审计发现与处置

| # | 审计项 | 发现 | 处置 |
|---|--------|------|------|
| 1 | NEEDSID_CAP=10 截断 | 真实账号暂无 >10 需求样本 [NOT AVAILABLE IN CURRENT ACCOUNT DATA]；但截断代码属人为风险 | **已废弃**。needsid 全量装载，fixture 测试 13 个 needsid 全通过 |
| 2 | pageSize=50 截断 | 同上，50 可能截断完整历史 | **已废弃**。`fetchAllOrdersByNo` 按 total 翻页拉全（仅历史查询，普通订单页不变），上限 20 页防御 |
| 3 | 失败伪装成无交稿 | `catch → rows:[] + blockFound:false`，请求失败与无区块混淆 | **已修**。`DeliveryLoadStatus = "ok" \| "no-block" \| "error"`，error 显式带 errorMessage，UI 分态呈现 |
| 4 | 区块定位脆弱 | 仅匹配 `class="draft-record"` 精确形态 | **已加固**。class-token 检测（单双引号/复合 class），行切块容忍额外属性/空白；真实样本两种形态 [VERIFIED] |
| 5 | HTML 实体 | `&` 与 `&amp;` 混用已在此前修过 | **保留** `&(?:amp;)?` 容错并加测试；`&quot;`/`&nbsp;` 不影响 recordid/needsid/type 语义 [VERIFIED 正则层面] |
| 6 | 同类型多文件 | 两份真实样本每行每类文件恰 1 个 [VERIFIED]；多文件场景 [NOT TESTED 无样本] | 保持 `string \| null`（取第一个）。取到反例再升级 `string[]`，**不猜** |
| 7 | 设计单号分隔 | 真实样本英文逗号无空格 [VERIFIED] | 兼容中英文逗号 + 逗号后空格；从首个 `TT_` 起截取防时间文本混入误切 |
| 8 | 时间解析 | 12AM→00 / 12PM→12 已正确 | 补齐 12 个月 + 边界时刻单测（12:00 AM/12:00 PM/1 AM/1 PM/11:59 PM）；`timeText` 原样保留，无法归一化时仍可见 |
| 9 | 订单-交稿关联 | `orderId` 即旧系统 needsid [VERIFIED 2026-09-21 详情接口与列表接口对照] | 保持 `orders.find(o => o.orderId === needsid)` 精确等值匹配，无模糊匹配 |
| 10 | 单号包含匹配误关联 | ordernum= 为包含匹配 [VERIFIED] | **精确匹配优先**：`normalizeOrderNo`（trim/全角/大小写）后 exact 命中则只取 exact；无 exact 保留候选并在 UI 标注"未找到完全一致的订单号" |
| 11 | 无限并发风险 | — | `runWithConcurrency(needsids, 2)`，1 需求=1 详情请求，同时最多 2 |
| 12 | 失败降级 | 单需求失败曾拖垮整页语义 | 单失败不影响其他需求；顶部 `ok/N 已加载，M 条读取失败——点击重试失败项`；`retryFailedDeliveries` 仅重发失败项 |
| 13 | 缓存 | — | 同会话内存 Map 短缓存；**不做** localStorage 持久（数据量大/含潜在 PII/过期复杂） |
| 14 | PII | 交稿/改价/订单字段不含完整客户 PII [VERIFIED 字段清单] | 前端仅解析 `.draft-record` 等所需区块，禁 `v-html` 全量渲染（未使用） |
| 15 | Worker 端点 | `/api/orders/price-change` | GET only + 认证 + legacy 白名单 + orderNo trim/长度限制（price-change.ts）[VERIFIED] |

## 二、空数据语义（审计 §二十，五态不混淆）

| 状态 | 判定 | UI 呈现 |
|------|------|---------|
| 订单不存在 | orders.length = 0 | "未查到单号 X 对应的订单" |
| 无交稿区块 | status = no-block | "未找到交稿记录区块——可能尚未交稿，或旧系统模板变更" |
| 区块存在 0 行 | status = ok, rows=0 | "该需求尚未交稿（区块存在但无记录行）" |
| 请求失败 | status = error | "交稿记录读取失败：{原因}"，可重试 |
| 解析失败 | —（当前解析器对已知模板稳健，异常输入返回 found=true+0 行，与"区块存在 0 行"同态） | 记录为已知限制，引入反例时拆分第五态 |

## 三、改价语义（审计 §十六/§十七）

旧系统 `GET /chsjs/editNeeds/query?ordernum=` [VERIFIED] 每单号仅返回**最新一条**申请+审核。
UI 标题已改为「最近一次改价」，不再声称"全部改价历史"；未发现历史列表端点前**不伪造全量**。

## 四、真实 staging E2E 门禁（b7a5993e，2026-09-21）

样本：`TT_260908007929`（用户自有测试单）。脚本：`.tmp-evidence/ui-qa/e2e-order-history.mjs`（凭据仅环境变量）。

```text
订单记录    PASS  1 条（exact 命中，¥20/已中标/2026-09-19 09:02:02）
交稿记录    PASS  1 次交稿，时间 2026-09-19 09:34:14（isoTime 归一化）
设计单号    PASS  5 版全列（第一版~第五版）
文件三态    PASS  final/source/proof 均已上传
最近一次改价 PASS  标准设计→修改设计 · 申请 11:37:29 · 审核通过 12:30:56 韩彩玉
error≠空   PASS  服务层单测契约（vitest 24/24）
```

覆盖矩阵（审计 §二十一）：

| 样本类型 | 结果 |
|----------|------|
| TT_ 单号 | VERIFIED（真实 E2E） |
| 普通数字单号 | NOT AVAILABLE IN CURRENT ACCOUNT DATA（单测 fixture 覆盖精确匹配语义） |
| 无改价订单 | VERIFIED（E2E 空态分支 + UI 空文案） |
| 有改价订单 | VERIFIED |
| 无交稿需求 | VERIFIED（no-block/ok-0-rows 单测 + UI 分态） |
| 多次交稿需求 | VERIFIED（单测 3 行全列；真实账号暂无多行样本） |
| 多需求订单（>10） | NOT AVAILABLE IN CURRENT ACCOUNT DATA（单测 13 needsid 无截断覆盖） |

## 五、PASS 判定（§三十一）

```text
[PASS] 单号精确匹配          [PASS] 请求失败 ≠ 无交稿
[PASS] 多需求完整            [PASS] 无交稿 ≠ 请求失败
[PASS] >10 需求不截断(单测)   [PASS] 改价语义="最近一次"
[PASS] 分页完整              [PASS] TT_ 单号
[PASS] 多次交稿全部显示       [PASS] PII 不误显示
[PASS] 每次交稿时间正确       [PASS] Worker whitelist
[PASS] 设计单号不丢          [PASS] 真实 staging E2E
[PASS] 文件三态正确          [PASS] lint / unit tests / build
[PASS] HTML entity 正确      [PASS] GitHub remote HEAD（推送后核对）
```

**ORDER_HISTORY = VERIFIED**（其中"普通数字单号/多需求订单"依赖真实样本缺口，以单测 fixture 覆盖并显式标注）。
