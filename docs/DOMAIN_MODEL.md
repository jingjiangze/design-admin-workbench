# DOMAIN_MODEL.md — 业务对象建模

> 状态：**PARTIAL VERIFIED** — 2026-09-20 基于 `getOrderList.do` 实测 38 字段 + 各页面 API 引用推导。
> 实体边界为 [INFERRED]（旧系统无独立实体接口，字段冗余在订单行内）；凡标注 [INFERRED] 处待详情接口取证修正。

## 对象清单

| 对象 | 是否存在 | 证据形态 | 关系 | 证据等级 |
| ---- | -------- | -------- | ---- | -------- |
| SubDesigner（子设计师） | 存在 | submemberid=1969296664（每订单行冗余）+ child 路径空间 + 登录体系 | 1 : N Order | [VERIFIED] |
| Member（会员/上游主体） | 存在 | memberid=1639927201 + membername=青云栈名片 | 1 : N Order；1 Member : N SubDesigner [INFERRED] | [VERIFIED] |
| Shop（店铺） | 存在（弱实体） | shop=益好旗舰店（字符串冗余于订单行，无 shopid） | N : 1 Member [INFERRED] | [VERIFIED] 字段存在 |
| Customer（客户/买家） | 存在（弱实体） | kehu_name + kehu_ww（旺旺号，冗余字段，无独立接口） | N : 1 Order 行内冗余 | [VERIFIED] 字段存在 |
| Order（订单） | 存在 | ordernum=TT_260908007929；38 字段 | 聚合根，挂需求/设计/状态 | [VERIFIED] |
| Need（需求/申请） | 存在 | **双键**：applyid（1977019790）与 needsid（1977019785），两套详情接口（needsDetail / needsDetail2） | 1 Order : 1 Need [INFERRED]；双键语义待详情取证 | [VERIFIED] 双键存在 |
| Category（品类） | 存在 | goodsid（428 个唯一 ID）+ name；无独立品类管理页面（疑似写死/上游同步） | 1 Category : N Order | [VERIFIED] |
| DesignTask（设计任务） | 存在（隐式） | tasktype（修改设计）、manuscriptdesignstatus（设计状态位）、版数 edition（隐藏列）、交稿格式 suffix（隐藏列） | 1 : 1 Order 行内 | [VERIFIED] 字段存在 |
| Status（状态机） | 存在 | state 数字枚举 1-12（12 值）+ needsstate/subviewstate/checkstatus 辅助位 | Order 属性 | [VERIFIED] |
| AbnormalOrder（异常申请） | 存在 | insertAbnormalOrder/cancleAbnormalOrder + getBadTypeList + isqll 字段（"未申请"） | N : 1 Order | [VERIFIED] |
| SpecialApply（特殊申请） | 存在 | /specialApply/insertSpecialOrder.do（reasonid+remark+applyimgs+needsid，凭证必填） | N : 1 Order | [VERIFIED] |
| Appeal（申诉） | 存在 | appealOrderList.do + getReasons.do 原因树（reasonpid→reasonid） | N : 1 Order | [VERIFIED] |
| RepulseData（打回数据） | 存在 | /repulse/* 独立路径空间 + isrepulsedata 标志 + getBackNotice | 1 : N Order [INFERRED] | [VERIFIED] |
| DingjinOrder（定金单） | 存在 | /dingjin/dingjinOrder.do + dingjinList.do 独立路径空间 | 与 Order 关系待取证 | [VERIFIED] 页面存在 |
| Reminder（催单） | 存在（收件侧） | reminderMessage.do 全套读取/已读/备注接口 + 语音（myYuyinList）/短信触达统计 | N : 1 Order [INFERRED]；发送方在客服侧（本端只读） | [VERIFIED] |
| Notice（系统通知） | 存在 | 四类：Accept 接单 / Back 打回 / Bad 不良 / Outtime 超时 + updateIsRead | N : 1 SubDesigner | [VERIFIED] |
| VoiceLog（语音通知记录） | 存在 | /yuyin/myYuyinList.do + 条数/花费统计（voiceCount/voiceSpend） | N : 1 Order [INFERRED] | [VERIFIED] |
| BadData（不良数据统计） | 存在 | badData.do（按日/按段查询 + 导出）+ 投诉不良率（首页） | 聚合统计，非实体 | [VERIFIED] |
| Income（收入/分润） | 存在 | toMemberSubIncome.do + 首页总收入/本日单量/本月单量 | N : 1 SubDesigner [INFERRED] | [VERIFIED] 页面存在 |
| OperationLog（操作日志） | NOT FOUND（子设计师端） | 无任何日志查询接口引用 | — | [VERIFIED] 未发现 |
| Contact（联系人） | NOT FOUND | 客户仅 kehu_name/kehu_ww 冗余字段，无通讯录类接口 | — | [VERIFIED] 未发现 |
| Payment（支付） | NOT FOUND（子设计师端） | 无支付接口引用；定金单页面为唯一财务边缘 | — | [VERIFIED] 未发现 |

## 关系图（实测证据推导）

```text
Member(会员, memberid)
  │ 1:N [INFERRED]
  ├─ Shop(店铺, shop 字符串)
  │     └─ Customer(客户, kehu_name/kehu_ww) ←弱实体,行内冗余
  └─ SubDesigner(子设计师, submemberid)  ← 当前登录视角
        │ 1:N
        └─ Order(订单, ordernum TT_yymmdd+seq, state 1-12)
              ├─ Need(需求, applyid + needsid 双键)   [双键语义待取证]
              ├─ Category(品类, goodsid, 428个)
              ├─ DesignTask(tasktype, 版数, 交稿格式, 设计状态位)
              ├─ AbnormalOrder(isqll) / SpecialApply / Appeal(reason树)
              ├─ RepulseData(打回)  [方向: 客服→设计师]
              ├─ DingjinOrder(定金) [关系待取证]
              ├─ Reminder(催单收件) ─ VoiceLog(语音) / 短信触达
              └─ Notice(接单/打回/不良/超时)
```

## 对新系统建模的启示（[INFERRED]）

1. **订单行 = 宽表冗余**：会员/店铺/客户字段全部冗余在订单行，无实体化 → 新系统应实体化 Customer/Shop，支撑"按客户聚合"（对应用户跨端消息汇总按客户分组的诉求）。
2. **双需求键**（applyid/needsid）暗示历史上"申请"与"需求"曾分离或一对多 → 新系统应收敛为单一 Need 实体 + 申请记录。
3. **状态 12=不良与待超时复用** → 状态枚举设计有债，新系统需显式拆分。
4. 催单是**单向触达**（客服→设计师，语音+短信）而非站内双向沟通 → 新系统如需双向沟通是新增能力。
