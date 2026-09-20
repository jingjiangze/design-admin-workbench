# SESSION_INTEGRATION_PROOF — 旧系统会话集成证明（P1A-06）

> 状态：**技术链路 PROVEN**；登录凭据当前被服务器业务层拒绝（非链路问题），见 §6。
> 取证时间：2026-09-20。证据等级标注：[VERIFIED] 实测 / [INFERRED] 推断。

## 1. 结论摘要

| 项 | 结论 | 证据 |
|----|------|------|
| 会话机制 | 纯 SESSION Cookie，无 Token / 无 CORS 头 / 无 CSRF | Phase 0 [VERIFIED] |
| Cookie 名称 | `SESSION`（Spring Session 特征，非 JSESSIONID） | 本日实测 [VERIFIED] |
| Cookie 属性 | `HttpOnly; SameSite=Lax; Domain=d.jndx.net; Path=/` | 本日实测 [VERIFIED] |
| 同源化方案 | Vite dev proxy `/chsjs → https://d.jndx.net` + `cookieDomainRewrite` | 本日实测 [VERIFIED] |
| 会话有效期 | **>24h**（Phase 0 获取的 SESSION 本日仍可调通业务接口；此前实测 >2.5h） | 本日实测 [VERIFIED] |
| 带 Cookie 业务调用 | `getOrderList.do`（sort=0&sorttype=1）返回 `result=true, total=548, listLen=10` | 本日实测 [VERIFIED] |
| 登录接口 | 当前返回 `result=false "登录失败，请联系客服"`（直连与 proxy 一致） | 本日实测 [VERIFIED] |

## 2. 同源/跨源判断 → 方案选择

[VERIFIED] 旧系统响应无任何 `Access-Control-Allow-*` 头，且 Cookie 带 `SameSite=Lax`：

- **跨源直连不可行**：Lax 语义下跨源 XHR/fetch 一律不携带 Cookie；且无 CORS 头，浏览器直接拦截响应。
- **不可靠方法禁止**（长文约束）：硬编码 Cookie、禁用浏览器安全策略、第三方代理注入均不采用。
- **采用方案**：dev 环境由 Vite proxy 同源化；生产环境由 Nginx 做同语义反代（§7）。

### Vite 配置（frontend/vite.config.ts）

```ts
"/chsjs": {
  target: "https://d.jndx.net",
  changeOrigin: true,
  secure: false,
  cookieDomainRewrite: true   // 见 §3 Domain 重写说明
}
```

**豁免说明**：URL 隔离 ESLint 规则只约束 `src/**`；`vite.config.ts` 属构建基础设施，
其中的 `/chsjs` 字面量是 proxy 路由声明，不构成 UI/服务层泄漏。

## 3. Cookie 情报（值一律 REDACTED）

Set-Cookie 原始属性（经 proxy 链路观测）：

```
SESSION=<REDACTED>; Domain=d.jndx.net; Path=/; HttpOnly; SameSite=Lax
```

| 属性 | 值 | 对新系统的影响 |
|------|-----|----------------|
| 名称 | `SESSION` | Spring Session；新系统会话存储直接沿用 |
| HttpOnly | 是 | JS 不可读 → 前端无法也无需持久化凭据，刷新页面依赖浏览器自动携带 |
| SameSite | Lax | 跨源 XHR 不带 Cookie → **proxy 同源是硬前提**，不是优化项 |
| Domain | `d.jndx.net` | 与 `localhost` 不匹配会被浏览器拒收 → **必须 `cookieDomainRewrite`** |
| Path | `/` | 全站生效 |

`cookieDomainRewrite: true` 移除 Domain 属性 → 变为 host-only Cookie，对 `localhost:8848` 生效。

## 4. 实测证据（proxy 链路，2026-09-20）

1. `GET http://localhost:8848/chsjs/child/toChildLogin.do`（经 proxy）→ `status=200`，
   观测到完整 Set-Cookie 属性（§3）。**proxy 转发 + Cookie 属性透传 [VERIFIED]**。
2. `POST childLogin.do`（JSON：username 明文 + password RSA-1024/PKCS#1 Base64，公钥同 Phase 0）→
   服务器以业务 JSON 响应（非 4xx/重定向）。**请求格式复现 [VERIFIED]**，但业务结果为拒绝（§6）。
3. 旧会话直连验证（对照实验）：携带 Phase 0 保存的 SESSION 调
   `POST getOrderList.do`（`sort=0&sorttype=1`）→
   `status=200, result=true, total=548, listLen=10`。**会话有效期 >24h + 业务接口拉通 [VERIFIED]**。

### 观察备注（P1A-07 需复核）

实测响应行样例中 `state` 为中文标签（如 `审核通过`）且行内无 `goodsid` 字段——
与 Phase 0 `api_order_withsort.json` 样本（数字状态码）形态不同。可能原因：无完整会话上下文
（子账号 userSubId）时服务端返回另一种形态。**P1A-07 实现时以完整登录会话下的真实响应为准**，
fixture 需重新取证脱敏。

## 5. 浏览器侧 RSA（jsencrypt）

- 依赖：`jsencrypt 3.5.4`（已入 package.json）。
- 加密方式与 Phase 0 Node 复现一致：RSA-1024 PKCS#1 v1.5，公钥为旧登录页前端公开资源。
- P1B 登录页实现：密码在浏览器侧加密后 POST，明文密码不出浏览器内存。

## 6. 当前阻塞：登录接口业务拒绝（BLOCKED 子项）

[VERIFIED] 同一脚本、同一凭据：Phase 0（本周早些时候）登录成功；本日直连与经 proxy 均返回
`{"result":false,"message":"登录失败，请联系客服"}`。

- **链路侧已排除**：proxy 转发、Cookie 属性、请求格式、RSA 加密均与成功时一致。
- **指向账号/风控侧**（[INFERRED]，需用户侧确认）：
  1. 密码是否已被修改；
  2. 账号是否被锁定/停用（异地 IP 或多端登录触发风控）；
  3. 是否有登录频率限制。
- **影响**：无法用新登录获取的 Cookie 完成端到端登录证明；但会话链路其余环节
  （Cookie 属性、有效期、业务调用）已用现存会话完整证明（§4.3）。
- **恢复路径**：用户在旧系统页面手动登录一次确认凭据有效性；若密码已改，更新本地
  凭据管理器后重跑 `djx_login_proxy.mjs` 即可补全证明。

## 7. 生产部署建议（P1E 部署阶段）

Nginx 同源反代（与 dev proxy 同语义）：

```nginx
location /chsjs/ {
  proxy_pass https://d.jndx.net;
  proxy_set_header Host d.jndx.net;
  proxy_ssl_server_name on;
  proxy_cookie_domain d.jndx.net $host;   # 对应 cookieDomainRewrite
}
```

## 8. 复验脚本

- `node .tmp-evidence/djx_login_proxy.mjs`（经 proxy；凭据走环境变量，Cookie 值输出 REDACTED）
- `node .tmp-evidence/djx_login.mjs`（直连对照）
- 会话复验：读 `.tmp-evidence/cookies.json` 带 SESSION 调 `getOrderList.do`（§4.3 同款）
