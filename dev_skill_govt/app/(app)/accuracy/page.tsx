"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Gauge } from "lucide-react";
import { api } from "@/lib/api";
import { fmtNum } from "@/lib/format";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Metric = number | string | boolean | null | undefined;

interface ClassRow {
  name: string;
  [k: string]: Metric;
}

function asNum(v: Metric): number | null {
  return typeof v === "number" ? v : null;
}

function pct(v: Metric): string {
  const n = asNum(v);
  if (n == null) return "—";
  return `${(n * 100).toFixed(1)} %`;
}

/** Recursively flatten one level of objects into rows for the table. */
function toRows(data: Record<string, unknown>): ClassRow[] {
  const rows: ClassRow[] = [];
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      rows.push({ name: k, ...(v as Record<string, Metric>) });
    }
  }
  return rows;
}

export default function AccuracyPage() {
  const q = useQuery({
    queryKey: ["accuracy"],
    queryFn: () => api<Record<string, unknown>>("/accuracy"),
    staleTime: 300_000,
  });

  const data = q.data;
  const unavailable = !!data && "message" in data;

  const overall = React.useMemo(() => {
    if (!data || unavailable) return null;
    const out: { label: string; value: number | null; kind: "pct" | "int" }[] = [];
    for (const key of ["precision", "recall", "f1", "accuracy"]) {
      const v = data[key];
      if (typeof v === "number") out.push({ label: key[0].toUpperCase() + key.slice(1), value: v, kind: "pct" });
    }
    if (typeof data.frames === "number") out.push({ label: "Frames evaluated", value: data.frames as number, kind: "int" });
    if (typeof data.videos === "number") out.push({ label: "Videos", value: data.videos as number, kind: "int" });
    return out;
  }, [data, unavailable]);

  const rows = React.useMemo(() => {
    if (!data || unavailable) return [];
    const explicit = data.classes ?? data.per_class ?? data.by_class;
    if (Array.isArray(explicit)) {
      return explicit.map((c) => ({ name: String((c as { name?: string; class?: string }).name ?? (c as { class?: string }).class ?? "?"), ...(c as object) }) as ClassRow);
    }
    if (typeof data.videos === "number") {
      // evaluation script shape: metrics flat → no class rows
      return [];
    }
    return toRows(data);
  }, [data, unavailable]);

  const columns = React.useMemo(() => {
    const keys = new Set<string>();
    rows.forEach((r) => Object.keys(r).forEach((k) => k !== "name" && keys.add(k)));
    return Array.from(keys);
  }, [rows]);

  if (q.error) {
    return (
      <div className="rounded-lg border bg-card">
        <ErrorState onRetry={() => q.refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Model accuracy"
        description="Held-out evaluation of the counting pipeline: how often the camera is right when a human checks it. Evaluated by the ML team with a human-verified test set."
      />

      {q.isLoading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : unavailable ? (
        <div className="rounded-lg border bg-card">
          <EmptyState
            icon={Gauge}
            title="No evaluation results yet"
            hint="Run eval/evaluate.py on the backend to produce results.json — this page picks it up automatically."
            action={
              <Badge variant="secondary" className="font-mono text-xs">
                {String((data as { message?: string } | undefined)?.message ?? "No data")}
              </Badge>
            }
          />
        </div>
      ) : (
        <>
          {overall && overall.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-3">
              {overall.map((m) => (
                <div key={m.label} className="rounded-lg border bg-card p-6">
                  <p className="eyebrow">{m.label}</p>
                  <p className="mt-1.5 tabular text-[28px] font-semibold leading-8 tracking-[-0.02em]">
                    {m.value == null ? "—" : m.kind === "pct" ? `${(m.value * 100).toFixed(1)} %` : fmtNum(m.value)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border bg-surface px-4 py-3 text-sm text-muted-foreground">
              Evaluation file present but no recognised top-level metrics. Raw values are shown below.
            </div>
          )}

          <div className="rounded-lg border bg-card">
            <div className="overflow-x-auto">
              <Table>
                <caption className="sr-only">Per-class accuracy metrics</caption>
                <TableHeader className="bg-surface">
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Class</TableHead>
                    {columns.map((c) => (
                      <TableHead key={c} className="text-right">
                        {c.replace(/_/g, " ")}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={columns.length + 1} className="py-10 text-center text-sm text-muted-foreground">
                        No per-class breakdown in this evaluation file — overall metrics only.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((r) => (
                      <TableRow key={r.name}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        {columns.map((c) => {
                          const v = r[c];
                          return (
                            <TableCell key={c} className="tabular text-right">
                              {typeof v === "number" && v >= 0 && v <= 1 ? pct(v) : (v ?? "—")}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Accuracy here is measured on a held-out set with human-verified labels. In production, uncertain frames are
            never counted as facts — they are flagged for review instead.
          </p>
        </>
      )}
    </div>
  );
}
