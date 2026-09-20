/**
 * 品类领域服务 —— 商品目录 + 品类分组（docs/DESIGNER_WORKBENCH_SPEC.md §8）
 *
 * 商品目录来源：旧系统详情层 goodsFileParamList（goodsid/subGoodsid/goodsname/
 * subGoodsname/keywords [VERIFIED]）。Phase 1 Mock 目录先行（脱敏样本），
 * Real 通道 Phase 2 聚合接入。金额规则读写委托 pricingRuleStore。
 */
import catalogMock from "./mock/goods-catalog.json";
import { isLegacyRealEnabled } from "./gateway";
import { parseLegacyAmount } from "./pricing/amount-resolution";

/** 商品目录视图模型 */
export interface GoodsItem {
  goodsId: string;
  subGoodsId: string;
  /** 一级商品名（如"名片"） */
  goodsName: string;
  /** 子商品名（如"PVC名片"，与 goodsName 相同时为空） */
  subGoodsName: string;
  /** 展示名（subGoodsName 优先，供品类分布/规则列表） */
  displayName: string;
  /** 一级业务品类分组 */
  group: string;
  /** 搜索关键词（Phase 0 已验证的旧系统 keywords 字段） */
  keywords: string[];
  /** 系统金额（旧系统该商品档位设计费；null = 未定义） */
  legacyAmount: number | null;
}

/** Mock 目录映射（raw 为脱敏样本行） */
function mapGoods(raw: Record<string, unknown>): GoodsItem {
  const goodsName = String(raw.goodsname ?? "");
  const subGoodsName = String(raw.subGoodsname ?? "");
  return {
    goodsId: String(raw.goodsid ?? ""),
    subGoodsId: String(raw.subGoodsid ?? ""),
    goodsName,
    subGoodsName,
    displayName: subGoodsName || goodsName,
    group: String(raw.group ?? "其他"),
    keywords: String(raw.keywords ?? "")
      .split(/\s+/)
      .filter(Boolean),
    legacyAmount: parseLegacyAmount(raw.legacyAmount)
  };
}

/** 拉取商品目录（Phase 1 Mock；Real 通道 Phase 2 聚合详情层） */
export async function fetchGoodsCatalog(): Promise<GoodsItem[]> {
  void isLegacyRealEnabled;
  const raw = (catalogMock as { data: { list: Record<string, unknown>[] } })
    .data.list;
  return raw.map(mapGoods);
}

/** 按一级品类分组（保持目录顺序） */
export function groupByCategory(
  goods: GoodsItem[]
): Array<{ group: string; items: GoodsItem[] }> {
  const map = new Map<string, GoodsItem[]>();
  for (const g of goods) {
    const arr = map.get(g.group) ?? [];
    arr.push(g);
    map.set(g.group, arr);
  }
  return [...map.entries()].map(([group, items]) => ({ group, items }));
}

/**
 * 商品搜索（名称/goodsid/subGoodsid/keywords 命中，Phase 0 keywords 语义：
 * 搜"名片"命中 名片/明信片/名牌/铭牌/PVC名片 等）
 */
export function searchGoods(goods: GoodsItem[], query: string): GoodsItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return goods;
  return goods.filter(g =>
    [
      g.goodsName,
      g.subGoodsName,
      g.displayName,
      g.goodsId,
      g.subGoodsId,
      ...g.keywords
    ]
      .join(" ")
      .toLowerCase()
      .includes(q)
  );
}
