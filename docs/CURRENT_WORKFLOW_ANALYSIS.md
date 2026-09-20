# CURRENT_WORKFLOW_ANALYSIS.md — 高频操作分析

> 状态：**PARTIAL VERIFIED** — 2026-09-20 基于页面源码与接口结构的静态工作流推导；"点击次数"为结构推导值 [INFERRED]，待用户实际操作观察校准。

## 订单主流程（状态机驱动，[VERIFIED] Tab 枚举 + 接口结构）

```text
ERP推单生成(needscreatetime=erpcreatetime) [INFERRED]
  → 1 待接单（batchTakeover.do 批量接单/单接）
  → 2 未反馈（设计师接单后未开始？语义待确认 [INFERRED]）
  → 3 设计中（manuscriptdesignstatus 设计进度位；交稿）
  → 4 交稿审核（checkstatus）
  → 5 审核通过 ──→ 7 订单完结（completetime 落值 [VERIFIED] 样本）
  → 6 审核不通过（打回 → /repulse/ + getBackNotice → 重新设计循环 [INFERRED]）
  分支：8 流标（countInfo 实测 64 单，占总量 546 的 11.7% [VERIFIED]）
        11 订单超时 / 12 不良订单&待超时（复用同一 state 值 [VERIFIED]）
        异常申请（isqll：insertAbnormalOrder → abnormalOrder 列表 → cancleAbnormal）
        特殊申请（specialApply：凭证必填）
        申诉（appealOrder + 原因树 getReasons）
```

## 催单工作流（本次取证核心，[VERIFIED]）

```text
客服/运营侧发起催单（子设计师端无发送接口 [VERIFIED]）
  → 触达：语音外呼（/yuyin/，记录条数与花费）+ 短信（smsCount/smsSpend 首页统计）
  → 设计师端收件箱（reminderMessage.do）：getReminderMessageNew 列表
  → 首页/全局 Badge 计数（getReminderNoticeCountNew + getReminderMessageNoReadNew）
  → 查看（reminderByIdNew）→ 标记已读（updateIsReadReminderNew / updateIsReadAllReminderNew）→ 备注（updateRemark）
结论：催单对设计师是"被动接收+已读回执"模型，无站内回复能力 [VERIFIED]
```

## 高频操作清单（入口与结构成本）

| 操作 | 当前入口 | 结构性点击路径 | 页面跳转 | 复制粘贴 | 易误操作点 | 证据等级 |
| ---- | -------- | -------------- | -------- | -------- | ---------- | -------- |
| 查订单 | 我的订单 Tab 组 | 侧栏→我的订单→(切换状态 Tab)→筛选下拉(428 项单列) | 无（单页 Tab） | 无 | 状态 Tab 12 与"待超时"复用难分；428 品类下拉难找 | [VERIFIED] 结构 / [INFERRED] 次数 |
| 看订单详情 | 行操作列 | 行内点击→needsDetail2 弹层/页 | 弹层 [INFERRED] | 无 | applyid/needsid 双详情入口并存 | [VERIFIED] 双入口 |
| 接单 | 待接单 Tab | 切 Tab→勾选行→批量接单（或单接） | 无 | 无 | 批量操作无预览确认层 [INFERRED] | [VERIFIED] 接口存在 |
| 收到催单后处理 | 全局 Badge→催单消息 | 点 Badge→列表→逐条点开→逐条标记已读 | 有（独立页） | 无 | 只能逐条已读（有全部已读接口） | [VERIFIED] 接口 |
| 标异常 | 行操作 | 勾选/行内→选不良类型(getBadTypeList)→提交 | 弹层 | 无 | "cancle"拼写暗示接口不稳定历史 | [VERIFIED] 接口 |
| 修改备注 | 行操作 | 行内→输入→updateSubApplyReamrks | 弹层 | 无 | — | [VERIFIED] |
| 按客户找单 | 无直接入口 | 需记忆店铺名→shop 下拉筛选 | 无 | 需先在别处复制店名 | **无客户维度视图**（只有店铺下拉） | [VERIFIED] 无入口 |
| 数据导出 | 不良数据页 | 按日期查询→导出 | 无 | 无 | 仅不良数据可导出，订单列表无导出接口 | [VERIFIED] 仅一处 |

## 点击次数对比模型（目标形态预演，[INFERRED]）

```text
查订单（旧系统）：侧栏→我的订单→找到状态Tab→切换→(品类下拉 428 项找品类)→查看
查订单（目标）：  全局搜索框输入订单号/店铺名 →直达（1 步）

处理催单（旧系统）：Badge→催单消息页→逐条点开→逐条已读→回我的订单处理
处理催单（目标）：  首页催单卡片（含订单上下文内联）→一键跳转对应订单（2 步）

按客户聚合查看（旧系统）：不存在（仅店铺字符串下拉）
按客户聚合（目标）：  客户实体页 → 历史/进行中订单/催单/打回 全景（新增能力）
```

## 痛点清单（结构层面，[VERIFIED] 证据支撑）

1. **无客户实体视图**：客户信息（kehu_name/kehu_ww）只是订单行冗余字段，无法按客户回溯历史。
2. **428 项品类平铺下拉**：无分组无搜索提示（layui 原生 select），高频操作成本高。
3. **状态语义混淆**：state=12 复用（不良/待超时）、applyid/needsid 双键、双详情接口并存。
4. **消息触达割裂**：催单走语音/短信（外部通道）+站内收件箱，四类通知（接单/打回/不良/超时）另一套接口——无统一消息中心。
5. **导出能力缺失**：仅不良数据可导出，订单/催单均无。
6. **代码层**：URL 拼写错误（cancle/Reamrks/双斜杠 upload）、前端硬编码公钥、无操作日志——技术债直观可见。
