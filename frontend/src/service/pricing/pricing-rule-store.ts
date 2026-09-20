/**
 * pricingRuleStore —— 商品金额规则存储封装（docs/PRICING_RULE_SPEC.md §6-8）
 *
 * Phase 1: localStorage（key = pricingRules:<userIdentity>，防多账号混淆）
 * Phase 2+: 切换 Server persistence——本 store 接口不变，UI/Service 无感。
 * ⚠️ 禁止页面组件直接 localStorage.setItem——一切读写经本 store。
 */
import type {
  PricingRule,
  PricingRuleImportRow,
  SetRuleInput,
  ImportPreview,
  ImportResult
} from "./pricing-rule-types";
import { ruleKey } from "./pricing-rule-types";
import { indexRules } from "./amount-resolution";

/** 存储抽象（测试可注入内存实现；生产 = window.localStorage） */
interface RuleStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const DEFAULT_STORAGE: RuleStorage =
  typeof window !== "undefined" && window.localStorage
    ? window.localStorage
    : { getItem: () => null, setItem: () => undefined };

let storage: RuleStorage = DEFAULT_STORAGE;
let userIdentity = "local";

/** 登录后由 auth 流程调用，切换规则归属（Phase 1 Mock 默认 local） */
export function setUserIdentity(userId: string): void {
  userIdentity = userId || "local";
}

export function getUserIdentity(): string {
  return userIdentity;
}

function storageKey(): string {
  return `pricingRules:${userIdentity}`;
}

/** 测试注入：内存存储 */
export function injectStorage(s: RuleStorage): void {
  storage = s;
}

export function resetStorage(): void {
  storage = DEFAULT_STORAGE;
  userIdentity = "local";
}

function makeId(): string {
  return `rule_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

/** 读取全部规则（坏数据静默回空数组，不抛错阻断 UI） */
export function listRules(): PricingRule[] {
  try {
    const raw = storage.getItem(storageKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is PricingRule =>
        r && typeof r.goodsId === "string" && "amount" in r
    );
  } catch {
    return [];
  }
}

function writeRules(rules: PricingRule[]): void {
  storage.setItem(storageKey(), JSON.stringify(rules));
}

export function getRule(
  goodsId: string,
  subGoodsId?: string
): PricingRule | null {
  return listRules().find(
    r => ruleKey(r.goodsId, r.subGoodsId) === ruleKey(goodsId, subGoodsId)
  ) ?? null;
}

/** upsert：新增或覆盖（恢复系统金额请用 clearRule） */
export function setRule(input: SetRuleInput): PricingRule {
  const rules = listRules();
  const key = ruleKey(input.goodsId, input.subGoodsId);
  const existing = rules.find(r => ruleKey(r.goodsId, r.subGoodsId) === key);
  if (existing) {
    existing.productName = input.productName || existing.productName;
    existing.amount = input.amount;
    existing.enabled = true;
    existing.updatedAt = new Date().toISOString();
    writeRules(rules);
    return existing;
  }
  const rule: PricingRule = {
    id: makeId(),
    goodsId: input.goodsId,
    subGoodsId: input.subGoodsId,
    productName: input.productName,
    amount: input.amount,
    enabled: true,
    source: "user",
    updatedAt: new Date().toISOString()
  };
  rules.push(rule);
  writeRules(rules);
  return rule;
}

/** 恢复系统金额 = 删除规则（overrideAmount → null，统计回落 legacy） */
export function clearRule(goodsId: string, subGoodsId?: string): boolean {
  const rules = listRules();
  const key = ruleKey(goodsId, subGoodsId);
  const next = rules.filter(r => ruleKey(r.goodsId, r.subGoodsId) !== key);
  if (next.length === rules.length) return false;
  writeRules(next);
  return true;
}

export function setEnabled(
  goodsId: string,
  subGoodsId: string | undefined,
  enabled: boolean
): void {
  const rules = listRules();
  const key = ruleKey(goodsId, subGoodsId);
  const rule = rules.find(r => ruleKey(r.goodsId, r.subGoodsId) === key);
  if (rule) {
    rule.enabled = enabled;
    rule.updatedAt = new Date().toISOString();
    writeRules(rules);
  }
}

// ===== 导入 / 导出（docs/PRICING_RULE_SPEC.md §8）=====

/** 校验一行导入输入（非法 → null，由预览计入 skipped） */
function normalizeRow(raw: unknown): PricingRuleImportRow | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const goodsid = row.goodsid != null ? String(row.goodsid).trim() : "";
  if (!goodsid) return null;
  let amount: number | null;
  if (row.amount === null || row.amount === undefined || row.amount === "") {
    amount = null;
  } else {
    const n = Number(row.amount);
    if (!Number.isFinite(n) || n < 0) return null;
    amount = n;
  }
  return {
    goodsid,
    subGoodsid:
      row.subGoodsid != null && String(row.subGoodsid).trim() !== ""
        ? String(row.subGoodsid).trim()
        : undefined,
    displayName:
      row.displayName != null && String(row.displayName).trim() !== ""
        ? String(row.displayName).trim()
        : undefined,
    amount
  };
}

/** 解析导入 JSON → 预览（纯逻辑，提交前必须展示给用户确认） */
export function buildImportPreview(json: string): ImportPreview {
  const preview: ImportPreview = {
    total: 0,
    added: [],
    updated: [],
    skipped: []
  };
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    preview.skipped.push({
      goodsid: "",
      amount: null,
      reason: "JSON 解析失败"
    });
    return preview;
  }
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  const existing = indexRules(listRules());
  for (const raw of rows) {
    const row = normalizeRow(raw);
    if (!row) {
      preview.skipped.push({
        goodsid: String((raw as Record<string, unknown>)?.goodsid ?? "?"),
        amount: null,
        reason: "格式非法（缺 goodsid 或金额为负数/非数字）"
      });
      continue;
    }
    preview.total += 1;
    const prev = existing.get(ruleKey(row.goodsid, row.subGoodsid));
    if (!prev) {
      preview.added.push(row);
    } else if (prev.amount === row.amount) {
      preview.skipped.push({ ...row, reason: "与现有规则相同（无变化）" });
    } else {
      preview.updated.push({ ...row, previousAmount: prev.amount });
    }
  }
  return preview;
}

/** 提交预览（应用新增/覆盖；跳过项不动作） */
export function commitImport(preview: ImportPreview): ImportResult {
  const result: ImportResult = { added: 0, updated: 0, skipped: 0 };
  for (const row of preview.added) {
    setRule({
      goodsId: row.goodsid,
      subGoodsId: row.subGoodsid,
      productName: row.displayName ?? row.goodsid,
      amount: row.amount
    });
    result.added += 1;
  }
  for (const row of preview.updated) {
    setRule({
      goodsId: row.goodsid,
      subGoodsId: row.subGoodsid,
      productName: row.displayName ?? row.goodsid,
      amount: row.amount
    });
    result.updated += 1;
  }
  result.skipped = preview.skipped.length;
  return result;
}

/** 导出 JSON（最小字段形态，便于手改/换机迁移） */
export function exportRules(): string {
  const rows: PricingRuleImportRow[] = listRules().map(r => ({
    goodsid: r.goodsId,
    subGoodsid: r.subGoodsId,
    displayName: r.productName,
    amount: r.amount
  }));
  return JSON.stringify(rows, null, 2);
}
