-- 0002_work_item_marker.sql —— 个人防漏单标记（WORKFLOW-V2 规格十三/十一）
--
-- 语义红线（docs/WORKFLOW_MARKER_SPEC.md）：
-- - 本表只存"当前用户确认自己完成过对应业务操作"的个人标记（绿点）；
-- - 绝不写回旧系统状态，两个方向断开：Legacy ← 业务反馈 ← Worker → D1 标记；
-- - item_key 使用旧系统主键（order:{needsid} / reminder:{reminderId}），
--   禁用订单号 ordernum（一个订单号可能对应多个需求）。

CREATE TABLE IF NOT EXISTS work_item_marker (
    id           TEXT PRIMARY KEY,
    user_key     TEXT NOT NULL,
    item_type    TEXT NOT NULL,
    item_key     TEXT NOT NULL,
    processed_at TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
);

-- 唯一约束：同一用户 + 同一类型 + 同一条目仅一条标记（幂等 upsert 基础）
CREATE UNIQUE INDEX IF NOT EXISTS idx_work_item_marker_unique
    ON work_item_marker (user_key, item_type, item_key);

CREATE INDEX IF NOT EXISTS idx_work_item_marker_user
    ON work_item_marker (user_key);
