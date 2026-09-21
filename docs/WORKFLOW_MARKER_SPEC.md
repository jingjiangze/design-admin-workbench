# WORKFLOW_MARKER_SPEC.md — 旧系统业务反馈 + 新系统防漏单绿点（语义冻结）

> 状态：**FROZEN（定稿）** — 2026-09-21 按 WORKFLOW-V2 规格实现。
> 核心原则：**只有旧系统真实成功，才算业务处理成功；绿点只负责防止用户漏掉已处理过的项目。**

## 1. 语义定义

### 1.1 绿点（localProcessedAt / work_item_marker）

绿点表示：**当前登录用户已经在新系统中确认自己完成过这个操作**。用途只有防漏单、防重复处理。

绿点 **不是**：

- 旧系统订单状态（legacyState）
- 客户状态 / 出稿中 / 跟进中 / 客户异常（未取证，一律不做）
- 已读
- 已联系业务状态

### 1.2 旧系统业务动作

业务动作（接单等）真正向旧系统反馈：

```text
浏览器 → Cloudflare /api/* → Worker → 旧系统原生接口 → 旧系统返回成功
```

只有旧系统返回成功，才写绿点（门禁在 Worker 侧强制，前端无法绕过）。

## 2. 旧系统接口审计矩阵（取证结论）

| UI 动作 | 旧系统原生接口 | 结论 | 证据 |
| --- | --- | --- | --- |
| 一键接单（订单） | `POST /chsjs/child/batchTakeover.do` `{applyidArr}` | **接入**（staging 网关，逐条调用获得逐项成败） | [VERIFIED 源码] |
| "已联系" | 无原生接口 | **不做**（情况 C）：按钮只叫"一键接单"，禁止伪造已联系反馈 | [VERIFIED 无接口] |
| 订单"一键处理" | 无"处理"语义接口 | 只提供本地 **我已处理** 防漏单标记 | [VERIFIED 无接口] |
| 催单"处理" | 仅已读族（`updateIsReadReminderNew` 等），语义=已读≠已处理 | 只提供本地 **我已处理** 标记，不把已读包装成已处理 | [VERIFIED 源码] |
| 绿点 | D1 `work_item_marker` | 新系统能力 ✅ | — |

## 3. 数据模型

```sql
work_item_marker (
  id, user_key, item_type, item_key,
  processed_at, created_at, updated_at,
  UNIQUE (user_key, item_type, item_key)
)
```

- `item_key` 锚定旧系统主键：`order:{needsid}` / `reminder:{reminderId}`；
  **禁用 ordernum**（一个订单号可能对应多个需求）。
- 幂等：重复标记保留首次 `processed_at`。
- 用户隔离：`user_key` 取自 Worker Session，账号间互不可见。
- 不自动清除（第一阶段），无取消按钮；DELETE 端点已预留。
- 绿点永不写回旧系统（Legacy ← 业务反馈 ← Worker → D1 标记，两方向断开）。

## 4. API 契约（Worker）

| 端点 | 方法 | 说明 |
| --- | --- | --- |
| `/api/workflow/markers` | GET | 当前用户全部标记（`?type=order\|reminder`） |
| `/api/workflow/markers` | POST | `{items:[{itemType,itemKey}]}` 写"我已处理"（≤200） |
| `/api/workflow/markers` | DELETE | 取消标记（无 UI 入口） |
| `/api/workflow/takeover` | POST | `{targets:[{applyId,orderId}]}`（≤50）一键接单 |

takeover 行为：

- 逐条调用 `batchTakeover.do`（单条 = 单元素批次）→ 逐项成败；
- `ok===true` 的条目由 Worker 写 `order:{needsid}` 标记；`ok===false` 绝不写；
- 会话失效（`LEGACY_SESSION_EXPIRED`）立即中止剩余批次；
- Mock 环境（`LEGACY_API_ENABLED=false`）不触旧系统，等价演示完整链路；
- **执行红线**：真实测试须用户本人点击 + 指定测试订单，禁止自动化/循环调用（规格二十三）。

## 5. UI 行为

- 订单行：订单号左侧 ○/🟢；操作列 [接单]（仅待接单且有 applyid）/[我已处理]；
  已处理显示"已处理 HH:mm"。
- 批量栏（选中后浮现）：[一键接单] [我已处理]，显示"成功 N 条，失败 M 条"。
- **处理后不消失**：不做 `filter/remove/archive`，订单保留在当前列表，排序不变。
- 刷新 / 重登录后绿点保留（D1 持久化）；换账号看到自己的标记。

## 6. 测试门禁（最重要防错条件，规格三十）

`frontend/test/workflow-marker.test.ts` 断言：

```ts
legacyActionSuccess === false  ⇒  localProcessedAt === null（无标记）
legacyActionSuccess === true   ⇒  localProcessedAt !== null
```

另覆盖：幂等、用户隔离、批量部分失败逐项准确、item_key 校验、空入参 no-op。

## 7. 部署注意

- 新增迁移 `migrations/0002_work_item_marker.sql`，三环境（preview/staging/production）
  均需 `wrangler d1 migrations apply`。
- staging/production（legacy=on）首次真实接单前：由用户指定测试订单，
  调用前后对比旧系统状态（规格二十三）。
