# CLOUDFLARE RESOURCE POLICY — 免费额度保护策略（Phase CF-0 §四十四/§四十五）

> 状态：[VERIFIED-DOC] 限额数字来自 Cloudflare 官方文档公开页；用量监控以控制台为准。
> 原则：**任何后续新增功能必须先证明 Cloudflare Free 能承受，再决定是否升级付费。**

## 目录

1. [Free 档关键限额](#一free-档关键限额)
2. [本项目预算模型](#二本项目预算模型)
3. [禁止行为](#三禁止行为)
4. [设计对策](#四设计对策)

---

## 一、Free 档关键限额

| 资源 | Free 限额 | 超限后果 |
|---|---|---|
| Workers 请求数 | 100,000 次/天 | 拒绝服务 |
| Workers CPU | 10ms/次 invocation | 执行中断 |
| Workers subrequest | 50 次/请求 | 超出即失败 |
| KV 读 | 100,000 次/天 | 失败至重置 |
| KV 写 | 1,000 次/天 | 失败至重置 |
| KV 存储 | 1 GB/namespace | 写入失败 |
| D1 rows read | 5,000,000 行/天 | **查询直接失败至重置** |
| D1 rows write | 100,000 行/天 | 查询直接失败至重置 |
| D1 存储 | 5 GB 总量 / 500 MB/库 | 写入失败 |
| Turnstile | 免费用于生产站点 | — |

## 二、本项目预算模型（小型工作室 + 少量设计师）

| 操作 | Worker 请求 | KV 读/写 | D1 读/写 | 备注 |
|---|---|---|---|---|
| 页面加载（静态） | 0（Static Assets 不计 Worker） | 0 | 0 | 直出 dist |
| 登录 | 1 | 1 / 1 | 1 / 1 | Turnstile siteverify 不计本项目 |
| 查订单列表 | 1/页 | 1/0 | 0 | 订单不落 D1 |
| 查详情 | 1 | 1/0 | 0 | HTML 透传 |
| 收入查询 | 1~3 | 1/0 | 0 | 前端聚合 |
| 规则读写 | 1 | 0 | ≤10 / 1 | 主要 D1 消耗 |

**按 5 名设计师 × 每天各 200 次请求估算 ≈ 1,000 requests/天**，全部维度余量 >10 倍。

## 三、禁止行为（§四十五）

- ❌ 每秒/每几秒轮询旧系统或任何 API。
- ❌ 后台无限轮询催稿/通知（通知：进入页面时读取一次即可，或 ≥60s 手动刷新）。
- ❌ 订单全量同步进 D1 / KV 大量缓存。
- ❌ 首页拆 15 个小 API（§四十六：最多 1 次 `/api/dashboard` 或 orders/reminders/income 三请求）。
- ❌ 无界循环子请求（50 次 subrequest 限制）。
- ❌ 在 Worker 内做 551KB HTML 重解析（10ms CPU 限制）。

## 四、设计对策（已内建）

1. **Session 滑动成本**：KV 写仅在登录时 1 次（第一版固定 24h TTL，不做每请求续期写）。
2. **静态资源**：走 Static Assets 缓存，不消耗 Worker 请求。
3. **私有 API**：`Cache-Control: private, no-store`（不进公共缓存，也避免缓存污染）。
4. **规则变更**：立即保存但单行 upsert（rows write 最小化）。
5. **observability**：`wrangler.jsonc` 已开启，控制台可查请求量与错误率；超 50% 日限额即告警审查。
