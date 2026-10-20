"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as ReTooltip, XAxis, YAxis } from "recharts";
import { Download, Printer } from "lucide-react";
import { api } from "@/lib/api";
import { fmtNum, fmtPct } from "@/lib/format";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { ChartCard } from "@/components/shared/ChartCard";
import { KpiCard, KpiRowSkeleton } from "@/components/shared/KpiCard";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface RollupRow {
  key: string;
  count: number;
  open_flags: number;
  risk_avg: number;
  sessions_total: number;
  sessions_held: number;
  sessions_missed: number;
  sessions_held_pct: number | null;
  avg_coverage_pct: number | null;
}

function downloadCsv(filename: string, rows: RollupRow[], by: string) {
  const header = [by, "centres", "open_flags", "avg_risk", "sessions_total", "sessions_held", "sessions_missed", "sessions_held_pct", "avg_coverage_pct"];
  const lines = [
    header.join(","),
    ...rows.map((r) =>
      [r.key, r.count, r.open_flags, r.risk_avg, r.sessions_total ?? 0, r.sessions_held ?? 0, r.sessions_missed ?? 0, r.sessions_held_pct ?? "", r.avg_coverage_pct ?? ""].join(",")
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const [by, setBy] = React.useState("district");

  const rollupQ = useQuery({
    queryKey: ["reports", "rollup", by],
    queryFn: () => api<RollupRow[]>(`/reports/rollup?by=${by}&limit=50`),
    refetchInterval: 60_000,
  });

  const rows = rollupQ.data ?? [];
  const totalCentres = rows.reduce((s, r) => s + r.count, 0);
  const totalFlags = rows.reduce((s, r) => s + r.open_flags, 0);
  const avgRisk = totalCentres ? rows.reduce((s, r) => s + r.risk_avg * r.count, 0) / totalCentres : 0;
  const worst = rows[0];
  const totalSessions = rows.reduce((s, r) => s + (r.sessions_total ?? 0), 0);
  const totalHeld = rows.reduce((s, r) => s + (r.sessions_held ?? 0), 0);
  const totalMissed = rows.reduce((s, r) => s + (r.sessions_missed ?? 0), 0);
  const heldPct = totalSessions ? Math.round((totalHeld / totalSessions) * 100) : null;
  const withCoverage = rows.filter((r) => r.avg_coverage_pct != null);
  const avgCoverage = withCoverage.length
    ? Math.round(withCoverage.reduce((s, r) => s + (r.avg_coverage_pct ?? 0), 0) / withCoverage.length)
    : null;

  const summary = rows.length
    ? `${rows.length} ${by}(s), ${fmtNum(totalCentres)} centres, ${fmtNum(totalFlags)} open flags, average risk ${fmtPct(avgRisk)}${
        worst ? `, highest in ${worst.key} (${fmtPct(worst.risk_avg)})` : ""
      }${heldPct != null ? `, ${heldPct}% sessions held` : ""}${totalMissed ? `, ${totalMissed} missed` : ""}${
        avgCoverage != null ? `, avg coverage ${avgCoverage}%` : ""
      }.`
    : "No data to summarise yet.";

  if (rollupQ.error) {
    return (
      <div className="rounded-lg border bg-card">
        <ErrorState onRetry={() => rollupQ.refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6 print:hidden">
      <PageHeader
        title="Reports"
        description="Rollups across districts, schemes and trades. Every chart carries a text summary; tables can be exported or printed."
        action={
          <>
            <Button
              variant="secondary"
              size="sm"
              disabled={rows.length === 0}
              onClick={() => downloadCsv(`rollup-by-${by}.csv`, rows, by)}
            >
              <Download className="mr-1.5 h-4 w-4" aria-hidden />
              Export CSV
            </Button>
            <Button variant="secondary" size="sm" onClick={() => window.print()}>
              <Printer className="mr-1.5 h-4 w-4" aria-hidden />
              Print
            </Button>
          </>
        }
      >
        <div className="flex items-end gap-3">
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Group by</span>
            <Select value={by} onValueChange={setBy}>
              <SelectTrigger className="w-44" aria-label="Group rollup by">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="district">District</SelectItem>
                <SelectItem value="scheme">Scheme</SelectItem>
                <SelectItem value="trade">Trade</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </PageHeader>

      {rollupQ.isLoading ? (
        <KpiRowSkeleton count={6} />
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          <KpiCard eyebrow="Centres in report" value={totalCentres} loading={false} />
          <KpiCard eyebrow="Open flags" value={totalFlags} loading={false} />
          <KpiCard eyebrow="Avg risk" value={Math.round(avgRisk)} loading={false} />
          <KpiCard eyebrow="Sessions held %" value={heldPct ?? 0} loading={false} />
          <KpiCard eyebrow="Missed sessions" value={totalMissed} loading={false} />
          <KpiCard eyebrow="Avg coverage %" value={avgCoverage ?? 0} loading={false} />
        </div>
      )}

      <ChartCard
        title={`Centres and open flags by ${by}`}
        loading={rollupQ.isLoading}
        empty={rows.length === 0}
        emptyTitle={`No ${by} data yet`}
        emptyHint="Rollups appear once centres are approved."
        summary={summary}
      >
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows.slice(0, 20)} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeWidth={1} />
              <XAxis
                dataKey="key"
                tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                axisLine={{ stroke: "var(--border)" }}
                tickLine={false}
                interval={0}
                angle={-30}
                textAnchor="end"
                height={60}
              />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={40} />
              <ReTooltip
                cursor={{ fill: "var(--surface-hover)" }}
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "var(--popover-foreground)",
                  boxShadow: "var(--shadow-pop)",
                }}
              />
              <Bar dataKey="count" name="Centres" fill="var(--primary)" isAnimationActive={false} />
              <Bar dataKey="open_flags" name="Open flags" fill="var(--sev-medium)" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <div className="rounded-lg border bg-card">
        <div className="max-h-[60vh] overflow-auto">
          <Table>
            <caption className="sr-only">Rollup table</caption>
            <TableHeader className="sticky top-0 z-10 bg-surface">
              <TableRow className="hover:bg-transparent">
                <TableHead className="capitalize">{by}</TableHead>
                <TableHead className="text-right">Centres</TableHead>
                <TableHead className="text-right">Open flags</TableHead>
                <TableHead className="text-right">Avg risk</TableHead>
                <TableHead className="text-right">Sessions</TableHead>
                <TableHead className="text-right">Held</TableHead>
                <TableHead className="text-right">Missed</TableHead>
                <TableHead className="text-right">Held %</TableHead>
                <TableHead className="text-right">Avg coverage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.key}>
                  <TableCell className="font-medium">{r.key}</TableCell>
                  <TableCell className="tabular text-right">{r.count}</TableCell>
                  <TableCell className="tabular text-right">{r.open_flags}</TableCell>
                  <TableCell className="tabular text-right">{fmtPct(r.risk_avg)}</TableCell>
                  <TableCell className="tabular text-right">{r.sessions_total ?? 0}</TableCell>
                  <TableCell className="tabular text-right">{r.sessions_held ?? 0}</TableCell>
                  <TableCell className="tabular text-right">{r.sessions_missed ?? 0}</TableCell>
                  <TableCell className="tabular text-right">
                    {r.sessions_held_pct != null ? `${r.sessions_held_pct}%` : "—"}
                  </TableCell>
                  <TableCell className="tabular text-right">
                    {r.avg_coverage_pct != null ? `${r.avg_coverage_pct}%` : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {rows.length === 0 && !rollupQ.isLoading && (
          <EmptyState
            icon={Download}
            title="Nothing to report yet"
            hint="Approve an application to create the first centre — rollups fill in from there."
          />
        )}
      </div>
    </div>
  );
}
