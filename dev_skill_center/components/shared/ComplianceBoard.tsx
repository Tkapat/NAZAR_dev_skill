"use client";

import * as React from "react";
import { CheckCircle2, Info, TriangleAlert, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { CountUp } from "@/lib/motion";
import { Meter } from "@/components/ui/meter";
import type { ComplianceResponse } from "@/lib/types";

const LEVEL_CHIP: Record<string, { cls: string; label: string; Icon: React.ComponentType<{ className?: string }> }> = {
  waiting: { cls: "border-warning/40 bg-warning/10 text-warning", label: "Waiting", Icon: Loader2 },
  ok: { cls: "border-success/40 bg-success/10 text-success", label: "All matched", Icon: CheckCircle2 },
  attention: { cls: "border-info/40 bg-info/10 text-info", label: "Worth a look", Icon: Info },
  critical: { cls: "border-danger/40 bg-danger/10 text-danger", label: "Needs your response", Icon: TriangleAlert },
};

const VERDICT_CHIP: Record<string, { cls: string; label: string }> = {
  waiting: { cls: "border-warning/40 bg-warning/10 text-warning", label: "Waiting" },
  match: { cls: "border-success/40 bg-success/10 text-success", label: "Matched" },
  inflated: { cls: "border-danger/40 bg-danger/10 text-danger", label: "Inflated" },
  over_capacity: { cls: "border-danger/40 bg-danger/10 text-danger", label: "Over capacity" },
  unclaimed: { cls: "border-info/40 bg-info/10 text-info", label: "Unclaimed" },
  unverifiable: { cls: "border-warning/40 bg-warning/10 text-warning", label: "Unverifiable" },
  ghost: { cls: "border-danger/40 bg-danger/10 text-danger", label: "Ghost" },
  unregistered: { cls: "border-warning/40 bg-warning/10 text-warning", label: "Unregistered" },
  ok: { cls: "border-success/40 bg-success/10 text-success", label: "OK" },
  missing: { cls: "border-warning/40 bg-warning/10 text-warning", label: "Missing" },
  declaration_mismatch: { cls: "border-info/40 bg-info/10 text-info", label: "Declaration mismatch" },
  non_operational: { cls: "border-warning/40 bg-warning/10 text-warning", label: "Non-operational" },
};

const SEVERITY_CHIP: Record<string, string> = {
  low: "border-border bg-surface text-muted-foreground",
  medium: "border-info/40 bg-info/10 text-info",
  high: "border-warning/40 bg-warning/10 text-warning",
  critical: "border-danger/40 bg-danger/10 text-danger",
};

const VERDICT_TEXT: Record<string, string> = {
  missing: "Fewer items seen than sanctioned",
  declaration_mismatch: "Declared quantity differs from sanctioned",
  non_operational: "No items in use during session",
};

function VerdictChip({ verdict, className, flash }: { verdict: string; className?: string; flash?: boolean }) {
  const meta = VERDICT_CHIP[verdict] ?? { cls: "border-border bg-surface text-muted-foreground", label: verdict };
  const [showFlash, setShowFlash] = React.useState(false);

  React.useEffect(() => {
    if (flash) {
      setShowFlash(true);
      const t = setTimeout(() => setShowFlash(false), 800);
      return () => clearTimeout(t);
    }
  }, [flash]);

  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full border px-2 text-xs font-medium transition-all",
        meta.cls,
        showFlash && "ring-2 ring-primary/50 scale-[1.02]",
        className,
      )}
    >
      {meta.label}
    </span>
  );
}

function SeverityChip({ severity }: { severity: string }) {
  return (
    <span className={`inline-flex h-5 items-center rounded-full border px-1.5 text-[10px] font-medium ${SEVERITY_CHIP[severity] ?? SEVERITY_CHIP.low}`}>
      {severity}
    </span>
  );
}

function formatTimeAgo(iso: string) {
  const diff = Date.now() - Date.parse(iso);
  if (diff < 60_000) return `${Math.max(1, Math.round(diff / 1000))} s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)} min ago`;
  return `${Math.round(diff / 3_600_000)} h ago`;
}

interface ComplianceBoardProps {
  data: ComplianceResponse | undefined;
  isLoading: boolean;
  error: unknown;
  onRetry?: () => void;
  compact?: boolean;
}

export function ComplianceBoard({ data, isLoading, error, onRetry, compact = false }: ComplianceBoardProps) {
  const [prevVerdict, setPrevVerdict] = React.useState<string | null>(null);
  const [prevEqVerdicts, setPrevEqVerdicts] = React.useState<Record<string, string>>({});

  const peopleVerdict = data?.people?.verdict ?? "waiting";
  const eqVerdicts = React.useMemo(
    () => Object.fromEntries((data?.equipment ?? []).map((e) => [e.class, e.verdict])),
    [data?.equipment],
  );

  const peopleFlash = prevVerdict !== null && prevVerdict !== peopleVerdict;
  const eqFlash = Object.keys(eqVerdicts).some((k) => prevEqVerdicts[k] !== eqVerdicts[k]);

  React.useEffect(() => {
    if (!isLoading && data) {
      setPrevVerdict(peopleVerdict);
      setPrevEqVerdicts(eqVerdicts);
    }
  }, [data, isLoading, peopleVerdict, eqVerdicts]);

  const levelMeta = LEVEL_CHIP[data?.summary?.level ?? "waiting"];
  const LevelIcon = levelMeta?.Icon ?? Loader2;

  if (error && !data) {
    return (
      <div className="card">
        <div className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow">Compliance now</p>
              <h3 className="text-lg font-semibold">Unable to load</h3>
            </div>
            {onRetry && (
              <button onClick={onRetry} className="btn-ghost btn-sm">
                Retry
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="eyebrow">Compliance now</p>
        <h3 className={compact ? "text-base font-semibold" : "text-lg font-semibold"}>
          {data?.summary?.headline ?? "Loading…"}
        </h3>
      </div>
      <div className="flex items-center gap-2">
        <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-full border px-2 text-xs font-medium", levelMeta?.cls)}>
          <LevelIcon className="h-3 w-3" aria-hidden />
          {levelMeta?.label}
        </span>
        <span className="text-xs text-muted-foreground">as of {data ? formatTimeAgo(data.as_of) : "…"}</span>
      </div>
    </div>
  );

  const people = data?.people;
  const enrolled = people?.enrolled ?? 0;
  const claimed = people?.claimed;
  const counted = people?.counted;
  const ciLow = people?.ci_low;
  const ciHigh = people?.ci_high;

  const peopleRow = (
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Enrolled</p>
        <p className="text-[28px] font-semibold tabular">
          <CountUp value={enrolled} />
        </p>
      </div>
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Claimed present</p>
        <p className="text-[28px] font-semibold tabular">
          {claimed != null ? <CountUp value={claimed} /> : <span className="text-muted-foreground">Not submitted yet</span>}
        </p>
      </div>
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Camera counted</p>
        <p className="text-[28px] font-semibold tabular">
          {counted != null ? (
            <>
              <CountUp value={counted} />
              {ciLow != null && ciHigh != null && ciLow !== ciHigh && (
                <span className="ml-2 text-xs text-muted-foreground">({ciLow}–{ciHigh})</span>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </p>
      </div>
    </div>
  );

  const peopleVerdictRow = (
    <div className="flex flex-wrap items-center gap-3 mt-3">
      <VerdictChip verdict={peopleVerdict} flash={peopleFlash} />
      <p className="text-sm text-muted-foreground flex-1 min-w-[200px]">
        {people?.text ?? "Waiting for sufficient frames (need 3+)."}
      </p>
    </div>
  );

  const equipment = data?.equipment ?? [];

  const equipmentTable = equipment.length > 0 ? (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left p-2 font-medium text-muted-foreground">Item</th>
            <th className="text-right p-2 font-medium text-muted-foreground">Sanctioned</th>
            <th className="text-right p-2 font-medium text-muted-foreground">Declared</th>
            <th className="text-right p-2 font-medium text-muted-foreground">Seen</th>
            <th className="text-right p-2 font-medium text-muted-foreground">In use</th>
            <th className="text-left p-2 font-medium text-muted-foreground">Verdict</th>
          </tr>
        </thead>
        <tbody>
          {equipment.map((e) => (
            <tr key={e.class} className="border-b border-border/50">
              <td className="p-2 font-medium">{e.label}</td>
              <td className="p-2 text-right tabular">{e.sanctioned}</td>
              <td className="p-2 text-right tabular">{e.declared}</td>
              <td className="p-2 text-right tabular">{e.seen != null ? <CountUp value={e.seen} /> : "—"}</td>
              <td className="p-2 text-right tabular">
                {e.in_use != null ? <CountUp value={e.in_use} /> : "—"}
                {e.in_use_pct != null && <Meter value={e.in_use_pct} max={100} className="h-2 w-24 ml-2 inline-block" />}
              </td>
              <td className="p-2">
                <div className="flex flex-col gap-1">
                  <VerdictChip verdict={e.verdict} flash={eqFlash} />
                  {e.off && e.off > 0 && (
                    <span className="text-xs text-muted-foreground">{e.off} switched off</span>
                  )}
                  {e.verdict !== "ok" && e.verdict !== "waiting" && (
                    <p className="text-xs text-muted-foreground">
                      {VERDICT_TEXT[e.verdict] ?? e.text}
                    </p>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <p className="text-sm text-muted-foreground">No equipment configured for this trade.</p>
  );

  const flags = data?.flags ?? [];
  const flagsList = flags.length > 0 ? (
    <ul className="space-y-2">
      {flags.map((f) => (
        <li key={f.id} className="flex flex-wrap items-start gap-3 rounded-[12px] border border-border bg-surface p-3">
          <div className="flex items-center gap-2 shrink-0">
            <SeverityChip severity={f.severity} />
            <span className="font-medium text-sm">{f.type}</span>
          </div>
          <p className="flex-1 min-w-0 text-sm">{f.reason}</p>
        </li>
      ))}
    </ul>
  ) : (
    <p className="text-sm text-muted-foreground">No differences found yet.</p>
  );

  return (
    <div className="card space-y-4 p-5">
      {header}
      <div className="space-y-4 border-t border-border pt-4">
        <section>
          {peopleRow}
          {peopleVerdictRow}
        </section>
        {equipment.length > 0 && (
          <section>
            <p className="eyebrow">Equipment</p>
            {equipmentTable}
          </section>
        )}
        <section>
          <p className="eyebrow">Flags</p>
          {flagsList}
        </section>
      </div>
    </div>
  );
}