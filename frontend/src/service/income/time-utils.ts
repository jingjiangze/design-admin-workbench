/**
 * 收入域时间工具（周 = 周一至周日，中国工作习惯）
 * 自 income-service-core 迁移（订单口径聚合层退役，工具保留供今日/本周过滤与首页复用）
 */

/** 今日键（本地时区 yyyy-MM-dd） */
export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayKey(): string {
  return dateKey(new Date());
}

/** 周一 00:00 */
export function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - diff);
}

/** 今日区间（本地时区 00:00:00.000 – 23:59:59.999） */
export function todayRange(): { from: Date; to: Date } {
  const now = new Date();
  return {
    from: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    to: new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999
    )
  };
}

/** 本周区间（周一 00:00 – 周日 23:59:59.999） */
export function weekRange(): { from: Date; to: Date } {
  const now = new Date();
  return {
    from: startOfWeek(now),
    to: new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999
    )
  };
}

/** 本月区间 + 月份键（yyyy-MM，供 /api/income/* queryTime） */
export function monthRange(): { from: Date; to: Date; monthKey: string } {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1),
    to: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
    monthKey
  };
}
