# ACCEPTANCE_SWITCH_SPEC —— 接单开关 + 定时关闭

> 版本：1.0（2026-09-21）｜状态：**已实现，staging 已部署，真实切换未经测试（红线）**
> 授权：开关接单与定时关闭为**用户 2026-09-21 明确授权接入的唯一旧系统写操作**；其余旧系统写接口仍禁（`docs/LEGACY_GATEWAY_SPEC.md` 禁止清单不变）。

---

## 一、旧系统取证基线 [VERIFIED 2026-09-21]

证据：`.tmp-evidence/memberCenter_auth.html`（旧首页，行 1169-1193 + 1534-1554）

| 项 | 内容 |
|---|---|
| UI 位置 | 旧首页"接单状态" layui switch（`lay-text 开启|关闭`） |
| 切换接口 | `POST /chsjs/membersub/updateWorkState.do`（⚠️ 前缀 `/membersub/` 非 `/child/`） |
| 请求参数 | 表单 `workstate`：`1`=开启接单（checked），`2`=关闭接单 |
| 响应 | `{result: boolean, message: string}` |
| 状态读取 | **无独立 API**——旧首页 SSR 渲染 checkbox 初始 `checked` 属性 |
| 旧系统内建机制 | 页面文案："如30分钟在平台未进行操作，系统自动关闭按钮"（30 分钟无操作自动关单） |

解析推断 [INFERRED→已被实测佐证]：关闭态下 checkbox 不渲染 `checked` 属性。
2026-09-21 staging 实测：解析结果 `open:false`，与旧系统真实状态（关闭）一致。

## 二、新系统 API（Worker 网关）

全部要求有效 Session（`__dw_session`）；写操作另过 `assertWriteOrigin` 三件套（SameSite + Origin 同源 + CSRF 双提交 `X-CSRF-Token`）。

| 端点 | 方法 | 上游 | 说明 |
|---|---|---|---|
| `/api/acceptance/status` | GET | `memberCenter.do`（HTML 解析，只读） | `{open: boolean\|null, degraded, schedule, lastResult}`；`open=null`=旧页结构变化无法解析 |
| `/api/acceptance/toggle` | POST | `updateWorkState.do`（**写**） | body `{open: boolean}` → `workstate=1\|2`；返回 `{result, data:{open, message}}` |
| `/api/acceptance/schedule` | GET | —（KV） | 当前定时任务 + 最近执行结果 |
| `/api/acceptance/schedule` | POST | —（KV） | body `{closeAt: ISO}`，限未来 1 分钟 ~ 7 天 |
| `/api/acceptance/schedule` | DELETE | —（KV） | 取消定时任务 |

Mock 模式（LEGACY=OFF）：status 恒 `open:true`，toggle 恒成功且**不触旧系统**。

## 三、定时关闭（KV + Cron）

- **存储**：KV `acc-sched:<userKey>` → `{userKey, closeAt, createdAt}`，7 天 TTL 兜底清理（防僵尸任务）；执行结果写 `acc-sched-result:<userKey>`（7d TTL）。
- **执行器**：Worker Cron Trigger `*/5 * * * *`（`wrangler.jsonc` triggers，三环境显式声明）→ `worker/src/acceptance/cron.ts`。
- **执行规则（安全边界）**：
  1. 仅 `LEGACY_API_ENABLED=true` 的环境执行（Mock/preview 空转）；
  2. **只执行"关闭"方向**（workstate=2），绝不自动开启；
  3. 到期时实时反查该 userKey 最新有效 Session 解密 Cookie（`findLatestSessionByUserKey`）；
  4. Session 过期 → 记 `SESSION_EXPIRED`、**保留任务**（用户重新登录后自动重试）；
  5. 旧系统业务拒绝 → 记 `REJECTED` 并删任务（重试无意义）；
  6. 网络等瞬时错误 → 记 `ERROR`、保留任务下次 cron 重试；
  7. 成功 → 删任务、记 `CLOSED`。
- **无任务时 cron 空转**：KV 无 `acc-sched:*` 即零动作——部署即上线不产生任何真实写操作。

## 四、前端（AppShell Header）

- 位置：`frontend/src/layout/shell/AppHeader.vue` actions 区（通知铃铛左侧）——UI-R1 定稿的唯一主框架。
  pure-admin 的 lay-navbar / NavMix 分支**不挂载**（避免双开关）。
- 组件：`frontend/src/layout/components/lay-acceptance/index.vue`
  - 时钟图标（有定时任务时显示红点）→ popover 定时面板：预设（30 分钟 / 1 小时 / 2 小时 / 今天 21:00）+ 自定义时间 + 取消；
  - "接单" 标签 + `el-switch`（inline 开/关）；
  - 状态读取失败（degraded）→ 开关置灰，不猜测状态。
- **交互纪律**：切换必经 `ElMessageBox.confirm` 二次确认；取消则回滚开关显示；服务端拒绝则回滚并透出旧系统 message。
- 服务层：`frontend/src/service/legacy/acceptance.ts`（仅走 `/api/acceptance/*`，ESLint 禁 legacy URL 纪律不破坏）。
- CSRF：`utils/http/index.ts` 请求拦截器统一注入 `X-CSRF-Token`（= csrfToken，双提交模式）。

## 五、执行红线（本任务全程遵守）

> ⚠️ 用户指令："不得擅自测试开关接单"

- `POST /api/acceptance/toggle` **从未被调用**（验证脚本 `acceptance-verify.mjs` 仅 GET status/schedule）；
- `POST /api/acceptance/schedule` **从未被调用**（避免留下真实定时任务）；
- `DELETE /api/acceptance/schedule` 从未被调用；
- UI 验证（CDP）仅**只读 DOM 探测**（pill 存在性 / switch 状态 / 定时按钮存在性），零点击；
- 真实切换只能由：① 用户本人在 UI 点击（二次确认后）② 到期 cron 自动执行。

## 六、验证记录（2026-09-21，只读）

| 验证项 | 结果 |
|---|---|
| 前端 build + eslint | ✅（15s，0 error） |
| staging 部署 | ✅ Version aba8e9c5（cron `*/5 * * * *` 已注册） |
| GET /api/acceptance/status（真实账号） | ✅ 200 `{open:false, degraded:null, schedule:null, lastResult:null}` |
| GET /api/acceptance/schedule | ✅ 200（空） |
| UI pill 渲染（CDP 截图） | ✅ `.acceptance-pill` 存在；label"接单"；switch 关态（与后端 open:false 一致）；定时按钮在 |
| 写接口调用 | **0 次（红线遵守）** |

## 七、待办（后续）

- [ ] 用户本人首次真实切换后，观察旧系统首页开关状态是否同步（肉眼确认即可）；
- [ ] CF-REAL-19 production 部署时 cron 随之生效（production 目前未部署）；
- [ ] 若旧系统 30 分钟自动关单与用户预期冲突，可考虑在 UI 提示剩余时间（需旧系统提供最后操作时间接口，暂无）。
