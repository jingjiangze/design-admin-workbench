# BATCH_ORDER_OPERATION_SPEC.md — 批量订单号工具规格

> 状态：**SPEC（定稿）** — 新系统第一批真正的增强能力之一。
> 依据：旧系统无任何批量复制能力（[VERIFIED] myOrder 页操作列仅接单/详情/标记类操作；ClipboardJS 只在详情页复制单个订单号）。

## 1. 定位

- 旧系统痛点：设计师处理催单/群发通知时，需要逐个打开订单复制订单号（[VERIFIED] 详情页才有单号复制按钮）。
- 本能力属于**纯前端增强**：不依赖旧系统新 API，只依赖已有 `getOrderList.do` 行数据（`ordernum` 字段）。
- 优先落地于：订单中心表格、首页待催单卡片、催单中心。

## 2. 交互定义

### 2.1 选择订单

- 表格首列复选框（对应旧系统"选中"列交互习惯 [VERIFIED] 待接单 Tab 有 check 列），支持：
  - 单击勾选 / 取消
  - 表头全选（当前页）
  - **跨页保持**：已勾选集合随筛选条件缓存，翻页不清空（旧系统翻页丢勾选 [VERIFIED] layui table 默认行为）
  - 快捷键：`Ctrl+A` 全选当前页、`Esc` 清空选择
- 选中数量常驻显示于批量操作栏：`已选 5 单`。

### 2.2 一键复制格式

| 模式 | 输出示例 | 说明 |
| ---- | ---- | ---- |
| 逐行 | `A001⏎A002⏎A003` | 默认模式；粘贴到聊天窗自动逐行展示 |
| 顿号 | `A001、A002、A003` | 中文场景群发 |
| 逗号 | `A001,A002,A003` | 粘贴到 Excel/表格类工具 |

- 复制按钮组常驻批量操作栏：`复制订单号 ▾`（下拉选格式，记住上次选择）。
- 复制成功 Toast：`已复制 5 个订单号（逐行）`。

### 2.3 预留扩展（Phase 2+，本期只留下拉占位）

- 复制催单文本 → 依赖 EXPEDITE_WORKFLOW_SPEC.md 的模板引擎
- 复制客户信息 → 店铺名/客户称呼（kehu_name），**不含手机号/旺旺号等 PII**（PII 仅详情 Drawer 权限展示 [见 ORDER_DETAIL_MODEL §7-5]）
- 复制订单摘要 → 单号+品类+设计费+截稿时间一行式

## 3. 技术要点（对齐 TECHNICAL_BASELINE.md）

- 剪贴板：`navigator.clipboard.writeText` + execText 降级；不引第三方库（旧系统 ClipboardJS 仅单条复制场景 [VERIFIED]）。
- 选择状态管理：Pinia store `batchSelectionStore`（跨页集合 = `Set<needsid>`，输出时映射回行数据）。
- 复用层：作为 `useBatchSelection()` 组合式函数 + `<BatchActionBar>` 组件，订单中心/催单中心/首页卡片三处复用。
- 禁止直接散落旧 API URL——数据一律来自 `orderService.list()`（Adapter 见 TECHNICAL_BASELINE.md §Adapter）。

## 4. 验收标准

- [ ] 订单中心勾选 3 单 → 逐行/顿号/逗号三种格式复制结果正确
- [ ] 翻页后勾选集合保持；清除筛选后集合清空
- [ ] 空选点击复制 → 按钮禁用态
- [ ] 复制 50 单无卡顿（<100ms）
