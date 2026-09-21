/**
 * pricing-sync —— P1-05 金额规则 D1 同步层契约测试
 *
 * 覆盖：hydrate 服务端覆盖 / 写意图队列（upsert PUT DELETE 路由）/
 * id 回填 / 失败保留重试 / last-write-wins 去重 / 身份竞态守卫。
 * 传输层注入内存实现；既有 localStorage 语义测试在 pricing-rule.test.ts
 * （三态矩阵与导入导出保留不变）。
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  setUserIdentity,
  resetStorage,
  injectStorage,
  listRules,
  getRule,
  setRule,
  clearRule,
  setEnabled,
  getSyncStatus,
  onSyncError
} from "@/service/pricing/pricing-rule-store";
import {
  injectPricingHttp,
  type PricingHttpCall
} from "@/service/pricing/pricing-api";
import type { PricingRule } from "@/service/pricing/pricing-rule-types";

interface RuleStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface RecordedCall {
  method: string;
  url: string;
  body?: unknown;
}

function memStorage(): { storage: RuleStorageLike; map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    storage: {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v)
    }
  };
}

function serverRow(overrides: Partial<PricingRule> = {}): PricingRule {
  return {
    id: "srv-uuid-1",
    goodsId: "548890581",
    subGoodsId: undefined,
    productName: "名片",
    amount: 12,
    enabled: true,
    source: "user",
    updatedAt: "2026-09-21T08:00:00.000Z",
    ...overrides
  };
}

function makeFakeHttp(options?: {
  serverRules?: PricingRule[];
  failOn?: (call: RecordedCall) => boolean;
  gatePost?: () => Promise<void>;
}) {
  const calls: RecordedCall[] = [];
  const postIds: string[] = [];
  let idSeq = 0;
  const impl: PricingHttpCall = async (method, url, body) => {
    const record: RecordedCall = { method, url, body };
    calls.push(record);
    if (options?.failOn?.(record)) {
      throw new Error("模拟网络故障");
    }
    if (options?.gatePost && method === "post") {
      await options.gatePost();
    }
    if (method === "get" && url === "/api/pricing/rules") {
      return { result: true, data: { list: options?.serverRules ?? [] } };
    }
    if (method === "post" && url === "/api/pricing/rules") {
      const id = `srv-${++idSeq}`;
      postIds.push(id);
      return { result: true, data: { id, upserted: true } };
    }
    return { result: true, data: {} };
  };
  return { calls, postIds, impl };
}

/** settle：数个宏任务，让 flush/hydrate 微任务链收敛 */
async function settle(rounds = 3): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

describe("pricing-sync：hydrate 服务端对齐", () => {
  beforeEach(() => {
    resetStorage();
    injectStorage(memStorage().storage);
  });

  it("登录身份设置后，服务端规则整体覆盖本地 cache", async () => {
    injectPricingHttp(
      makeFakeHttp({
        serverRules: [
          serverRow(),
          serverRow({
            id: "srv-uuid-2",
            goodsId: "1717812924",
            productName: "PVC名片",
            amount: 3.5
          })
        ]
      }).impl
    );
    setUserIdentity("alice");
    await settle();
    const rules = listRules();
    expect(rules).toHaveLength(2);
    expect(rules.map(r => r.goodsId).sort()).toEqual([
      "1717812924",
      "548890581"
    ]);
    expect(getSyncStatus().pendingCount).toBe(0);
    expect(getSyncStatus().lastSyncedAt).not.toBeNull();
  });

  it("hydrate/flush 失败：镜像兜底可读，pending 保留 + lastError 记录", async () => {
    injectPricingHttp(makeFakeHttp({ failOn: () => true }).impl);
    const { storage } = memStorage();
    injectStorage(storage);
    setUserIdentity("alice");
    await settle();

    setRule({ goodsId: "548890581", productName: "名片", amount: 12 });
    await settle();
    expect(getSyncStatus().pendingCount).toBe(1);
    expect(getSyncStatus().lastError).toBe("模拟网络故障");
    // 读仍可用（cache/mirror 兜底）
    expect(listRules()).toHaveLength(1);
    expect(storage.getItem("pricingRules:alice")).toContain("548890581");
  });
});

describe("pricing-sync：写意图路由", () => {
  beforeEach(() => {
    resetStorage();
    injectStorage(memStorage().storage);
  });

  it("本地新规则 → POST upsert，服务端真实 id 回填 cache", async () => {
    const fake = makeFakeHttp();
    injectPricingHttp(fake.impl);
    setUserIdentity("alice");
    await settle();

    setRule({ goodsId: "548890581", productName: "名片", amount: 35 });
    await settle();

    const post = fake.calls.find(c => c.method === "post");
    expect(post).toBeDefined();
    expect(post!.body).toEqual({
      goodsId: "548890581",
      subGoodsId: null,
      productName: "名片",
      amount: 35,
      enabled: true
    });
    const row = getRule("548890581");
    expect(row?.id).toBe("srv-1"); // 本地 rule_ id 已被服务端 id 替换
    expect(getSyncStatus().pendingCount).toBe(0);
  });

  it("已同步规则改金额 → PUT 快照（amount+enabled）", async () => {
    const fake = makeFakeHttp();
    injectPricingHttp(fake.impl);
    setUserIdentity("alice");
    await settle();
    setRule({ goodsId: "548890581", productName: "名片", amount: 35 });
    await settle();
    const before = fake.calls.length;

    setRule({ goodsId: "548890581", productName: "名片", amount: 36 });
    await settle();
    const put = fake.calls.slice(before).find(c => c.method === "put");
    expect(put).toBeDefined();
    expect(put!.url).toContain(`/api/pricing/rules/${fake.postIds[0]}`);
    expect(put!.body).toEqual({ amount: 36, enabled: true });
  });

  it("setEnabled → PUT enabled", async () => {
    const fake = makeFakeHttp();
    injectPricingHttp(fake.impl);
    setUserIdentity("alice");
    await settle();
    setRule({ goodsId: "548890581", productName: "名片", amount: 35 });
    await settle();
    const before = fake.calls.length;

    setEnabled("548890581", undefined, false);
    await settle();
    const put = fake.calls.slice(before).find(c => c.method === "put");
    expect(put).toBeDefined();
    expect(put!.body).toEqual({ amount: 35, enabled: false });
  });

  it("已同步规则 clearRule → DELETE /:id；本地行 clearRule 零服务端调用", async () => {
    const fake = makeFakeHttp();
    injectPricingHttp(fake.impl);
    setUserIdentity("alice");
    await settle();
    setRule({ goodsId: "548890581", productName: "名片", amount: 35 });
    await settle(); // 已同步（id=srv-1）
    setRule({ goodsId: "1717812924", productName: "PVC名片", amount: 3.5 });
    const localRow = getRule("1717812924")!;
    expect(localRow.id).toMatch(/^rule_/); // 尚未 flush

    const before = fake.calls.length;
    clearRule("1717812924"); // 本地行删除：服务端无此行，无需调用
    clearRule("548890581"); // 已同步行删除：DELETE
    await settle();

    const deletes = fake.calls.slice(before).filter(c => c.method === "delete");
    expect(deletes).toHaveLength(1);
    expect(deletes[0].url).toBe(`/api/pricing/rules/${fake.postIds[0]}`);
    expect(listRules()).toHaveLength(0);
  });

  it("flush 失败：意图保留 + onSyncError 透出，下次写触发重试", async () => {
    let fail = true;
    const fake = makeFakeHttp({ failOn: () => fail });
    injectPricingHttp(fake.impl);
    setUserIdentity("alice");
    await settle();

    const errors: string[] = [];
    onSyncError(msg => errors.push(msg));

    setRule({ goodsId: "548890581", productName: "名片", amount: 35 });
    await settle();
    expect(getSyncStatus().pendingCount).toBe(1);
    expect(errors).toContain("模拟网络故障");

    fail = false; // 恢复 → 下一次写把挂起意图一并冲掉
    setRule({ goodsId: "1717812924", productName: "PVC名片", amount: 3.5 });
    await settle();
    expect(getSyncStatus().pendingCount).toBe(0);
    expect(listRules()).toHaveLength(2);
    const posts = fake.calls.filter(c => c.method === "post");
    // 3 = G1 首次失败尝试 + G1 重试成功 + G2 成功
    expect(posts).toHaveLength(3);
  });

  it("同 key 连续写：last-write-wins，只 flush 最终状态一次", async () => {
    const fake = makeFakeHttp();
    injectPricingHttp(fake.impl);
    setUserIdentity("alice");
    await settle();

    setRule({ goodsId: "548890581", productName: "名片", amount: 35 });
    setRule({ goodsId: "548890581", productName: "名片", amount: 36 });
    await settle();

    const posts = fake.calls.filter(c => c.method === "post");
    expect(posts).toHaveLength(1);
    expect((posts[0].body as { amount: number }).amount).toBe(36);
    expect(getRule("548890581")?.amount).toBe(36);
    expect(getSyncStatus().pendingCount).toBe(0);
  });

  it("删除后立刻重写同 key：删除意图被覆盖为 upsert", async () => {
    const fake = makeFakeHttp();
    injectPricingHttp(fake.impl);
    setUserIdentity("alice");
    await settle();

    setRule({ goodsId: "548890581", productName: "名片", amount: 35 });
    await settle();
    clearRule("548890581");
    setRule({ goodsId: "548890581", productName: "名片", amount: 40 });
    await settle();

    const deletes = fake.calls.filter(c => c.method === "delete");
    expect(deletes).toHaveLength(0); // 删除意图被 upsert 覆盖，未执行
    const posts = fake.calls.filter(c => c.method === "post");
    expect(posts).toHaveLength(2); // 初次建档 + 恢复后再建档
    expect((posts[1].body as { amount: number }).amount).toBe(40);
  });
});

describe("pricing-sync：身份隔离", () => {
  beforeEach(() => {
    resetStorage();
    injectStorage(memStorage().storage);
  });

  it("不同身份 hydrate 到各自服务端数据", async () => {
    const aliceRules = [serverRow({ id: "srv-a1", amount: 35 })];
    const bobRules = [serverRow({ id: "srv-b1", amount: 50 })];
    let currentUser: "alice" | "bob" = "alice";
    const base = makeFakeHttp();
    const dynamic: PricingHttpCall = async (method, url, body) => {
      if (method === "get" && url === "/api/pricing/rules") {
        return {
          result: true,
          data: { list: currentUser === "alice" ? aliceRules : bobRules }
        };
      }
      return base.impl(method, url, body);
    };
    injectPricingHttp(dynamic);

    currentUser = "alice";
    setUserIdentity("alice");
    await settle();
    expect(listRules().map(r => r.amount)).toEqual([35]);

    currentUser = "bob";
    setUserIdentity("bob");
    await settle();
    expect(listRules().map(r => r.amount)).toEqual([50]);
  });

  it("身份切换期间挂起的 upsert 不污染新身份的 cache", async () => {
    let releasePost: (() => void) | null = null;
    const gate = new Promise<void>(resolve => {
      releasePost = resolve;
    });
    const fake = makeFakeHttp({ gatePost: () => gate }); // POST 挂起
    injectPricingHttp(fake.impl);

    setUserIdentity("alice");
    await settle();
    setRule({ goodsId: "548890581", productName: "名片", amount: 35 });
    // flush 卡在 POST；此时切换身份
    setUserIdentity("bob");
    await settle();
    expect(listRules()).toHaveLength(0); // bob 的空服务端数据，未被 alice 污染

    releasePost!();
    await settle();
    // alice 的 upsert 完成，但 id 回填守卫（intent.identity !== 当前身份）生效
    expect(listRules()).toHaveLength(0);
  });
});
