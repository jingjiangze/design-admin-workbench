# LEGACY GATEWAY SPEC — 旧系统网关规范（Phase CF-0 §八/§二十一~§二十五）

> 实现位置：`worker/src/index.ts` + `worker/src/legacy/*`
> 状态：[VERIFIED-CONFIG] 代码已实现；[VERIFIED] 契约项来自 Phase 0 真实取证。

## 目录

1. [职责边界](#一职责边界)
2. [路由白名单](#二路由白名单)
3. [旧系统契约（[VERIFIED]）](#三旧系统契约verified)
4. [透传策略](#四透传策略)
5. [Mock 通道](#五mock-通道)
6. [错误码规范](#六错误码规范)
7. [写接口禁令](#七写接口禁令)

---

## 一、职责边界

```text
浏览器 ──/api/*──→ Worker（认证/限流/白名单）──→ 旧系统 d.jndx.net
```

- Worker **唯一掌握**：`d.jndx.net`、`/chsjs/child/*.do`、SESSION、旧参数、旧字段、旧错误码。
- Worker 定位 = **保护和转发**，不做重型转换/解析（Free CPU 10ms 保护，§二十二）。
- **禁止开放代理**：不存在 `/api/proxy?url=`；每个 route 显式对应一个 legacy endpoint。

## 二、路由白名单

| 新端点 | 方法 | legacy endpoint | 说明 |
|---|---|---|---|
| `/api/health` | GET | — | 无认证健康检查 |
| `/api/auth/login` | POST | `childLogin.do`（前置 `toChildLogin.do` 取 JSESSIONID） | Turnstile + RSA 密文透传 |
| `/api/auth/logout` | POST | — | 销毁 KV 会话 |
| `/api/auth/me` | GET | — | 会话身份 |
| `/api/orders` | GET | `getOrderList.do`（Worker 侧 POST 表单=查询语义） | **强制 sort=0&sorttype=1** |
| `/api/orders/detail` | GET | `needsDetail2.do?needsid=` / `needsDetail.do?applyid=` | HTML 透传不解析 |
| `/api/reminders` | GET | `getReminderMessageNew.do?page=&limit=`（GET 分页 JSON） | 收件箱只读；**[VERIFIED 2026-09-20]** `reminderMessage.do` 是 HTML 页面非 API，禁作数据源；响应 `{result, data:{pageInfo:{list,total,…}}}` → Worker 适配 `{list,total,pageNum,pageSize}` |
| `/api/acceptance/status` | GET | `memberCenter.do`（HTML 解析 checkbox，只读） | 接单开关状态；详见 docs/ACCEPTANCE_SWITCH_SPEC.md |
| `/api/acceptance/toggle` | POST | `updateWorkState.do`（form `workstate=1\|2`） | **唯一获授权的旧系统写操作**（用户 2026-09-21：开关接单 + 定时关闭）；其余写接口仍禁 |
| `/api/acceptance/schedule` | GET/POST/DELETE | —（KV + Cron `*/5 * * * *`） | 定时关闭接单（单向只关不开）；详见 docs/ACCEPTANCE_SWITCH_SPEC.md |
| `/api/income/summary` `/api/income/orders` | GET | `getOrderList.do` | 语义别名，前端聚合 |
| `/api/pricing/rules` (+`/:id`) | GET/POST/PUT/DELETE | — | D1（新系统自有数据） |

其余 `/api/*` 一律 404；非 `/api` 请求交 Static Assets（SPA fallback）。

## 三、旧系统契约（[VERIFIED]，Phase 0 实测）

| 契约 | 内容 |
|---|---|
| 列表隐性契约 | `sort=0&sorttype=1` 必传，缺省 `flag:500`（Worker 强制注入，前端不可覆盖） |
| 列表请求形态 | POST 表单：sort/sorttype/page/limit/state/keyword（查询语义） |
| 列表响应 | `{result, data:{countInfo, pageInfo:{total, list[38字段]}}}` |
| 详情 | `needsDetail2(needsid)` 主键；`needsDetail(applyid)` 兼容；两响应 99.97% 相同 |
| 登录 | 两步 cookie jar（toChildLogin 取 JSESSIONID → childLogin POST JSON） |
| 登录体 | `{username, password: RSA-PKCS1(SPKI公钥) base64}` —— 公钥为旧前端公开物，非 secret |
| 会话 Cookie | `SESSION`，HttpOnly, SameSite=Lax, Domain=d.jndx.net |
| 催稿能力边界 | 子设计师端无发送 API；updateRemark/updateIsRead 为写接口（禁接） |

## 四、透传策略

- **列表**：原始 JSON 透传；38 字段 → OrderListItem 的映射留在前端 `order-mapping.ts`（浏览器解析）。
- **详情**：551KB HTML 原样透传，强制 `Cache-Control: private, no-store` + `X-Content-Type-Options: nosniff`；内嵌 JSON 提取由浏览器 `detail-mapping.ts` 完成。
- **超时**：legacy fetch 统一 15s（AbortSignal.timeout）。
- **Cookie 转发白名单**：仅 SESSION / JSESSIONID（`sanitizeLegacyCookie`），其余一律剥离。

## 五、Mock 通道

- `LEGACY_API_ENABLED=false`（development/preview 默认）：Worker 返回 `worker/src/legacy/mock-data/` 脱敏样本（与前端 vitest fixtures 同源），登录为 Mock 会话（不触旧系统）。
- 生产（production env）`LEGACY_API_ENABLED=true` 且由 Worker 端控制——**前端 URL 参数无法开启 Mock**（§四十三）。

## 六、错误码规范

| code | HTTP | 场景 |
|---|---|---|
| `UNAUTHENTICATED` | 401 | 新系统会话缺失/过期 |
| `LEGACY_SESSION_EXPIRED` | 401 | 旧系统 401/302 |
| `LEGACY_LOGIN_REJECTED` | 401 | 旧系统业务拒绝（账号侧，BLOCKED 项） |
| `TURNSTILE_FAILED` | 403 | 人机校验未通过 |
| `ORIGIN_*` / `CSRF_*` | 403 | 写请求三件套失败 |
| `BAD_NEEDSID` / `BAD_AMOUNT` 等 | 400 | 参数白名单校验失败 |
| `LEGACY_UNREACHABLE` | 502 | 旧系统网络失败/超时 |
| `LEGACY_BIZ_ERROR` | 502 | `result=false` / `flag:500` |
| `NOT_FOUND` | 404 | 白名单外端点 |

## 七、写接口禁令（§二十五）

**永不接入**（新系统任何层）：

```text
batchTakeover   updateRemark   updateIsRead
insertAbnormalOrder   updateRepulseData   任何催稿发送
```

**唯一写操作例外（2026-09-21 用户授权）**：`membersub/updateWorkState.do`（接单开关 `workstate=1|2`）——用于"开关接单 + 定时关闭"两个功能（docs/ACCEPTANCE_SWITCH_SPEC.md）；执行红线：不做自动化测试调用，真实切换仅由用户本人或到期 cron 触发。

查询类 POST（getOrderList 等）在旧系统语义上是查询，非数据写操作。
