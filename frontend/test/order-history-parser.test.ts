/**
 * 交稿记录解析器契约测试（ORDER-HISTORY-AUDIT §八/§九/§十/§十一/§二十七）
 * 覆盖：12AM/12PM 边界、全部 12 个月、HTML 实体、多设计单号（中英文逗号）、
 * 复合 class / 引号形态、多次交稿行、空行/缺区块语义。
 */
import { describe, expect, it } from "vitest";
import {
  normalizeEnUsTime,
  parseDraftRecords
} from "../src/service/legacy/draft-record";

describe("normalizeEnUsTime", () => {
  it("基础样本（已 VERIFIED 真实数据）", () => {
    expect(normalizeEnUsTime("Sep 19, 2026 9:34:14 AM")).toBe(
      "2026-09-19 09:34:14"
    );
  });

  it("12AM → 00 / 12PM → 12", () => {
    expect(normalizeEnUsTime("Jan 1, 2026 12:00:00 AM")).toBe(
      "2026-01-01 00:00:00"
    );
    expect(normalizeEnUsTime("Jan 1, 2026 12:30:00 PM")).toBe(
      "2026-01-01 12:30:00"
    );
  });

  it("1AM / 1PM / 11:59 PM", () => {
    expect(normalizeEnUsTime("Feb 2, 2026 1:00:00 AM")).toBe(
      "2026-02-02 01:00:00"
    );
    expect(normalizeEnUsTime("Feb 2, 2026 1:15:00 PM")).toBe(
      "2026-02-02 13:15:00"
    );
    expect(normalizeEnUsTime("Mar 3, 2026 11:59:59 PM")).toBe(
      "2026-03-03 23:59:59"
    );
  });

  it("全部 12 个月归一化", () => {
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec"
    ];
    months.forEach((mo, i) => {
      const r = normalizeEnUsTime(`${mo} 15, 2026 10:00:00 AM`);
      expect(r?.slice(5, 7)).toBe(String(i + 1).padStart(2, "0"));
    });
  });

  it("非法输入返回 null（timeText 原样保留由调用方兜底）", () => {
    expect(normalizeEnUsTime("")).toBeNull();
    expect(normalizeEnUsTime("not a time")).toBeNull();
    expect(normalizeEnUsTime("Xyz 99, 2026 9:00:00 AM")).toBeNull();
  });
});

function row(
  time: string,
  types: Array<[string, string]> = [["0", "111"]],
  designNos = "TT_A"
) {
  const links = types
    .map(
      ([t, rid]) =>
        `<a href="/chsjs/child/downloadFile.do?recordid=${rid}&amp;needsid=1&type=${t}">f</a>`
    )
    .join("");
  return `<div class='jiaogaojilu3'><td>1</td><td>${time}</td>${links}<span>审核中</span><td>${designNos}</td></div>`;
}

describe("parseDraftRecords", () => {
  it("found=false：无区块（no-block 语义，非 error）", () => {
    expect(parseDraftRecords("<html>empty</html>")).toEqual({
      found: false,
      rows: []
    });
  });

  it("单次交稿：时间/状态/文件三态/设计单号", () => {
    const html = `<div class="draft-record">${row("Sep 19, 2026 9:34:14 AM", [
      ["0", "111"],
      ["1", "222"],
      ["2", "333"]
    ])}<!--交稿记录end-->`;
    const { found, rows } = parseDraftRecords(html);
    expect(found).toBe(true);
    expect(rows).toHaveLength(1);
    expect(rows[0].isoTime).toBe("2026-09-19 09:34:14");
    expect(rows[0].timeText).toBe("Sep 19, 2026 9:34:14 AM");
    expect(rows[0].status).toBe("审核中");
    expect(rows[0].files).toEqual({
      final: "111",
      source: "222",
      proof: "333"
    });
    expect(rows[0].designNos).toEqual(["TT_A"]);
  });

  it("多次交稿 = 多行全部列出", () => {
    const html = `<div class="draft-record">${row("Sep 1, 2026 1:00:00 PM")}${row(
      "Sep 2, 2026 2:00:00 PM"
    )}${row("Sep 3, 2026 3:00:00 PM")}<!--交稿记录end-->`;
    const { rows } = parseDraftRecords(html);
    expect(rows).toHaveLength(3);
    expect(rows.map(r => r.isoTime)).toEqual([
      "2026-09-01 13:00:00",
      "2026-09-02 14:00:00",
      "2026-09-03 15:00:00"
    ]);
  });

  it("HTML 实体：&amp; 与 & 等价，recordid/needsid/type 不受影响", () => {
    const html = `<div class="draft-record"><div class='jiaogaojilu3'>Sep 1, 2026 1:00:00 PM
      <a href="/chsjs/child/downloadFile.do?recordid=42&amp;needsid=7&amp;type=0">a</a>
      <a href="/chsjs/child/downloadFile.do?recordid=43&needsid=7&type=1">b</a>
    </div><!--交稿记录end-->`;
    const { rows } = parseDraftRecords(html);
    expect(rows[0].files.final).toBe("42");
    expect(rows[0].files.source).toBe("43");
  });

  it("区块定位容错：复合 class / 单引号", () => {
    const base = `Sep 1, 2026 1:00:00 PM<div class='jiaogaojilu3'>Sep 1, 2026 1:00:00 PM</div>`;
    for (const cls of [
      `class="draft-record"`,
      `class='draft-record'`,
      `class="foo draft-record"`,
      `class="draft-record foo"`
    ]) {
      const html = `<div ${cls}>${base}</div>`;
      const { found, rows } = parseDraftRecords(html);
      expect(found, cls).toBe(true);
      expect(rows, cls).toHaveLength(1);
    }
  });

  it("行切块容错：双引号 / 额外属性 / 空白", () => {
    const html = `<div class="draft-record">
      <div class="jiaogaojilu3" data-x="1">Sep 1, 2026 1:00:00 PM 审核中</div>
      <div  class ='jiaogaojilu3' >Sep 2, 2026 2:00:00 PM 审核中</div>
    </div><!--交稿记录end-->`;
    const { rows } = parseDraftRecords(html);
    expect(rows).toHaveLength(2);
  });

  it("设计单号：多版不丢 + 中英文逗号混排 + 逗号后空格", () => {
    const html = `<div class="draft-record"><div class='jiaogaojilu3'>Sep 1, 2026 1:00:00 PM 审核中 TT_260908007929(多版作品共5版第一版)-26-09-19-093227-8270-P,TT_260908007929(多版作品共5版第二版)-26-09-19-093227-8270-P， TT_260908007929(多版作品共5版第三版)-26-09-19-093227-8270-P</div><!--交稿记录end-->`;
    const { rows } = parseDraftRecords(html);
    expect(rows[0].designNos).toHaveLength(3);
    expect(rows[0].designNos[0]).toContain("第一版");
    expect(rows[0].designNos[2]).toContain("第三版");
  });

  it("区块存在但 0 行（情况 C：暂无交稿记录）", () => {
    const html = `<div class="draft-record"><table></table></div><!--交稿记录end-->`;
    const { found, rows } = parseDraftRecords(html);
    expect(found).toBe(true);
    expect(rows).toHaveLength(0);
  });

  it("无法归一化时间：timeText 原样保留不丢失", () => {
    const html = `<div class="draft-record"><div class='jiaogaojilu3'>Xyz 19, 2026 9:34:14 AM 审核中</div><!--交稿记录end-->`;
    const { rows } = parseDraftRecords(html);
    expect(rows[0].isoTime).toBeNull();
    expect(rows[0].timeText).toBe("Xyz 19, 2026 9:34:14 AM");
  });

  it("无任何时间模式：timeText 为空串（由上层显示 '—'）", () => {
    const html = `<div class="draft-record"><div class='jiaogaojilu3'>某未知时间格式 审核中</div><!--交稿记录end-->`;
    const { rows } = parseDraftRecords(html);
    expect(rows[0].isoTime).toBeNull();
    expect(rows[0].timeText).toBe("");
  });
});
