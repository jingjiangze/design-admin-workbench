/**
 * pricingRuleStore —— 商品金额规则存储封装（docs/PRICING_RULE_SPEC.md §6-8）
 *
 * P1-05 存储升级：localStorage → Worker /api/pricing/rules → D1。
 * 分层模型（保留既有同步调用语义，UI/Service 零改动）：
 * - cache      ：内存数组，一切读操作的事实源（listRules/getRule）；
 * - mirror     ：localStorage `pricingRules:<userIdentity>`，本地韧性层
 *                （服务端不可达时读不中断；hydrate 成功后被服务端数据覆盖）；
 * - sync queue ：写意图队列（按 identity::key 去重，last-write-wins），
 *                串行 flush 到服务端；失败保留意图，下次写/hydrate 重试。
 *
 * 意图自包含（upsert 带规则快照 / delete 带服务端行 id），flush 不回读
 * cache——身份切换竞态下不会把 A 的写刷进 B 的会话（intent.identity 守卫）。
 *
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
import { fetchRules, pushRule, patchRule, deleteRule } from "./pricing-api";

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

/** 内存 cache（读事实源），随身份切换从镜像装载 */
let cache: PricingRule[] = [];

/** 服务端同步意图队列：key = `${identity}::${ruleKey}` */
interface SyncIntent {
  identity: string;
  kind: "upsert" | "delete";
  key: string;
  /** upsert：规则快照（flush 自包含） */
  rule?: PricingRule;
  /** delete：服务端行 id（行从未同步过则无 → 服务端无需动作） */
  serverId?: string;
}
const queue = new Map<string, SyncIntent>();

let flushInFlight = false;
let flushScheduled = false;
let hydrateInFlight = false;
let lastError: string | null = null;
let lastSyncedAt: string | null = null;
let lastNotifiedError: string | null = null;
const syncErrorListeners = new Set<(message: string) => void>();

/** 本地生成 id 前缀（服务端 id 为 UUID，不含下划线开头段） */
const LOCAL_ID_PREFIX = "rule_";

/** 登录后由 auth 流程调用，切换规则归属并触发服务端对齐 */
export function setUserIdentity(userId: string): void {
  userIdentity = userId || "local";
  cache = loadMirror();
  // fire-and-forget：先 flush 本地未同步写，再以服务端数据覆盖 cache
  void hydrateFromServer();
}

export function getUserIdentity(): string {
  return userIdentity;
}

function storageKey(): string {
  return `pricingRules:${userIdentity}`;
}

/** 测试注入：内存存储（同时按新存储重载 cache） */
export function injectStorage(s: RuleStorage): void {
  storage = s;
  cache = loadMirror();
}

export function resetStorage(): void {
  storage = DEFAULT_STORAGE;
  userIdentity = "local";
  cache = [];
  queue.clear();
  flushInFlight = false;
  flushScheduled = false;
  hydrateInFlight = false;
  lastError = null;
  lastSyncedAt = null;
  lastNotifiedError = null;
}

/** 同步状态（UI/调试可读；pending 只统计当前身份） */
export function getSyncStatus(): {
  pendingCount: number;
  lastError: string | null;
  lastSyncedAt: string | null;
} {
  let pendingCount = 0;
  for (const intent of queue.values()) {
    if (intent.identity === userIdentity) pendingCount += 1;
  }
  return { pendingCount, lastError, lastSyncedAt };
}

/** 订阅写同步失败（UI 透出用；返回退订函数） */
export function onSyncError(cb: (message: string) => void): () => void {
  syncErrorListeners.add(cb);
  return () => syncErrorListeners.delete(cb);
}

function notifyError(message: string): void {
  if (message === lastNotifiedError) return; // 同因不刷屏
  lastNotifiedError = message;
  for (const cb of syncErrorListeners) {
    try {
      cb(message);
    } catch {
      /* 监听方异常不影响存储层 */
    }
  }
}

function loadMirror(): PricingRule[] {
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

function writeMirror(): void {
  storage.setItem(storageKey(), JSON.stringify(cache));
}

/** 读取全部规则（读内存 cache；坏镜像数据装载时已过滤） */
export function listRules(): PricingRule[] {
  return cache;
}

export function getRule(
  goodsId: string,
  subGoodsId?: string
): PricingRule | null {
  return (
    cache.find(
      r => ruleKey(r.goodsId, r.subGoodsId) === ruleKey(goodsId, subGoodsId)
    ) ?? null
  );
}

function makeId(): string {
  return `${LOCAL_ID_PREFIX}${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function enqueueIntent(intent: Omit<SyncIntent, "identity">): void {
  queue.set(`${userIdentity}::${intent.key}`, {
    ...intent,
    identity: userIdentity
  });
  scheduleFlush();
}

/**
 * 微任务调度 flush：同一同步写块（如导入循环、删除后立即重写）
 * 先完成意图合并，再统一冲刷——天然 last-write-wins。
 */
function scheduleFlush(): void {
  if (flushScheduled) return;
  flushScheduled = true;
  queueMicrotask(() => {
    flushScheduled = false;
    void runFlush();
  });
}

/** 串行 flush：只处理当前身份的意图（其他身份的意图原地保留，待其回归） */
async function runFlush(): Promise<void> {
  if (flushInFlight) return;
  flushInFlight = true;
  try {
    for (;;) {
      let matched: SyncIntent | null = null;
      let matchedKey: string | null = null;
      for (const [key, intent] of queue.entries()) {
        if (intent.identity === userIdentity) {
          matched = intent;
          matchedKey = key;
          break;
        }
      }
      if (!matched || !matchedKey) break;
      // 先摘除再执行：执行期间同 key 可能被更新意图覆盖，
      // 若后删除会把新意图一并删掉（丢失写）；失败时仅在无更新意图时回放
      queue.delete(matchedKey);
      try {
        await executeIntent(matched);
        lastError = null;
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
        if (!queue.has(matchedKey)) queue.set(matchedKey, matched);
        notifyError(lastError);
        break; // 保留意图，下次写 / hydrate 时重试
      }
    }
  } finally {
    flushInFlight = false;
  }
}

async function executeIntent(intent: SyncIntent): Promise<void> {
  if (intent.kind === "delete") {
    if (intent.serverId) await deleteRule(intent.serverId);
    return; // 从未同步过的行：服务端本无，无需动作
  }
  const rule = intent.rule;
  if (!rule) return;
  if (!rule.id.startsWith(LOCAL_ID_PREFIX)) {
    // 已同步行：PUT 金额/启用（快照自包含，幂等）
    await patchRule(rule.id, { amount: rule.amount, enabled: rule.enabled });
    return;
  }
  // 本地行：POST upsert → 回填服务端真实 id
  const realId = await pushRule({
    goodsId: rule.goodsId,
    subGoodsId: rule.subGoodsId,
    productName: rule.productName,
    amount: rule.amount,
    enabled: rule.enabled
  });
  if (intent.identity === userIdentity) {
    const row = cache.find(
      x => ruleKey(x.goodsId, x.subGoodsId) === intent.key
    );
    if (row && row.id === rule.id) {
      row.id = realId;
      writeMirror();
    }
  }
}

/** 服务端对齐：flush 本地写 → GET 全量覆盖 cache+镜像（身份竞态守卫） */
async function hydrateFromServer(): Promise<void> {
  if (hydrateInFlight) return;
  hydrateInFlight = true;
  const scope = userIdentity;
  try {
    await runFlush();
    const serverRules = await fetchRules();
    if (scope !== userIdentity) return; // 期间已切换身份，丢弃过期结果
    cache = serverRules;
    writeMirror();
    lastError = null;
    lastSyncedAt = new Date().toISOString();
  } catch (e) {
    // 读对齐失败：镜像兜底继续可用；错误记录不刷屏（写失败才 notify）
    lastError = e instanceof Error ? e.message : String(e);
  } finally {
    hydrateInFlight = false;
  }
}

/** upsert：新增或覆盖（恢复系统金额请用 clearRule） */
export function setRule(input: SetRuleInput): PricingRule {
  const key = ruleKey(input.goodsId, input.subGoodsId);
  const existing = getRule(input.goodsId, input.subGoodsId);
  if (existing) {
    existing.productName = input.productName || existing.productName;
    existing.amount = input.amount;
    existing.enabled = true;
    existing.updatedAt = new Date().toISOString();
    writeMirror();
    enqueueIntent({ kind: "upsert", key, rule: { ...existing } });
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
  cache.push(rule);
  writeMirror();
  enqueueIntent({ kind: "upsert", key, rule: { ...rule } });
  return rule;
}

/** 恢复系统金额 = 删除规则（overrideAmount → null，统计回落 legacy） */
export function clearRule(goodsId: string, subGoodsId?: string): boolean {
  const key = ruleKey(goodsId, subGoodsId);
  const victim = cache.find(r => ruleKey(r.goodsId, r.subGoodsId) === key);
  if (!victim) return false;
  const serverId = victim.id.startsWith(LOCAL_ID_PREFIX)
    ? undefined
    : victim.id;
  cache = cache.filter(r => r !== victim);
  writeMirror();
  enqueueIntent({ kind: "delete", key, serverId });
  return true;
}

export function setEnabled(
  goodsId: string,
  subGoodsId: string | undefined,
  enabled: boolean
): void {
  const rule = getRule(goodsId, subGoodsId);
  if (!rule) return;
  rule.enabled = enabled;
  rule.updatedAt = new Date().toISOString();
  writeMirror();
  enqueueIntent({
    kind: "upsert",
    key: ruleKey(goodsId, subGoodsId),
    rule: { ...rule }
  });
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
