"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Camera, LayoutGrid, Radio, Search, Table2, Users, X } from "lucide-react";
import { api } from "@/lib/api";
import { fmtIST, fmtNum, formatTimeOnly, timeAgo } from "@/lib/format";
import { ITEM_LABEL, LIVE_STATE, PEOPLE_VERDICT_LABEL } from "@/lib/constants";
import { useCountUp } from "@/lib/motion";
import { gsap, useGSAP, motionOk, DUR, EASE } from "@/lib/gsap";
import { cn } from "@/lib/utils";
import { useDebounced } from "@/hooks/useDebounced";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { LiveStateChip, LIVE_STATE_ICON } from "@/components/shared/StatusChip";
import { LiveElapsedLabel } from "@/components/shared/ElapsedTimer";
import { Sparkline } from "@/components/shared/Sparkline";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { LiveFeed, LiveState, LiveStatus } from "@/types";

const STATES: LiveState[] = ["live", "idle", "offline", "tampered", "provisional", "error"];
const COUNT_LABEL: Record<LiveState, string> = {
  live: "Live",
  idle: "Idle",
  offline: "Offline",
  tampered: "Camera problem",
  provisional: "Setup pending",
  error: "Detector error",
};
const MAX_ITEM_CHIPS = 4;
const SCREEN_CLASSES = new Set(["monitor", "laptop"]);

const stateLabel = (s: string) => (s in LIVE_STATE ? LIVE_STATE[s as LiveState].label : s);

const itemLabel = (cls: string) => ITEM_LABEL[cls] ?? cls.replace(/(^|\s)\S/g, (c) => c.toUpperCase());

/** 4 px usage bar: success >= 90 %, warning 60–89 %, danger < 60 % of present items in use. */
function UsageBar({ inUse, present }: { inUse: number; present: number }) {
  const pct = present > 0 ? (inUse / present) * 100 : 0;
  return (
    <span className="relative block h-1 w-full overflow-hidden rounded-full bg-surface-2" aria-hidden>
      <span
        className={cn("block h-full rounded-full", pct >= 90 ? "bg-success" : pct >= 60 ? "bg-warning" : "bg-danger")}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </span>
  );
}

function EquipmentMiniTile({ cls, v }: { cls: string; v: { present: number; in_use: number; idle: number; off: number } }) {
  const verb = SCREEN_CLASSES.has(cls) ? "on" : "in use";
  return (
    <span className="flex min-w-0 flex-col gap-1 rounded-lg border bg-surface p-2">
      <span className="flex items-center justify-between gap-1">
        <span className="truncate text-xs font-medium">{itemLabel(cls)}</span>
        {v.off > 0 && (
          <span className="tabular shrink-0 rounded-full border border-warning/30 bg-warning/10 px-1 text-[10px] font-medium text-warning">
            {v.off} off
          </span>
        )}
      </span>
      <span className="tabular text-xs text-muted-foreground">
        {v.in_use} / {v.present} {verb}
      </span>
      <UsageBar inUse={v.in_use} present={v.present} />
    </span>
  );
}

function LiveDataCard({ room, fetchedAt }: { room: LiveStatus; fetchedAt: number }) {
  const peopleRef = useCountUp(room.people ?? 0);
  const live = room.state === "live";
  const idle = room.state === "idle";
  const offline = room.state === "offline";
  const items = Object.entries(room.items ?? {}).filter(([cls, v]) => cls !== "person" && v.present > 0);
  const visible = items.slice(0, MAX_ITEM_CHIPS);
  const extra = items.slice(MAX_ITEM_CHIPS);
  const badQuality = room.quality && !room.quality.ok && (room.quality.reasons?.length ?? 0) > 0;
  const started = room.session?.actual_start_ts ?? room.run_started_at ?? null;
  const claimedDelta = room.claimed != null && room.people != null ? room.claimed - room.people : null;
  const cs = room.compliance_summary;

  return (
    <Card className="card-hover relative h-full overflow-hidden">
      <CardContent className="space-y-3 p-4">
        {/* Row 1: state chip + camera · right: elapsed / last seen / waiting */}
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2">
            <LiveStateChip state={room.state} className="shrink-0" />
            <span className="truncate text-xs text-muted-foreground">{room.camera_name}</span>
          </span>
          {live ? (
            <LiveElapsedLabel
              serverSeconds={room.elapsed_s}
              fetchedAt={fetchedAt}
              className="shrink-0 text-xs text-muted-foreground"
            />
          ) : offline ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="shrink-0 text-xs text-muted-foreground">Last seen {timeAgo(room.ts)}</span>
                </TooltipTrigger>
                <TooltipContent>{fmtIST(room.ts)}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : idle ? (
            <span className="shrink-0 text-xs text-muted-foreground">Waiting for session</span>
          ) : (
            <span className="shrink-0 text-xs text-muted-foreground">{stateLabel(room.state)}</span>
          )}
        </div>

        {/* Row 2: People number + sparkline */}
        <div className="flex items-end justify-between gap-2">
          <span className="flex items-baseline gap-1.5">
            <span
              ref={peopleRef as React.RefObject<HTMLSpanElement>}
              className="tabular text-[36px] font-semibold leading-9"
            />
            <span className="text-xs text-muted-foreground">people</span>
          </span>
          {room.spark?.length > 1 && <Sparkline data={room.spark} className="h-8 w-24 shrink-0" />}
        </div>

        {/* Row 2b: compliance verdict chip */}
        {cs && (
          <p
            className={cn(
              "inline-flex h-6 w-fit items-center rounded-full border px-2 text-xs font-medium",
              cs.verdict === "match"
                ? "border-success/40 bg-success/10 text-success"
                : cs.verdict === "waiting"
                  ? "border-warning/40 bg-warning/10 text-warning"
                  : cs.verdict === "unclaimed" || cs.verdict === "unverifiable" || cs.verdict === "unregistered"
                    ? "border-info/40 bg-info/10 text-info"
                    : "border-danger/40 bg-danger/10 text-danger"
            )}
            title={cs.headline}
          >
            Claimed {fmtNum(room.claimed ?? 0)} / Counted {fmtNum(room.people ?? 0)} -{" "}
            {PEOPLE_VERDICT_LABEL[cs.verdict ?? "waiting"] ?? cs.headline}
          </p>
        )}

        {/* Row 3: claimed vs counted two-bar */}
        {room.claimed != null && (
          <div className="space-y-1">
            <p className="tabular text-sm">
              <span className="text-muted-foreground">Claimed </span>
              <span className="font-semibold">{fmtNum(room.claimed)}</span>
              <span className="text-muted-foreground"> / Camera counted </span>
              <span className="font-semibold">{fmtNum(room.people ?? 0)}</span>
            </p>
            <div className="flex h-1 gap-0.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
              <span
                className="h-full bg-primary"
                style={{
                  width: `${(() => {
                    const max = Math.max(room.claimed ?? 0, room.people ?? 0, 1);
                    return Math.round(((room.claimed ?? 0) / max) * 100);
                  })()}%`,
                }}
              />
              <span
                className="h-full bg-foreground"
                style={{
                  width: `${(() => {
                    const max = Math.max(room.claimed ?? 0, room.people ?? 0, 1);
                    return Math.round(((room.people ?? 0) / max) * 100);
                  })()}%`,
                }}
              />
            </div>
            {claimedDelta != null && claimedDelta !== 0 && (
              <p className="text-xs text-muted-foreground">
                {fmtNum(Math.abs(claimedDelta))} {claimedDelta > 0 ? "fewer" : "more"} than claimed
              </p>
            )}
          </div>
        )}

        {/* Row 4: equipment mini-tiles */}
        {items.length > 0 && (
          <div className="grid grid-cols-2 gap-1.5">
            {visible.map(([cls, v]) => (
              <EquipmentMiniTile key={cls} cls={cls} v={v} />
            ))}
            {extra.length > 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="tabular flex min-h-[60px] items-center justify-center rounded-lg border border-dashed bg-surface text-xs text-muted-foreground hover:border-border-strong"
                  >
                    +{extra.length}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-56 space-y-1.5">
                  <p className="text-xs font-medium">More equipment</p>
                  {extra.map(([cls, v]) => (
                    <p key={cls} className="tabular flex justify-between text-xs text-muted-foreground">
                      <span>{itemLabel(cls)}</span>
                      <span>
                        {v.in_use} / {v.present} {SCREEN_CLASSES.has(cls) ? "on" : "in use"}
                      </span>
                    </p>
                  ))}
                </PopoverContent>
              </Popover>
            )}
          </div>
        )}

        {badQuality && (
          <p className="flex items-start gap-1.5 text-xs text-warning">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">{room.quality?.reasons.join(" · ")}</span>
          </p>
        )}

        {/* Footer */}
        <div className="space-y-0.5 border-t pt-3">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs font-medium">{room.centre_name}</span>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">{room.centre_code}</span>
          </div>
          <p className="tabular truncate text-xs text-muted-foreground">
            {room.session ? room.session.label : "No active session"}
            {started && ` · Started ${formatTimeOnly(started)}`}
          </p>
        </div>
      </CardContent>

      <Link
        href={`/centres/${room.centre_id}?tab=live`}
        className="absolute inset-0 z-20"
        aria-label={`Open ${room.centre_name} live tab`}
      />
    </Card>
  );
}

function CardGridSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-4 w-28" />
          </div>
          <div className="flex items-end justify-between">
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-8 w-24" />
          </div>
          <Skeleton className="h-6 w-2/3" />
          <div className="grid grid-cols-2 gap-1.5">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
          <Skeleton className="h-4 w-full" />
        </div>
      ))}
    </div>
  );
}

export default function LivePage() {
  const router = useRouter();
  const [view, setView] = React.useState<"grid" | "table">("grid");
  const [district, setDistrict] = React.useState("");
  const [q, setQ] = React.useState("");
  const [state, setState] = React.useState<LiveState | null>(null);
  const debouncedDistrict = useDebounced(district, 200);
  const debouncedQ = useDebounced(q, 200);
  const gridRef = React.useRef<HTMLDivElement>(null);
  const firstReady = React.useRef(true);

  const params = React.useMemo(() => {
    const p = new URLSearchParams({ limit: "60" });
    const d = debouncedDistrict.trim();
    const s = debouncedQ.trim();
    if (d) p.set("district", d);
    if (s) p.set("q", s);
    if (state) p.set("state", state);
    return p.toString();
  }, [debouncedDistrict, debouncedQ, state]);

  const liveQ = useQuery({
    queryKey: ["live", "wall", params],
    queryFn: () => api<LiveFeed>(`/live?${params}`),
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
    staleTime: 5000,
  });

  useGSAP(
    () => {
      if (!gridRef.current || !liveQ.data || !firstReady.current) return;
      firstReady.current = false;
      if (!motionOk()) return;
      const cards = Array.from(gridRef.current.children).slice(0, 12);
      gsap.fromTo(
        cards,
        { opacity: 0, y: 8 },
        { opacity: 1, y: 0, duration: DUR.base, stagger: 0.035, ease: EASE.out, clearProps: "opacity,transform" }
      );
    },
    { scope: gridRef, dependencies: [liveQ.data] }
  );

  const counts = liveQ.data?.counts;
  const rows = React.useMemo(
    () => (liveQ.data?.items ?? []).filter((r) => !state || r.state === state),
    [liveQ.data, state]
  );

  const filtersActive = !!debouncedDistrict.trim() || !!debouncedQ.trim() || !!state;

  const clearFilters = () => {
    setDistrict("");
    setQ("");
    setState(null);
  };

  const columns: DataTableColumn<LiveStatus>[] = [
    {
      key: "centre",
      header: "Centre",
      render: (r) => (
        <span>
          <span className="font-medium">{r.centre_name}</span>
          <span className="ml-1.5 font-mono text-xs text-muted-foreground">{r.centre_code}</span>
        </span>
      ),
    },
    { key: "camera", header: "Camera", render: (r) => r.camera_name },
    { key: "state", header: "State", render: (r) => <LiveStateChip state={r.state} /> },
    {
      key: "session",
      header: "Session",
      render: (r) => <span className="text-muted-foreground">{r.session?.label ?? "—"}</span>,
    },
    {
      key: "started",
      header: "Started",
      render: (r) => {
        const started = r.session?.actual_start_ts ?? r.run_started_at;
        return started ? (
          <span className="tabular font-mono text-xs text-muted-foreground">{formatTimeOnly(started)}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        );
      },
    },
    {
      key: "elapsed",
      header: "Elapsed",
      render: (r) =>
        r.state === "live" && r.elapsed_s != null ? (
              <LiveElapsedLabel serverSeconds={r.elapsed_s} fetchedAt={liveQ.dataUpdatedAt} className="text-xs" />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    { key: "people", header: "People", numeric: true, render: (r) => fmtNum(r.people ?? 0) },
    {
      key: "claimed",
      header: "Claimed",
      numeric: true,
      render: (r) =>
        r.claimed == null ? <span className="text-muted-foreground">—</span> : fmtNum(r.claimed),
    },
    {
      key: "items",
      header: "Items in use",
      render: (r) => {
        const used = Object.entries(r.items ?? {})
          .filter(([cls, v]) => cls !== "person" && v.present > 0)
          .map(([cls, v]) => `${itemLabel(cls)} ${v.in_use}`)
          .join(" · ");
        return (
          <span className="block max-w-56 truncate text-muted-foreground">{used || "—"}</span>
        );
      },
    },
    {
      key: "age",
      header: "Age",
      render: (r) => <span className="tabular text-muted-foreground">{timeAgo(r.ts)}</span>,
    },
  ];

  const emptyState = filtersActive ? (
    <EmptyState
      icon={Search}
      title="No rooms match these filters"
      hint="Try clearing one of the filters above."
      action={
        <Button variant="secondary" size="sm" onClick={clearFilters}>
          Clear filters
        </Button>
      }
    />
  ) : (
    <EmptyState
      icon={Radio}
      title="No rooms are being monitored right now."
      hint="Rooms appear here when a centre starts monitoring during a session."
    />
  );

  if (liveQ.error && !liveQ.data) {
    return (
      <div className="rounded-lg border bg-card">
        <ErrorState onRetry={() => liveQ.refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Live rooms"
        description="What is happening in every room right now?"
        action={
          <div className="flex rounded-lg border">
            <Button
              variant={view === "grid" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8"
              onClick={() => setView("grid")}
              aria-label="Grid view"
              aria-pressed={view === "grid"}
            >
              <LayoutGrid className="h-4 w-4" aria-hidden />
            </Button>
            <Button
              variant={view === "table" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8"
              onClick={() => setView("table")}
              aria-label="Table view"
              aria-pressed={view === "table"}
            >
              <Table2 className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          {STATES.map((s) => {
            const Icon = LIVE_STATE_ICON[s];
            const active = state === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setState(active ? null : s)}
                aria-pressed={active}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors",
                  active
                    ? "border-primary bg-accent-soft text-primary"
                    : "border-border bg-card text-muted-foreground hover:border-border-strong hover:text-foreground"
                )}
              >
                {s === "live" && (
                  <span className="h-1.5 w-1.5 rounded-full bg-success live-dot" aria-hidden />
                )}
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {COUNT_LABEL[s]}
                <span className="tabular font-semibold">{fmtNum(counts?.[s] ?? 0)}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="live-district" className="text-xs text-muted-foreground">
              District
            </Label>
            <Input
              id="live-district"
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              placeholder="District…"
              className="w-44"
              aria-label="Filter by district"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="live-q" className="text-xs text-muted-foreground">
              Search
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                id="live-q"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Centre name or code…"
                className="w-56 pl-9"
                aria-label="Search rooms"
              />
            </div>
          </div>

          {filtersActive && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Clear filters
            </Button>
          )}

          <span className="ml-auto tabular text-sm text-muted-foreground">
            {rows.length} of {liveQ.data?.items.length ?? 0} rooms
          </span>
        </div>
      </PageHeader>

      {liveQ.isLoading ? (
        <CardGridSkeleton />
      ) : rows.length === 0 ? (
        <Card>
          <CardContent>{emptyState}</CardContent>
        </Card>
      ) : view === "grid" ? (
        <div
          ref={gridRef as React.RefObject<HTMLDivElement>}
          className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
        >
          {rows.map((room) => (
            <LiveDataCard key={room.camera_id} room={room} fetchedAt={liveQ.dataUpdatedAt} />
          ))}
        </div>
      ) : (
        <DataTable
          caption="Live rooms"
          columns={columns}
          rows={rows}
          getRowId={(r) => r.camera_id}
          onRowClick={(r) => router.push(`/centres/${r.centre_id}?tab=live`)}
          skeletonRows={8}
          empty={emptyState}
        />
      )}

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Camera className="h-3.5 w-3.5" aria-hidden />
        <Users className="h-3.5 w-3.5" aria-hidden />
        Cameras count people anonymously. Trainee faces are never identified.
        <span className="ml-auto">Refreshes every 5 s</span>
      </p>
    </div>
  );
}
