# CLOUDFLARE ARCHITECTURE — 全面 Cloudflare 化架构（Phase CF-0）

> 状态：[VERIFIED-CONFIG] 代码与配置已入库；部署动作待 Cloudflare 账号操作（见 DEPLOYMENT）。
> 核心原则：**Cloudflare 是唯一生产运行环境；本机只保留源代码编辑和必要的 Git 操作。**

## 目录

1. [定位与架构总览](#一定位与架构总览)
2. [产品选型（Free 档）](#二产品选型free-档)
3. [请求链路](#三请求链路)
4. [项目结构](#四项目结构)
5. [Adapter 边界重定义](#五adapter-边界重定义)
6. [数据边界](#六数据边界)
7. [环境矩阵](#七环境矩阵)
8. [明确不采用](#八明确不采用)

---

## 一、定位与架构总览

本项目正式定位为**公开 Web 项目**（小型工作室 + 少量设计师）。生产运行环境全部在 Cloudflare，本机不运行任何长期驻留的项目后台服务。

```text
                         GitHub（jingjiangze/design-admin-workbench）
                            │ push
                            ▼
                 Cloudflare Workers Builds（自动 build/deploy）
                            │
                            ▼
                 ┌──────────────────────────┐
                 │ Cloudflare Worker        │
                 │  /api/* (run_worker_first)│
                 │  Auth / Session / Gateway │
                 └──────┬───────────┬───────┘
                        │           │
                  KV（Session）   D1（金额规则）
                        │
                        ▼
                   d.jndx.net（旧系统，仅 Worker 可达）
```

- 静态资源：Workers Static Assets（`frontend/dist`，SPA fallback），尽量不经过 Worker 业务代码。
- API：`/api/*` 白名单路由，Worker 唯一掌握旧系统地址、SESSION、旧参数与错误码。
- 浏览器：Vue SPA，只看到 `/api/*`，不接触 `d.jndx.net` 与旧 SESSION。

## 二、产品选型（Free 档）

| 产品 | 用途 | 第一阶段是否引入 |
|---|---|---|
| Workers | API / Auth / Legacy Gateway / Session | ✅ |
| Workers Static Assets | `frontend/dist` 托管 + SPA fallback | ✅ |
| Workers KV | 仅 Session（高频读低频写） | ✅ |
| D1 | 仅新系统自有数据（金额规则/用户/设置） | ✅ |
| Turnstile | 登录人机校验（公开站点防护） | ✅ |
| Workers Builds | GitHub push 自动构建部署 | ✅ |
| R2 / Durable Objects / Queues / Hyperdrive / Containers / Pages Functions | — | ❌ 无明确需求不引入 |

## 三、请求链路

### 3.1 登录（§十一/§十二）

```text
浏览器
 ↓ 用户名 + JSEncrypt RSA(PKCS#1) 加密密码 + Turnstile token
POST /api/auth/login
 ↓
Cloudflare Worker（Turnstile siteverify → 不接触明文密码）
 ↓ POST /chsjs/child/childLogin.do {username, password(RSA密文)}
旧系统
 ↓ Set-Cookie SESSION
Worker：SESSION → AES-256-GCM 加密 → KV sess:<id>
 ↓ Set-Cookie __dw_session=<opaque>（HttpOnly/Secure/SameSite=Lax）
浏览器（只见 opaque id，绝不接触旧 SESSION 值）
```

### 3.2 查订单（§二十一/§二十二/§二十三）

```text
GET /api/orders?page=&limit=&state=&keyword=
 ↓ Worker 注入 sort=0&sorttype=1（隐性契约，前端不可覆盖）
POST /chsjs/child/getOrderList.do（旧系统查询语义）
 ↓ 原始 JSON 透传（38 字段映射保留在前端 order-mapping.ts）
浏览器解析展示
```

### 3.3 订单详情（551KB HTML，§二十二）

Worker 只做"认证保护 + 透传"（`Cache-Control: private, no-store`），**不在 Worker 内解析 HTML**（Free CPU 10ms 保护）；解析由浏览器现有 `detail-mapping.ts` 完成。

### 3.4 收入（§四十七）

Worker 不实现收入计算（Free CPU 保护）。`/api/income/summary|orders` 为 `/api/orders` 语义别名；打开收入页才查询对应时间范围，前端聚合 `effectiveAmount`。

## 四、项目结构

```text
design-admin-workbench/
├── frontend/                 # Vue SPA（纯 UI + Domain Service）
│   ├── src/                  # 只允许 /api/* 端点（ESLint 全域禁旧 URL）
│   ├── public/
│   └── dist/                 # build 产物 → Static Assets
├── worker/src/               # Worker（旧 URL 唯一居住地）
│   ├── index.ts              # 主路由（白名单 + assets fallback）
│   ├── auth/routes.ts        # login / logout / me
│   ├── security/             # session(KV) / crypto(AES-GCM) / turnstile / 中间件
│   ├── legacy/               # client + order + detail + remind + mock-data
│   └── pricing/              # D1 CRUD + users
├── migrations/0001_init.sql  # D1 表结构
├── wrangler.jsonc            # assets / DB / SESSIONS / environments
└── docs/                     # 本文档等五份 CF 文档
```

## 五、Adapter 边界重定义

```text
Phase 1A（旧）：UI → Service → Legacy Adapter → HTTP → 旧系统（同源 proxy）
Phase CF（新）：Vue UI → Domain Service → /api/* → CF Worker → Legacy Gateway → 旧系统
```

- **Legacy URL 是 Worker 层唯一居住地**（`worker/src/legacy/`）。
- 前端 ESLint：`frontend/src` **全域**禁止 `/chsjs`、`*.do` 字面量（不再有任何目录豁免）。
- 前端可见端点（§十）：

| 新端点 | 方法 | 旧 endpoint（仅 Worker 知晓） |
|---|---|---|
| `/api/health` | GET | — |
| `/api/auth/login` / `logout` / `me` | POST/POST/GET | childLogin.do（仅 login） |
| `/api/orders` | GET | getOrderList.do |
| `/api/orders/detail` | GET | needsDetail2.do / needsDetail.do |
| `/api/reminders` | GET | reminderMessage.do |
| `/api/income/summary` / `orders` | GET | getOrderList.do（语义别名） |
| `/api/pricing/rules` (+`/:id`) | GET/POST/PUT/DELETE | —（D1 新系统数据） |

- **禁止 `/api/proxy?url=` 形态**——每条路由显式映射，杜绝开放代理。
- **旧系统写接口永不接入**：batchTakeover / updateRemark / updateIsRead / insertAbnormalOrder / updateRepulseData 及一切催稿发送。

## 六、数据边界

| 存储 | 只保存 | 绝不保存 |
|---|---|---|
| KV | Session（legacyCookie 加密） | 任何明文凭据 |
| D1 | users 身份 / pricing_rules / user_settings / 轻量日志 | 旧系统订单全量、客户 PII（tel/email/qq/company/buyer_open_uid）、任何密码 |
| GitHub / 日志 / Analytics | 代码与无凭据元数据 | password（明文/密文）、SESSION、客户数据 |

- **不做订单全量同步**：查订单 = 实时经 Worker 读旧系统（§二十一）。
- **0 ≠ UNDEFINED**：规则 amount=NULL 显式表示未设置，绝不静默落 0（§二十）。

## 七、环境矩阵（§四十一）

| 环境 | Legacy API | D1 / KV | 用途 |
|---|---|---|---|
| development | off（Mock） | dev 资源 | 远端 Mock 开发 |
| preview | off | preview 资源 | 真实 Worker 预览 |
| production | on（Worker env 控制） | production 资源 | 正式服务 |

- Mock 永不消失（§四十二）：legacy=off 时 Worker 返回脱敏样本，页面仍可开发。
- 生产不可开 Mock：`production.LEGACY_API_ENABLED=true` 且由 Worker 端控制，前端 URL 参数无法开启。

## 八、明确不采用

Docker / Linux VPS / Windows Server / Nginx / Node 常驻服务 / Python 常驻服务 / PostgreSQL / Redis / RabbitMQ / Cloudflare Containers。任何后续新增功能必须先证明 Cloudflare Free 能承受（见 CLOUDFLARE_RESOURCE_POLICY.md）。
