# PRICING_RULE_SPEC — 商品金额规则规格（定稿）

> 状态：**SPEC FINAL** — 2026-09-20（Phase 1B）
> 数据边界：**自定义金额只影响新工作台的个人收入统计，绝不修改旧系统原始订单金额。**

## 1. 概念与命名

正式命名：**商品金额规则**（Pricing Rule）。
禁用命名：手工改订单金额 / 修改订单价格 / 修改ERP金额（这些暗示修改旧系统，全部禁止）。

背景：部分商品（goodsid）在旧系统中没有定义设计金额（design_money 为空），设计师需要自己为这些商品定义"用于个人收入统计的金额"。

## 2. 数据模型

```typescript
/** 商品金额规则（用户自定义，仅新系统收入统计使用） */
interface PricingRule {
  id: string;                    // 规则唯一标识（uuid）
  goodsId: string;               // 商品 ID（旧系统 goodsid，字符串形态）
  subGoodsId?: string;           // 子商品 ID（可选，精确到子品类）
  productName: string;           // 展示名（如"PVC名片"）
  amount: number | null;         // 自定义金额；null = 未设置（区别于 0）
  enabled: boolean;              // 规则启用开关
  source: "user";                // 来源（Phase 2+ 服务器规则预留扩展）
  updatedAt: string;             // ISO 时间戳
}
```

订单领域对象金额三层（Adapter 映射产物，禁止在组件中计算）：

```typescript
interface OrderListItem {
  // ...Phase 1A 既有字段
  legacyAmount: number | null;    // 原始金额：旧系统 design_money，空→null，原样保存
  overrideAmount: number | null;  // 统计金额：命中用户规则时的金额，未命中→null
  effectiveAmount: number | null; // 最终统计金额：resolveOrderAmount 的产物
  amountSource: AmountSource;     // "override" | "legacy" | "undefined"
}
```

⚠️ 禁止 `order.money = 8` 这类对原始数据的写操作——三层字段全部由 `resolveOrderAmount` 纯函数生成。

## 3. 金额三层模型

| 层 | 字段 | 来源 | 可变性 |
|----|------|------|--------|
| 原始订单金额 | `legacyAmount` | 旧系统 order.design_money | 只读，原样保存 |
| 用户自定义金额 | `overrideAmount` | PricingRule 匹配结果 | 用户可增删改 |
| 最终统计金额 | `effectiveAmount` | 计算产物 | 派生，不落库 |

## 4. 规则优先级（可扩展链）

```text
① goodsId + subGoodsId 精确规则   （最优先）
② goodsId 子品类规则
③ goodsId 一级业务品类规则
④ 旧系统原始金额 legacyAmount
⑤ 金额未定义（amountSource = "undefined"）
```

示例：PVC名片（子品类）设 ¥8，名片（一级）设 ¥5 → PVC 名片订单 ¥8，普通名片订单 ¥5。

## 5. "未定义"与"0 元"严格区分

| 状态 | 语义 | UI 表现 |
|------|------|---------|
| 未定义（amountSource="undefined"） | 设计师还没确定如何统计 | "⚠ 金额未定义" 灰底警告样式；不计入收入，单独计数 |
| ¥0（effectiveAmount=0） | 设计师明确认为该商品收入为 0 | "¥0" 正常样式；计入统计（为 0） |

判定逻辑：`legacyAmount=null 且 overrideAmount=null` → undefined；任一层显式为 0 → 0。

## 6. 存储设计

- **Phase 1**：localStorage，经 `pricingRuleStore` 封装，key = `pricingRules:<userIdentity>`。
  - userIdentity 取登录用户标识（账户名/手机号尾号等）；取不到时用 `local` 兜底并在文档标注。
- **禁止**页面组件直接 `localStorage.setItem(...)`——一切读写经 store。
- **Phase 2+**：切换为 Server persistence（User Account 关联 userId），UI 与 Service 不感知存储位置（store 接口不变）。

```typescript
// pricingRuleStore 接口（src/service/pricing/pricing-rule-store.ts）
listRules(): PricingRule[]
getRule(goodsId, subGoodsId?): PricingRule | null
setRule(input: { goodsId, subGoodsId?, productName, amount }): void   // upsert
clearRule(goodsId, subGoodsId?): void          // 恢复系统金额 = 删除规则（override→null）
setEnabled(goodsId, subGoodsId?, enabled): void
importRules(json: string): ImportPreview       // 导入前预览
commitImport(preview: ImportPreview): ImportResult
exportRules(): string                          // JSON 序列化
```

## 7. 恢复系统金额

用户对 PVC 设置 ¥8 后想恢复旧系统金额：执行"恢复系统金额"→ 删除该规则 → `overrideAmount=null` → 统计回落到 `legacyAmount`（若也为 null 则"未定义"）。**不能删除商品本身**（商品目录来自旧系统）。

## 8. 导入/导出协议

导出 JSON 形态（最小字段，便于手改）：

```json
[
  { "goodsid": "1717812924", "subGoodsid": "", "displayName": "PVC名片", "amount": 8 }
]
```

导入流程：解析 → 生成预览（`发现 N 条 / 新增 x / 覆盖 y / 跳过 z`）→ 用户确认 → 提交生效。
跳过判定：同名同 goodsId 且金额相同（无变化）；amount 非法（负数/非数字）跳过并计入预览说明。

## 9. UI 落点

- 品类中心 → 金额规则页：按品类分组商品卡（系统金额 / 我的金额 对照列），搜索（名称/goodsid/subGoodsid/keywords），设置金额弹窗（含"用于个人收入统计，不修改原订单金额"说明），批量设置。
- 金额未定义的商品行醒目提示（⚠ 未设置），设计师可快速扫出缺口。
