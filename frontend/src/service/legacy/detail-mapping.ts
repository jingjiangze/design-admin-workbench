/**
 * Detail 映射纯函数与 Legacy 类型 —— 无 IO 依赖（可单测）
 * 提取器为 Phase 0 extract_detail_json.cjs 的 TS 移植
 */
import type { LegacyDetailContainer } from "./types";
import type {
  OrderDetail,
  DesignEdition,
  FileConstraintView
} from "../order-detail-types";

/** 详情容器（17 顶层字段，实测键名）——从 types re-export 便于单文件消费 */
export type {
  LegacyDetailContainer,
  LegacyProduct,
  LegacyFileConstraint
} from "./types";

/**
 * 提取详情 HTML 中的内嵌转义 JSON。
 * 定位 `{&#034;applyid&#034;` 起始 → HTML 反转义 → 平衡大括号扫描（处理字符串内转义）。
 */
export function extractEmbeddedDetailJson(html: string): unknown {
  const start = html.indexOf("{&#034;applyid&#034;");
  if (start < 0) return null;
  const raw = html
    .slice(start, start + 250_000)
    .replace(/&#034;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
  let depth = 0;
  let end = -1;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (c === "\\") {
      esc = true;
      continue;
    }
    if (c === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (c === "{") depth++;
    if (c === "}") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end < 0) return null;
  try {
    return JSON.parse(raw.slice(0, end));
  } catch {
    return null;
  }
}

/** 通用掩码：保留前 keep 头后 keep 尾（不足 2*keep 位全掩码） */
function mask(value: unknown, keep = 2): string {
  const s = String(value ?? "").trim();
  if (!s) return "";
  if (s.length <= keep * 2) return "*".repeat(s.length);
  return s.slice(0, keep) + "*".repeat(s.length - keep * 2) + s.slice(-keep);
}

function mapProduct(p: Record<string, unknown>, index: number): DesignEdition {
  return {
    editionIndex: index + 1,
    designNo: String(p.designNo ?? ""),
    productName: String(p.spmc ?? ""),
    spec: String(p.def1Name ?? ""),
    width: Number(p.chang ?? 0),
    height: Number(p.wide ?? 0),
    attrs: String(p.attrs ?? ""),
    material: String(p.sizeName ?? p.def8 ?? ""),
    quantity: Number(p.spsl ?? 0),
    unit: String(p.danwei ?? ""),
    amount: Number(p.je ?? 0)
  };
}

function mapFileConstraint(c: Record<string, unknown>): FileConstraintView {
  return {
    acceptedSuffixes: String(c.checkFileSuffix ?? "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean),
    similarCheck: Number(c.checkSimilar ?? 0) === 1,
    editionCount: Number(c.edition ?? 0),
    goodsId: String(c.goodsid ?? ""),
    goodsName: String(c.goodsname ?? ""),
    subGoodsId: String(c.subGoodsid ?? ""),
    subGoodsName: String(c.subGoodsname ?? ""),
    keywords: String(c.keywords ?? "")
      .split(/[，,]/)
      .map(s => s.trim())
      .filter(Boolean)
  };
}

/**
 * 详情容器 → OrderDetail 七区块（38 字段禁直出原则在详情层的对应实现）。
 * erpOrderJson 二次解析；ordrtyp→shop 改名与 PII 脱敏只发生在本函数。
 */
export function mapLegacyDetail(raw: LegacyDetailContainer): OrderDetail {
  let erp: Record<string, unknown> | null = null;
  try {
    if (raw.erpOrderJson) erp = JSON.parse(raw.erpOrderJson);
  } catch {
    erp = null;
  }
  return {
    identity: {
      needsid: String(raw.needsid ?? ""),
      applyid: String(raw.applyid ?? ""),
      ordernum: String(raw.ordernum ?? "")
    },
    preview: {
      smallUrl: String(raw.s3url ?? ""),
      largeUrl: String(raw.s3Largeurl ?? "")
    },
    flags: {
      isBeol: Boolean(raw.isbeol),
      spotColor: Boolean(raw.spotColor),
      isModel: Number(raw.isModel ?? 0) === 1,
      isOnlyDesign: Boolean(raw.isOnlyDesignOfOrder),
      multipleUpload: Boolean(raw.isMultipleUpload),
      packageUpload: Boolean(raw.isPackgeUpload),
      connectShow: Boolean(raw.isConnectShow)
    },
    editions: Array.isArray(raw.products) ? raw.products.map(mapProduct) : [],
    fileConstraints: Array.isArray(raw.goodsFileParamList)
      ? raw.goodsFileParamList.map(mapFileConstraint)
      : [],
    erpSnapshot: erp
      ? {
          erpOrderId: String(erp.orderid ?? ""),
          shop: String(erp.ordrtyp ?? ""),
          orderState: Number(erp.orderState ?? 0),
          erpCreateTime: String(erp.creattime ?? ""),
          groupCount: Number(erp.num ?? 0),
          sales: String(erp.sales ?? ""),
          customerNote: String(erp.notes ?? ""),
          serviceTrace: String(erp.bz ?? "")
        }
      : null,
    pii: erp
      ? {
          telMasked: mask(erp.tel, 3),
          emailMasked: mask(erp.email, 2),
          companyMasked: mask(erp.company, 2),
          qqMasked: mask(erp.qq, 2),
          buyerOpenUidMasked: mask(erp.buyer_open_uid, 4)
        }
      : null
  };
}
