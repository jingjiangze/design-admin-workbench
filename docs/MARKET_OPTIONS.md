# MARKET_OPTIONS.md — 市面成熟方案调研（定稿版）

> 状态：**PARTIAL VERIFIED → 工程审计完成** — 2026-09-20 两轮取证：
> ① GitHub API 元数据（7 候选，[VERIFIED]）；② 4 个关键候选 shallow clone 实际工程检查（[VERIFIED]，数据见 §2）。
> 评价口径：不用"第一名/最好"，逐项写"更适合…… / 主要限制…… / 本项目匹配点 / 主要风险"。

## 1. GitHub 元数据（API 实测 2026-09-20，[VERIFIED]）

| 方案 | Stars | Forks | Issues | 最近推送 | License | 归档 |
| ---- | ----- | ----- | ------ | -------- | ------- | ---- |
| soybeanjs/soybean-admin | 15,018 | 2,516 | 7 | 2026-09-07 | MIT | 否 |
| pure-admin/pure-admin-thin | 3,039 | 1,407 | 1 | 2025-10-30 | MIT | 否 |
| HalseySpicy/Geeker-Admin | 8,089 | 1,668 | 78 | 2026-07-29 | MIT | 否 |
| tabler/tabler | 41,725 | 4,428 | 68 | 2026-09-19 | MIT | 否 |
| vbenjs/vue-vben-admin | 33,484 | 8,970 | 45 | 2026-09-19 | MIT | 否 |
| jekip/naive-ui-admin | 5,916 | 1,066 | 36 | 2026-01-19 | MIT | 否 |
| fantastic-admin/basic | 3,397 | 396 | 0 | 2026-08-30 | MIT | 否 |

许可证核查：7 候选 API 均为 MIT；其中 4 个已下载 LICENSE 原文核对（pure-admin/soybean/Geeker/Vben，均为标准 MIT 文本，允许商业/修改/闭源/再分发）[VERIFIED]。

## 2. 实际工程审计（shallow clone 实测 2026-09-20，[VERIFIED]）

### 2.1 体积与复杂度

| 指标 | pure-admin-thin | soybean-admin | Geeker-Admin | vue-vben-admin |
| ---- | ---- | ---- | ---- | ---- |
| 源码体积（clone 后） | **1.6M** | 2.9M | 9.6M | 20M |
| 依赖数（deps+devDeps） | 24+53=77 | 21+27=48 | 22+44=66 | catalog 化（根包几乎无直接依赖） |
| src 模块数 | 12 | 16 | 15 | monorepo（apps/packages/internal/playground） |
| src 文件数（.vue/.ts/.tsx） | **117** | 156 | 184 | 按包拆分（playground 1985 文件规模） |
| Monorepo | 否（pnpm） | 是（pnpm workspace） | 否（pnpm） | 是（pnpm + turbo + catalog） |
| 包管理器 | pnpm | pnpm | pnpm | pnpm |

### 2.2 技术栈版本（package.json 实测）

| 项 | pure-admin-thin | soybean-admin | Geeker-Admin | vben |
| ---- | ---- | ---- | ---- | ---- |
| Vue | ^3.5.22 | ^3.5.34 | ^3.5.13 | catalog（3.5.x） |
| Vite | ^7.1.12 | **^8.0.12** | ^6.3.2 | catalog |
| TypeScript | ^5.9.3 | **^6.0.3** | ^5.8.3 | catalog |
| UI 库 | **Element Plus ^2.11.5** | **NaiveUI ^2.44.1** | **Element Plus ^2.9.8** | 多 UI（shadcn-vue/element/antd 可选） |
| Pinia / Router | ^3.0.3 / ^4.6.3 | ^3.0.4 / **^5.0.7（下一代）** | ^3.0.2（+persistedstate）/ ^4.5.0 | catalog |
| CSS 方案 | Tailwind ^4 | UnoCSS ^66 | 自研 style + SCSS | Tailwind ^4 |
| 图表 | ECharts ^6 | ECharts ^6 | ECharts ^5.6 | 可选 |
| 表格方案 | **@pureadmin/table ^3.3（增强表格）**+sortablejs | **无增强表格依赖** | sortablejs（Element 自带表格） | sortablejs |
| HTTP | axios ^1.12 | 自研 @sa/axios（workspace） | axios ^1.8 | 自研 http 包 |
| 其他 | fake-server 内置 mock | i18n 内置、elegant-router | wangeditor、PWA、i18n | vitest、turbo |

### 2.3 pure-admin-thin 安装与构建实测（npm 路径，[VERIFIED]）

- `npm install --ignore-scripts`：**710 个包 / node_modules 855M / 约 3 分钟**（npm 无中心 store，pnpm 会显著小于此值）。
- `npm run build` 在 Windows cmd 直接失败：build 脚本使用 Unix 内联环境变量（`NODE_OPTIONS=... vite build`），**Windows 需 bash 或 cross-env** [VERIFIED]。
- 绕过脚本直接 `vite build`：**CDN 插件链路崩溃** —— ① `vite-plugin-cdn-import` 扫描 `vue-demi`（CDN 预配置引用但未安装）直接抛错 [VERIFIED]；② 补装 vue-demi 后 rollup 仍报 ParseError（环境兼容，未继续深挖）→ **本环境构建未走通**，dist 体积 [NOT TESTED]。
- 审计结论：官方路径是 pnpm；npm + Windows 是次要路径，存在两处已知坑（build 脚本跨平台、CDN 插件对依赖完整性敏感）。这些坑可修（禁用 CDN/加 cross-env），但反映模板的 Windows/npm 兼容投入有限。

## 3. 逐项评价（工程证据版）

### pure-admin-thin — 更适合作为本项目起点
- 本项目匹配点：① 唯一内置**增强表格组件**（@pureadmin/table），订单工作台大表格场景直接受益；② Element Plus 生态与旧系统 layui 的"表格+弹层"心智最接近；③ 源码最精简（117 文件/1.6M），去模板化成本四者最低；④ 内置 fake-server mock，Phase 1 前端可先行。
- 主要限制：官方推荐 pnpm（本机未装，npm 路径有已知坑，见 §2.3）；最近推送 2025-10-30，活跃度中等（thin 定位本身变更少）。
- 主要风险：构建链路在 Windows 需要一次性修正（cross-env/关 CDN），属可控技术债。

### soybean-admin — 更适合重视工程规范与 i18n 的团队
- 匹配点：依赖最少（48）、结构清晰（16 模块）、文档好、社区响应快（issues 仅 7）。
- 主要限制：**无增强表格方案**（大表格 CRUD 需自建或引入第三方）；monorepo + Router5 + Vite8 + TS6 版本激进，新手排错成本高；NaiveUI 生态对本项目的组件匹配度弱于 Element Plus。
- 主要风险：激进版本 + monorepo 双重复杂度，对 Vue 新手不友好。

### Geeker-Admin — 更适合需要"开箱即用全功能"的场景
- 匹配点：Element Plus 全家桶 + 内置丰富模板页（权限/主题/表格示例多）；单仓结构比 vben 简单。
- 主要限制：**src 184 文件为四者最多**，去模板化与"识别哪些能删"的成本最高；构建脚本为空串（package.json 实测 [VERIFIED]，需人工确认构建入口）；ECharts 停在 5.x。
- 主要风险：模板化过重——对本项目"不是 Vue 换皮"的目标构成反向拉力。

### vue-vben-admin — 更适合大型多应用组织
- 匹配点：生态最大、turbo monorepo、多 UI 适配层，长期维护有保障。
- 主要限制：20M 源码 + catalog/turbo 概念密度，新手理解成本四者最高；本项目单应用用不到其多包架构。
- 主要风险：过度工程；二次开发要跨 4 层目录。

### tabler / naive-ui-admin / fantastic-admin（未 clone，元数据级）
- tabler：更适合作为**视觉参照**（41.7k★、当天活跃、纯 HTML UI Kit），不作为框架底座（无路由/状态管理）。
- naive-ui-admin：8 个月未推送 [VERIFIED]，活跃度风险，不再推进。
- fantastic-admin：AI-friendly 定位有吸引力，但 free 版边界未审计，作为观察项保留。

## 4. 结论（供 Phase 1 执行，详见 TECHNICAL_BASELINE.md）

- **底座：pure-admin-thin**（表格组件匹配 + 源码最简 + Element Plus 生态）。
- 视觉参照：Tabler / Linear / 飞书（克制、高密度、留白）。
- 本机前置任务：安装 pnpm（corepack enable pnpm 或 npm i -g pnpm），按官方路径重装依赖并复测构建（Phase 1A 第一项）。
