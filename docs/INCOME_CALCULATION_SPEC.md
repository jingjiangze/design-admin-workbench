# INCOME_CALCULATION_SPEC — 收入计算规格（定稿）

> 状态：**SPEC FINAL** — 2026-09-20（Phase 1B）
> 边界：收入页展示的是**当前登录设计师自己的数据**；不混入他人订单/收入/规则。

## 1. 金额解析算法（唯一权威实现：resolveOrderAmount）

```text
IncomeAmount(order, pricingRules):
1. 优先命中用户 goodsid/subGoodsid 自定义规则 → effectiveAmount = rule.amount
2. 没有规则 → 使用旧系统原始设计费 legacyAmount
3. legacyAmount 为空 → amountSource = "undefined"，不计入收入
```

| Case | legacy | override | effective | amountSource |
|------|--------|----------|-----------|--------------|
| 1 | 10 | null | 10 | legacy |
| 2 | null | 8 | 8 | override |
| 3 | 10 | 8 | 8 | override |
| 4 | null | null | null | **undefined** |
| 5 | 10 | 0 | 0 | override |

⚠️ **Case 4 ≠ ¥0**：未定义不计入收入、单独计数显式提醒；Case 5 计入统计且金额为 0。0 与 undefined 严格不同（测试锁定）。

## 2. 统计口径（IncomePolicy 配置化）

```typescript
type IncomePolicy = {
  /** 进入统计的订单状态（6 视图语义，非旧 state 数字） */
  includedStatuses: OrderView[];
  /** 是否用自定义金额优先（false = 纯系统口径） */
  useOverrideAmount: boolean;
  /** 未定义金额订单是否计入统计（false = 排除并单独计数） */
  includeUndefinedAmount: boolean;
};
```

**第一版默认值（固定，不开放 UI 配置）**：

```typescript
export const DEFAULT_INCOME_POLICY: IncomePolicy = {
  includedStatuses: ["completed"],   // 审核通过 / 订单完结 / 完结
  useOverrideAmount: true,
  includeUndefinedAmount: false
};
```

**证据等级 [INFERRED]**：Phase 0 未对旧收入页面做专项取证。默认口径依据：
- 6 视图中 `completed`（审核通过/订单完结/完结）语义最接近"可结算"；
- 进行中/待审核订单金额尚未落定；风险单（流标/超时/不良）不应计入。
**待办**：后续对旧收入页取证后修订 `includedStatuses`，修订时更新本节并补测试。

## 3. 双口径展示

| 口径 | 计算 | 用途 |
|------|------|------|
| **我的统计**（默认突出） | 按 IncomePolicy + 金额规则三层解析 | 设计师自查收入 |
| 系统金额 | 仅 legacyAmount 求和（同样只统计 includedStatuses） | 与旧系统设计费对照，发现规则差异 |

两口径并排展示但不混算；差异本身不自动解释，通过订单级"金额来源"反查。

## 4. 日期过滤

- 维度：本日 / 本周 / 本月 / 自定义日期区间。
- 时间字段：订单 `completeTime`（完成时间）为收入归属时间；`completeTime` 为空的订单不进入已完结统计（[INFERRED] 未完结订单本就不在 includedStatuses 内）。
- 周 = 周一至周日（中国工作习惯）。

## 5. 汇总指标（getIncomeSummary）

| 指标 | 定义 |
|------|------|
| 本日/本周/本月收入 | effectiveAmount 求和（我的统计口径） |
| 已完成订单数 | includedStatuses 内订单计数 |
| 平均每单金额 | 收入合计 / 计入订单数（分母不含未定义单） |
| 金额未定义 | amountSource="undefined" 且命中统计状态的订单数（显式提醒，不计入收入） |

禁止把 undefined 订单静默混入 ¥0——收入页必须显示"N 个订单未计入收入统计"并引导到金额规则页。

## 6. 反查链路（收入 → 品类 → 订单 → 详情）

```text
收入页汇总卡
  ↓ 点击品类分布项（如"名片 12 单"）
对应订单列表（已按该品类+日期过滤）
  ↓ 点击订单行
订单详情 Drawer（含金额来源解释：本次统计 ¥8 ← 个人金额规则 / 旧系统设计费 / 金额未定义）
```

## 7. Service 职责（src/service/income/）

```typescript
getIncomeSummary(orders, rules, policy, range): IncomeSummary
getIncomeByDate(orders, rules, policy, range): DailyIncome[]
getIncomeByCategory(orders, rules, policy, range): CategoryIncome[]
getIncomeOrders(orders, rules, policy, range, category?): OrderListItem[]
getUndefinedAmountOrders(orders, policy): OrderListItem[]
resolveOrderAmount(order, rules): AmountResolution   // 纯函数，规则优先级唯一实现
```

- `resolveOrderAmount` 与状态过滤均为**纯函数**（无 IO），单测直接覆盖。
- 组件禁止内联金额计算——一律经 incomeService。
