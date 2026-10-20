"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Ban, CalendarDays } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDate, fmtDuration, fmtIST, formatTimeOnly } from "@/lib/format";
import { SESSION_KIND } from "@/lib/constants";
import { SessionStatusChip, SeverityDot, FlagTypeChip, FlagStatusChip } from "@/components/shared/StatusChip";
import { RunList } from "@/components/shared/RunList";
import { ErrorState } from "@/components/shared/ErrorState";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { Flag, SessionDetail } from "@/types";

function StatTile({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="rounded-lg border bg-surface p-2.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn("tabular mt-0.5 text-sm font-semibold", mono && "font-mono")}>{value}</p>
    </div>
  );
}

/** Right drawer (560 px desktop / bottom sheet mobile) with session detail, runs and flags. */
export function SessionDrawer({
  sessionId,
  onClose,
}: {
  sessionId: string;
  onClose: () => void;
}) {
  const q = useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => api<SessionDetail>(`/sessions/${sessionId}`),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    staleTime: 10_000,
  });

  const flagsQ = useQuery({
    queryKey: ["session-flags", sessionId],
    queryFn: () => api<{ items: Flag[] }>(`/flags?centre_id=${q.data?.centre_id ?? ""}&limit=50`),
    enabled: !!q.data?.centre_id,
    staleTime: 30_000,
  });

  const s = q.data;
  const sessionFlags = React.useMemo(
    () => (flagsQ.data?.items ?? []).filter((f) => f.session_id === sessionId),
    [flagsQ.data, sessionId]
  );

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="overflow-y-auto sm:max-w-[560px]">
        <SheetHeader className="pr-8">
          <SheetTitle className="text-base">
            {s?.label ?? (q.isLoading ? <Skeleton className="h-5 w-40" /> : "Session")}
          </SheetTitle>
          <div className="flex flex-wrap items-center gap-2">
            {s && <SessionStatusChip status={s.status} lineThrough />}
            {s?.kind && (
              <Badge variant="secondary" className="font-mono text-[11px]">
                {SESSION_KIND[s.kind] ?? s.kind}
              </Badge>
            )}
            {s?.cancel_reason && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Ban className="h-3 w-3" aria-hidden />
                {s.cancel_reason}
              </span>
            )}
          </div>
          {s && (
            <p className="text-sm text-muted-foreground">
              {s.centre_name}{" "}
              <span className="font-mono text-xs">{s.centre_code}</span> · {fmtDate(s.session_date)}
            </p>
          )}
        </SheetHeader>

        {q.error && !s && (
          <div className="rounded-lg border bg-card">
            <ErrorState onRetry={() => q.refetch()} />
          </div>
        )}
        {q.isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}

        {s && (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <StatTile
                label="Scheduled"
                value={`${formatTimeOnly(s.start_ts)} – ${formatTimeOnly(s.end_ts)}`}
                mono
              />
              <StatTile
                label="Actual"
                value={
                  s.actual_start_ts
                    ? `${formatTimeOnly(s.actual_start_ts)} – ${s.actual_end_ts ? formatTimeOnly(s.actual_end_ts) : "now"}`
                    : "—"
                }
                mono
              />
              <StatTile
                label="Monitored"
                value={s.monitored_s != null ? `${fmtDuration(s.monitored_s)}${s.coverage_pct != null ? ` · ${s.coverage_pct}%` : ""}` : "—"}
              />
              <StatTile
                label="Late start"
                value={s.late_start_s != null && s.late_start_s > 0 ? `+${Math.round(s.late_start_s / 60)} min` : "On time"}
              />
              <StatTile
                label="Early end"
                value={s.early_end_s != null && s.early_end_s > 0 ? `${Math.round(s.early_end_s / 60)} min` : "—"}
              />
              <StatTile
                label="Claimed / counted"
                value={`${s.claimed ?? "—"} / ${s.observed ?? "—"}`}
              />
            </div>

            {s.coverage_pct != null && (
              <div className="rounded-lg border bg-surface p-3">
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Monitoring coverage</p>
                <div className="relative h-2 w-full overflow-hidden rounded-full bg-surface-2">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      s.coverage_pct >= 90 ? "bg-success" : s.coverage_pct >= 60 ? "bg-warning" : "bg-danger"
                    )}
                    style={{ width: `${Math.min(100, Math.max(0, s.coverage_pct))}%` }}
                  />
                </div>
                <p className="tabular mt-1 text-xs text-muted-foreground">{s.coverage_pct}% of the scheduled window</p>
              </div>
            )}

            {s.status === "missed" && (
              <p className="rounded-lg border border-dashed border-danger/40 bg-danger/5 p-3 text-sm text-danger">
                No camera data was received.
              </p>
            )}

            <section>
              <h4 className="mb-2 text-sm font-semibold">Monitoring runs</h4>
              <div className="rounded-lg border p-3">
                <RunList runs={s.runs} empty="No monitoring runs were recorded for this session." />
              </div>
            </section>

            {(s.claimed != null || s.observed != null) && (
              <section className="rounded-lg border p-3">
                <h4 className="mb-2 text-sm font-semibold">Claimed vs counted</h4>
                <div className="flex items-center gap-3 text-sm">
                  <span className="tabular">
                    <span className="text-muted-foreground">Claimed </span>
                    <span className="font-semibold">{s.claimed ?? "—"}</span>
                  </span>
                  <span className="text-muted-foreground">/</span>
                  <span className="tabular">
                    <span className="text-muted-foreground">Camera counted </span>
                    <span className="font-semibold">{s.observed ?? "—"}</span>
                  </span>
                  {s.delta != null && (
                    <span
                      className={cn(
                        "tabular ml-auto rounded-full border px-2 py-0.5 text-xs font-medium",
                        s.delta > 0
                          ? "border-warning/30 bg-warning/10 text-warning"
                          : s.delta === 0
                            ? "border-success/30 bg-success/10 text-success"
                            : "border-info/30 bg-info/10 text-info"
                      )}
                    >
                      {s.delta > 0 ? `+${s.delta}` : s.delta}
                    </span>
                  )}
                </div>
                {s.summary?.ci_low != null && (
                  <p className="tabular mt-1.5 text-xs text-muted-foreground">
                    Range {s.summary.ci_low}–{s.summary.ci_high}
                    {s.summary.staff_verified != null && ` · Trainer ${s.summary.staff_verified ? "verified" : "not verified"}`}
                    {s.summary.snapshots != null && ` · ${s.summary.snapshots} snapshots`}
                  </p>
                )}
              </section>
            )}

            <section>
              <h4 className="mb-2 text-sm font-semibold">Flags of this session</h4>
              {flagsQ.isLoading ? (
                <Skeleton className="h-20 w-full" />
              ) : sessionFlags.length === 0 ? (
                <p className="rounded-lg border p-3 text-sm text-muted-foreground">No flags for this session.</p>
              ) : (
                <div className="space-y-2">
                  {sessionFlags.map((f) => (
                    <Link
                      key={f.id}
                      href={`/flags/${f.id}`}
                      className="block rounded-lg border p-2.5 transition-colors hover:border-border-strong"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <SeverityDot severity={f.severity} />
                        <FlagTypeChip type={f.type} />
                        <FlagStatusChip status={f.status} />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{f.reason}</p>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            <Link
              href={`/centres/${s.centre_id}?tab=calendar&date=${s.session_date}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <CalendarDays className="h-3.5 w-3.5" aria-hidden />
              Open this day in the centre calendar
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>

            <p className="tabular text-xs text-muted-foreground">Created {fmtIST(s.start_ts)}</p>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
