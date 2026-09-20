# DOMAIN_MODEL.md — 业务对象建模

> 状态：**NOT VERIFIED（未验证）** — 不存在的对象需明确标注 `NOT FOUND / NOT VERIFIED`。

## 对象清单

| 对象 | 是否存在 | 关系 | 证据等级 |
| ---- | -------- | ---- | -------- |
| User | UNKNOWN | | |
| Customer | UNKNOWN | | |
| Order | UNKNOWN | | |
| Product | UNKNOWN | | |
| Category | UNKNOWN | | |
| DesignTask | UNKNOWN | | |
| Status | UNKNOWN | | |
| Reminder（催单） | UNKNOWN | | |
| OperationLog | UNKNOWN | | |

## 关系图（目标形态，待取证后修正）

```text
Customer
   │
   ├── Orders
   │      ├── Category
   │      ├── Design
   │      └── Status
   │
   └── Contacts
```
