/**
 * 交稿记录解析器（needsDetail2.do HTML 内嵌 .draft-record 区块）
 *
 * [VERIFIED 2026-09-21 详情页取证] 旧系统详情页「交稿记录」弹层由服务端渲染：
 * <div class="draft-record"> … 每行 <div class='jiaogaojilu3'> 内含
 * 序号 / 时间（如 "Sep 19, 2026 9:34:14 AM"，JVM 英文 locale 格式）/ 定稿文件 /
 * 源文件 / 定稿凭证（downloadFile.do?recordid=&needsid=&type=0|1|2）/ 状态 /
 * 设计单号（TT_ 单号(版次)-时间戳-序列-P，逗号分隔多版）。
 * 多次交稿 = 多行，全部列出（重点需求：每次交稿时间完整呈现）。
 * 纯函数、无 DOM 依赖（vitest 可测）。
 */

/** 单次交稿记录 */
export interface DraftRecordRow {
  /** 序号（旧系统行号） */
  index: number | null;
  /** 原始时间文本（原样呈现，不丢失） */
  timeText: string;
  /** 归一化时间 yyyy-MM-dd HH:mm:ss（无法解析时为 null，仍展示 timeText） */
  isoTime: string | null;
  /** 审核状态（如"审核中"） */
  status: string;
  /** 设计单号（多版逗号分隔 → 数组） */
  designNos: string[];
  /** 三类文件记录（recordid；无该类文件为 null） */
  files: {
    final: string | null;
    source: string | null;
    proof: string | null;
  };
}

const MONTHS: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11
};

/** "Sep 19, 2026 9:34:14 AM" → "2026-09-19 09:34:14"；失败返回 null */
export function normalizeEnUsTime(text: string): string | null {
  const m = text.match(
    /^([A-Za-z]{3}) (\d{1,2}), (\d{4}) (\d{1,2}):(\d{2}):(\d{2}) ([AP]M)$/i
  );
  if (!m) return null;
  const month = MONTHS[m[1]];
  if (month === undefined) return null;
  let hour = Number(m[4]);
  const suffix = m[7].toUpperCase();
  if (suffix === "PM" && hour < 12) hour += 12;
  if (suffix === "AM" && hour === 12) hour = 0;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${m[3]}-${p(month + 1)}-${p(Number(m[2]))} ${p(hour)}:${m[5]}:${m[6]}`;
}

const EN_TIME = /([A-Za-z]{3} \d{1,2}, \d{4} \d{1,2}:\d{2}:\d{2} ?[AP]M)/;
const ISO_TIME = /(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/;
const FILE_LINK =
  /downloadFile\.do\?recordid=(\d+)&(?:amp;)?needsid=(\d+)&(?:amp;)?type=([012])/g;

function stripTags(chunk: string): string[] {
  return chunk
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, "|")
    .replace(/&nbsp;|&amp;/g, " ")
    .split("|")
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * 解析详情 HTML 中的交稿记录区块。
 * found=false = 页面无该区块（旧系统模板变更，需人工核查——显式透出，禁静默当空）。
 */
export function parseDraftRecords(html: string): {
  found: boolean;
  rows: DraftRecordRow[];
} {
  const start = html.indexOf('class="draft-record"');
  if (start === -1) return { found: false, rows: [] };
  let end = html.indexOf("<!--交稿记录end", start);
  if (end === -1) end = Math.min(start + 80_000, html.length);
  const seg = html.slice(start, end);

  const chunks = seg.split("<div class='jiaogaojilu3'>").slice(1);
  const rows: DraftRecordRow[] = [];
  for (const chunk of chunks) {
    const timeMatch = chunk.match(EN_TIME) ?? chunk.match(ISO_TIME);
    const timeText = (timeMatch?.[1] ?? "").trim();
    const isoTime =
      normalizeEnUsTime(timeText) ??
      (ISO_TIME.test(timeText) ? timeText : null);

    const files: DraftRecordRow["files"] = {
      final: null,
      source: null,
      proof: null
    };
    for (const m of chunk.matchAll(FILE_LINK)) {
      const kind = m[3] === "0" ? "final" : m[3] === "1" ? "source" : "proof";
      if (files[kind] === null) files[kind] = m[1];
    }

    const parts = stripTags(chunk);
    const status =
      parts.find(s =>
        [
          "审核中",
          "未审核",
          "审核通过",
          "审核不通过",
          "已通过",
          "已驳回"
        ].includes(s)
      ) ?? "";
    const designNoPart = parts
      .filter(s => s.includes("TT_") || s.includes("设计单号"))
      .sort((a, b) => b.length - a.length)[0];
    const designNos = designNoPart
      ? designNoPart
          .replace(/^设计单号[:：]?/, "")
          .split(",")
          .map(s => s.trim())
          .filter(Boolean)
      : [];

    rows.push({
      index: rows.length + 1,
      timeText,
      isoTime,
      status,
      designNos,
      files
    });
  }
  return { found: true, rows };
}
