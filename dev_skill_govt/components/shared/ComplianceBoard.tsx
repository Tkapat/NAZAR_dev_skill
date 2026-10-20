"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, Info, Loader2, TriangleAlert } from "lucide-react";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import {
  COMPLIANCE_LEVEL_LABEL,
  EQUIP_VERDICT_LABEL,
  PEOPLE_VERDICT_LABEL,
  SEVERITY,
  type Severity,
} from "@/lib/constants";
import { useCountUp } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { ErrorState } from "@/components/shared/ErrorState";
import { FlagTypeChip, SeverityDot } from "@/components/shared/StatusChip";
import { Meter } from "@/components/ui/meter";
import { Skeleton } from "@/components/ui/skeleton";
import type { ComplianceResponse } from "@/types";

const LEVEL_CHIP: Record<string, { cls: string; Icon: React.ComponentType<{ className?: string }> }> = {
  waiting: { cls: "border-warning/40 bg-warning/10 text-warning", Icon: Loader2 },
  ok: { cls: "border-success/40 bg-success/10 text-success", Icon: CheckCircle2 },
  attention: { cls: "border-info/40 bg-info/10 text-info", Icon: Info },
  critical: { cls: "border-danger/40 bg-danger/10 text-danger", Icon: TriangleAlert },
};

const PEOPLE_VERDICT_CHIP: Record<string, string> = {
  waiting: "border-warning/40 bg-warning/10 text-warning",
  match: "border-success/40 bg-success/10 text-success",
  inflated: "border-danger/40 bg-danger/10 text-danger",
  over_capacity: "border-danger/40 bg-danger/10 text-danger",
  unclaimed: "border-info/40 bg-info/10 text-info",
  unverifiable: "border-warning/40 bg-warning/10 text-warning",
  ghost: "border-danger/40 bg-danger/10 text-danger",
  unregistered: "border-warning/40 bg-warning/10 text-warning",
};

const EQUIP_VERDICT_CHIP: Record<string, string> = {
  waiting: "border-warning/40 bg-warning/10 text-warning",
  ok: "border-success/40 bg-success/10 text-success",
  missing: "border-warning/40 bg-warning/10 text-warning",
  declaration_mismatch: "border-info/40 bg-info/10 text-info",
  non_operational: "border-warning/40 bg-warning/10 text-warning",
};

function VerdictChip({ verdict, labels, map, className }: { verdict: string; labels: Record<string, string>; map: Record<string, string>; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center rounded-full border px-2 text-xs font-medium",
        map[verdict] ?? "border-border bg-surface text-muted-foreground",
        className
      )}
    >
      {labels[verdict] ?? verdict}
    </span>
  );
}

function BigStat({ eyebrow, value, range }: { eyebrow: string; value: number | null; range?: string | null }) {
  const ref = useCountUp(value ?? 0);
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{eyebrow}</p>
      <p className="tabular mt-0.5 text-[28px] font-semibold leading-8">
        {value == null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span ref={ref as React.RefObject<HTMLSpanElement>} />
        )}
        {range && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{range}</span>}
      </p>
    </div>
  );
}

export function ComplianceBoard({ cid, pollMs = 5000 }: { cid: string; pollMs?: number }) {
  const q = useQuery({
    queryKey: ["centre-compliance", cid],
    queryFn: () => api<ComplianceResponse>(`/centres/${cid}/compliance`),
    refetchInterval: pollMs,
    refetchIntervalInBackground: false,
    staleTime: Math.min(pollMs, 5000),
  });

  if (q.error && !q.data) {
    return (
      <div className="rounded-lg border bg-card">
        <ErrorState onRetry={() => q.refetch()} />
      </div>
    );
  }

  const d = q.data;
  const level = d?.summary?.level ?? "waiting";
  const LevelIcon = LEVEL_CHIP[level]?.Icon ?? Loader2;
  const people = d?.people;
  const range =
    people?.ci_low != null && people.ci_high != null && people.ci_low !== people.ci_high
      ? `(${people.ci_low}–${people.ci_high})`
      : null;

  return (
    <section className="rounded-lg border bg-card p-4" aria-label="Compliance now" data-stagger-item>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Compliance now</p>
          <h3 className="truncate text-sm font-semibold">{d?.summary?.headline ?? "Loading…"}</h3>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={cn(
              "inline-flex h-6 items-center gap-1.5 rounded-full border px-2 text-xs font-medium",
              LEVEL_CHIP[level]?.cls ?? "border-border bg-surface text-muted-foreground"
            )}
          >
            <LevelIcon className={cn("h-3 w-3", level === "waiting" && "animate-spin")} aria-hidden />
            {COMPLIANCE_LEVEL_LABEL[level] ?? level}
          </span>
          {d && <span className="text-[11px] text-muted-foreground">{timeAgo(d.as_of)}</span>}
        </div>
      </div>

      {q.isLoading && !d ? (
        <div className="mt-4 space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : d ? (
        <>
          {/* PEOPLE row */}
          <div className="mt-4 rounded-lg border bg-surface p-3">
            <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
              <BigStat eyebrow="Enrolled" value={people?.enrolled ?? 0} />
              <BigStat eyebrow="Claimed present" value={people?.claimed ?? null} />
              <BigStat eyebrow="Camera counted" value={people?.counted ?? null} range={range} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <VerdictChip
                verdict={people?.verdict ?? "waiting"}
                labels={PEOPLE_VERDICT_LABEL}
                map={PEOPLE_VERDICT_CHIP}
              />
              <p className="min-w-[200px] flex-1 text-xs text-muted-foreground">{people?.text ?? "—"}</p>
            </div>
          </div>

          {/* EQUIPMENT table */}
          {d.equipment.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Equipment compliance</caption>
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-2 font-medium">Item</th>
                    <th className="pb-2 text-right font-medium">Sanctioned</th>
                    <th className="pb-2 text-right font-medium">Declared</th>
                    <th className="pb-2 text-right font-medium">Seen</th>
                    <th className="pb-2 text-right font-medium">In use</th>
                    <th className="pb-2 pl-3 font-medium">Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {d.equipment.map((e) => (
                    <tr key={e.class} className="border-b border-border/60 last:border-0">
                      <td className="py-2">
                        <span className="font-medium">{e.label || e.class}</span>
                      </td>
                      <td className="py-2 text-right tabular">{e.sanctioned}</td>
                      <td className="py-2 text-right tabular">{e.declared}</td>
                      <td className="py-2 text-right tabular">{e.seen ?? "—"}</td>
                      <td className="py-2 text-right tabular">{e.in_use ?? "—"}</td>
                      <td className="py-2 pl-3">
                        <div className="flex items-center gap-2">
                          <VerdictChip
                            verdict={e.verdict}
                            labels={EQUIP_VERDICT_LABEL}
                            map={EQUIP_VERDICT_CHIP}
                          />
                          {e.in_use_pct != null && e.sanctioned > 0 && (
                            <Meter
                              value={e.in_use ?? 0}
                              max={e.sanctioned}
                              showValue={false}
                              className="w-16 shrink-0"
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* FLAGS list */}
          <div className="mt-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Flags for this session</p>
              <Link href="/flags" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                All flags
                <ArrowRight className="h-3 w-3" aria-hidden />
              </Link>
            </div>
            {d.flags.length === 0 ? (
              <p className="mt-2 rounded-lg border bg-surface p-2.5 text-xs text-muted-foreground">
                No flags raised for this session.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-border rounded-lg border">
                {d.flags.map((f) => (
                  <li key={f.id}>
                    <Link href={`/flags/${f.id}`} className="flex items-start gap-2.5 p-2.5 hover:bg-surface-hover">
                      <SeverityDot severity={f.severity} withLabel={false} className="mt-1 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <FlagTypeChip type={f.type} className="h-5" />
                          <span className="text-[11px] text-muted-foreground">
                            {SEVERITY[(f.severity as Severity) ?? "low"]?.label}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{f.reason}</span>
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(f.created_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="mt-3 border-t pt-2 text-[11px] text-muted-foreground">
            {d.snapshots} snapshot{d.snapshots === 1 ? "" : "s"} · window {d.window} · computed on request, no manual refresh needed
          </p>
        </>
      ) : null}
    </section>
  );
}
