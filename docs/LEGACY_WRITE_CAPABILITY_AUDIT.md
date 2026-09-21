# LEGACY_WRITE_CAPABILITY_AUDIT — 旧系统写能力与原生状态审计（2026-09-21）

> 方法纪律：**ZERO WRITE**。仅静态分析（页面源码/JS/onclick/AJAX 参数），未执行任何写请求。
> 取证材料：`.tmp-evidence/write-capability-audit/{myOrder,memberCenter,abnormalOrder}.html`
> （真实账号只读登录抓取，凭据仅环境变量）。
> 分类口径：`READ` / `WRITE-SINGLE` / `WRITE-BATCH` / `NOT-FOUND`（UNKNOWN 表示端点存在但参数未证实）。

## 一、能力总表

| 功能 | 原生 endpoint | 方法 | 分类 | 参数已证实 | 本项目接入 |
|------|--------------|------|------|-----------|-----------|
| 批量接单 | `POST /chsjs/child/batchTakeover.do` | POST JSON | **WRITE-BATCH** | YES：`{"applyidArr":"id1,id2,…"}` | **NO** |
| 异常申请 | `POST /chsjs/child/insertAbnormalOrder.do` | POST form | **WRITE-SINGLE** | YES：`{reasonpid, reasonid, remark, applyimgs, needsid}` | **NO** |
| 异常原因 | `POST /chsjs/child/getReasons.do` | POST | **READ** | YES：`{pid: reasonType}` → `data.data` 列表（reasonpid 单选分类 → reasonid 下拉，两级结构） | NO |
| 异常订单列表 | `POST /chsjs/child/getAbnormalOrderList.do` | POST（layui 分页） | **READ** | YES：`dataList` 键，pageInfo 结构 | NO |
| 撤销异常 | `POST /chsjs/child/cancleAbnormalOrder.do` | POST form | **WRITE-SINGLE** | YES：`{id}`（异常记录主键） | **NO** |
| 特殊申请 | `POST /chsjs/specialApply/insertSpecialOrder.do` | POST form | **WRITE-SINGLE**（保守判定） | PARTIAL：`{…, needsid: needsids[0]}`——代码只取第一个选中项 | **NO** |
| 订单备注 | `POST /chsjs/child/updateSubApplyReamrks.do` | POST form | **WRITE-SINGLE** | YES：`{applyid, subDesignerRemarks}`（旧系统拼写 Reamrks 属实） | **NO** |
| 订单优先级打标 | `setBackgroundColor()` 入口存在 | — | **UNKNOWN** | NO：函数收集多 needsid + 颜色选择器，但**实际写端点未在源码中定位到**（`backgroundColour` 仅出现在列表查询参数） | **NO** |
| ~~客户状态~~ → **设计状态** | `POST /chsjs/designer/updateDesignStatus.do` | POST form | **WRITE-SINGLE** | YES：见下节 | **NO**（未授权） |

## 二、重点结论：用户所谓"客户状态"= 原生「设计状态」字段 [FOUND]

用户需求举例"出稿中、其他"——**精确对应**旧系统 `manuscriptdesignstatus` 原生枚举的值 3 和 1：

```text
POST /chsjs/designer/updateDesignStatus.do
参数：{ memberid, needsid, id(=applyid), subMemberid,
       manuscriptDesignStatus, manuscriptDesignStatusName, ordernum }
单需求（taskArr 由单条订单 obj 拆出，无批量形态）
```

原生枚举（myOrder.html 列内下拉 [VERIFIED]）：

| 值 | 名称 |
|----|------|
| 0 | 请选择 |
| 1 | 其他 |
| 2 | 要资料 |
| 3 | 出稿中 |
| 4 | 已初稿 |
| 5 | 客户失联 |
| 6 | 修改定稿中 |
| 7 | 打样中 |

判定标准对照（审计 §二十四）：满足 C（原生状态按钮/下拉 + 实际存储接口 `updateDesignStatus.do`）+ D（真实枚举 + 归属对象明确 = 单需求）。
**这是订单/需求级"设计状态"，不是独立客户档案字段**（customerStatus/memberStatus/buyerStatus 全文 0 命中 [NOT FOUND]）。

## 三、红线与后续阶段

1. 本轮零写操作；上述全部写端点继续位于 Worker DENY 白名单之外（现仅 `membersub/updateWorkState.do` 接单开关获授权）。
2. **未经用户明确授权，不接任何写端点、不加对应 UI。**
3. 后续若进入 `CUSTOMER-STATUS` / `WRITE-ABNORMAL` 阶段，需补审计：
   - CSRF/Origin、重复提交、失败语义、部分失败逐项结果；
   - `insertSpecialOrder` 完整参数表（当前 PARTIAL）；
   - `setBackgroundColor` 真实写端点（当前 UNKNOWN）。
4. 异常申请原生即为**单需求**（UI 强制 `只能单订单申请！` [VERIFIED 源码]）——新系统永远不做"批量异常申请"按钮。
5. 异常原因必须走 `getReasons.do` 原生两级结构，禁止自造原因列表。

## 四、证据索引

- 批量接单：myOrder.html ×10 命中，JSON `contentType` + `applyidArr` 逗号拼接 [VERIFIED]
- 异常申请单订单强制：`if(needsids.length > 1){ rewriteAlert("只能单订单申请！"); return; }` [VERIFIED]
- 设计状态枚举：myOrder.html `getSelected(obj.manuscriptdesignstatus, n)` 下拉模板 [VERIFIED]
- 写端点调用：`$.post(contextPath + '/designer/updateDesignStatus.do', {...})` [VERIFIED]
- 异常列表/撤销：abnormalOrder.html `getAbnormalOrderList.do`（layui table）+ `cancleAbnormalOrder.do {id}` [VERIFIED]
