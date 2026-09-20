# Phase UI-R1 任务与验收清单

> Modern Minimal UI 重构 · 目标：把"后台模板"变成"设计师工作台"
> 边界：数据层 / Service / Adapter / API / Cloudflare 全部不动（§四十三），UI only

## 开发顺序（§五十四）

| 步骤 | 内容 | Commit | 状态 |
|---|---|---|---|
| UI-R1-04 | 设计令牌 tokens.css（先行，被全部依赖） | `3181a15` | ✅ |
| UI-R1-05 | UI 基础组件九件套 components/ui/ | `5434bba` | ✅ |
| UI-R1-01 | 新 Shell（绕过 pure-admin layout） | `b3cb124` | ✅ |
| UI-R1-02 | Rail Navigation 60px 图标导航 | `b3cb124` | ✅ |
| UI-R1-03 | Header + CommandPalette 全局搜索 | `b3cb124` | ✅ |
| UI-R1-06 | Home Search First 重构 | `4f1493d` | ✅ |
| UI-R1-07 | Orders 工作台 | `45d3099` | ✅ |
| UI-R1-08 | Order Drawer 680px | `45d3099` | ✅ |
| UI-R1-09 | Income 工作台 | `0b9e4b9` | ✅ |
| UI-R1-10 | Expedite 工作台 | `9e0cc3e` | ✅ |
| UI-R1-11 | Category + Pricing + Account | `c5d66a9` | ✅ |
| — | /ui-preview 视觉验收页 | `ba6c2a5` | ✅ |
| UI-R1-12 | Visual QA（三件套 + 线上截图） | — | 🔄 进行中 |

## 结构落定（§四十二）

```text
Shell（layout/shell/AppShell.vue）
 ├── AppRail        60px 图标导航 ×6（工作台/订单/催稿/收入/品类/账户）
 ├── AppHeader      54px（品牌 / 搜索入口 / 通知+头像）
 └── Main           max-width 1320px
浮层：CommandPalette（/ 或 Ctrl+K）、OrderDrawer 680px、AppDialog 440px

页面
 ├── Home      Search 大框 → 4 极简数字 → 今天需要关注列表 → 最近订单线表
 ├── Orders    6 视图行内 Tab + 轻筛选 + 线表 + 浮现批量栏 + Drawer
 ├── Income    大数字 + 今日/本周/本月 + 品类横条（反查订单）+ 未定义清单
 ├── Expedite  行式列表 + 浮现批量栏 + 催稿文本 Drawer（无发送入口）
 ├── Category  分组商品行（系统/我的金额对照）+ 极简弹窗 + 导入导出
 └── Account   身份 + 数据模式 + 规则统计 + 登出
```

## 关键决策记录

- **pure-admin UI 绕过**（§四十七）：`src/layout/index.vue` 不再被任何路由引用，
  navbar/tags/setting panel/sidebar 对用户不可见；代码保留。
- **Drawer Tabs 数据驱动**：概要/版次/文件/轨迹有数据才渲染；
  聊天/校对/历史无 Service 数据，不造假 Tab（诚实原则）。
- **订单品类/时间筛选**：作用于当前结果集（Real 分页下仅当前页），
  全量筛选待 CF-REAL-05 真实搜索升级——页面注释已标注。
- **收入环比（较上月）**：income Service 无上月范围 preset，第一版不做，
  不硬编码假数字（§四十五）。
- **催稿文本变量**：Service 层模板变量为 {店铺}{订单}{品类}{截稿}，
  UI 提示与之一致；缺失显式 `<缺失:xxx>`。
- **导入/导出**：并入品类页（文件方式），账户页去重。

## 三件套（2026-09-20 实测）

| 项 | 结果 |
|---|---|
| lint | exit 0（eslint+prettier+stylelint） |
| test | 70/70（6 文件） |
| build | 15.01s · 1.89MB · AppShell chunk 9.65kB |

## 视觉验收标准（§五十，逐项检查）

- [x] 没有 pure-admin 默认视觉
- [x] 没有无意义大卡片
- [x] 没有多余边框
- [x] 没有三级菜单
- [x] 没有彩虹色
- [x] 没有模板 Dashboard 感
- [x] 搜索入口明显
- [x] 内容层级清晰
- [x] 信息密度适中
- [x] 空间利用合理
- [x] 文字层级明确
- [x] 操作路径短
- [x] 订单号容易识别
- [x] 金额来源容易识别

> 截图验收（1440×900 / 1920×1080）在 Cloudflare 部署后用浏览器自动化执行，
> 覆盖：首页 / 订单 / 订单 Drawer / 收入 / 催稿 / 品类 / 金额编辑。

## 视觉验收实测（2026-09-20 · UI-R1-12）

**方式**：本地 wrangler 4.135.0 部署（Version `4726617d`）→ headless Chrome 153 CDP
（`Emulation.setDeviceMetricsOverride` 1440×900 / 1920×1080）逐页审计 + 截图 17 张。
说明：agent-browser 0.27.0 daemon 在本机挂死（open/connect 全部无输出卡住，
手动 chrome + 原生 CDP 脚本 `.tmp-evidence/ui-qa/ui-cdp.mjs` 替代）。

**线上验证**：`/api/health` 200（mode=mock）；首页 asset hash
`index-Cofm_pVY.js` / `index-Cz6PwZ6X.css` 与本地构建一致。

**机器审计（两档分辨率 × 7 页面全部 PASS）**：

| 检查项 | 实测 | 判定 |
|---|---|---|
| Rail 宽度 | 60px（规范 56–64） | PASS |
| Header 高度 | 54px（规范 52–56） | PASS |
| 导航项 | 6 项（工作台/订单/催稿/收入/品类/账户） | PASS |
| TagViews | 无 | PASS |
| 全局背景 | rgb(247,247,245) = #F7F7F5 | PASS |
| 阴影 | 仅浮层（el-popper/el-drawer/el-overlay），正文 0 投影 | PASS |

**交互验证**：Mock 登录（表单"账号/密码"→ `#/welcome` 跳转 + token 写入）；
订单 Drawer 点击行打开（680px、左圆角 10px、Tabs 概要/版次/文件/轨迹、
金额块"¥20 · 来源：系统设计费"、PII 掩码 `138****982` 正常）。

**截图**：`.tmp-evidence/ui-qa/page-*.png`（gitignore，不入库）。

**备注**：`/ui-preview` 需访问 `#/ui-preview/index`（父路由仅为壳，子路由才是页面），
直接访问 `#/ui-preview` 为空白——符合 vue-router 嵌套路由语义，非缺陷。

## 遗留与后续

- 登录页仍为 pure-admin 视觉（独立 login.css）——轻度品牌化延后（不阻塞 §五十一 判定，
  因登录页不构成"工作台像后台"的主体验路径）。
- Dark 主题延后（§四十八：第一版 Light only）。
- 收入"自定义"日期范围待 CF-REAL-10 Income Service 扩展 preset 后接入。
