"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Building2, LayoutGrid, Plus, Search, Table2, X } from "lucide-react";
import { api } from "@/lib/api";
import { fmtPct } from "@/lib/format";
import { useDebounced } from "@/hooks/useDebounced";
import { useMe } from "@/hooks/useMe";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { CentreStatusChip } from "@/components/shared/StatusChip";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Meter } from "@/components/ui/meter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Centre } from "@/types";

type ListedCentre = Centre & {
  open_flags?: number;
  cameras?: { online: number; offline: number; tampered: number };
};

const RISK_RANGES = [
  { id: "all", label: "All risk" },
  { id: "low", label: "Low < 25" },
  { id: "medium", label: "Medium 25–60" },
  { id: "high", label: "High > 60" },
] as const;

export default function CentresPage() {
  const router = useRouter();
  const { isSuperAdmin } = useMe();
  const [view, setView] = React.useState<"table" | "grid">("table");
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [district, setDistrict] = React.useState("all");
  const [scheme, setScheme] = React.useState("all");
  const [risk, setRisk] = React.useState("all");
  const debouncedQ = useDebounced(q, 200);

  const centresQ = useQuery({
    queryKey: ["centres", "list"],
    queryFn: () => api<ListedCentre[]>("/centres"),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const labelsQ = useQuery({
    queryKey: ["schemes", "labels"],
    queryFn: async () => {
      const schemes = await api<{ id: string; name: string }[]>("/schemes").catch(() => []);
      const tpls = await Promise.all(
        schemes.map((s) => api<{ id: string; trade_name: string }[]>(`/schemes/${s.id}/templates`).catch(() => []))
      );
      const schemeMap: Record<string, string> = {};
      const tradeMap: Record<string, string> = {};
      schemes.forEach((s) => (schemeMap[s.id] = s.name));
      tpls.forEach((l) => l.forEach((t) => (tradeMap[t.id] = t.trade_name)));
      return { schemeMap, tradeMap, schemes };
    },
    staleTime: 60_000,
  });

  const districts = React.useMemo(
    () => Array.from(new Set((centresQ.data ?? []).map((c) => c.district))).sort(),
    [centresQ.data]
  );

  const rows = React.useMemo(() => {
    const needle = debouncedQ.trim().toLowerCase();
    return (centresQ.data ?? []).filter((c) => {
      if (status !== "all" && c.status !== status) return false;
      if (district !== "all" && c.district !== district) return false;
      if (scheme !== "all" && c.scheme_id !== scheme) return false;
      if (risk !== "all") {
        const r = c.risk_score ?? 0;
        if (risk === "low" && r >= 25) return false;
        if (risk === "medium" && (r < 25 || r > 60)) return false;
        if (risk === "high" && r <= 60) return false;
      }
      if (!needle) return true;
      return [c.code, c.name, c.district, c.state].join(" ").toLowerCase().includes(needle);
    });
  }, [centresQ.data, status, district, scheme, risk, debouncedQ]);

  const filtersActive = status !== "all" || district !== "all" || scheme !== "all" || risk !== "all" || !!debouncedQ;

  const clearFilters = () => {
    setStatus("all");
    setDistrict("all");
    setScheme("all");
    setRisk("all");
    setQ("");
  };

  const columns: DataTableColumn<ListedCentre>[] = [
    { key: "code", header: "Code", render: (c) => <span className="font-mono text-xs">{c.code}</span> },
    { key: "name", header: "Centre", render: (c) => <span className="font-medium">{c.name}</span> },
    { key: "district", header: "District", render: (c) => c.district },
    {
      key: "scheme",
      header: "Scheme / trade",
      render: (c) => (
        <span className="text-muted-foreground">
          {labelsQ.data?.schemeMap[c.scheme_id] ?? "—"}
          <span className="mx-1">·</span>
          {labelsQ.data?.tradeMap[c.trade_template_id] ?? "—"}
        </span>
      ),
    },
    { key: "status", header: "Status", render: (c) => <CentreStatusChip status={c.status} /> },
    {
      key: "risk",
      header: "Risk",
      className: "w-36",
      render: (c) => (
        <Meter value={Math.round(c.risk_score ?? 0)} max={100} showValue={false} threshold={{ warning: 0.25, danger: 0.6 }} />
      ),
    },
    {
      key: "flags",
      header: "Open flags",
      numeric: true,
      render: (c) => (c.open_flags ?? 0) > 0 ? (
        <Link href={`/flags?centre=${c.id}`} className="font-medium text-warning hover:underline" onClick={(e) => e.stopPropagation()}>
          {c.open_flags}
        </Link>
      ) : (
        <span className="text-muted-foreground">0</span>
      ),
    },
    {
      key: "cameras",
      header: "Cameras",
      render: (c) => (
        <span className="tabular text-xs text-muted-foreground">
          <span className="text-success">{c.cameras?.online ?? 0}</span>
          <span className="mx-0.5">/</span>
          <span>{c.cameras?.offline ?? 0}</span>
          <span className="mx-0.5">off</span>
          {c.cameras?.tampered ? <span className="ml-1 text-danger">{c.cameras.tampered} tampered</span> : null}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Centres"
        description="Every approved centre with its live status, risk score and camera health."
        action={
          <>
            <div className="flex rounded-lg border">
              <Button
                variant={view === "table" ? "secondary" : "ghost"}
                size="icon" className="h-8 w-8"
                onClick={() => setView("table")}
                aria-label="Table view"
                aria-pressed={view === "table"}
              >
                <Table2 className="h-4 w-4" aria-hidden />
              </Button>
              <Button
                variant={view === "grid" ? "secondary" : "ghost"}
                size="icon" className="h-8 w-8"
                onClick={() => setView("grid")}
                aria-label="Grid view"
                aria-pressed={view === "grid"}
              >
                <LayoutGrid className="h-4 w-4" aria-hidden />
              </Button>
            </div>
            {isSuperAdmin && (
              <Button onClick={() => router.push("/centres/new")}>
                <Plus className="mr-1.5 h-4 w-4" aria-hidden />
                New centre
              </Button>
            )}
          </>
        }
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search code or name…"
              className="w-56 pl-9"
              aria-label="Search centres"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-44" aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="live">Live</SelectItem>
                <SelectItem value="pending_setup">Setting up</SelectItem>
                <SelectItem value="awaiting_camera_approval">Awaiting camera approval</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="terminated">Terminated</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">District</Label>
            <Select value={district} onValueChange={setDistrict}>
              <SelectTrigger className="w-40" aria-label="Filter by district">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All districts</SelectItem>
                {districts.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Scheme</Label>
            <Select value={scheme} onValueChange={setScheme}>
              <SelectTrigger className="w-44" aria-label="Filter by scheme">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All schemes</SelectItem>
                {(labelsQ.data?.schemes ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Risk</Label>
            <Select value={risk} onValueChange={setRisk}>
              <SelectTrigger className="w-40" aria-label="Filter by risk">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RISK_RANGES.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {filtersActive && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Clear filters
            </Button>
          )}

          <span className="ml-auto tabular text-sm text-muted-foreground">
            {rows.length} of {centresQ.data?.length ?? 0}
          </span>
        </div>
      </PageHeader>

      {view === "table" ? (
        <DataTable
          caption="Centres"
          columns={columns}
          rows={rows}
          getRowId={(c) => c.id}
          loading={centresQ.isLoading}
          error={centresQ.error}
          onRetry={() => centresQ.refetch()}
          onRowClick={(c) => router.push(`/centres/${c.id}`)}
          empty={
            filtersActive ? (
              <EmptyState
                icon={Search}
                title="No centres match these filters"
                hint="Try clearing one of the filters above."
                action={
                  <Button variant="secondary" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={Building2}
                title="No centres yet"
                hint="Approved applications create centre records that appear here."
              />
            )
          }
        />
      ) : (
        <div>
          {centresQ.isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-44 animate-pulse rounded-lg bg-surface-2" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <Card>
              <CardContent>
                {filtersActive ? (
                  <EmptyState
                    icon={Search}
                    title="No centres match these filters"
                    hint="Try clearing one of the filters above."
                    action={
                      <Button variant="secondary" size="sm" onClick={clearFilters}>
                        Clear filters
                      </Button>
                    }
                  />
                ) : (
                  <EmptyState
                    icon={Building2}
                    title="No centres yet"
                    hint="Approved applications create centre records that appear here."
                  />
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((c) => (
                <Link key={c.id} href={`/centres/${c.id}`}>
                  <Card className="card-hover h-full">
                    <CardContent className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{c.name}</p>
                          <p className="font-mono text-xs text-muted-foreground">{c.code} · {c.district}</p>
                        </div>
                        <CentreStatusChip status={c.status} />
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Risk</span>
                          <span className="tabular font-medium">{fmtPct(c.risk_score ?? 0)}</span>
                        </div>
                        <Meter value={Math.round(c.risk_score ?? 0)} max={100} showValue={false} threshold={{ warning: 0.25, danger: 0.6 }} />
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{c.open_flags ?? 0} open flags</span>
                        <span className="tabular">
                          <span className="text-success">{c.cameras?.online ?? 0}</span>
                          <span className="mx-0.5">/</span>
                          {c.cameras ? c.cameras.online + c.cameras.offline + c.cameras.tampered : 0} cameras
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
