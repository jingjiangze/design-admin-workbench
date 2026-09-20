# TECHNICAL_BASELINE.md — 建议技术基线

> 状态：**NOT VERIFIED（未验证）** — 必须根据审计结果决定，不提前锁死。

## 待定基线

| 项 | 当前候选 | 结论 | 依据 |
| -- | -------- | ---- | ---- |
| 基础模板 | 待定 | UNKNOWN | |
| UI | Naive UI / Element Plus（二选一） | UNKNOWN | |
| Vue | Vue 3 | 待验证 | |
| 构建 | Vite | 待验证 | |
| 语言 | TypeScript | 待验证 | |
| 状态 | Pinia | 待验证 | |
| 路由 | Vue Router | 待验证 | |
| HTTP Client | 待定 | UNKNOWN | |
| 表格方案 | 待定 | UNKNOWN | |
| 权限方案 | 待定 | UNKNOWN | |

## Adapter 架构

```text
旧系统 API
      ↓
Legacy Adapter
      ↓
Domain Service
      ↓
新后台页面
```

目标：Vue 页面不直接依赖旧接口细节；旧接口变化只需改 Adapter/Service。

## 可扩展能力评估（待完成）

feature / module / service / adapter / plugin 形式的扩展可行性；不为未来功能提前造复杂系统。
