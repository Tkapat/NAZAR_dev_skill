"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Building2, Flag as FlagIcon, FileText, Camera, AlertTriangle, Inbox, Radio } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDate, fmtIST, fmtNum, timeAgo } from "@/lib/format";
import { ITEM_LABEL, SEVERITY, type Severity } from "@/lib/constants";
import { useCountUp, useStaggerIn } from "@/lib/motion";
import { PageHeader } from "@/components/shared/PageHeader";
import { CurrentDateIST } from "@/components/shared/CurrentDateIST";
import { KpiCard, KpiRowSkeleton } from "@/components/shared/KpiCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { SeverityDot, CentreStatusChip, LiveStateChip } from "@/components/shared/StatusChip";
import { LiveElapsedLabel } from "@/components/shared/ElapsedTimer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Meter } from "@/components/ui/meter";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { todayIST } from "@/lib/calendar";
import { cn } from "@/lib/utils";
import type { Application, Camera as CameraT, Centre, Flag, LiveFeed, LiveStatus, SessionCounts, SessionListFeed } from "@/types";

const MapComponent = dynamic(() => import("./MapComponent"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

const SEV_COLORS: Record<Severity, string> = {
  low: "var(--sev-low)",
  medium: "var(--sev-medium)",
  high: "var(--sev-high)",
  critical: "var(--sev-critical)",
};

function useHistory(key: string, value: number): number[] {
  const [store, setStore] = React.useState<Record<string, number[]>>({});
  const arr = store[key] ?? [];
  if (arr.length === 0 || arr[arr.length - 1] !== value) {
    // sanctioned render-phase state adjustment (docs: you might not need an effect)
    setStore((s) => {
      const next = [...(s[key] ?? []), value];
      if (next.length > 14) next.shift();
      return { ...s, [key]: next };
    });
  }
  return arr.length ? arr : [value];
}

function KpiRow({ values, hrefs, loading }: { values: { eyebrow: string; value: number }[]; hrefs: string[]; loading: boolean }) {
  const ref = useStaggerIn();
  return (
    <div ref={ref as React.RefObject<HTMLDivElement>} className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      {values.map((k, i) => (
        <KpiWithHistory key={k.eyebrow} eyebrow={k.eyebrow} value={k.value} href={hrefs[i]} loading={loading} />
      ))}
    </div>
  );
}

function KpiWithHistory({ eyebrow, value, href, loading }: { eyebrow: string; value: number; href: string; loading: boolean }) {
  const history = useHistory(eyebrow, value);
  return <KpiCard eyebrow={eyebrow} value={value} href={href} sparkline={history} loading={loading} />;
}

function buildFlagBuckets(flags: Flag[]) {
  const days: { label: string; low: number; medium: number; high: number; critical: number; total: number }[] = [];
  const now = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push({ label: fmtDate(d).slice(0, 6), low: 0, medium: 0, high: 0, critical: 0, total: 0 });
  }
  const start = new Date(now);
  start.setDate(start.getDate() - 13);
  start.setHours(0, 0, 0, 0);

  for (const f of flags) {
    const t = new Date(f.created_at);
    if (t < start) continue;
    const idx = days.length - 1 - Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime()) / 86400000);
    if (idx < 0 || idx >= days.length) continue;
    const sev = (f.severity ?? "low") as Severity;
    days[idx][sev] += 1;
    days[idx].total += 1;
  }
  return days;
}

const SCREEN_CLASSES = new Set(["monitor", "laptop"]);

function equipmentPhrase(room: LiveStatus): string | null {
  const entries = Object.entries(room.items ?? {}).filter(([cls, v]) => cls !== "person" && v.present > 0);
  if (!entries.length) return null;
  const [cls, v] = entries[0];
  const label = (ITEM_LABEL[cls] ?? cls) + (v.present === 1 ? "" : cls === "chair" ? "s" : "");
  const verb = SCREEN_CLASSES.has(cls) ? "on" : "in use";
  return `${v.in_use} of ${v.present} ${label} ${verb}`;
}

function LiveRoomRow({ room, fetchedAt }: { room: LiveStatus; fetchedAt: number }) {
  const peopleRef = useCountUp(room.people ?? 0);
  const live = room.state === "live";
  const phrase = equipmentPhrase(room);

  return (
    <Link
      href={`/centres/${room.centre_id}?tab=live`}
      className="flex items-center gap-3 rounded-lg p-2 -mx-2 hover:bg-surface-hover"
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{room.centre_name}</span>
          <span className="shrink-0 font-mono text-xs text-muted-foreground">{room.centre_code}</span>
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span className="inline-flex items-baseline gap-1">
            <span ref={peopleRef as React.RefObject<HTMLSpanElement>} className="tabular text-base font-semibold text-foreground" />
            <span>people</span>
          </span>
          {phrase && <span className="tabular">{phrase}</span>}
          {live ? (
            <LiveElapsedLabel
              serverSeconds={room.elapsed_s}
              fetchedAt={fetchedAt}
              className="text-[11px] text-muted-foreground"
            />
          ) : room.state === "offline" ? (
            <span>Last seen {timeAgo(room.ts)}</span>
          ) : (
            <span>Waiting for session</span>
          )}
        </span>
      </span>
      <LiveStateChip state={room.state} className="shrink-0" />
    </Link>
  );
}

function LiveRoomsCard() {
  const q = useQuery({
    queryKey: ["overview", "live-rooms"],
    queryFn: () => api<LiveFeed>("/live"),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    staleTime: 15_000,
  });
  const rooms = React.useMemo(
    () => (q.data?.items ?? []).filter((r) => r.state === "live").slice(0, 4),
    [q.data]
  );
  const liveTotal = q.data?.counts?.live ?? 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Live rooms now</CardTitle>
        <Link href="/live" className="text-xs font-medium text-primary hover:underline">
          Open Live wall
        </Link>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : rooms.length === 0 ? (
          <EmptyState
            icon={Radio}
            title="No rooms are live"
            hint={
              liveTotal === 0
                ? "Rooms appear here when a centre starts monitoring during a session."
                : "Live rooms will appear here shortly."
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {rooms.map((r) => (
              <li key={r.camera_id}>
                <LiveRoomRow room={r} fetchedAt={q.dataUpdatedAt} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function TodaySessionsCard() {
  const today = todayIST();
  const q = useQuery({
    queryKey: ["overview", "today-sessions", today],
    queryFn: () => api<SessionListFeed>(`/sessions?date=${today}&limit=1`),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    staleTime: 15_000,
  });
  const c: SessionCounts | undefined = q.data?.counts;
  const stats: { label: string; value: number; href: string }[] = [
    { label: "Running", value: c?.running ?? 0, href: "/sessions?status=running" },
    { label: "Held", value: c?.held ?? 0, href: "/sessions?status=held" },
    { label: "Missed", value: c?.missed ?? 0, href: "/sessions?status=missed" },
    { label: "Upcoming", value: c?.scheduled ?? 0, href: "/sessions?status=scheduled" },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Today&apos;s sessions</CardTitle>
        <Link href="/sessions" className="text-xs font-medium text-primary hover:underline">
          Open Sessions
        </Link>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {stats.map((s) => (
              <Link
                key={s.label}
                href={s.href}
                className="rounded-lg border bg-surface p-2.5 transition-colors hover:border-border-strong"
              >
                <p className="text-[11px] text-muted-foreground">{s.label}</p>
                <p className="tabular mt-0.5 text-xl font-semibold">{fmtNum(s.value)}</p>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const SEV_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function flagCategory(type: string): string {
  if (type.startsWith("A")) return "Attendance";
  if (type.startsWith("E")) return "Equipment";
  if (type.startsWith("C")) return "Camera";
  return "Sessions";
}

const CATEGORY_CHIP: Record<string, string> = {
  Attendance: "border-danger/30 bg-danger/10 text-danger",
  Equipment: "border-warning/30 bg-warning/10 text-warning",
  Camera: "border-info/30 bg-info/10 text-info",
  Sessions: "border-border bg-surface text-muted-foreground",
};

function ComplianceAlertsCard({ flags, centreById, loading }: { flags: Flag[]; centreById: Map<string, Centre>; loading: boolean }) {
  const todayFlags = React.useMemo(() => {
    return flags
      .filter((f) => fmtDate(f.created_at) === fmtDate(new Date()))
      .sort((a, b) => {
        const r = (SEV_RANK[a.severity] ?? 4) - (SEV_RANK[b.severity] ?? 4);
        if (r !== 0) return r;
        return Date.parse(b.created_at) - Date.parse(a.created_at);
      });
  }, [flags]);

  const counts: Record<string, number> = { Attendance: 0, Equipment: 0, Camera: 0, Sessions: 0 };
  for (const f of todayFlags) counts[flagCategory(f.type)] += 1;
  const shown = todayFlags.slice(0, 6);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Compliance alerts now</CardTitle>
        <Link href="/flags" className="text-xs font-medium text-primary hover:underline">
          View all flags
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(counts) as string[]).map((cat) => (
            <span
              key={cat}
              className={cn(
                "inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs font-medium",
                CATEGORY_CHIP[cat]
              )}
            >
              {cat}
              <span className="tabular font-semibold">{counts[cat]}</span>
            </span>
          ))}
        </div>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <EmptyState
            icon={FlagIcon}
            title="No open alerts today"
            hint="Open compliance flags raised today appear here, sorted by severity."
          />
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((f) => {
              const centre = centreById.get(f.centre_id);
              return (
                <li key={f.id}>
                  <Link href={`/flags/${f.id}`} className="flex items-start gap-2.5 py-2.5 hover:bg-surface-hover">
                    <SeverityDot severity={f.severity} withLabel={false} className="mt-1.5 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-medium">{f.type}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {centre ? `${centre.code} — ${centre.name}` : "—"}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">{f.reason}</span>
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(f.created_at)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default function OverviewPage() {
  const centresQ = useQuery({
    queryKey: ["centres", "all"],
    queryFn: () => api<Centre[]>("/centres?sort=risk"),
    refetchInterval: 15_000,
    staleTime: 15_000,
  });
  const openFlagsQ = useQuery({
    queryKey: ["flags", "open", "count"],
    queryFn: () => api<{ items: Flag[] }>("/flags?status=open&limit=100"),
    refetchInterval: 15_000,
    staleTime: 15_000,
  });
  const latestFlagsQ = useQuery({
    queryKey: ["flags", "latest"],
    queryFn: () => api<{ items: Flag[] }>("/flags?limit=10"),
    refetchInterval: 15_000,
    staleTime: 15_000,
  });
  const chartFlagsQ = useQuery({
    queryKey: ["flags", "chart14"],
    queryFn: () => api<{ items: Flag[] }>("/flags?limit=100"),
    refetchInterval: 15_000,
    staleTime: 15_000,
  });
  const offlineQ = useQuery({
    queryKey: ["cameras", "offline"],
    queryFn: () => api<{ items: CameraT[] }>("/cameras?status=offline&limit=100"),
    refetchInterval: 15_000,
    staleTime: 15_000,
  });
  const pendingQ = useQuery({
    queryKey: ["applications", "submitted"],
    queryFn: () => api<Application[]>("/applications?status=submitted"),
    refetchInterval: 15_000,
    staleTime: 15_000,
  });

  const isLoading =
    centresQ.isLoading || openFlagsQ.isLoading || latestFlagsQ.isLoading || offlineQ.isLoading || pendingQ.isLoading;
  const error = centresQ.error || openFlagsQ.error || latestFlagsQ.error || offlineQ.error || pendingQ.error;

  const centres = React.useMemo(() => centresQ.data ?? [], [centresQ.data]);
  const centreById = React.useMemo(() => new Map(centres.map((c) => [c.id, c])), [centres]);
  const openFlags = openFlagsQ.data?.items ?? [];
  const latestFlags = latestFlagsQ.data?.items ?? [];
  const chartFlags = React.useMemo(() => chartFlagsQ.data?.items ?? [], [chartFlagsQ.data]);

  const liveCentres = centres.filter((c) => c.status === "live").length;
  const openCount = openFlags.length;
  const highCritical = openFlags.filter((f) => f.severity === "high" || f.severity === "critical").length;
  const offlineCams = offlineQ.data?.items.length ?? 0;
  const pendingApps = pendingQ.data?.length ?? 0;

  const riskList = React.useMemo(
    () => [...centres].sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0)).slice(0, 8),
    [centres]
  );
  const mapCentres = centres;
  const buckets = React.useMemo(() => buildFlagBuckets(chartFlags), [chartFlags]);

  const retry = () => {
    centresQ.refetch();
    openFlagsQ.refetch();
    latestFlagsQ.refetch();
    chartFlagsQ.refetch();
    offlineQ.refetch();
    pendingQ.refetch();
  };

  if (error) {
    return (
      <div className="rounded-lg border bg-card">
        <ErrorState onRetry={retry} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description={
          <>
            Monitoring dashboard · <CurrentDateIST /> · refreshes every 15 s
          </>
        }
      />

      {isLoading ? (
        <KpiRowSkeleton />
      ) : (
        <KpiRow
          loading={false}
          hrefs={["/centres?status=live", "/flags?status=open", "/flags?severity=high", "/cameras?status=offline", "/applications?status=submitted"]}
          values={[
            { eyebrow: "Live centres", value: liveCentres },
            { eyebrow: "Open flags", value: openCount },
            { eyebrow: "High / Critical", value: highCritical },
            { eyebrow: "Cameras offline", value: offlineCams },
            { eyebrow: "Pending applications", value: pendingApps },
          ]}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Map */}
        <div className="space-y-4 lg:col-span-2">
          <Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle>Centre locations</CardTitle>
              <span className="text-xs text-muted-foreground">Green &lt; 25 · Amber 25–60 · Red &gt; 60 risk</span>
            </CardHeader>
            <CardContent className="h-96 p-0">
              {isLoading ? <Skeleton className="h-full w-full" /> : <MapComponent centres={mapCentres} />}
            </CardContent>
          </Card>
        </div>

        {/* Live rooms now (NO pictures) */}
        <LiveRoomsCard />

        {/* Today's sessions */}
        <TodaySessionsCard />

        {/* Compliance alerts now */}
        <ComplianceAlertsCard flags={openFlags} centreById={centreById} loading={isLoading} />

        {/* Latest flags */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Latest flags</CardTitle>
            <Link href="/flags" className="text-xs font-medium text-primary hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="space-y-1.5">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                ))}
              </div>
            ) : latestFlags.length === 0 ? (
              <EmptyState
                icon={FlagIcon}
                title="No flags yet"
                hint="Flags appear here when the camera disagrees with claimed data."
              />
            ) : (
              <ul className="divide-y divide-border">
                {latestFlags.map((f) => {
                  const centre = centreById.get(f.centre_id);
                  return (
                    <li key={f.id}>
                      <Link href={`/flags/${f.id}`} className="flex items-start gap-3 py-3 hover:bg-surface-hover">
                        <SeverityDot severity={f.severity} withLabel={false} className="mt-1.5" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="font-mono text-xs font-medium">{f.type}</span>
                            <span className="truncate text-sm text-muted-foreground">
                              {centre ? centre.code : "—"}
                            </span>
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {SEVERITY[(f.severity as Severity) ?? "low"]?.label} · {f.state === "uncertain" ? "Uncertain" : "Flagged"}
                          </span>
                        </span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(f.created_at)}</span>
                          </TooltipTrigger>
                          <TooltipContent>{fmtIST(f.created_at)}</TooltipContent>
                        </Tooltip>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Highest risk centres */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Highest risk centres</CardTitle>
            <Link href="/centres" className="text-xs font-medium text-primary hover:underline">
              All centres
            </Link>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)
            ) : riskList.length === 0 ? (
              <EmptyState icon={Building2} title="No centres yet" hint="Approved centres appear here with their risk score." />
            ) : (
              riskList.map((c) => (
                <Link key={c.id} href={`/centres/${c.id}`} className="block space-y-1.5 rounded-lg p-2 -mx-2 hover:bg-surface-hover">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{c.name}</span>
                    <CentreStatusChip status={c.status} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{c.code}</span>
                    <span className="text-xs text-muted-foreground">· {c.district}</span>
                  </div>
                  <Meter value={Math.round(c.risk_score ?? 0)} max={100} showValue={false} threshold={{ warning: 0.25, danger: 0.6 }} />
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        {/* Flags per day */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Flags per day (last 14 days, by severity)</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : chartFlags.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="No flags in the last 14 days"
                hint="Daily counts appear here once the detectors start raising flags."
              />
            ) : (
              <>
                <div className="mb-3 flex flex-wrap gap-3">
                  {(Object.keys(SEVERITY) as Severity[]).map((s) => (
                    <span key={s} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SEV_COLORS[s] }} aria-hidden />
                      {SEVERITY[s].label}
                    </span>
                  ))}
                </div>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={buckets} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
                      <CartesianGrid vertical={false} stroke="var(--border)" strokeWidth={1} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                        axisLine={{ stroke: "var(--border)" }}
                        tickLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                        axisLine={false}
                        tickLine={false}
                        width={40}
                      />
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
                      {(Object.keys(SEVERITY) as Severity[]).map((s) => (
                        <Bar key={s} dataKey={s} stackId="sev" fill={SEV_COLORS[s]} isAnimationActive={false} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
                  {fmtNum(buckets.reduce((s, d) => s + d.total, 0))} flags in 14 days:{" "}
                  {(Object.keys(SEVERITY) as Severity[]).map((s) => `${buckets.reduce((sum, d) => sum + d[s], 0)} ${SEVERITY[s].label.toLowerCase()}`).join(", ")}.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Privacy line */}
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Camera className="h-3.5 w-3.5" aria-hidden />
        Cameras count people anonymously. Trainee faces are never identified.
        {pendingQ.data && <span className="ml-2"><FileText className="mr-1 inline h-3 w-3" aria-hidden />{pendingApps} pending application{pendingApps === 1 ? "" : "s"}</span>}
        {error && <AlertTriangle className="h-3.5 w-3.5 text-warning" aria-hidden />}
      </p>
    </div>
  );
}
