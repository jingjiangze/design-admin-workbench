/**
 * Legacy Detail Adapter —— 旧系统订单详情接口的唯一入口
 *
 * 主键约定 [VERIFIED]：needsDetail2(needsid) 为主详情接口（myOrder/催单/消息入口统一引用）；
 * needsDetail(applyid) 为兼容入口，两接口响应为同一 HTML 模板（99.97% 逐字节相同）
 * 数据形态：551KB 级 HTML，内嵌 HTML 转义 JSON（&#034; 等），平衡大括号扫描提取
 * 只读纪律：仅 GET
 */

import { http } from "@/utils/http";

/** 详情容器（17 顶层字段，实测键名） */
export interface LegacyDetailContainer {
  applyid: string;
  needsid: string;
  ordernum: string;
  /** ERP 原始推单对象（二次嵌套 JSON 字符串，含语义错位 ordrtyp 与 PII） */
  erpOrderJson: string;
  /** 多版设计产品行（与 erp.Products 同构） */
  products: LegacyProduct[];
  goodsFileParamList: LegacyFileConstraint[];
  decidingPapersFile: Record<string, unknown>;
  s3url: string;
  s3Largeurl: string;
  isbeol: boolean;
  isModel: number;
  isMultipleUpload: boolean;
  isPackgeUpload: boolean;
  isPackgeUploadShow: boolean;
  isOnlyDesignOfOrder: boolean;
  isConnectShow: boolean;
  spotColor: boolean;
  [key: string]: unknown;
}

/** 版次产品行（ERP Products，27 字段核心子集） */
export interface LegacyProduct {
  spmc: string;
  designNo: string;
  def1Name: string;
  chang: number;
  wide: number;
  attrs: string;
  def8: string;
  sizeName: string;
  guige: string;
  spsl: number;
  danwei: string;
  je: number;
  outer_sku_id: string;
  [key: string]: unknown;
}

/** 文件上传约束（goodsFileParamList 元素） */
export interface LegacyFileConstraint {
  checkFileSuffix: string;
  checkSimilar: number;
  edition: number;
  editionFileParamList: Array<Record<string, unknown>>;
  goodsid: string;
  goodsname: string;
  subGoodsid: string;
  subGoodsname: string;
  keywords: string;
  sizeName: string;
  detailId: string;
  [key: string]: unknown;
}

/**
 * 提取详情 HTML 中的内嵌转义 JSON（Phase 0 extract_detail_json.cjs 的 TS 移植）。
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

/** GET 详情 HTML 并提取内嵌 JSON（两个详情接口共用此管道） */
async function fetchDetailHtml(
  url: string
): Promise<LegacyDetailContainer | null> {
  const html = await http.request<string>("get", url, {
    responseType: "text",
    headers: { Accept: "text/html, */*; q=0.01" },
    timeout: 30000
  });
  return extractEmbeddedDetailJson(
    String(html)
  ) as LegacyDetailContainer | null;
}

/** 按 needsid 主键拉取详情并解析（[VERIFIED] 主详情键：myOrder/催单/消息入口统一引用） */
export async function fetchLegacyDetailByNeedsid(
  needsid: string
): Promise<LegacyDetailContainer | null> {
  return fetchDetailHtml(
    `/chsjs/child/needsDetail2.do?needsid=${encodeURIComponent(needsid)}`
  );
}

/** applyid 兼容入口（同模板，99.97% 逐字节相同 [VERIFIED]） */
export async function fetchLegacyDetailByApplyid(
  applyid: string
): Promise<LegacyDetailContainer | null> {
  return fetchDetailHtml(
    `/chsjs/child/needsDetail.do?applyid=${encodeURIComponent(applyid)}`
  );
}
