# INCOME_CUTOVER_SPEC —— 收入域切换真实源（P1-01 冻结）

> 任务卡：P1-01（任务书 §一/§二）。本文档冻结口径与契约，实现（P1-03/04/07/08）必须逐条对齐；偏离即回改本文档先行。
> 上游依据：`docs/INCOME_SOURCE_AUDIT.md`（六端点取证）、`docs/INCOME_PRICING_MAPPING_AUDIT.md`（映射审计）。
> 红线：禁 fallback 假数据；禁 null→0；禁把订单列表当收入源；禁前端拉 500×N 条订单自算收入。

---

## 1. 冻结的真实口径 [VERIFIED]

| 项 | 冻结值 |
|---|---|
| 收入数据源 | 旧系统六端点（`/chsjs/child/` 下 getThisMonthIncome / getAllIncome / getThisMonthFind / querySameMonthData / getIncomeList / getDeductionList，全 POST） |
| 月收入语义 | `getThisMonthIncome.moneys`（旧系统口径，直取，禁止重算覆盖） |
| 记账时间锚点 | `createtime` = **中标时间**（月/日落位锚点；与结算、发单时间无关） |
| 收入记录 | `getIncomeList.dataList`（注意键是 `dataList` 非 `list`） |
| 计入条件 | 出现在 getIncomeList 即计入（中标即收入）；**订单 state 不参与** |
| 罚款 | 独立体系（getDeductionList / getThisMonthFind / 折线 deductMoneys），与收入分开展示 |
| 明细金额 | `childProceeds`（整数元；实测恒有值，零 null） |
| 数据闭环 | 日折线合计=moneys(月)；Σ月=getAllIncome（审计已证，切换后作为契约测试断言） |
| **禁止** | `getOrderList.do` 作为收入源；"拉 500/1000/2000 条订单→前端求和" |

## 2. IncomeRecord 模型（任务书 §二）

```ts
interface IncomeRecord {
  orderNo: string;          // ordernum（含 TT_ 前缀形态）
  awardTime: string;        // createtime（中标时间，记账锚点）
  issueTime?: string;       // issuingtime（发单时间，辅助列）
  goodsName: string;        // goodsname（可为复合拼接名 "A/B"）
  legacyAmount: number;     // childProceeds（实测恒有值）
  goodsId?: string | null;  // 见 §3 映射路径
  subGoodsId?: string | null;
}
```

**goodsId/subGoodsId 获取路径（P1-02 审计定案）**：

1. 收入明细与订单列表均**不含** goodsId（38 字段/7 字段实测），唯一真实来源 = 订单详情 `goodsFileParamList[]`；
2. 映射算法 = **增量实证缓存**：
   - 缓存表 `goodsname → {goodsId, subGoodsId|null}`（持久于 localStorage `goodsIdMap:<userIdentity>`，非敏感数据不入 D1、不加新基础设施）；
   - 收入明细行先查缓存表；**缓存未命中 → 经 /api/orders/detail 拉详情实证 → 回填缓存**（永不猜，审计 §五）；
   - 复合名（"A/B"）先按 `/` 拆分逐段查表（复合名 = join(gfp[].goodsname) 已实证），规则匹配在条目级进行；
3. `subGoodsid = -1` 归一化为 `null`（goodsId 级规则；-1 是旧系统"无子商品"第三态，审计 §三）；
4. 映射失败（详情实证不可得）→ `goodsId = null`，该行不参与规则匹配但**保留在系统口径中**（legacyAmount 不受影响）。

## 3. 双口径与金额覆盖算法（任务书 §三/§四/§五）

**System Amount（系统口径）** = 旧系统真实口径：`Σ childProceeds`（月度直取 `moneys`，不重算）。

**My Amount（我的统计）** = 收入明细逐行应用用户规则后的有效金额之和：

```text
for each IncomeRecord:
  resolve pricing rule (goodsId, subGoodsId)  // §2 映射路径
  if override 存在且 enabled:
      effectiveAmount = overrideAmount; amountSource = "override"
  else if legacyAmount 非 null:               // childProceeds
      effectiveAmount = legacyAmount;        amountSource = "legacy"
  else:
      effectiveAmount = null;                amountSource = "undefined"
```

铁律：

- **override > legacy > undefined** 优先级不变；
- **禁止 null → 0**：undefined 行不参与求和、不静默归零，显式计数 `undefinedCount` 展示；
- **moneys 不可改写**：系统口径恒等于旧系统 `moneys`；两口径必须**分开双行展示**（"系统口径 ¥1368 / 我的统计 ¥xxxx"），仅存在覆盖规则时二者不同；无覆盖规则时"我的统计 = 系统口径"，不伪装成旧系统原始数据；
- 收入页标注"**按中标时间统计**"；禁用"已结算/到账/工资"字样（旧系统未证明该语义）。

**金额三态测试矩阵（必须保留并通过）**：

| Case | legacyAmount | overrideAmount | effectiveAmount | amountSource |
|---|---|---|---|---|
| A | null | null | null | undefined |
| B | null | 35 | 35 | override |
| C | 20 | null | 20 | legacy |
| D | 20 | 35 | 35 | override |

> 注：真实收入源下 childProceeds 恒有值 → Case A 在系统口径侧不再自然出现；三态测试保留为**规则引擎契约**（规则 amount=null 的显式未设置行仍走 A 语义）。

## 4. Worker API 契约（P1-04 实现，任务书 §六/§七）

**移除**：现 `/api/income/summary|orders` 的 getOrderList 别名（index.ts §八）。

**新增白名单四端点**（GET-only，Session 保护，内部 adapter 严格映射六端点，无开放代理）：

```text
GET /api/income/summary?range=month|all&month=yyyy-MM
GET /api/income/trend?month=yyyy-MM
GET /api/income/orders?month=yyyy-MM&page=&limit=     // 明细分页透传
GET /api/income/deductions?month=yyyy-MM&page=&limit=
```

响应结构（统一 `{result, data}` 信封）：

```ts
// summary —— systemIncome/orderCount/avgPerOrder 服务端可算（moneys + 明细 total）；
// myIncome/undefinedCount 涉及用户规则，由前端 Income Service 叠加填充（Worker 无规则知识，Free CPU 纪律）
{
  range: "today" | "week" | "month" | "all",
  systemIncome: number | null,   // moneys；无数据月 = null（显示"—"）
  myIncome: number | null,       // 前端填充
  orderCount: number,            // getIncomeList pageInfo.total
  avgPerOrder: number | null,    // systemIncome / orderCount（orderCount=0 → null）
  undefinedCount: number         // 前端填充（My 口径 undefined 行数）
}

// trend
{ dates: string[], systemIncome: number[], deduction: number[] }   // querySameMonthData 透传归一

// orders
{ list: IncomeRecord[], total: number }                            // getIncomeList 分页

// deductions
{ list: DeductionRecord[], total: number }                         // getDeductionList 分页
// DeductionRecord: { orderno, typename, designerDeduction, reason }
```

数据缺失语义：无数据月 `data` 缺省（C5 实测 `{result:true}` 无 data）→ `systemIncome = null` → 前端显示"—"；**禁止 0**。

## 5. 时间范围策略（任务书 §八，禁伪造"今日/本周"）

| UI 范围 | 实现 | 标注 |
|---|---|---|
| 本月 | `getThisMonthIncome(queryTime)` 直取 moneys + `getIncomeList` 明细 | —（服务端原生口径） |
| 今日 / 本周 | **当月明细（getIncomeList）前端按 createtime 时间过滤聚合** | UI 明示"按月度明细的前端时间过滤"（数据诚实性标注） |
| 全部 | `getAllIncome()` | — |

明细规模保护：分页 limit=100 循环拉取，上限 `min(总页数, 10)`（当前 287 条 = 3 页，充裕）；若月明细 total > 1000，本策略降级为仅"本月"口径并提示（记录在案，未来另做服务端聚合，不在本阶段实现）。

## 6. 前端切换点（P1-07/08 实现范围）

| 现状 | 动作 |
|---|---|
| `fetchIncomeScope`（拉 500×4 订单） | **退役删除** |
| `income.ts getIncomeDashboard/getIncomeOrderList/getUndefinedOrders` | 改调 `/api/income/*` + 规则引擎（§3） |
| 收入页大数字 | 双行：系统口径（moneys）/ 我的统计（Σ effectiveAmount）+ "按中标时间统计"标注 |
| 品类分布 | 按明细 goodsname（gfp 条目级）分组，点击 → 收入记录 → orderNo → OrderDrawer 反查 |
| 订单反查行展示 | 系统金额 + 我的金额 + 金额来源（"来源：个人规则"/"来源：系统金额"） |
| API 失败 | Real 模式 throw → 显式"加载失败 + 重试"；**禁止 mock fallback**（P0 红线延续） |

## 7. 明确不做（本阶段，任务书 §二十二）

生产部署 / 改旧系统 / 催稿发送 / WebSocket / 大规模订单缓存 / 全量 D1 同步 / 重做 UI / 新基础设施。
