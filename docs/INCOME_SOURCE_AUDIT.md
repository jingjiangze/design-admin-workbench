# INCOME_SOURCE_AUDIT —— 收入源直连取证（CF-REAL P0-5）

> 任务卡：CF-REAL-04 P0-5（任务书 §三 P0-5）
> 取证时间：2026-09-21 ｜ 方法：旧系统收益页逆向（toMemberSubIncome.do 页面 → memberSubIncome.js）+ 六端点动态直连
> 红线：只读取证；禁 null→0；凭据/SESSION 不入库。
> 证据等级：[VERIFIED] = 动态实测；[VERIFIED-STATIC] = 页面 JS 静态分析；[INFERRED] = 由数据关系推断。

---

## 一、端点地图 [VERIFIED-STATIC + VERIFIED]

**关键结论：`toMemberSubIncome.do` 是 HTML 页面（GET 36KB / POST 405），不是数据 API。**
真实数据端点为其页面脚本 `memberSubIncome.js` 调用的六个 POST 接口：

| # | 端点（contextPath=/chsjs） | 参数 | 响应 | 用途 |
|---|---|---|---|---|
| 1 | `/child/getThisMonthIncome.do` | 无 或 `queryTime=yyyy-MM`（form） | `{result, data:{moneys:<int>}}` | 月收入金额 |
| 2 | `/child/getAllIncome.do` | 无（JSON body `{}`） | 同上 | 全部收益 |
| 3 | `/child/getThisMonthFind.do` | `queryTime=yyyy-MM` | `{result}`（无数据时 data 缺省） | 月罚款金额 |
| 4 | `/child/querySameMonthData.do` | `queryTime=yyyy-MM` | `{result, data:{dates:["9.1"…], incomMoneys:[…], deductMoneys:[…]}}` | 折线图（日粒度收入/罚款） |
| 5 | `/child/getIncomeList.do` | `queryTime` + layui `page`/`limit`（form） | `{result, data:{pageInfo:{pageNum,pageSize,total,dataList:[…]}}}` | 收入明细（中标记录） |
| 6 | `/child/getDeductionList.do` | 同上 | 同上（行字段不同） | 罚款明细 |

⚠️ Worker 现状：`/api/income/*` 目前是 `getOrderList.do` 的语义别名（CLOUDFLARE_ARCHITECTURE §八）——**与本审计确认的真实收入源不同源**，P1 Income Cutover 须改接上表端点。

## 二、明细行字段语义（getIncomeList.do）[VERIFIED]

行字段 7 个（pageInfo.dataList 行）：

| 字段 | 语义 | 样本 |
|---|---|---|
| `createtime` / `createtimestr` | **中标时间**（收入记账锚点） | "2026-09-20 16:31:15" |
| `childProceeds` | **中标金额**（整数，元） | 10 / 5 |
| `ordernum` | 平台订单号（含 `TT_` 前缀特殊单形态） | "TT_2****7929" |
| `issuingtime` / `issuingtimestr` | 发单时间（辅助列，非记账锚点） | "2026-09-19 09:03:16" |
| `goodsname` | 商品名 | "名片" |

分页结构同 PageHelper 家族：`pageInfo.{pageNum,pageSize,total,dataList}`（注意：**数据键是 `dataList` 不是 `list`**，与 getOrderList.do 不同）。

## 三、时间口径（8.2）[VERIFIED]

- **粒度 = 月**：`queryTime=yyyy-MM`；缺省（不传）= 当前月（bare 1368 = 2026-09 1368）。
- **记账锚点 = 中标时间 createtime**：明细 287 行（9 月）按 createtime 落月；**日折线 incomMoneys 合计 = 1368 = getThisMonthIncome(9 月)** 完全闭合 → 收入按中标时间落日/落月，**与结算时间、发单时间无关**。
- 跨月对照：2026-08 = 626，2026-09 = 1368（月份参数独立正确联动）。
- 折线 `dates` 长度 = 当月自然日数（9 月 30 天），不足月补 0。

## 四、状态口径（8.3）[VERIFIED]

- **收入 = 中标记录**：凡出现在 getIncomeList 即计收入（childProceeds > 0），**无订单 state 过滤概念**——"中标"本身就是计入条件。
- **罚款 = 独立体系**：getDeductionList / getThisMonthFind（`typename` 扣款类型 / `reason` 扣款原因 / `designerDeduction` 扣款金额）；与收入分开展示、分开折线（本账号 9 月罚款 total=0）。
- **不要把订单列表 state 枚举（1..8/11/12）与收入计入条件混淆**——旧系统收入页从不看 needsstate。

## 五、金额三态（8.4）[VERIFIED]

- 旧系统仅有 **`childProceeds`（中标金额）**——即新系统 `legacyAmount` 的真实来源；旧系统无"用户覆盖金额"概念。
- 新系统三态语义维持 INCOME_CALCULATION_SPEC 现设计：
  - `overrideAmount`（用户规则，来源 pricingRules）非 null → `effectiveAmount = overrideAmount`，`amountSource = "override"`；
  - 否则 `legacyAmount` 非 null → `effectiveAmount = legacyAmount`（来源 = childProceeds），`amountSource = "legacy"`；
  - 两者皆 null → `effectiveAmount = null`，`amountSource = "undefined"`——**undefined ≠ 0，统计中显式计数（undefinedCount），禁止静默归零**。
- **P1 收入切换时 effectiveAmount 的新语义问题**：若收入页改直连 getIncomeList.do，`childProceeds` 恒有值（[INFERRED] 中标必有金额，287 行抽查无 null），则"未定义"态将消失——**规则覆盖仍生效（override 优先于 childProceeds）**，但 `amountSource="undefined"` 分支预期不再出现。此为口径升级，需在 P1 Cutover SPEC 中明确。

## 六、数据闭环验证（汇总一致性）[VERIFIED]

| 断言 | 结果 |
|---|---|
| `querySameMonthData(2026-09).incomMoneys` 日合计 = `getThisMonthIncome(2026-09)` | 1368 = 1368 ✅ |
| `getThisMonthIncome(2026-08)` + `getThisMonthIncome(2026-09)` = `getAllIncome()` | 626 + 1368 = 1994 ✅ |
| getIncomeList(2026-09) total=287 行、分页 p1/p2 total 一致 | ✅ |
| 罚款三处一致（Find=缺省 / deductMoneys 全 0 / DeductionList total=0） | ✅ |

## 七、对新系统收入域的影响（P1 Income Cutover 预告，本轮不改代码）

1. **数据源切换**：`/api/income/*` 从 getOrderList 别名改为六端点白名单接入（至少 #1/#2/#4/#5 四个核心）。
2. **口径升级**：月收入 = Σ childProceeds（服务端聚合直取 moneys），**废除"前端拉 500×4 条订单自算"**（REAL_DATA_INVENTORY §三-5）；收益页分页明细直用 dataList。
3. **`fetchIncomeScope` 退役**：其"上限保护 2000 条"假设在 total=549 现状下碰巧成立，但口径错误（按订单而非中标记录）。
4. **规则覆盖（pricingRules）如何叠加服务端 moneys**：moneys 是旧系统口径合计，覆盖金额需在前端按规则重算明细差额——P1 需出 SPEC 明确（建议：总览双行显示"系统口径 / 我的口径"）。
5. **null→0 红线检查**：罚款接口无数据时响应缺 `data` 字段（C5 `{result:true}` 无 data）——前端适配必须判 `data?.moneys ?? null` 显示"—"而非 0。
