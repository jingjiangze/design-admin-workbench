# CLOUDFLARE DEPLOYMENT — 部署手册（Phase CF-0）

> 状态：[VERIFIED-CONFIG] 代码/配置已就绪；以下需要 Cloudflare 账号的步骤尚未执行 [NOT TESTED]。
> 原则：**正式部署永远由 Cloudflare Workers Builds 完成，电脑不参与生产部署。**

## 目录

1. [前置条件](#一前置条件)
2. [资源创建（一次性）](#二资源创建一次性)
3. [回填 wrangler.jsonc](#三回填-wranglerjsonc)
4. [Secrets](#四secrets)
5. [D1 迁移](#五d1-迁移)
6. [GitHub 自动部署（Workers Builds）](#六github-自动部署workers-builds)
7. [构建命令与远端基线](#七构建命令与远端基线)
8. [域名策略](#八域名策略)
9. [登录验收 BLOCKED 项](#九登录验收-blocked-项)
10. [本地短时调试（唯一允许的本地运行形态）](#十本地短时调试)

---

## 一、前置条件

- Cloudflare 免费账号（用户已有 CF 账号：jiangjiangze.icu 关联账号可复用或新建）。
- GitHub 仓库已连接（公开仓：jingjiangze/design-admin-workbench）。
- 本机已安装 Node 22+（仅需执行一次性 `wrangler` CLI 命令；不跑常驻服务）。

## 二、资源创建（一次性）

在仓库根目录执行（首次会引导 `wrangler login` 浏览器授权）：

```bash
npx wrangler d1 create design-workbench            # 生产 D1
npx wrangler d1 create design-workbench-preview    # 预览 D1
npx wrangler kv namespace create SESSIONS          # 生产 KV
npx wrangler kv namespace create SESSIONS --preview # 预览 KV
```

记录输出中的 `database_id` 与 KV `id`。

## 三、回填 wrangler.jsonc

将上一步得到的 id 回填到 `wrangler.jsonc` 对应位置（当前为 `0000…` 占位）：

- 顶层 `d1_databases[0].database_id` ← design-workbench
- `environments.preview.d1_databases[0].database_id` ← design-workbench-preview
- 顶层 `kv_namespaces[0].id` ← SESSIONS（生产）
- `environments.preview.kv_namespaces[0].id` ← SESSIONS（preview）

## 四、Secrets

```bash
# AES-256 密钥（base64 32 字节）——本地生成示例（Node）：
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

npx wrangler secret put SESSION_ENCRYPTION_KEY                 # 必须
npx wrangler secret put TURNSTILE_SECRET_KEY                   # 生产登录防护（必须）
```

- Secret 绝不写入 git / wrangler.jsonc / .env / 前端 bundle（长文 §三十四）。
- 本地短时调试用 `worker/.dev.vars`（模板：`worker/.dev.vars.example`，已 gitignore）。
- Turnstile site key（公开，非 secret）在 Cloudflare 控制台创建后填入前端登录页配置。

## 五、D1 迁移

```bash
npx wrangler d1 migrations apply design-workbench --remote            # 生产
npx wrangler d1 migrations apply design-workbench-preview --remote    # 预览
```

迁移文件：`migrations/0001_init.sql`（users / pricing_rules / user_settings / operation_log + 表达式唯一索引）。

## 六、GitHub 自动部署（Workers Builds）

优先使用 **Cloudflare Workers Builds**（控制台：Workers & Pages → Create → Connect to Git）：

1. 选择仓库 `jingjiangze/design-admin-workbench`，分支 `main`。
2. Build command：`cd frontend && pnpm install --frozen-lockfile && pnpm build`
3. Deploy command：`npx wrangler deploy`
4. Build Watch Paths：`frontend/**`、`worker/**`、`wrangler.jsonc`、`migrations/**`
5. 环境绑定：Production = `production` env；Preview = `preview` env（PR/push 到非 main 自动 preview）。

> 若 Git Integration 不可用，回退 GitHub Actions：`CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` 只放 **GitHub Secrets**，绝不写仓库（长文 §三十九）。

## 七、构建命令与远端基线

| 项 | 本机历史参考（已停用） | 正式数据 |
|---|---|---|
| lint/test | lint exit 0 / test 70/70 | 首次 Cloudflare Build 后回填 |
| build | 18.45s / 2.33MB | 首次 Cloudflare Build 后回填 |
| Node/pnpm/Vite | 本机 Node 22 | 以 Build 日志为准 |

## 八、域名策略（§四十）

1. 先用 `https://design-admin-workbench.<account>.workers.dev` 验证全链路。
2. 全部通过后绑定正式域名（如 `workbench.jiangjiangze.icu`）。
3. **不要先切生产 DNS**。

## 九、登录验收 BLOCKED 项（§五十一）

Phase 1A 记录：旧系统登录接口当前**业务拒绝**（账号侧待用户确认）。因此：

- ✅ 可先行完成：Mock / Worker / KV / D1 / Static Assets / API 架构、Turnstile、Builds。
- ⛔ BLOCKED（不得绕过）：真实生产登录验收。
- 🚫 明确禁止：硬编码旧 SESSION、复制旧 Cookie、绕过旧登录。

## 十、本地短时调试（唯一允许的本地运行形态）

```bash
# 终端 1（临时，用完即停）
cd frontend && pnpm install && npx wrangler dev        # Worker :8787

# 终端 2（临时）
cd frontend && pnpm dev                                 # vite :8848，/api proxy → :8787
```

⚠️ `pnpm dev` / `vite` / `wrangler dev` **只允许短时调试**，禁止作为长期运行环境；正常开发/预览优先 Cloudflare Preview / workers.dev / Production（长文 §三）。
