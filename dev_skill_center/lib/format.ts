import type { Session, SessionState } from "./types";

export const IST = "Asia/Kolkata";

export const fmtIST = (d: string | Date) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: IST,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(d));

export const fmtDate = (d: string | Date) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: IST,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(d));

export function timeAgo(d: string | Date) {
  const s = Math.round((new Date(d).getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const steps: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "second"],
    [3600, "minute"],
    [86400, "hour"],
    [604800, "day"],
  ];
  for (const [lim, unit] of steps)
    if (Math.abs(s) < lim) {
      const div = unit === "second" ? 1 : unit === "minute" ? 60 : unit === "hour" ? 3600 : 86400;
      return rtf.format(Math.round(s / div), unit);
    }
  return fmtDate(d);
}

export const fmtNum = (n: number) => n.toLocaleString("en-IN");

export const fmtPct = (n: number) => `${Math.round(n)} %`;

/** UI rule: show relative time, exact fmtIST() in a Tooltip on hover. */
export const tooltipTime = (d: string | Date) => `${fmtIST(d)} (IST)`;

/* aliases kept for existing imports */
export const formatDate = fmtIST;
export const formatDateOnly = fmtDate;
export const relativeTime = timeAgo;
export const toTooltip = tooltipTime;
export function formatTimeOnly(d: string | Date) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(d));
}

/** "09:30" (backend HH:MM string) -> "9:30 am". Never run through new Date(). */
export function fmtClock(hhmm: string) {
  const [hRaw, m] = hhmm.split(":");
  const h = Number(hRaw);
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = h % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

/** "09:30"-"11:30" -> "9:30 - 11:30 am" compact range for rails. */
export function fmtRange(start: string, end: string) {
  return `${fmtClock(start)} - ${fmtClock(end)}`;
}

/** Morning / afternoon / evening by IST hour. */
export function dayPart(d: string | Date = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat("en-IN", { timeZone: IST, hour: "numeric", hour12: false }).format(
      new Date(d),
    ),
  );
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

/** Today's date label in IST for the hero eyebrow. */
export function todayIST(d: string | Date = new Date()) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(d));
}


/** Derive the friendly session state from timestamps + claim (status stays "scheduled"). */
export function sessionState(s: Session, now: Date = new Date()): SessionState {
  const start = new Date(s.start_ts).getTime();
  const end = new Date(s.end_ts).getTime();
  const t = now.getTime();
  if (t < start) return "upcoming";
  if (t <= end) return "active";
  return s.claimed != null ? "closed" : "missed";
}

export const SESSION_STATE_LABEL: Record<SessionState, string> = {
  upcoming: "Upcoming",
  active: "Active",
  closed: "Closed",
  missed: "Missed",
};

/** "YYYY-MM-DD" (date-only string) -> "12 Oct". No timezone shifts. */
export function fmtShortDate(yyyyMmDd: string) {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  if (!y || !m || !d) return yyyyMmDd;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d} ${months[m - 1]}`;
}
