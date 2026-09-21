/**
 * Workflow Gateway 客户端（/api/workflow/* —— 业务反馈 + 个人防漏单标记）
 *
 * WORKFLOW-V2：绿点（localProcessedAt）由 Worker 在旧系统动作成功后写入，
 * 本客户端只是传输层；门禁逻辑（legacy 成功 → 才写标记）在 Worker 侧强制。
 */
import { http } from "@/utils/http";

export interface GatewayMarker {
  itemType: string;
  itemKey: string;
  processedAt: string;
}

export interface GatewayTakeoverResult {
  orderId: string;
  applyId: string;
  ok: boolean;
  message: string;
  processedAt?: string;
}

/** 当前用户全部标记（?type= 可选过滤） */
export async function fetchGatewayMarkers(itemType?: string): Promise<{
  result: boolean;
  data?: { list: GatewayMarker[] };
}> {
  const query = itemType ? `?type=${encodeURIComponent(itemType)}` : "";
  return http.request("get", `/api/workflow/markers${query}`, {
    timeout: 15000
  });
}

/** 写本地"我已处理"标记（幂等；已存在保留首次 processedAt） */
export async function putGatewayMarkers(
  items: Array<{ itemType: string; itemKey: string }>
): Promise<{
  result: boolean;
  data?: { marked: number; processedAt: string };
}> {
  return http.request("post", "/api/workflow/markers", {
    data: { items },
    timeout: 15000
  });
}

/** 取消已处理标记（第一版无 UI 入口） */
export async function deleteGatewayMarkers(
  items: Array<{ itemType: string; itemKey: string }>
): Promise<{
  result: boolean;
  data?: { removed: number };
}> {
  return http.request("delete", "/api/workflow/markers", {
    data: { items },
    timeout: 15000
  });
}

/** 一键接单（旧系统 batchTakeover staging 网关；成功项 Worker 已写标记） */
export async function takeoverGateway(
  targets: Array<{ applyId: string; orderId: string }>
): Promise<{
  result: boolean;
  data?: { results: GatewayTakeoverResult[] };
}> {
  return http.request("post", "/api/workflow/takeover", {
    data: { targets },
    timeout: 30000
  });
}
