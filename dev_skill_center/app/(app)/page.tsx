"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarCheck, ClipboardList, KeyRound, TriangleAlert, MessageSquareWarning } from "lucide-react";
import { api } from "@/lib/api";
import { dayPart, fmtRange, IST, relativeTime, sessionState, SESSION_STATE_LABEL, todayIST } from "@/lib/format";
import { useHeroEntrance, useRail, useStagger } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { Meter } from "@/components/ui/meter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiCard, KpiRowSkeleton } from "@/components/shared/KpiCard";
import { ErrorState } from "@/components/shared/ErrorState";
import { EmptyState } from "@/components/shared/EmptyState";
import { CameraStatusChip, SeverityDot, UncertainChip } from "@/components/shared/StatusChip";
import { ComplianceBoard } from "@/components/shared/ComplianceBoard";
import { useMe } from "@/hooks/useMe";
import type { Flag, MyCentre, Notice, Session, ComplianceResponse } from "@/lib/types";

const STATE_CHIP: Record<string, string> = {
  upcoming: "border-border bg-surface text-muted-foreground",
  active: "border-success/40 bg-success/10 text-success",
  closed: "border-info/40 bg-info/10 text-info",
  missed: "border-warning/40 bg-warning/10 text-warning",
};

function SessionRow({ s, trainerView }: { s: Session; trainerView?: boolean }) {
  const state = sessionState(s);
  return (
    <li
      data-rail-row
      className="flex flex-wrap items-center gap-3 border-b border-border p-4 last:border-b-0"
    >
      <span
        className={cn(
          "inline-flex h-6 shrink-0 items-center rounded-full border px-2 text-xs font-medium",
          STATE_CHIP[state],
        )}
      >
        {SESSION_STATE_LABEL[state]}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{s.batch_name ?? "Session"}</p>
        <p className="text-xs text-muted-foreground">
          {fmtRange(fmtClockOf(s.start_ts), fmtClockOf(s.end_ts))} · {s.trainer_name ?? "—"}
        </p>
      </div>
      {s.claimed != null || s.observed != null ? (
        <p className="tabular text-xs text-muted-foreground">
          Claimed {s.claimed ?? "—"} · Camera saw {s.observed ?? "—"}
        </p>
      ) : null}
      {trainerView && (state === "upcoming" || state === "active") && (
        <div className="flex gap-2">
          <Button asChild size="sm" variant="secondary">
            <Link href={`/attendance?session=${s.id}`}>Mark attendance</Link>
          </Button>
        </div>
      )}
    </li>
  );
}

function fmtClockOf(ts: string) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ts));
}

export default function DashboardPage() {
  const { user, isPending } = useMe();
  const isTrainer = user?.role === "trainer";
  const mustChange = !isPending && !!user?.must_change_password;
  const dataEnabled = !isPending && !mustChange;

  const centreQ = useQuery({
    queryKey: ["centre", "mine"],
    queryFn: () => api<MyCentre>("/my/centre"),
    refetchInterval: 15_000,
    enabled: dataEnabled,
  });
  const sessionsQ = useQuery({
    queryKey: ["sessions", "today"],
    queryFn: () => api<{ items: Session[] }>("/my/sessions/today"),
    refetchInterval: 15_000,
    enabled: dataEnabled,
  });
  const flagsQ = useQuery({
    queryKey: ["flags", "recent"],
    queryFn: () => api<{ items: Flag[] }>("/my/flags?limit=5"),
    refetchInterval: 15_000,
    enabled: dataEnabled,
  });
  const noticesQ = useQuery({
    queryKey: ["notices", "recent"],
    queryFn: () => api<{ items: Notice[] }>("/my/notices?unread_only=true&limit=3"),
    refetchInterval: 15_000,
    enabled: dataEnabled,
  });
  const requestsQ = useQuery({
    queryKey: ["requests", "pending"],
    queryFn: () => api<{ items: unknown[] }>("/my/requests?status=pending&limit=5"),
    refetchInterval: 30_000,
    enabled: dataEnabled && !isTrainer,
  });
  const complianceQ = useQuery({
    queryKey: ["compliance"],
    queryFn: () => api<ComplianceResponse>("/my/compliance"),
    refetchInterval: 15_000,
    enabled: dataEnabled,
  });

  const ready = !isPending && !centreQ.isLoading && !sessionsQ.isLoading;
  const heroRef = useHeroEntrance(ready);
  const railRef = useRail(ready);
  const flagsRef = useStagger(ready);

  const centre = centreQ.data?.centre;
  const stats = centreQ.data?.stats;
  const liveSummary = centreQ.data?.live_summary ?? null;
  const sessions = sessionsQ.data?.items ?? [];
  const flags = flagsQ.data?.items ?? [];
  const notices = noticesQ.data?.items ?? [];
  const pendingRequests = requestsQ.data?.items?.length ?? 0;

  if (centreQ.error) {
    return <ErrorState onRetry={() => centreQ.refetch()} />;
  }

  const firstName = (user?.full_name || "").split(" ")[0] || "there";
  const part = dayPart();

  return (
    <div className="space-y-6">
      <div ref={heroRef}>
        <p className="eyebrow" data-hero-eyebrow>
          {todayIST()}
        </p>
        <h1 className="display mt-2 text-[32px] md:text-[40px]" data-hero-title>
          Good {part}, {firstName}.
        </h1>
        <p className="mt-1 text-sm text-muted-foreground" data-hero-sub>
          {centre ? `${centre.name} · ${centre.code}` : "…"}
        </p>
        {centre && centre.status !== "live" && (
          <div className="mt-3" data-hero-action>
            <Button asChild size="sm">
              <Link href="/onboarding">
                Finish setup
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" aria-hidden />
              </Link>
            </Button>
          </div>
        )}
      </div>

      {mustChange && (
        <section
          aria-label="Password change required"
          role="alert"
          className="card border-warning/50 bg-warning/10 p-5"
        >
          <div className="flex flex-wrap items-start gap-4">
            <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-warning/40 bg-warning/20 text-warning">
              <KeyRound className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-warning">
                <TriangleAlert className="h-4 w-4" aria-hidden />
                Change your password to continue
              </h2>
              <p className="mt-1.5 text-sm text-muted-foreground">
                You signed in with a temporary password. You must change it within{" "}
                <strong className="font-semibold text-foreground">72 hours</strong> — after
                that your account stops working and you&apos;ll need your district
                coordinator to reset it. Until then most of this portal stays locked.
              </p>
              <div className="mt-4">
                <Button asChild>
                  <Link href="/change-password">
                    Change password now
                    <ArrowRight className="ml-1.5 h-3.5 w-3.5" aria-hidden />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      )}

      {!mustChange &&
      (isTrainer ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Today&apos;s sessions</h2>
          {sessionsQ.isLoading ? (
            <div className="grid gap-4 md:grid-cols-2">
              <Skeleton className="h-44" />
              <Skeleton className="h-44" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="card">
              <EmptyState
                icon={CalendarCheck}
                title="No sessions today"
                hint="Sessions appear here on the days your batch meets."
              />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2" data-stagger-item>
              {sessions.map((s) => (
                <div key={s.id} className="card card-hover p-5">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex h-6 items-center rounded-full border px-2 text-xs font-medium",
                        STATE_CHIP[sessionState(s)],
                      )}
                    >
                      {SESSION_STATE_LABEL[sessionState(s)]}
                    </span>
                  </div>
                  <p className="mt-3 text-lg font-semibold">{s.batch_name ?? "Session"}</p>
                  <p className="text-sm text-muted-foreground">
                    {fmtRange(fmtClockOf(s.start_ts), fmtClockOf(s.end_ts))}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button asChild>
                      <Link href={`/attendance?session=${s.id}`}>
                        <CalendarCheck className="mr-1.5 h-4 w-4" aria-hidden />
                        Mark attendance
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : (
        <>
          <section aria-label="Key numbers">
            {centreQ.isLoading || sessionsQ.isLoading ? (
              <KpiRowSkeleton count={4} />
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <KpiCard eyebrow="Today's sessions" value={stats?.sessions_today ?? sessions.length} href="/schedule" />
                <div className="card p-5" data-stat>
                  <p className="eyebrow">Enrolled / Max</p>
                  <div className="mt-2">
                    <Meter
                      value={centre?.enrolled_count ?? 0}
                      max={centre?.max_trainees ?? 1}
                      label=""
                      threshold={{ warning: 0.9, danger: 1 }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {centre?.enrolled_count ?? 0} of {centre?.max_trainees ?? 0} seats filled
                  </p>
                </div>
                <KpiCard
                  eyebrow="Open flags"
                  value={stats?.open_flags ?? 0}
                  href="/flags"
                />
                <div className="card p-5" data-stat>
                  <p className="eyebrow">Camera status</p>
                  <div className="mt-3">
                    <CameraStatusChip
                      status={stats?.camera_status ?? (stats?.camera_count ? "unknown" : "none")}
                      className="h-7"
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {stats?.camera_count ?? 0} camera{(stats?.camera_count ?? 0) === 1 ? "" : "s"} registered
                  </p>
                </div>
              </div>
            )}
          </section>

          {complianceQ.data?.session && (
            <section aria-label="Compliance">
              <ComplianceBoard
                data={complianceQ.data}
                isLoading={complianceQ.isLoading}
                error={complianceQ.error}
                onRetry={() => complianceQ.refetch()}
              />
            </section>
          )}

          {liveSummary && liveSummary.cameras.length > 0 && (
            <section aria-label="Live rooms" className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <h2 className="text-sm font-semibold">Live rooms</h2>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/live">
                    Open monitor
                    <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden />
                  </Link>
                </Button>
              </div>
              <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
                {liveSummary.cameras.map((cam) => (
                  <Link
                    key={cam.camera_id}
                    href="/live"
                    className="card card-hover overflow-hidden"
                  >
                    <div className="relative aspect-video bg-surface-2">
                      {cam.thumb_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={cam.thumb_url}
                          alt={cam.camera_name}
                          className={cn(
                            "h-full w-full object-cover",
                            cam.state !== "live" && "opacity-60",
                          )}
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                          No frame yet
                        </div>
                      )}
                      <span
                        className={cn(
                          "absolute left-2 top-2 inline-flex h-6 items-center gap-1.5 rounded-full border px-2 text-xs font-medium backdrop-blur-sm",
                          cam.state === "live"
                            ? "border-success/40 bg-success/15 text-success"
                            : cam.state === "tampered"
                              ? "border-warning/40 bg-warning/15 text-warning"
                              : "border-border bg-background/80 text-muted-foreground",
                        )}
                      >
                        {cam.state === "live" && (
                          <span className="live-dot h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
                        )}
                        {cam.state === "live"
                          ? "Live"
                          : cam.state === "tampered"
                            ? "Camera problem"
                            : cam.state === "provisional"
                              ? "Setup pending"
                              : cam.state === "idle"
                                ? "Idle"
                                : "Offline"}
                      </span>
                    </div>
                    <div className="p-4">
                      <div className="flex items-baseline justify-between">
                        <p className="text-sm font-semibold">{cam.camera_name}</p>
                        <p className="tabular text-2xl font-semibold">{cam.people}</p>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {cam.claimed != null
                          ? `Claimed ${cam.claimed} / Camera saw ${cam.people}`
                          : `${Object.values(cam.items ?? {}).reduce((a, i) => a + (i.in_use ?? 0), 0)} items in use`}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <section className="card overflow-hidden" aria-label="Today's sessions">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <h2 className="text-sm font-semibold">Today</h2>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/schedule">
                    Batches
                    <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden />
                  </Link>
                </Button>
              </div>
              <div ref={railRef} className="relative">
                {sessionsQ.isLoading ? (
                  <div className="space-y-3 p-5">
                    <Skeleton className="h-12" />
                    <Skeleton className="h-12" />
                    <span data-rail-line className="hidden" />
                  </div>
                ) : sessions.length === 0 ? (
                  <EmptyState
                    icon={CalendarCheck}
                    title="No sessions scheduled today"
                    hint="Sessions are generated from your batch timetables."
                  />
                ) : (
                  <>
                    <span
                      data-rail-line
                      aria-hidden
                      className="absolute left-0 top-0 hidden h-full w-0.5 bg-primary/40"
                    />
                    <ul className="relative">
                      {sessions.map((s) => (
                        <SessionRow key={s.id} s={s} />
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </section>

            <div className="space-y-4">
              <section className="card overflow-hidden" aria-label="Recent flags">
                <div className="flex items-center justify-between border-b border-border px-5 py-4">
                  <h2 className="text-sm font-semibold">Recent flags</h2>
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/flags">
                      All
                      <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden />
                    </Link>
                  </Button>
                </div>
                <div ref={flagsRef}>
                  {flagsQ.isLoading ? (
                    <div className="space-y-3 p-5">
                      <Skeleton className="h-12" />
                      <Skeleton className="h-12" />
                    </div>
                  ) : flags.length === 0 ? (
                    <EmptyState
                      icon={TriangleAlert}
                      title="No open flags"
                      hint="If the camera sees a difference from your attendance, it appears here so you can respond."
                    />
                  ) : (
                    <ul className="divide-y divide-border">
                      {flags.slice(0, 5).map((f) => (
                        <li key={f.id} data-stagger-item className="flex items-start gap-3 px-5 py-3.5">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{f.reason}</p>
                            <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                              <SeverityDot severity={f.severity} withLabel={false} />
                              {relativeTime(f.created_at ?? "")}
                            </p>
                          </div>
                          {f.state === "uncertain" && <UncertainChip />}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>

              <section className="card overflow-hidden" aria-label="Notices and requests">
                <ul className="divide-y divide-border">
                  <li className="flex items-center gap-3 px-5 py-4">
                    <MessageSquareWarning className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <p className="min-w-0 flex-1 text-sm">
                      {notices.length === 0
                        ? "No unread notices"
                        : `${notices.length} unread notice${notices.length === 1 ? "" : "s"}`}
                    </p>
                    <Button asChild variant="ghost" size="sm">
                      <Link href="/notices">Open</Link>
                    </Button>
                  </li>
                  <li className="flex items-center gap-3 px-5 py-4">
                    <ClipboardList className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <p className="min-w-0 flex-1 text-sm">
                      {pendingRequests === 0
                        ? "No pending requests"
                        : `${pendingRequests} request${pendingRequests === 1 ? "" : "s"} awaiting a decision`}
                    </p>
                    <Button asChild variant="ghost" size="sm">
                      <Link href="/requests">Open</Link>
                    </Button>
                  </li>
                </ul>
              </section>
            </div>
          </div>
        </>
      ))}

      <p className="text-xs text-muted-foreground">
        Cameras count people anonymously. Trainee faces are never identified.
      </p>
    </div>
  );
}