"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Archive,
  CheckCircle2,
  HelpCircle,
  Lock,
  MessageSquare,
  ShieldAlert,
} from "lucide-react";
import { api } from "@/lib/api";
import { fmtDuration, fmtIST, formatTimeOnly, timeAgo } from "@/lib/format";
import { FLAG_TYPES, SEVERITY, type Severity } from "@/lib/constants";
import { getErrorMessage } from "@/lib/strings";
import { useMe } from "@/hooks/useMe";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorState } from "@/components/shared/ErrorState";
import { FlagStatusChip, FlagTypeChip, SessionStatusChip, SeverityDot, UncertainChip } from "@/components/shared/StatusChip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Centre, Flag, SessionDetail } from "@/types";

export default function FlagDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { canWrite } = useMe();

  const flagQ = useQuery({
    queryKey: ["flag", id],
    queryFn: () => api<Flag>(`/flags/${id}`),
    refetchInterval: 30_000,
  });

  const flagData = flagQ.data;
  const needsSessionCard = !!flagData?.session_id && ["M1", "C3"].includes(flagData.type);
  const sessionQ = useQuery({
    queryKey: ["flag-session", flagData?.session_id],
    queryFn: () => api<SessionDetail>(`/sessions/${flagData!.session_id}`),
    enabled: needsSessionCard,
    staleTime: 30_000,
  });

  const centresQ = useQuery({
    queryKey: ["centres", "list"],
    queryFn: () => api<Centre[]>("/centres"),
    staleTime: 60_000,
  });

  const [dialog, setDialog] = React.useState<"resolve" | "dismiss" | null>(null);
  const [comment, setComment] = React.useState("");

  const act = useMutation({
    mutationFn: ({ action, body }: { action: string; body?: object }) =>
      api<{ status: string }>(`/flags/${id}/action`, {
        method: "POST",
        body: JSON.stringify({ action, ...body }),
      }),
    onSuccess: (res, vars) => {
      qc.invalidateQueries({ queryKey: ["flag", id] });
      qc.invalidateQueries({ queryKey: ["flags"] });
      setDialog(null);
      setComment("");
      toast.success(`Flag ${res.status}.`);
      if (vars.action === "dismiss" || vars.action === "resolve") router.push("/flags");
    },
    onError: (e) => {
      const err = e as { code?: string; message?: string };
      toast.error(getErrorMessage(err.code, err.message));
    },
  });

  const flag = flagQ.data;
  const centre = React.useMemo(
    () => (flag ? centresQ.data?.find((c) => c.id === flag.centre_id) : undefined),
    [flag, centresQ.data]
  );

  if (flagQ.error) {
    const err = flagQ.error as { code?: string; message?: string };
    return (
      <div className="rounded-lg border bg-card">
        <ErrorState message={getErrorMessage(err.code, err.message)} onRetry={() => flagQ.refetch()} />
      </div>
    );
  }

  if (flagQ.isLoading || !flag) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-80" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 w-full lg:col-span-2" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  const sev = (SEVERITY[flag.severity] ? flag.severity : "low") as Severity;
  const meta = FLAG_TYPES[flag.type];
  const status = flag.status ?? "open";
  const details = flag.details;
  const canAct = canWrite && !["resolved", "dismissed"].includes(status);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${flag.type} · ${SEVERITY[sev].label} severity`}
        title={meta?.name ?? flag.type}
        description={meta?.hint}
        action={
          <Button variant="ghost" size="sm" onClick={() => router.push("/flags")}>
            <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden />
            All flags
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <SeverityDot severity={flag.severity} />
          <FlagTypeChip type={flag.type} />
          <FlagStatusChip status={status} />
          {flag.state === "uncertain" && <UncertainChip />}
          <span className="text-xs text-muted-foreground">Raised {timeAgo(flag.created_at)}</span>
          {centre && (
            <Link href={`/centres/${centre.id}`} className="text-xs font-medium text-primary hover:underline">
              {centre.code} — {centre.name}
            </Link>
          )}
        </div>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-lg border bg-card p-6">
            <h2 className="mb-2 text-base font-semibold">Why this was raised</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">{flag.reason}</p>

            {details && (
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {[
                  ["Claimed", details.claimed],
                  ["Observed", details.observed],
                  ["Range", `${details.ci_low}–${details.ci_high}`],
                  ["Margin", details.margin],
                  ["Threshold", details.threshold],
                ].map(([k, v]) => (
                  <div key={k as string} className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">{k}</p>
                    <p className="tabular text-lg font-semibold">{v}</p>
                  </div>
                ))}
              </div>
            )}

            <dl className="mt-4 space-y-2 border-t border-border/60 pt-4 text-sm">
              {flag.model_version && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Model version</dt>
                  <dd className="font-mono text-xs">{flag.model_version}</dd>
                </div>
              )}
              {flag.session_id && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Session</dt>
                  <dd className="font-mono text-xs">{flag.session_id}</dd>
                </div>
              )}
              {flag.ledger_hash && (
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted-foreground">Ledger hash</dt>
                  <dd className="break-all text-right font-mono text-xs">
                    <Lock className="mr-1 inline h-3 w-3 text-success" aria-hidden />
                    {flag.ledger_hash}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          <div className="rounded-lg border bg-card p-6">
            <h2 className="mb-3 text-base font-semibold">Session</h2>
            {sessionQ.isLoading && <Skeleton className="h-24 w-full" />}
            {sessionQ.error && !sessionQ.data && (
              <p className="text-sm text-muted-foreground">Session record unavailable.</p>
            )}
            {sessionQ.data && (
              (() => {
                const s = sessionQ.data;
                const status = s.status;
                const missed = s.status === "missed";
                return (
                  <div className="space-y-2 rounded-lg border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium">{s.label ?? s.batch ?? "Session"}</span>
                      <SessionStatusChip status={status} lineThrough />
                    </div>
                    <p className="tabular text-xs text-muted-foreground">
                      Scheduled {formatTimeOnly(s.start_ts)} – {formatTimeOnly(s.end_ts)}
                      {s.actual_start_ts || s.actual_end_ts
                        ? ` · actual ${s.actual_start_ts ? formatTimeOnly(s.actual_start_ts) : "—"} – ${s.actual_end_ts ? formatTimeOnly(s.actual_end_ts) : "—"}`
                        : ""}
                    </p>
                    {missed && <p className="text-xs text-danger">No camera data received.</p>}
                    {s.cancel_reason && <p className="text-xs text-muted-foreground">Cancelled: {s.cancel_reason}</p>}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                      <span className="tabular">
                        <span className="text-muted-foreground">Monitored </span>
                        {s.monitored_s != null ? fmtDuration(s.monitored_s) : "—"}
                      </span>
                      <span className="tabular">
                        <span className="text-muted-foreground">Coverage </span>
                        {s.coverage_pct != null ? `${s.coverage_pct}%` : "—"}
                      </span>
                      <span className="tabular">
                        <span className="text-muted-foreground">Claimed </span>
                        {s.claimed ?? "—"}
                      </span>
                      <span className="tabular">
                        <span className="text-muted-foreground">Counted </span>
                        {s.observed ?? "—"}
                      </span>
                    </div>
                    {centre && s.session_date && (
                      <Button asChild variant="secondary" size="sm" className="mt-1">
                        <Link href={`/centres/${centre.id}?tab=calendar&date=${s.session_date}`}>
                          See this day in the calendar
                        </Link>
                      </Button>
                    )}
                  </div>
                );
              })()
            )}
          </div>

          <div className="rounded-lg border bg-card p-6">
            <h2 className="mb-3 text-base font-semibold">Evidence</h2>
            {flag.evidence_urls && flag.evidence_urls.length > 0 ? (
              <div className="grid grid-cols-3 gap-3">
                {flag.evidence_urls.map((u, i) => {
                  return (
                    // eslint-disable-next-line @next/next/no-img-element -- signed short-lived URL, not optimizable
                    <img
                      key={i}
                      src={u}
                      alt={`Evidence ${i + 1}`}
                      className="aspect-video w-full rounded-lg border object-cover"
                      loading="lazy"
                    />
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <HelpCircle className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} aria-hidden />
                <p className="text-sm font-medium">No stored frame for this flag</p>
                <p className="max-w-[45ch] text-sm text-muted-foreground">
                  Only evidence attached at raise time shows here. Session captures live in the centre&apos;s Evidence tab.
                </p>
                {centre && (
                  <Button asChild variant="secondary" size="sm">
                    <Link href={`/centres/${centre.id}?tab=evidence`}>Open centre evidence</Link>
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="rounded-lg border bg-card p-6">
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
              <MessageSquare className="h-4 w-4" aria-hidden />
              Event history
            </h2>
            <ol className="relative space-y-4 border-l border-border pl-5">
              {(flag.events ?? []).map((e, i) => (
                <li key={i} className="relative">
                  <span className="absolute -left-[25px] top-1.5 h-2 w-2 rounded-full bg-primary" aria-hidden />
                  <p className="text-sm">
                    <span className="font-medium capitalize">{e.action.replace(/_/g, " ")}</span>
                    {e.actor_role && <span className="ml-1.5 text-xs text-muted-foreground">by {e.actor_role}</span>}
                  </p>
                  {e.comment && <p className="text-sm text-muted-foreground">{e.comment}</p>}
                  <p className="text-xs text-muted-foreground">{fmtIST(e.ts)}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* Right: actions */}
        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-lg border bg-card p-6">
            <h2 className="mb-4 text-base font-semibold">Actions</h2>
            {canAct ? (
              <div className="space-y-2">
                <Button
                  className="w-full"
                  loading={act.isPending && act.variables?.action === "acknowledge"}
                  onClick={() => act.mutate({ action: "acknowledge" })}
                  disabled={status === "acknowledged"}
                >
                  <CheckCircle2 className="mr-1.5 h-4 w-4" aria-hidden />
                  Acknowledge
                </Button>
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => setDialog("resolve")}
                  disabled={status === "resolved"}
                >
                  <Archive className="mr-1.5 h-4 w-4" aria-hidden />
                  Resolve with comment
                </Button>
                <Button
                  variant="secondary"
                  className="w-full"
                  loading={act.isPending && act.variables?.action === "escalate"}
                  onClick={() => act.mutate({ action: "escalate" })}
                >
                  <ShieldAlert className="mr-1.5 h-4 w-4" aria-hidden />
                  Escalate
                </Button>
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={() => setDialog("dismiss")}
                  disabled={status === "dismissed"}
                >
                  <Archive className="mr-1.5 h-4 w-4" aria-hidden />
                  Dismiss with comment
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {canWrite
                  ? "This flag is closed. No further actions."
                  : "Auditor accounts are read-only — no flag actions are available."}
              </p>
            )}
          </div>

          <div className="rounded-lg border bg-card p-6">
            <h2 className="mb-3 text-base font-semibold">About this type</h2>
            <p className="text-sm text-muted-foreground">{meta?.hint ?? "Unknown flag type."}</p>
            <div className="mt-3">
              <Badge variant="outline">{flag.type}</Badge>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog === "resolve" ? "Resolve flag" : "Dismiss flag"}</DialogTitle>
            <DialogDescription>
              A comment is required. It stays attached to the flag history for auditors.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="flag-comment">Comment</Label>
            <Textarea
              id="flag-comment"
              rows={4}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={dialog === "resolve" ? "What fixed it / what was verified…" : "Why this is a false positive…"}
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDialog(null)} disabled={act.isPending}>
              Cancel
            </Button>
            <Button
              variant={dialog === "dismiss" ? "destructive" : "default"}
              disabled={!comment.trim()}
              loading={act.isPending && (act.variables?.action === "resolve" || act.variables?.action === "dismiss")}
              onClick={() => act.mutate({ action: dialog!, body: { comment } })}
            >
              {dialog === "resolve" ? "Resolve" : "Dismiss"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
