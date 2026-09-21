# LEGACY_API_MAP.md — 原系统接口地图

> 状态：**PARTIAL VERIFIED** — 2026-09-20 通过登录后逐页 HTML 内嵌 JS 静态提取 + getOrderList 等实测取得。
> 只读取证：未执行任何催单/状态变更操作；`update*`/`insert*`/`cancle*` 等端点仅记录结构未调用。

## 接口清单

### 认证与会话

| API | Method | 功能 | 参数 | 返回 | 证据等级 |
| --- | ------ | ---- | ---- | ---- | -------- |
| /chsjs/child/toChildLogin.do | GET | 登录页 | — | HTML | [VERIFIED] |
| /chsjs/child/childLogin.do | POST | 登录 | JSON `{username明文, password RSA(PKCS#1)Base64}` | `{result, message}` | [VERIFIED] 实测 |
| /chsjs/child/updatePwd.do | POST | 修改密码 | JSON `{oldPwd,newPwd,againPwd}`（未加密） | `{result, message}` | [VERIFIED] 源码 |
| /chsjs/child/logout.do | GET/POST | 登出 | — | — | [VERIFIED] 源码 |
| /chsjs/login | GET | 401 跳转目标 | — | — | [VERIFIED] 源码 |

### 订单核心

| API | Method | 功能 | 参数 | 返回 | 证据等级 |
| --- | ------ | ---- | ---- | ---- | -------- |
| /chsjs/child/getOrderList.do | GET(layui) | 订单列表 | **必需** `page,limit,state,sort=0,sorttype=1`（缺 sort/sorttype → 500）；可选 `goodsid,ordernum,designform,begindate,enddate,manuscriptDesignStatus,badtypename,shop,backgroundColour` | `{result,data:{countInfo,pageInfo:{total,list[38字段]}}}` | [VERIFIED] 实测 |
| /chsjs/child/needsDetail.do?applyid= | GET | 需求详情（按申请） | applyid | 页面/JSON 未验证 | [VERIFIED] 引用 |
| /chsjs/child/needsDetail2.do?needsid= | GET | 需求详情（按需求） | needsid | 未验证 | [VERIFIED] 引用 |
| /chsjs/designer/needsDetail.do?needsid= | GET | 需求详情（designer 空间版） | needsid | 未验证 | [VERIFIED] 引用 |
| /chsjs/child/batchTakeover.do | POST | 批量接单 | JSON `{applyidArr:"1,2,3"}` 或 `{needsidArr:...}` | 未验证（未调用） | [VERIFIED] 源码；2026-09-21 WORKFLOW-V2 接入 staging 网关（worker/src/workflow/legacy-actions.ts，逐条调用；真实测试待用户授权 + 指定测试订单） |
| /chsjs/child/insertAbnormalOrder.do | POST | 标记异常订单 | JSON `{needsidArr}` | 未验证（未调用） | [VERIFIED] 源码 |
| /chsjs/child/getReasons.do | GET | 申诉原因树 | — | 未验证 | [VERIFIED] 引用 |
| /chsjs/specialApply/insertSpecialOrder.do | POST | 特殊订单申请 | JSON `{reasonid,remark,applyimgs,needsid}`（凭证必填） | 未验证（未调用） | [VERIFIED] 源码 |
| /chsjs/child/updateSubApplyReamrks.do | POST | 更新订单备注 | JSON（原拼写 Reamrks） | 未验证（未调用） | [VERIFIED] 源码 |
| /chsjs/child/setBackgroundColor.do | POST | 行颜色标记 | JSON `{needsids, colorType}` | 未验证（未调用） | [VERIFIED] 源码 |
| /chsjs/membersub/updateWorkState.do | POST | **接单开关**（旧首页"接单状态"） | 表单 `{workstate: 1=开启, 2=关闭}` | `{result, message}`；⚠️ 前缀 /membersub/；新系统已接入（2026-09-21 用户授权，docs/ACCEPTANCE_SWITCH_SPEC.md），未真实调用测试 | [VERIFIED] 源码+staging status 解析 |

### 异常 / 打回 / 定金 / 申诉

| API | Method | 功能 | 所属页面 | 证据等级 |
| --- | ------ | ---- | ---- | -------- |
| /chsjs/child/getAbnormalOrderList.do | GET | 异常订单列表 | abnormalOrder | [VERIFIED] 源码 |
| /chsjs/child/cancleAbnormalOrder.do | POST | 取消异常标记（原拼写 cancle） | abnormalOrder | [VERIFIED] 源码 |
| /chsjs/repulse/repulseDataList.do | GET | 打回数据列表 | repulsePage | [VERIFIED] 源码 |
| /chsjs/repulse/updateRepulseData.do | POST | 打回数据处理 | repulsePage | [VERIFIED] 源码 |
| /chsjs/dingjin/dingjinList.do | GET | 定金单列表 | dingjinOrder | [VERIFIED] 源码 |
| /chsjs/child/appealOrderList.do | GET | 申诉订单列表 | appealOrder | [VERIFIED] 源码 |

### 消息 / 催单 / 通知

| API | Method | 功能 | 返回样例 | 证据等级 |
| --- | ------ | ---- | ---- | -------- |
| /chsjs/child/getInfoNoticeCount.do | GET | 信息通知计数 | `{result:true,data:911}`（实测） | [VERIFIED] 实测 |
| /chsjs/child/getReminderNoticeCountNew.do | GET | 催单通知计数 | `{result:true,data:0}`（实测） | [VERIFIED] 实测 |
| /chsjs/child/getReminderMessageNoReadNew.do | GET | 未读催单数 | `{result:true,data:{count:0}}`（实测） | [VERIFIED] 实测 |
| /chsjs/child/getReminderMessageNew.do | GET | 催单消息列表 | 未验证（未调用） | [VERIFIED] 引用 |
| /chsjs/child/reminderByIdNew.do | GET | 催单详情 | 未验证 | [VERIFIED] 引用 |
| /chsjs/child/updateIsReadReminderNew.do | POST | 单条催单已读 | 未调用 | [VERIFIED] 引用 |
| /chsjs/child/updateIsReadAllReminderNew.do | POST | 全部催单已读 | 未调用 | [VERIFIED] 引用 |
| /chsjs/child/updateRIsReadNew.do | POST | 催单相关已读 | 未调用 | [VERIFIED] 引用 |
| /chsjs/child/updateRemark.do | POST | 催单备注 | 未调用 | [VERIFIED] 引用 |
| /chsjs/child/getMyOrderMessage.do | GET | 订单消息列表 | myMessage | [VERIFIED] 源码 |
| /chsjs/child/getAcceptNotice.do | GET | 接单通知 | myMessage | [VERIFIED] 源码 |
| /chsjs/child/getBackNotice.do | GET | 打回通知 | myMessage | [VERIFIED] 源码 |
| /chsjs/child/getBadNotice.do | GET | 不良通知 | myMessage | [VERIFIED] 源码 |
| /chsjs/child/getOuttimeNotice.do | GET | 超时通知 | myMessage | [VERIFIED] 源码 |
| /chsjs/child/updateIsRead.do | POST | 消息已读 | 未调用 | [VERIFIED] 源码 |

**催单方向结论**：子设计师端只有"读取 + 标记已读 + 备注"，**无发送催单接口** → 催单由客服/运营侧发起，经语音/短信触达（memberCenter 首页有语音/短信条数与花费统计）。[VERIFIED]

### 语音 / 数据 / 其他

| API | Method | 功能 | 证据等级 |
| --- | ------ | ---- | -------- |
| /chsjs/yuyin/myYuyinList.do | GET | 语音通知记录列表 | [VERIFIED] 源码 |
| /chsjs/child/getBadDataByDate1.do | GET | 不良数据（按日期） | [VERIFIED] 源码 |
| /chsjs/child/queryBadDataByTimes.do | GET | 不良数据（按时间段） | [VERIFIED] 源码 |
| /chsjs/child/getBadDataByDateExport.do | GET | 不良数据导出 | [VERIFIED] 源码 |
| /chsjs/child/getBadTypeList.do | GET | 不良类型列表 | [VERIFIED] 源码 |
| /chsjs/child/toSampleDesign.do | GET | 跳转样品设计（DIY 工具入口） | [VERIFIED] 源码 |
| /chsjs/file/uploadWechatQrCode.do | POST | 微信二维码上传（myInfo） | [VERIFIED] 源码 |
| /chsjs/membersub//upload.do | POST | 文件上传（myOrder，URL 含双斜杠——代码质量问题） | [VERIFIED] 源码 |
| /chsjs/websocket | WS(SockJS+STOMP) | 实时推送；订阅 `/user/{userSubId}/queue/getResponseZi`，心跳 20s | [VERIFIED] 源码 |

## 关键取证项进度

- [x] 登录/Session 机制（Cookie 会话，无 Token/CSRF/验证码）→ 详见 AUTH_MODEL.md
- [x] 订单列表（必需参数 sort=0&sorttype=1 是隐性坑；分页 page/limit）
- [x] 订单详情双键：applyid / needsid（未验证返回体）
- [x] 订单状态枚举 12 值 → ORDER_MODEL.md
- [x] 催单接口（子设计师端只读+已读，无发送）
- [x] 品类 goodsid 清单 → LEGACY_CATEGORY_MAP.md
- [ ] 订单详情返回体（needsDetail2 实际字段）
- [ ] 上传接口 multipart 结构
- [ ] WebSocket 消息体完整格式
- [ ] 会话超时时间

## 留样规范

关键 JSON 返回脱敏后存放 `research/raw/`；账号、密码、Cookie、Token、Session ID 一律 `<REDACTED>`。本次实测样本存放于本地 `.tmp-evidence/`（已 gitignore，不入库）。
