"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Ban, CalendarDays, ChevronLeft, ChevronRight, Inbox, Radio, Search, X } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDate, fmtDuration, formatTimeOnly } from "@/lib/format";
import { isYmd, shiftDay, todayIST } from "@/lib/calendar";
import { SESSION_KIND, sessionDisplayStatus } from "@/lib/constants";
import { useDebounced } from "@/hooks/useDebounced";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { SessionStatusChip } from "@/components/shared/StatusChip";
import { SessionDrawer } from "@/components/shared/SessionDrawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Centre, SessionCounts, SessionListFeed, SessionRow } from "@/types";

const STATUS_FILTERS = [
  { key: "scheduled", label: "Scheduled", api: "scheduled" },
  { key: "running", label: "Running", api: "running" },
  { key: "held", label: "Held", api: "closed" },
  { key: "missed", label: "Not held", api: "missed" },
  { key: "cancelled", label: "Cancelled", api: "cancelled" },
] as const;

function LateStartCell({ s }: { s: SessionRow }) {
  const late = s.late_start_s != null && s.late_start_s > 300;
  if (s.status === "missed" || !s.actual_start_ts) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <span
      className={cn(
        "tabular inline-flex h-5 items-center rounded-full border px-1.5 text-[11px] font-medium",
        late ? "border-warning/30 bg-warning/10 text-warning" : "border-border bg-surface text-muted-foreground"
      )}
    >
      {late ? `+${Math.round(s.late_start_s! / 60)} min` : "On time"}
    </span>
  );
}

function MonitoredCell({ s }: { s: SessionRow }) {
  if (s.monitored_s == null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const pct = s.coverage_pct ?? 0;
  return (
    <span className="flex flex-col gap-1">
      <span className="tabular text-sm">{fmtDuration(s.monitored_s)}</span>
      <span className="relative block h-1 w-16 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <span
          className={cn("block h-full rounded-full", pct >= 90 ? "bg-success" : pct >= 60 ? "bg-warning" : "bg-danger")}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </span>
      <span className="tabular text-[11px] text-muted-foreground">{pct}%</span>
    </span>
  );
}

export default function SessionsPage() {
  const router = useRouter();
  const today = todayIST();
  const [date, setDate] = React.useState(today);
  const [status, setStatus] = React.useState<string>("all");
  const [district, setDistrict] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [openSession, setOpenSession] = React.useState<string | null>(null);
  const debouncedQ = useDebounced(q, 200);

  React.useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const d = p.get("date");
    const s = p.get("session");
    if (d && isYmd(d)) setDate(d);
    if (s) setOpenSession(s);
  }, []);

  const centresQ = useQuery({
    queryKey: ["centres", "list"],
    queryFn: () => api<Centre[]>("/centres"),
    staleTime: 60_000,
  });
  const districts = React.useMemo(
    () => Array.from(new Set((centresQ.data ?? []).map((c) => c.district))).sort(),
    [centresQ.data]
  );

  const params = React.useMemo(() => {
    const p = new URLSearchParams({ date, limit: "25" });
    if (status !== "all") {
      const f = STATUS_FILTERS.find((x) => x.key === status);
      if (f) p.set("status", f.api);
    }
    if (district !== "all") p.set("district", district);
    if (debouncedQ.trim()) p.set("q", debouncedQ.trim());
    return p.toString();
  }, [date, status, district, debouncedQ]);

  const sessionsQ = useInfiniteQuery({
    queryKey: ["sessions", "board", params],
    queryFn: ({ pageParam }) =>
      api<SessionListFeed>(`/sessions?${params}${pageParam ? `&cursor=${pageParam}` : ""}`),
    initialPageParam: "",
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    refetchInterval: date === today ? 15_000 : false,
    refetchIntervalInBackground: false,
    staleTime: 10_000,
  });

  const rows = React.useMemo(() => (sessionsQ.data?.pages ?? []).flatMap((p) => p.items), [sessionsQ.data]);
  const counts: SessionCounts | undefined = sessionsQ.data?.pages[0]?.counts;
  const filtersActive = status !== "all" || district !== "all" || !!debouncedQ.trim();

  const clearFilters = () => {
    setStatus("all");
    setDistrict("all");
    setQ("");
  };

  const openDrawer = (row: SessionRow) => {
    setOpenSession(row.id);
    const p = new URLSearchParams({ date });
    p.set("session", row.id);
    router.replace(`/sessions?${p.toString()}`, { scroll: false });
  };

  const closeDrawer = () => {
    setOpenSession(null);
    const p = new URLSearchParams({ date });
    router.replace(`/sessions${p.toString() ? `?${p.toString()}` : ""}`, { scroll: false });
  };

  const changeDate = (d: string) => {
    setDate(d);
    const p = new URLSearchParams({ date: d });
    router.replace(`/sessions?${p.toString()}`, { scroll: false });
  };

  const columns: DataTableColumn<SessionRow>[] = [
    {
      key: "centre",
      header: "Centre",
      render: (s) => (
        <span>
          <span className="font-medium">{s.centre_name ?? "—"}</span>
          <span className="ml-1.5 font-mono text-xs text-muted-foreground">{s.centre_code}</span>
        </span>
      ),
    },
    {
      key: "session",
      header: "Session",
      render: (s) => (
        <span className="flex flex-col gap-0.5">
          <span className={cn("flex items-center gap-1.5 text-sm font-medium", s.status === "cancelled" && "line-through")}>
            {s.status === "cancelled" && <Ban className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />}
            {s.label ?? "Session"}
          </span>
          <span className="flex flex-wrap items-center gap-1">
            {s.kind && (
              <Badge variant="secondary" className="h-4 font-mono text-[10px]">
                {SESSION_KIND[s.kind] ?? s.kind}
              </Badge>
            )}
            {s.batch && <span className="text-[11px] text-muted-foreground">Batch {s.batch}</span>}
          </span>
          {s.status === "missed" && (
            <span className="text-[11px] text-muted-foreground">No camera data</span>
          )}
          {s.status === "cancelled" && s.cancel_reason && (
            <span className="text-[11px] text-muted-foreground">{s.cancel_reason}</span>
          )}
        </span>
      ),
    },
    {
      key: "scheduled",
      header: "Scheduled",
      render: (s) => (
        <span className="tabular font-mono text-xs text-muted-foreground">
          {formatTimeOnly(s.start_ts)} – {formatTimeOnly(s.end_ts)}
        </span>
      ),
    },
    { key: "status", header: "Status", render: (s) => <SessionStatusChip status={sessionDisplayStatus(s.status, s.actual_start_ts)} lineThrough /> },
    {
      key: "started",
      header: "Started",
      render: (s) =>
        s.actual_start_ts ? (
          <span className="tabular font-mono text-xs text-muted-foreground">{formatTimeOnly(s.actual_start_ts)}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      key: "ended",
      header: "Ended",
      render: (s) =>
        s.actual_end_ts ? (
          <span className="tabular font-mono text-xs text-muted-foreground">{formatTimeOnly(s.actual_end_ts)}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    { key: "monitored", header: "Monitored", render: (s) => <MonitoredCell s={s} /> },
    { key: "late", header: "Late start", render: (s) => <LateStartCell s={s} /> },
    {
      key: "claimed",
      header: "Claimed / counted",
      numeric: true,
      render: (s) => (
        <span className="tabular">
          {s.claimed ?? "—"} / {s.observed ?? "—"}
        </span>
      ),
    },
  ];

  const emptyState = filtersActive ? (
    <EmptyState
      icon={Search}
      title="No sessions match these filters"
      hint="Try clearing one of the filters above."
      action={
        <Button variant="secondary" size="sm" onClick={clearFilters}>
          Clear filters
        </Button>
      }
    />
  ) : (
    <EmptyState
      icon={Inbox}
      title="No sessions on this date."
      hint="Sessions appear here once the centre publishes its schedule."
      action={
        <Button variant="secondary" size="sm" onClick={() => changeDate(today)}>
          Go to today
        </Button>
      }
    />
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sessions"
        description="Which sessions were scheduled, which were held, and for how long?"
        action={
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => changeDate(shiftDay(date, -1))}
              aria-label="Previous day"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </Button>
            <Input
              type="date"
              value={date}
              onChange={(e) => e.target.value && changeDate(e.target.value)}
              className="w-40 tabular font-mono text-sm"
              aria-label="Session date"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => changeDate(shiftDay(date, 1))}
              aria-label="Next day"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
            <Button variant="secondary" size="sm" onClick={() => changeDate(today)} disabled={date === today}>
              Today
            </Button>
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setStatus("all")}
            aria-pressed={status === "all"}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors",
              status === "all"
                ? "border-primary bg-accent-soft text-primary"
                : "border-border bg-card text-muted-foreground hover:border-border-strong hover:text-foreground"
            )}
          >
            All
            <span className="tabular font-semibold">
              {counts
                ? counts.scheduled + counts.running + counts.held + counts.missed + counts.cancelled
                : "—"}
            </span>
          </button>
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setStatus(status === f.key ? "all" : f.key)}
              aria-pressed={status === f.key}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors",
                status === f.key
                  ? "border-primary bg-accent-soft text-primary"
                  : "border-border bg-card text-muted-foreground hover:border-border-strong hover:text-foreground"
              )}
            >
              {f.key === "running" && (
                <span className="h-1.5 w-1.5 rounded-full bg-success live-dot" aria-hidden />
              )}
              {f.label}
              <span className="tabular font-semibold">{counts?.[f.key as keyof SessionCounts] ?? 0}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">District</Label>
            <Select value={district} onValueChange={setDistrict}>
              <SelectTrigger className="w-40" aria-label="Filter district">
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
            <Label htmlFor="sessions-q" className="text-xs text-muted-foreground">
              Search
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                id="sessions-q"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Centre or session label…"
                className="w-56 pl-9"
                aria-label="Search sessions"
              />
            </div>
          </div>

          {filtersActive && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Clear filters
            </Button>
          )}

          <span className="ml-auto flex items-center gap-1.5 tabular text-sm text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden />
            {fmtDate(date)}
            {date === today && (
              <span className="inline-flex items-center gap-1 text-xs">
                <Radio className="h-3 w-3 text-success" aria-hidden />
                refreshes every 15 s
              </span>
            )}
          </span>
        </div>
      </PageHeader>

      <DataTable
        caption="Sessions for the selected date"
        columns={columns}
        rows={rows}
        getRowId={(s) => s.id}
        onRowClick={openDrawer}
        loading={sessionsQ.isLoading}
        error={sessionsQ.error}
        onRetry={() => sessionsQ.refetch()}
        skeletonRows={8}
        empty={emptyState}
        nextCursor={sessionsQ.hasNextPage ? (sessionsQ.data?.pages.at(-1)?.next_cursor ?? null) : null}
        loadingMore={sessionsQ.isFetchingNextPage}
        onLoadMore={() => sessionsQ.fetchNextPage()}
      />

      {openSession && <SessionDrawer sessionId={openSession} onClose={closeDrawer} />}
    </div>
  );
}
