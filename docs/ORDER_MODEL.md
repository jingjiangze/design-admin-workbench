# ORDER_MODEL.md — 订单对象模型

> 状态：**PARTIAL VERIFIED** — 2026-09-20 以 `getOrderList.do` 实际返回（38 字段）为准。
> 样本：第 1 页 10 条 / 总数 546 单；客户标识类字段已脱敏。

## 数据结构总览

```
GET/POST /chsjs/child/getOrderList.do
  必需参数: page, limit, state, sort=0, sorttype=1   ← sort/sorttype 缺省时服务端 500
  可选参数: goodsid, ordernum, designform, begindate, enddate,
            manuscriptDesignStatus, badtypename, shop, backgroundColour
  响应: {result, message, data:{countInfo, pageInfo:{total, list:[...38字段]}}}
```

- `countInfo`：各状态数量统计 `{wait, nofeedback, badordercount, aftersale, flowmarker, didnotpass, ...}`（实测 flowmarker=64）
- 响应非 layui 标准格式（无 code/count），由前端 `parseData` 手工适配。

## 字段清单（38 字段，实测样本）

| 字段 | 示例值（脱敏） | 含义推断 | 证据等级 |
| ---- | ---- | ---- | ---- |
| ordernum | TT_260908007929 | 订单号，格式 `TT_yymmdd+6位序号` | [VERIFIED] |
| applyid | 1977019790 | 需求申请 ID（详情接口 needsDetail.do 的键） | [VERIFIED] |
| needsid | 1977019785 | 需求 ID（详情接口 needsDetail2.do 的键） | [VERIFIED] |
| state | 审核通过 | 订单状态（服务端已转中文文本） | [VERIFIED] |
| needsstate / subviewstate / checkstatus / manuscriptdesignstatus | 0 | 数字状态位（需求/子单视图/审核/设计进度） | [VERIFIED] 值待枚举 |
| manuscriptdesignstatusname | 请选择 / 其他 | 设计状态中文名 | [VERIFIED] |
| shop | 益好旗舰店 | 店铺名（客户主体） | [VERIFIED] |
| name | 名片 | 接单产品（品类名，对应 goodsid） | [VERIFIED] |
| sign | 普通 | 类型形式（普通/加急等） | [VERIFIED] |
| tasktype | 修改设计 | 设计形式（新做/修改） | [VERIFIED] |
| needtype | 4 | 需求类型编号 | [VERIFIED] 值待枚举 |
| money | 10 | 设计费（元） | [VERIFIED] |
| design_money | 20 | 设计费基准价（元） | [VERIFIED] |
| sales | 0 | 销售额（列被注释隐藏，字段仍在） | [VERIFIED] |
| urgent | 0 | 加急标志 | [VERIFIED] |
| isqll | 未申请 | 异常订单状态（isqll≈"是否申请异常"） | [VERIFIED] |
| isrepulsedata | false | 是否打回数据 | [VERIFIED] |
| backgroundcolour / colorType | 1 | 行颜色标记（自定义分组标记） | [VERIFIED] |
| isnew / islast / big_buyer_flag | 0/true/1 | 新单/末版/大客户标志 | [VERIFIED] 语义[INFERRED] |
| is_regular_customer | false | 常规客户标志 | [VERIFIED] |
| bindwechat | 0 | 是否绑定微信 | [VERIFIED] |
| memberid / membername | 1639927201 / 青云栈名片 | 会员（上游主体）ID 与名称 | [VERIFIED] |
| submemberid | 1969296664 | 子设计师 ID（= 页面 userSubId） | [VERIFIED] |
| kehu_name / kehu_ww | 洪 / \*\*\*\* | 客户称呼 / 旺旺号（PII，脱敏） | [VERIFIED] |
| needscreatetime | 2026-09-19 09:02:02 | 需求创建时间 | [VERIFIED] |
| erpcreatetime | 2026-09-19 09:02:02 | ERP 创建时间（与 needscreatetime 同值，疑似同步生成） | [VERIFIED] |
| createtime | 2026-09-19 09:03:16 | 订单/接单创建时间 | [VERIFIED] |
| timeneeds | 2026-09-21 11:43:16 | 需求截止时间（截稿） | [VERIFIED] |
| completetime | 2026-09-19 09:31:59 | 完成时间 | [VERIFIED] |
| sort | 1 | 服务端排序号 | [VERIFIED] |
| （remark / wealth / suffix / edition / fabu） | — | 表格列存在：备注、操作列、交稿格式(hide)、版数(hide)、发布/截稿时间 | [VERIFIED] 列定义 |

## 状态枚举（myOrder 页面 Tab 定义，state 参数）

| state | 含义 | 证据等级 |
| -- | -- | -- |
| "" | 全部订单 | [VERIFIED] |
| 1 | 待接单 | [VERIFIED] |
| 2 | 未反馈 | [VERIFIED] |
| 3 | 设计中（designstatus） | [VERIFIED] |
| 4 | 交稿审核 | [VERIFIED] |
| 5 | 审核通过 | [VERIFIED] |
| 6 | 审核不通过 | [VERIFIED] |
| 7 | 订单完结 | [VERIFIED] |
| 8 | 流标 | [VERIFIED] |
| 9 | 售后（Tab 已注释停用） | [VERIFIED] |
| 11 | 订单超时 | [VERIFIED] |
| 12 | 不良订单 + 待超时订单（两个 Tab 复用同一值，疑似逻辑合并） | [VERIFIED]（复用为观察事实，语义[INFERRED]） |

## 关联实体与外键

```
订单(ordernum) ─ 需求(applyid → /child/needsDetail.do)
              └ 需求(needsid → /child/needsDetail2.do)
会员(memberid/membername) ←→ 子设计师(submemberid)
店铺(shop) + 客户(kehu_name/kehu_ww)（冗余存储于订单行，无独立客户接口）
```

## 附属信息（对应操作入口，同页面可触发）

- 操作记录：备注更新 `updateSubApplyReamrks.do`（注意原拼写 Reamrks）[VERIFIED]
- 异常申请：`insertAbnormalOrder.do` + 不良类型 `getBadTypeList.do`、取消 `cancleAbnormalOrder.do` [VERIFIED]
- 特殊申请：`/specialApply/insertSpecialOrder.do`（reasonid+remark+applyimgs+needsid，"申请凭证必须添加"）[VERIFIED]
- 申诉：原因树 `getReasons.do`（reasonpid→reasonid 两级）[VERIFIED]
- 批量接单：`batchTakeover.do`（applyidArr 逗号拼接）/ `needsidArr`（按 needsid 维度）[VERIFIED]
- 打回数据处理：`/repulse/updateRepulseData.do` [VERIFIED]

## 订单量观察（2026-09-20 实测）

- 总单量 546；countInfo：流标 64、待接单 0、未反馈 0、不良 0、审核不通过 0、售后 0。
- ERP 与需求创建时间同值 → 订单由上游 ERP 推送生成（[INFERRED]，需进一步验证是否手工建单缺失）。
