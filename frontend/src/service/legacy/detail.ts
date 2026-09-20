/**
 * Legacy Detail Adapter —— 旧系统订单详情接口的唯一入口
 *
 * 主键约定 [VERIFIED]：needsDetail2(needsid) 为主详情接口；
 * needsDetail(applyid) 为兼容入口，两者响应为同一 HTML 模板（99.97% 逐字节相同）
 * 只读纪律：仅 GET
 */
// P1A-08 启用时引入: import { http } from "@/utils/http";

/** P1A-08 实现：按 needsid 主键拉取详情（返回 551KB 级 HTML，内嵌转义 JSON） */
export async function fetchLegacyDetailByNeedsid(_needsid: string) {
  // P1A-08: GET /chsjs/child/needsDetail2.do → 平衡大括号扫描提取内嵌 JSON
  throw new Error("P1A-08 待实现");
}

/** P1A-08 实现：applyid 兼容入口（同模板） */
export async function fetchLegacyDetailByApplyid(_applyid: string) {
  // P1A-08: GET /chsjs/child/needsDetail.do
  throw new Error("P1A-08 待实现");
}
