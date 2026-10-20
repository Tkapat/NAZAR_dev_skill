/**
 * Date-string-only helpers for calendar views.
 * "YYYY-MM-DD" strings are NEVER run through new Date() for display (local TZ
 * shifts the day). Date arithmetic below uses UTC construction only, which is
 * timezone-independent. Timestamps (ISO / epoch) go through lib/format.
 */

const IST = "Asia/Kolkata";

export const pad = (n: number) => String(n).padStart(2, "0");

export function ymd(y: number, m: number, d: number) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Today's calendar date in Asia/Kolkata as YYYY-MM-DD. */
export function todayIST(): string {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function isYmd(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function parseYmd(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
}

/** First and last day of a month (m is 1-12) as YYYY-MM-DD strings. */
export function monthRange(y: number, m: number): { from: string; to: string } {
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); // day 0 of next month = last of m
  return { from: ymd(y, m, 1), to: ymd(y, m, last) };
}

/** ISO day of week: 1 = Monday … 7 = Sunday. */
export function isoDow(dateStr: string): number {
  const { y, m, d } = parseYmd(dateStr);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return dow === 0 ? 7 : dow;
}

/** 6 weeks × 7 days of date strings, Mon-Sun; "" for padding cells. */
export function monthGrid(y: number, m: number): string[][] {
  const { from } = monthRange(y, m);
  const lead = isoDow(from) - 1;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: string[] = [];
  for (let i = 0; i < lead; i++) cells.push("");
  for (let d = 1; d <= last; d++) cells.push(ymd(y, m, d));
  while (cells.length % 7 !== 0) cells.push("");
  const rows: string[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

/** Quartile 0..4 by value/max; 0 = no data. */
export function heatLevel(value: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (!max || value <= 0) return 0;
  const r = value / max;
  if (r <= 0.25) return 1;
  if (r <= 0.5) return 2;
  if (r <= 0.75) return 3;
  return 4;
}

const HEAT_ALPHA = ["0%", "6%", "12%", "20%", "32%"];

/** Tinted background for a heat level, through the primary CSS var only. */
export function heatBg(level: 0 | 1 | 2 | 3 | 4): string | undefined {
  if (!level) return undefined;
  return `color-mix(in oklab, var(--primary) ${HEAT_ALPHA[level]}, transparent)`;
}

/** "Friday, 10 October 2026" from a date string (no TZ conversion). */
export function fmtDayLong(dateStr: string): string {
  const { y, m, d } = parseYmd(dateStr);
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** "October 2026" from year + 1-based month. */
export function monthLabel(y: number, m: number): string {
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, 1))
  );
}

export function shiftMonth(y: number, m: number, delta: number): { y: number; m: number } {
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 };
}

export function shiftDay(dateStr: string, delta: number): string {
  const { y, m, d } = parseYmd(dateStr);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}
