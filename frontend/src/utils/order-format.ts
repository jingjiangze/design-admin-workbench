/**
 * 批量订单号复制格式（docs/BATCH_ORDER_OPERATION_SPEC.md §2.2）
 * 3 种规格格式 + 空格扩展，共 4 种分隔符；PII 禁止复制（本工具只处理订单号）
 */

export type CopyFormat = "newline" | "dunhao" | "comma" | "space";

export const COPY_FORMAT_LABEL: Record<CopyFormat, string> = {
  newline: "逐行",
  dunhao: "顿号",
  comma: "逗号",
  space: "空格"
};

const SEPARATOR: Record<CopyFormat, string> = {
  newline: "\n",
  dunhao: "、",
  comma: ",",
  space: " "
};

/** 将订单号数组格式化为指定分隔符文本（去空、去重、保序） */
export function formatOrderNos(
  orderNos: string[],
  format: CopyFormat = "newline"
): string {
  const cleaned = [...new Set(orderNos.map(n => n.trim()).filter(Boolean))];
  return cleaned.join(SEPARATOR[format]);
}
