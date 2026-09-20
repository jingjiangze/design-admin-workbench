# SESSION STORAGE SPEC — 会话存储规范（Phase CF-0 §十三/§十四）

> 实现位置：`worker/src/security/session.ts` + `worker/src/security/crypto.ts`
> 状态：[VERIFIED-CONFIG] 代码已实现；运行验证待首次部署。

## 目录

1. [为什么浏览器不能持有旧 SESSION](#一为什么浏览器不能持有旧-session)
2. [KV 记录结构](#二kv-记录结构)
3. [Cookie 规范](#三cookie-规范)
4. [加密方案](#四加密方案)
5. [生命周期](#五生命周期)
6. [CSRF 机制](#六csrf-机制)
7. [安全红线](#七安全红线)

---

## 一、为什么浏览器不能持有旧 SESSION

旧系统 Cookie：`SESSION; Domain=d.jndx.net; HttpOnly; SameSite=Lax`。
新域名（workers.dev / 正式域名）无法携带该 Cookie，也**绝不允许**把旧 SESSION 值设为新域名的 Cookie 暴露给浏览器。因此由 Worker 代持：

```text
旧 SESSION ──→ Cloudflare Worker（AES-GCM 加密）──→ KV sess:<id>
浏览器只见 __dw_session=<opaque-random-id>
```

## 二、KV 记录结构

| key | value（JSON） |
|---|---|
| `sess:<32字节随机base64url>` | `{ userKey, legacyCookieEnc, createdAt, expiresAt, csrfTokenHash }` |

- `userKey`：旧系统登录名（D1 `users.user_key` 同源）。
- `legacyCookieEnc`：旧 Cookie 串的 AES-256-GCM 密文（`base64url(iv).base64url(ct)`），仅含白名单 Cookie 名（SESSION / JSESSIONID）。
- `csrfTokenHash`：写请求 CSRF token 的 SHA-256（KV 不存明文 token）。

## 三、Cookie 规范

```text
__dw_session=<opaque>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400
```

- 绝不包含 `d.jndx.net` SESSION 的任何值。
- Max-Age = 86400（24h，与旧系统会话实测寿命对齐）。

## 四、加密方案

| 项 | 值 |
|---|---|
| 算法 | AES-256-GCM（WebCrypto subtle） |
| 密钥 | Worker Secret `SESSION_ENCRYPTION_KEY`（base64 32 字节） |
| IV | 每条记录随机 12 字节（与密文同存） |
| 密钥轮换 | 旧记录解密失败 = 会话失效 → 用户重新登录（可接受） |

密钥只存在于 Workers Secrets（生产）与 `worker/.dev.vars`（本地短时调试，gitignore），绝不硬编码。

## 五、生命周期

| 事件 | 行为 |
|---|---|
| 登录成功 | `createSession`：生成 opaque id + CSRF token → 加密旧 Cookie → KV put（TTL 24h） |
| 任何 /api 请求 | `requireSession`：读 Cookie → KV get → 校验过期 |
| 登出 | KV delete + `Max-Age=0` 清 Cookie |
| 24h 过期 | KV TTL 自动清除；下次请求 401 → 前端引导重新登录 |
| 旧系统会话失效 | legacy 网关返回 401 `LEGACY_SESSION_EXPIRED` → 前端引导重新登录 |

第一版不做每请求滑动续期（省 KV 写配额，见 RESOURCE_POLICY §四）。

## 六、CSRF 机制（写请求三件套，§二十八）

1. SameSite=Lax Cookie（基础防线）。
2. Origin 校验：`Origin` host 必须与请求 `Host` 一致。
3. CSRF 双提交：登录响应返回一次性 `csrfToken`（随机 24 字节），前端存 localStorage 并在每个写请求带 `X-CSRF-Token`；Worker 比对 `sha256(token) === csrfTokenHash`。

第一阶段唯一写 API 面：`/api/pricing/rules*`。

## 七、安全红线

- ❌ 任何日志 / 响应体 / 错误信息中出现 legacyCookie（明文或密文）或明文密码。
- ❌ 把 `userKey` 之外的用户身份信息存入 KV。
- ❌ 浏览器传参决定身份（`?userId=` 永远不可信，身份只来自 Session）。
- ✅ 登录成功只保存：session、user identity、必要 metadata（§十五）。
