# LEGACY_PAGE_MAP.md — 原系统页面地图

> 状态：**PARTIAL VERIFIED** — 2026-09-20 以子设计师账号登录后逐页拉取（11/11 页面 200）。
> 技术栈观察：jQuery 1.12.4 + layui（表格/弹层）+ SockJS/STOMP WebSocket + jsencrypt；多页应用（MPA），服务端渲染外壳 + 页内 AJAX。

## 页面地图

| 页面 | URL | 菜单入口 | 功能 | 依赖接口 | 证据等级 |
| --- | --- | --- | --- | --- | --- |
| 登录页 | /chsjs/child/toChildLogin.do | — | 设计师登录（RSA+AJAX） | childLogin.do | [VERIFIED] |
| 会员中心（首页） | /chsjs/child/memberCenter.do | 默认首页 | 仪表盘：订单状态 Tab 计数、健康状态、工作状态（接单状态）、总收入、本日/本月单量、通知成功情况（语音/短信条数与花费）、接单产品、热门模板、最近设计、对接人、投诉不良率 | getInfoNoticeCount 等统计 | [VERIFIED] |
| 我的订单 | /chsjs/child/myOrder.do | 订单管理→我的订单 | 订单工作台（核心页，153KB）：12 状态 Tab、筛选（品类/订单号/设计形式/日期/店铺/颜色标记）、批量接单、异常申请、特殊申请、备注、需求详情、样品设计 | getOrderList、batchTakeover、insertAbnormalOrder、getReasons、insertSpecialOrder、updateSubApplyReamrks、setBackgroundColor、needsDetail(2) | [VERIFIED] |
| 申诉订单 | /chsjs/child/appealOrder.do | 订单管理→申诉订单 | 申诉单列表 + **WebSocket 实时推送** | appealOrderList、/websocket | [VERIFIED] |
| 定金单 | /chsjs/dingjin/dingjinOrder.do | 订单管理→定金单 | 定金订单列表 | dingjinList | [VERIFIED] |
| 异常订单 | /chsjs/child/abnormalOrder.do | 订单管理→异常订单 | 异常单列表 + 取消异常 | getAbnormalOrderList、cancleAbnormalOrder | [VERIFIED] |
| 打回订单信息 | /chsjs/repulse/toPage.do | 订单管理→打回订单信息 | 被打回订单/数据列表与处理 | repulseDataList、updateRepulseData | [VERIFIED] |
| 语音通知记录 | /chsjs/yuyin/myCallInfo.do | 订单管理→语音通知记录 | 催单语音外呼记录（条数/花费） | myYuyinList | [VERIFIED] |
| 不良数据 | /chsjs/child/badData.do | 我的数据→不良数据 | 不良率统计（按日/按段）+ 导出 | getBadDataByDate1、queryBadDataByTimes、getBadDataByDateExport | [VERIFIED] |
| 订单消息 | /chsjs/child/myMessage.do | 消息通知→订单消息 | 四类通知：接单/打回/不良/超时 + 已读 | getMyOrderMessage、get{Accept,Back,Bad,Outtime}Notice、updateIsRead | [VERIFIED] |
| 催单消息 | /chsjs/child/reminderMessage.do | 消息通知（Badge 计数） | 催单收件箱：列表/详情/已读/备注（**只读，无发送**） | getReminderMessageNew、reminderByIdNew、update*ReminderNew、updateRemark | [VERIFIED]（2026-09-20 CF-REAL-03 补充实测：页面本身是 JSP HTML；列表数据走 GET getReminderMessageNew.do?page=&limit= → {result, data:{pageInfo:{list,total}}}；行字段动态——id/memberid/isread/sendtime/needsid/noticedetail/supplyman/ordernum/state/subname/times/shop 恒在，readtime/timeout/ageing 仅已接收/已处理行出现；实测 total=164） |
| 我的信息 | /chsjs/child/myInfo.do | 头像区 | 个人资料 + 微信二维码上传 | uploadWechatQrCode | [VERIFIED] |
| 我的收入 | /chsjs/child/toMemberSubIncome.do | 首页"总收入" | 收入/分润（36KB，页面无显式 AJAX，疑似 SSR 渲染） | 待验证 | [VERIFIED] 页面存在 |

## 全局元素（每页共用）

- 顶部栏：显示名、修改密码弹窗（updatePwd.do）、消息 Badge（getReminderMessageNoReadNew 轮询）、登出
- 修改密码弹窗：原密码/新密码/确认密码（JS 源码在每页内嵌）
- 全局 401 处理：ajaxSetup → 跳 /chsjs/login

## 功能树（子设计师视角实测）

```
登录 /chsjs/child/toChildLogin.do
└── 会员中心 memberCenter.do（仪表盘）
    ├── 订单管理
    │   ├── 我的订单 myOrder.do ★核心工作台
    │   ├── 申诉订单 appealOrder.do（含 WebSocket 实时推送）
    │   ├── 定金单 dingjin/dingjinOrder.do
    │   ├── 异常订单 abnormalOrder.do
    │   ├── 打回订单信息 repulse/toPage.do
    │   └── 语音通知记录 yuyin/myCallInfo.do
    ├── 我的数据
    │   └── 不良数据 badData.do（统计+导出）
    ├── 消息通知
    │   ├── 订单消息 myMessage.do（接单/打回/不良/超时）
    │   └── 催单消息 reminderMessage.do（只读收件箱）
    ├── 我的信息 myInfo.do（资料+微信二维码）
    ├── 我的收入 toMemberSubIncome.do
    └── DIY设计工具（外链推广位 → toSampleDesign.do）
```

## 角色视图差异

- 子设计师（当前账号实测）：上表全部页面。[VERIFIED]
- 其他角色（设计师 /designer、定金运营 /dingjin 等）：仅能从 URL 空间与页面引用推断存在；其专属页面清单与视图差异未取证。[INFERRED]
- 管理员：UNKNOWN（无入口迹象）。
- 实际角色数：≥2（子设计师已证实；designer 路径空间提示设计师角色）。[INFERRED]
