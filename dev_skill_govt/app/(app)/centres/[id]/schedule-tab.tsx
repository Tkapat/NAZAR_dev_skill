"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Ban, CalendarOff, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDate, fmtDuration, formatTimeOnly } from "@/lib/format";
import { isoDow, shiftDay, todayIST } from "@/lib/calendar";
import { sessionDisplayStatus } from "@/lib/constants";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { SessionStatusChip } from "@/components/shared/StatusChip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Batch, CentreSchedule, Session } from "@/types";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DOW_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const GRID_START = 6;
const GRID_END = 20;
const HOUR_PX = 22;

function istHourMin(iso: string): { h: number; m: number } {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
  }).formatToParts(new Date(iso));
  const h = Number(p.find((x) => x.type === "hour")?.value ?? 0);
  const m = Number(p.find((x) => x.type === "minute")?.value ?? 0);
  return { h: h === 24 ? 0 : h, m };
}

function CoverageBar({ pct }: { pct: number | null | undefined }) {
  if (pct == null) return <span className="text-xs text-muted-foreground">—</span>;
  const tone = pct >= 90 ? "bg-success" : pct >= 60 ? "bg-warning" : "bg-danger";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-1 w-14 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <span className={cn("block h-full rounded-full", tone)} style={{ width: `${Math.min(100, pct)}%` }} />
      </span>
      <span className="tabular text-xs text-muted-foreground">{pct}%</span>
    </span>
  );
}

function batchSessionLabel(s: Session, batches: Batch[]): string {
  if (s.label) return s.label;
  const b = s.batch_id ? batches.find((x) => x.id === s.batch_id) : null;
  if (b) return b.name;
  return "Session";
}

function WeekGrid({ sessions, holidays }: { sessions: Session[]; holidays: { holiday_date: string; name?: string | null }[] }) {
  const holidayDows = new Set<number>();
  const holidayNames = new Map<number, string>();
  for (const h of holidays) {
    const dow = isoDow(h.holiday_date);
    holidayDows.add(dow);
    if (h.name) holidayNames.set(dow, h.name);
  }

  const byDow = new Map<number, Session[]>();
  for (const s of sessions) {
    const dow = isoDow(s.session_date);
    if (!byDow.has(dow)) byDow.set(dow, []);
    byDow.get(dow)!.push(s);
  }

  const hours = Array.from({ length: GRID_END - GRID_START }, (_, i) => GRID_START + i);

  return (
    <div>
      <div className="grid grid-cols-[36px_repeat(7,minmax(0,1fr))] gap-px" aria-hidden>
        <span />
        {DOW.map((d, i) => (
          <span
            key={d}
            className={cn(
              "pb-1 text-center text-[11px] font-medium text-muted-foreground",
              holidayDows.has(i + 1) && "text-warning"
            )}
          >
            {d}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-[36px_repeat(7,minmax(0,1fr))] gap-px">
        <div className="relative" style={{ height: hours.length * HOUR_PX }} aria-hidden>
          {hours.map((h, i) => (
            <span
              key={h}
              className="tabular absolute right-1 -translate-y-1/2 text-[10px] text-muted-foreground"
              style={{ top: i * HOUR_PX }}
            >
              {String(h).padStart(2, "0")}
            </span>
          ))}
        </div>
        {DOW.map((d, i) => {
          const dow = i + 1;
          const items = byDow.get(dow) ?? [];
          const holiday = holidayDows.has(dow);
          return (
            <div
              key={d}
              className={cn(
                "relative overflow-hidden rounded border border-border",
                holiday && "bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,var(--warning-soft)_4px,var(--warning-soft)_8px)]"
              )}
              style={{ height: hours.length * HOUR_PX }}
              role="presentation"
            >
              {hours.map((h, r) => (
                <span
                  key={h}
                  className="absolute left-0 right-0 border-t border-border/50"
                  style={{ top: r * HOUR_PX }}
                  aria-hidden
                />
              ))}
              {items.map((s) => {
                const st = istHourMin(s.start_ts);
                const en = istHourMin(s.end_ts);
                const startH = Math.max(GRID_START, st.h + st.m / 60);
                const endHRaw = en.h + en.m / 60;
                const endH = Math.min(GRID_END, endHRaw <= startH ? startH + 1 : endHRaw);
                const top = (startH - GRID_START) * HOUR_PX;
                const height = Math.max(8, (endH - startH) * HOUR_PX - 2);
                return (
                  <span
                    key={s.id}
                    title={`${batchSessionLabel(s, [])} ${formatTimeOnly(s.start_ts)}–${formatTimeOnly(s.end_ts)}`}
                    className={cn(
                      "absolute left-0.5 right-0.5 rounded-sm px-1 text-[9px] leading-tight",
                      s.status === "cancelled"
                        ? "border border-dashed border-muted-foreground bg-muted text-muted-foreground"
                        : s.status === "missed"
                          ? "border border-dashed border-danger bg-danger-soft"
                          : "bg-accent-soft text-primary"
                    )}
                    style={{ top, height }}
                  >
                    {formatTimeOnly(s.start_ts)}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
      {holidayNames.size > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          Hatched columns are holidays: {[...holidayNames.entries()].map(([dow, name]) => `${DOW_LONG[dow - 1]} — ${name}`).join(" · ")}
        </p>
      )}
    </div>
  );
}

export function ScheduleTab({ cid }: { cid: string }) {
  const [from, setFrom] = React.useState(() => shiftDay(todayIST(), -14));
  const [to, setTo] = React.useState(() => shiftDay(todayIST(), 14));

  const q = useQuery({
    queryKey: ["centre-schedule", cid, from, to],
    queryFn: () => api<CentreSchedule>(`/centres/${cid}/schedule?from=${from}&to=${to}`),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
  });

  const shiftWindow = (delta: number) => {
    setFrom((f) => shiftDay(f, delta));
    setTo((t) => shiftDay(t, delta));
  };

  if (q.error && !q.data) return <ErrorState onRetry={() => q.refetch()} />;
  if (q.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-1" />
          <Skeleton className="h-64 lg:col-span-2" />
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  const batches = q.data?.batches ?? [];
  const sessions = q.data?.sessions ?? [];
  const holidays = q.data?.holidays ?? [];
  const changes = [...(q.data?.changes ?? [])].reverse();
  const batchMap = new Map(batches.map((b) => [b.id, b]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
        <Button variant="ghost" size="icon" aria-label="Previous 14 days" onClick={() => shiftWindow(-14)}>
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </Button>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          From
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-8 rounded-md border bg-background px-2 text-xs"
          />
        </label>
        <span className="text-xs text-muted-foreground">to</span>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="h-8 rounded-md border bg-background px-2 text-xs"
        />
        <Button variant="ghost" size="icon" aria-label="Next 14 days" onClick={() => shiftWindow(14)}>
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
        <span className="tabular ml-auto text-xs text-muted-foreground">
          {fmtDate(from)} – {fmtDate(to)} · {sessions.length} session{sessions.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-1">
          <p className="text-xs font-medium text-muted-foreground">Recurring batches</p>
          {batches.length === 0 ? (
            <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">No batches on record.</p>
          ) : (
            batches.map((b) => (
              <Card key={b.id}>
                <CardContent className="space-y-2 p-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{b.name}</span>
                    <Badge variant={b.active ? "success" : "secondary"}>{b.active ? "Active" : "Inactive"}</Badge>
                  </div>
                  <p className="tabular flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" aria-hidden />
                    {b.start_time} – {b.end_time}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {DOW.map((d, i) => (
                      <span
                        key={d}
                        title={DOW_LONG[i]}
                        className={cn(
                          "inline-flex h-5 items-center rounded px-1.5 text-[10px] font-medium",
                          b.weekdays.includes(i + 1)
                            ? "bg-accent-soft text-primary"
                            : "bg-surface-2 text-muted-foreground/50"
                        )}
                      >
                        {d}
                      </span>
                    ))}
                  </div>
                  {(b.start_date || b.end_date) && (
                    <p className="text-xs text-muted-foreground">
                      {b.start_date ?? "…"} – {b.end_date ?? "…"}
                    </p>
                  )}
                  {b.trainer_id && (
                    <p className="font-mono text-[10px] text-muted-foreground">Trainer {b.trainer_id.slice(-6)}</p>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <div className="lg:col-span-2">
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Week grid (06:00–20:00)</p>
          <div className="rounded-lg border bg-card p-3">
            <WeekGrid sessions={sessions} holidays={holidays} />
          </div>
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">Sessions</p>
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Session</th>
                <th className="px-3 py-2 font-medium">Scheduled</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Actual</th>
                <th className="px-3 py-2 font-medium">Monitored</th>
                <th className="px-3 py-2 font-medium">Coverage</th>
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      icon={CalendarOff}
                      title="No sessions in this range."
                      hint="Widen the date range or check that batches are active for these weekdays."
                    />
                  </td>
                </tr>
              ) : (
                sessions.map((s) => {
                  const b = s.batch_id ? batchMap.get(s.batch_id) : null;
                  const ds = sessionDisplayStatus(s.status === "active" ? "running" : s.status, s.actual_start_ts);
                  return (
                    <tr
                      key={s.id}
                      className={cn(
                        "border-b border-border/60 last:border-0",
                        ds === "missed" && "bg-danger-soft/40",
                        s.status === "cancelled" && "bg-muted/50"
                      )}
                    >
                      <td className="tabular whitespace-nowrap px-3 py-2 font-mono text-xs">{s.session_date}</td>
                      <td className="px-3 py-2">
                        <span className={cn("font-medium", s.status === "cancelled" && "line-through")}>
                          {batchSessionLabel(s, batches)}
                        </span>
                        {b && <span className="ml-1.5 text-xs text-muted-foreground">· {b.name}</span>}
                      </td>
                      <td className="tabular whitespace-nowrap px-3 py-2 font-mono text-xs text-muted-foreground">
                        {formatTimeOnly(s.start_ts)} – {formatTimeOnly(s.end_ts)}
                      </td>
                      <td className="px-3 py-2">
                        <SessionStatusChip status={ds} lineThrough />
                      </td>
                      <td className="tabular whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                        {s.actual_start_ts || s.actual_end_ts ? (
                          <>
                            {s.actual_start_ts ? formatTimeOnly(s.actual_start_ts) : "—"} –{" "}
                            {s.actual_end_ts ? formatTimeOnly(s.actual_end_ts) : "—"}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="tabular whitespace-nowrap px-3 py-2 text-xs">
                        {s.monitored_s != null ? fmtDuration(s.monitored_s) : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <CoverageBar pct={s.coverage_pct} />
                        {s.status === "cancelled" && s.cancel_reason && (
                          <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                            <Ban className="h-3 w-3" aria-hidden />
                            {s.cancel_reason}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Holidays</p>
          <div className="rounded-lg border bg-card">
            {holidays.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No holidays in this range.</p>
            ) : (
              <ul className="divide-y divide-border">
                {holidays.map((h) => (
                  <li key={h.holiday_date} className="flex items-center gap-2 p-3 text-sm">
                    <CalendarOff className="h-3.5 w-3.5 text-warning" aria-hidden />
                    <span className="tabular font-mono text-xs">{h.holiday_date}</span>
                    <span className="text-muted-foreground">{h.name || "Holiday"}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Schedule changes</p>
          <div className="rounded-lg border bg-card">
            {changes.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No schedule changes in this range.</p>
            ) : (
              <ul className="divide-y divide-border">
                {changes.map((c, i) => (
                  <li key={i} className="p-3 text-sm">
                    <p>{c.text || `${c.action ?? "change"} ${c.entity ?? ""}`.trim()}</p>
                    <p className="tabular mt-0.5 text-xs text-muted-foreground">
                      {c.ts ? fmtDate(c.ts.slice(0, 10)) : ""} {c.ts ? formatTimeOnly(c.ts) : ""} · {c.actor_name ?? "system"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
