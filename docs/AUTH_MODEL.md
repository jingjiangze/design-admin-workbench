# AUTH_MODEL.md — 登录与权限模型

> 状态：**PARTIAL VERIFIED（部分验证）** — 2026-09-20 通过登录页 HTML/JS 静态分析 + 实际登录复现（Node 脚本）取证。
> 敏感信息（公钥、密码、Cookie 值）不入库，仅记录机制结构。

## 登录机制

| 项 | 结论 | 证据等级 |
| -- | ---- | -------- |
| 入口 URL | `https://d.jndx.net/chsjs/child/memberCenter.do`（未登录访问 → 重定向至 `/chsjs/child/toChildLogin.do`） | [VERIFIED] 实测 |
| 登录页面 | `/chsjs/child/toChildLogin.do`（标题"设计师登录"，站点名"设计工作室"，品牌图 shenmewanyi.png） | [VERIFIED] |
| 登录方式 | AJAX POST，非表单提交。按钮触发 JS 函数 `childLogin()`（`/chsjs/static/js/child/childLogin.js`） | [VERIFIED] 源码 |
| 登录端点 | `POST /chsjs/child/childLogin.do`，`Content-Type: application/json;charset=utf-8` | [VERIFIED] 源码+实测 |
| 请求体 | `{"username": "<明文用户名>", "password": "<RSA加密后Base64>"}` | [VERIFIED] 源码+实测 |
| 密码加密 | JSEncrypt，RSA 1024-bit，PKCS#1 v1.5 填充；公钥硬编码于前端 JS（X.509 SPKI 格式，不入库） | [VERIFIED] 源码+复现成功 |
| 客户端校验 | 用户名/密码非空 + 密码格式（8-20 位，字母/数字/特殊符号至少两种，`public.js validatePwd`） | [VERIFIED] 源码 |
| 成功响应 | `{"result":true}`（无 message）；失败 `{"result":false,"message":"..."}` | [VERIFIED] 实测 |
| 登录后跳转 | `window.location.href = contextPath + "/child/memberCenter.do"` | [VERIFIED] 源码 |
| Session / Cookie | 服务端 SESSION Cookie（单 Cookie，JSESSION 语义）。登录前即下发，登录后复用同一 SESSION | [VERIFIED] 实测 |
| Token | 无独立 Token / 无 Bearer 头，纯 Cookie 会话 | [VERIFIED] 实测 |
| CSRF | 未见 CSRF Token 机制（登录与业务 AJAX 均无） | [PARTIAL] 静态分析未见，未穷举 |
| 验证码 | 登录无验证码、无滑块、无图形校验 | [VERIFIED] 实测 |
| 二次验证 | 无 | [VERIFIED] 实测 |
| 登录失效表现 | 页面全局 `$.ajaxSetup`：HTTP 401 → `top.location.href = contextPath+"/login"`；403 → alert message；408 → "请求超时" | [VERIFIED] 源码 |
| 修改密码 | `POST /chsjs/child/updatePwd.do`，JSON `{oldPwd,newPwd,againPwd}` — **三参数均未加密**（与登录不对称，审计发现） | [VERIFIED] 源码 |
| 登出 | `POST/GET /chsjs/child/logout.do`（各页面均引用） | [VERIFIED] 源码 |

## 复现要点（技术基线）

- RSA 加密可离线复现：SPKI DER（Base64）→ `crypto.createPublicKey({key, format:'der', type:'spki'})` → `publicEncrypt(RSA_PKCS1_PADDING)`，与 JSEncrypt 输出等价，服务端接受（复现登录成功两次）。
- 登录请求无 Referer/Origin/XHR 头校验（纯 Node fetch 直连成功）。
- 会话有效期：UNKNOWN（本次取证会话 >30 分钟仍有效，未测超时上限）。

## 权限体系

| 项 | 结论 | 证据等级 |
| -- | ---- | -------- |
| 当前账号角色 | "子设计师"（child 路径空间 + 子设计师订单列表注释 + userSubId=1969296664） | [VERIFIED] |
| 页面内身份标识 | 显示名"岳绘播qy"（账号手机号 176\*\*\*\*\*\*\*\*93） | [VERIFIED]（已脱敏） |
| URL 空间分层 | `/chsjs/child/*`（子设计师）、`/chsjs/designer/*`（设计师，needsDetail 出现）、`/chsjs/dingjin/*`、`/chsjs/repulse/*`、`/chsjs/yuyin/*`、`/chsjs/specialApply/*`、`/chsjs/membersub/*` — 暗示至少 子设计师/设计师/运营（定金、打回管理）多角色 | [INFERRED] 由路径与页面引用推断 |
| 跨角色访问控制 | 未测：子设计师会话直接访问 `/chsjs/designer/*` 页面是否被拒 → 待专项验证 | [NOT TESTED] |
| WebSocket 鉴权 | SockJS+STOMP 连接 `/chsjs/websocket`，订阅 `/user/{userSubId}/queue/getResponseZi`（Spring 风格 user destination，服务端按会话绑定用户） | [VERIFIED] 源码 |

## 审计发现（安全）

1. **前端硬编码 RSA 公钥 + 1024 位短密钥**：公钥公开无妨，但 1024-bit RSA 已属弱强度。[VERIFIED]
2. **updatePwd 密码参数明文 JSON 传输**（虽有 HTTPS，但与登录的加密策略不一致）。[VERIFIED]
3. **无 CSRF 防护迹象** + 纯 Cookie 会话 → 存在 CSRF 攻击面。[PARTIAL]
4. 登录接口无验证码/限流迹象（未做暴力破解测试，遵守只读原则）。[PARTIAL]
