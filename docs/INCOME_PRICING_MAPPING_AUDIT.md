# INCOME_PRICING_MAPPING_AUDIT —— 收入记录→商品规则映射取证（P1-02）

> 任务卡：P1-02（任务书 §三）。**只读取证，不实现映射算法。**
> 取证时间：2026-09-21 ｜ 方法：getIncomeList(287 行全量) × getOrderList(549 行全量) 匹配矩阵 + needsDetail2.do 内嵌 JSON 分层抽样（6 深挖 + 16 分层）。
> 红线：凭据/SESSION 不入库；样本输出脱敏；禁止在本阶段拍板映射算法。
> 脚本：`.tmp-evidence/income-mapping-audit.mjs` / `detail-goodsid-probe.mjs` / `goodsname-mapping-stability.mjs`（gitignored）。

---

## 一、总览矩阵（任务书 §三 要求的五项计数）

| 指标 | 值 | 依据 |
|---|---|---|
| **total income records** | 287（2026-09，limit=100 分页拉全） | [VERIFIED] getIncomeList pageInfo.total=287，fetched=287 |
| **mapped**（收入→订单→商品可达） | **287 / 287 = 100%** | [VERIFIED] 见 §二 |
| **unmapped**（订单列表查无此号） | **0** | [VERIFIED] 含 TT_ 特殊单（TT_ 前缀单全部命中） |
| **ambiguous**（同号多订单） | **0** | [VERIFIED] ordernum → 订单行 一对一 |
| **multi-product**（一单多商品） | **3 / 287 = 1.05%**（拼接名形态） | [VERIFIED] goodsname 含 "/" 的复合名 x3（名片/名片 x2、PVC名片/PVC名片 x1） |

补充计数：**一单多条收入记录 = 0**（287 收入记录 ↔ 287 unique ordernum，无重复中标）。

## 二、映射链路逐环验证

```
IncomeRecord.ordernum
  → getOrderList.do 行（ordernum 唯一索引）        287/287 命中 [VERIFIED]
  → needsid
  → needsDetail2.do 内嵌 JSON（{&#034;applyid&#034; 起始平衡扫描）
  → goodsFileParamList[].goodsid / subGoodsid       6 深挖 + 16 分层样本 0 失败 [VERIFIED]
```

各环证据：

| 环节 | 结论 | 证据 |
|---|---|---|
| ① 订单列表 38 字段 | **不含 goodsid/subGoodsid**（`hasGoodsId=false` 全 549 行核实） | [VERIFIED] 字段普查 |
| ② 收入明细 7 字段 | `childProceeds, createtime, createtimestr, goodsname, issuingtime, issuingtimestr, ordernum`——**不含 goodsid** | [VERIFIED] 字段普查 |
| ③ 详情内嵌 JSON | `goodsFileParamList[]` 每条含 `goodsid / goodsname / subGoodsid / subGoodsname` | [VERIFIED] Phase 0 已实现（detail-mapping.ts `mapFileConstraint`），本轮 22 样本复核 |
| ④ 版次行 products[] | 27 键，**无 goods 类字段**（金额 je / 数量 spsl / 规格等） | [VERIFIED] 键普查 |

## 三、商品名→商品 ID 映射稳定性（分层抽样）

每种 goodsname 抽 3 单（覆盖全部 7 种名称，16 详情 0 失败）：

| goodsname（收入明细） | goodsid | subGoodsid | 稳定性 |
|---|---|---|---|
| 名片 | 548890581 | 1604601457（双面） | STABLE 3/3 |
| PVC名片 | 1717812924 | 1717813902 | STABLE 3/3 |
| 普通特种纸名片 | 1905267588 | 1905267995 | STABLE 3/3 |
| 对裱名片 | 1948177609 | **-1**（无子商品） | STABLE 3/3 |
| 宣传单 | 548890565 | 1604601446 | STABLE 3/3 |
| 名片/名片 | 548890581+548890581（两文件约束条目） | 同左各自 | STABLE 2/2 |
| PVC名片/PVC名片 | 1717812924+1717812924 | 同左各自 | STABLE 1/1 |

**关键发现**：

1. **goodsname ↔ goodsid 当前为确定性等值映射**（7/7 稳定，0 冲突）——注意：这是"同月同账号 287 单实测"，**不是**"goodsName 可以模糊猜 goodsId"的授权。任务书禁令依然有效：**映射表只能由详情实证构建，新 goodsname 首次出现必须拉详情验证，禁止猜测**。
2. **复合名 = `join(goodsFileParamList[].goodsname, "/")`** [VERIFIED 复合名 3 样本全等]——即"名片/名片"不是独立商品，是一单两个文件约束条目的拼接展示。规则匹配必须在 **gfp 条目级**进行，不能按拼接名整体匹配。
3. **subGoodsid 存在第三态 `-1`**（= 无子商品，对裱名片）——与"未设置(null)"/"空串"不同。映射归一化约定：`-1 → null`（goodsId 级规则）。
4. 平均每单 gfp 条目数 = 1.19（绝大多数单一商品）。

## 四、金额三态核实

- `childProceeds` **零 null**（287 行全有值，[INFERRED] 中标必有金额成立）；
- `Σ childProceeds = 1368` = `getThisMonthIncome(2026-09)` 精确闭合 [VERIFIED]；
- 推论（INCOME_SOURCE_AUDIT §五 口径升级确认）：**切换真实收入源后 `amountSource="undefined"` 分支在"系统口径"侧自然消失**；"undefined" 仅剩理论语义（My 口径规则 amount=null 的显式未设置行）。

## 五、成本约束（决定映射算法形态）

- 单详情 HTML ≈ 500-551KB；**全量 287 单详情 ≈ 145MB/月，不可接受**（Free 纪律 + 旧系统负载）。
- 因此映射算法必须是**增量缓存形态**：
  - `goodsname → {goodsid, subGoodsid}` 映射表由详情实证逐条建立并缓存（D1 或本地）；
  - 收入明细先按 goodsname 查缓存表；**缓存未命中（新商品名）→ 拉一次详情实证 → 回填缓存**；
  - 缓存命中即可完成规则匹配，无需拉详情。
- 复合名按 gfp 条目拆分后逐条查表（两商品单 = 两次规则匹配）。

## 六、遗留风险与边界

| # | 风险 | 等级 | 处置 |
|---|---|---|---|
| 1 | goodsname↔goodsid 等值映射仅在当前 7 种商品名上验证；旧系统新增商品/改名会破坏映射 | 中 | 缓存 miss → 详情实证回填（§五），永不猜 |
| 2 | subGoodsid=-1 语义（无子商品）需在规则唯一键中归一化 | 低 | 归一化 -1 → null（SPEC §6 约定） |
| 3 | 订单列表 549 行为当前全量；收入记录理论可早于订单列表保留窗口（老单不可见）→ unmapped | 低 | 本月 0 命中失败；审计脚本可复跑监控 |
| 4 | 复合单在收入页的品类归属（归入哪个商品）是产品语义决策 | 低 | 收入页按 gfp 条目级展示双行（P1-07 实现时定） |
| 5 | 本审计仅覆盖 2026-09 单月 | 低 | 映射缓存设计本身跨月复用；复跑脚本可扩月 |

## 七、证据文件

- `.tmp-evidence/income-mapping-raw.json`（287 收入行 + 549 订单行原始数据，本地临时）
- 脚本 stdout 全量输出（本文档引用的数据均来自其中）
- 复跑方式：`DJX_USER=xxx DJX_PASS=xxx node .tmp-evidence/income-mapping-audit.mjs`（其余两个探针同）
