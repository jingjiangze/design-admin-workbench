-- 0001_init.sql —— D1 初始迁移（长文 §十七/§十八/§十九）
-- 边界红线：只保存"新系统自己的数据"（用户身份 / 金额规则 / 设置）；
-- 旧系统订单 / 客户 PII（tel/email/qq/company/buyer_open_uid）永不写入 D1。

-- 用户身份（登录成功登记；user_key = 旧系统登录名）
CREATE TABLE IF NOT EXISTS users (
    user_id       TEXT PRIMARY KEY,
    user_key      TEXT NOT NULL UNIQUE,
    created_at    TEXT NOT NULL,
    last_login_at TEXT
);

-- 自定义金额规则（唯一长期持久化核心业务，长文 §四十八）
-- amount = NULL 表示"未设置"（显式区分 0，长文 §二十）
CREATE TABLE IF NOT EXISTS pricing_rules (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL,
    goods_id      TEXT NOT NULL,
    sub_goods_id  TEXT,
    product_name  TEXT NOT NULL,
    amount        REAL,
    enabled       INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);

-- 唯一约束：同一用户 + 商品 + 子商品 仅一条规则
-- 注意：SQLite 唯一约束对 NULL 不去重，sub_goods_id 可空 → 用表达式索引 COALESCE
CREATE UNIQUE INDEX IF NOT EXISTS idx_pricing_rules_unique
    ON pricing_rules (user_id, goods_id, COALESCE(sub_goods_id, ''));

CREATE INDEX IF NOT EXISTS idx_pricing_rules_user
    ON pricing_rules (user_id);

-- 用户设置（第一版保留表位，暂无固定列）
CREATE TABLE IF NOT EXISTS user_settings (
    user_id    TEXT PRIMARY KEY,
    settings   TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL
);

-- 可选轻量操作日志（第一版仅记录规则变更，不含任何订单/客户数据）
CREATE TABLE IF NOT EXISTS operation_log (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    action     TEXT NOT NULL,
    target_id  TEXT,
    created_at TEXT NOT NULL
);
