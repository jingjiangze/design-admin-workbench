# TECHNICAL_BASELINE.md — 技术基线（定稿）

> 状态：**DEVELOPMENT READY** — 2026-09-20 基于 4 候选实际工程审计定稿（审计数据见 MARKET_OPTIONS.md §2，[VERIFIED]）。
> 原则：结论来自本轮实测，非沿用早期推荐。

## 1. 选型结论

| 项 | 选定 | 版本（随模板） | 依据 |
| -- | ---- | ---- | ---- |
| 基础模板 | **pure-admin-thin**（pure-admin/pure-admin-thin） | v6.2.0（实测 package.json） | 见 §2 |
| UI | **Element Plus** | ^2.11.5 | 订单表格工作台心智与旧 layui 最接近；thin 版原生集成 |
| Vue | Vue 3（Composition API + `<script setup>`） | ^3.5.22 | 模板默认；生态主流 |
| 构建 | Vite | ^7.1.12 | 模板默认 |
| 语言 | TypeScript（strict） | ^5.9.3 | 模板默认；详情/列表模型字段可类型化 |
| 状态 | Pinia | ^3.0.3 | 模板默认 |
| 路由 | Vue Router | ^4.6.3 | 模板默认 |
| HTTP | axios（模板已内置封装） | ^1.12.2 | 拦截器挂 SESSION Cookie 与错误码分发 |
| 表格 | **@pureadmin/table**（模板内置）+ 原生 el-table | ^3.3.0 | 订单工作台大表格主场景 |
| 样式 | Tailwind CSS ^4（模板内置）+ Element 主题变量 | ^4.1.16 | 布局微调快，不重复造轮子 |
| 图表 | ECharts ^6（模板内置，按需引入） | ^6.0.0 | 首页统计卡片 |
| Mock | vite-plugin-fake-server（模板内置） | — | 旧系统未改造前，Phase 1 可 mock先行 |

### 为什么选 pure-admin-thin（依据本轮实测，非 Star 数）

1. **表格组件唯一匹配**：四候选中唯一内置增强表格（@pureadmin/table）——订单中心是本项目第一主场景。
2. **去模板化成本最低**：src 仅 117 文件 / 1.6M（vben 20M、Geeker 9.6M），删除 demo 页面后骨架一目了然，对新手友好。
3. **Element Plus 生态**：与旧系统 layui 的"表格+弹层+表单"交互形态同构，学习迁移成本最低。
4. **mock 先行**：内置 fake-server，Phase 1 可在旧系统 Adapter 就绪前并行开发首页/查单。

### 为什么没选另外三个（实测依据）

- **soybean-admin**：无增强表格依赖（CRUD 表格要自建）；Vite8/TS6/Router5 版本激进 + pnpm monorepo，新手排错成本高；NaiveUI 对表格密集场景组件匹配弱于 Element。
- **Geeker-Admin**：src 184 文件模板化最重，与"不做 Vue 换皮"目标相悖；package.json 构建脚本为空串（实测异常）；ECharts 5.x 停更线。
- **vue-vben-admin**：turbo + catalog 多包架构（20M 源码）对单应用项目是过度工程。
- （tabler 是 UI Kit 非框架；naive-ui-admin 8 个月未推送；fantastic-admin free 版边界未审计——均不进入本轮底座比较。）

### 已知风险与前置任务（Phase 1A 必做）

| 风险 | 实测证据 | 处置 |
| ---- | ---- | ---- |
| 本机无 pnpm（模板官方路径） | corepack/pnpm 均不可用 [VERIFIED] | `npm i -g pnpm` 后用 pnpm 重装依赖 |
| build 脚本 Unix 内联环境变量，Windows cmd 不兼容 | `NODE_OPTIONS=... vite build` cmd 报错 [VERIFIED] | 改用 bash 执行或引入 cross-env（一行改动） |
| CDN 构建模式脆弱（引用未安装的 vue-demi 即崩） | vite-plugin-cdn-import 抛错 [VERIFIED] | 保持 `.env.production` VITE_CDN=false（默认即关）；构建入口改脚本化 |
| dist 构建体积 | 本环境构建未走通 | Phase 1A 装好 pnpm 后复测并回填 [NOT TESTED] |

## 2. 分层架构与 Adapter（P0-F10 定稿）

```text
┌────────────────────────────────────────────┐
│ UI 层  Vue 页面 / 组件（.vue）              │  ← 只 import service，禁止出现 /chsjs 字样
├────────────────────────────────────────────┤
│ Domain Service 层（src/service/）           │  ← 领域语义 API：orderService.list(detail?)
│   orderService / expediteService /          │
│   categoryService / statsService /          │
│   authService / messageService              │
├────────────────────────────────────────────┤
│ Legacy Adapter 层（src/service/legacy/）    │  ← 唯一允许出现旧 URL/参数翻译/字段映射的地方
│   legacyOrderAdapter / legacyRemindAdapter… │
├────────────────────────────────────────────┤
│ HTTP 基建（模板 axios 封装 + Cookie 会话）   │
└────────────────────────────────────────────┘
            ↓（调用）
   旧系统 /chsjs/child/*.do
```

**强制规约**：

- `.vue` 文件中出现 `getOrderList.do` 等 URL 字符串 = 违规（lint 阶段用 no-restricted-syntax 拦截）。
- Adapter 输入输出一律**领域类型**（`OrderListItem` / `OrderDetail` / `ExpediteMessage`），旧字段名（isqll/ordrtyp/kehu_ww 等）只在 Adapter 内部出现。
- 已知语义错位在 Adapter 翻译：`erp.ordrtyp`（实为店铺名）→ `Order.shop`；`state` 数字 → 显式状态枚举；`isqll` → `AbnormalStatus`。
- 未来替换后端 = 重写 Adapter 层，Service/UI 零改动。

### 目录结构规划（基于 thin 版精简）

```text
src/
├── api/            # 模板自带（保留 HTTP 基建）
├── service/        # 新增：领域服务层
│   ├── order.ts / expedite.ts / category.ts / stats.ts / message.ts
│   └── legacy/     # Legacy Adapter（旧 URL 唯一居住地）
│       ├── order.ts / remind.ts / upload.ts
│       └── types.ts
├── views/          # 页面（删光模板 demo，仅留）
│   ├── home/ order/ expedite/ category/ data/ account/ login/
├── components/     # BatchActionBar / OrderDrawer / SearchBar / StatCard…
├── store/          # user / batchSelection / app
├── router/         # 沿用模板路由权限机制
└── utils/
```

## 3. 权限方案（复用模板机制，映射旧系统角色）

- 模板自带：路由级权限（返回路由表按角色过滤）+ 按钮/组件级（`Auth` 组件 / `v-auth` 指令）+ Token/Cookie 存取封装。
- 映射：旧系统 Cookie 会话（SESSION）→ 模板 auth 存储；子设计师角色 → `ROLE_SUB_DESIGNER`（Phase 1 单角色，多角色留扩展位）。
- 旧系统跨角色隔离 NOT TESTED（记录于 AUTH_MODEL.md），新系统不做越权探测。

## 4. 明确 UNKNOWN（不阻塞开发）

- pure-admin-thin 在本机的 pnpm 构建产物体积 [NOT TESTED → Phase 1A 回填]
- 旧系统 WebSocket（SockJS/STOMP）在新系统的接入时机（Phase 2 催单中心再议）
- 旧系统会话超时精确时长（实测 >2.5h 有效）
- 登录 RSA 公钥轮换机制（假设不轮换，出现 401 全量重登兜底）
