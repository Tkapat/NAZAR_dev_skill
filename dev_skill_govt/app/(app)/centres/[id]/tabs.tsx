"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Camera as CameraIcon, CheckCircle2, FileImage, Inbox, ScrollText, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDate, fmtIST, timeAgo } from "@/lib/format";
import { getErrorMessage } from "@/lib/strings";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import {
  CameraStatusChip,
  DecisionChip,
  FlagStatusChip,
  FlagTypeChip,
  SeverityDot,
  UncertainChip,
} from "@/components/shared/StatusChip";
import { SignedImage } from "@/components/shared/SignedImage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Meter } from "@/components/ui/meter";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Camera, Centre, Flag, Notice } from "@/types";

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/* ---------------- Overview ---------------- */

export function OverviewTab({ centre }: { centre: Centre }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Sanctioned summary">
        <dl className="space-y-3">
          {[
            ["Code", <span key="c" className="font-mono">{centre.code}</span>],
            ["District", `${centre.district}, ${centre.state}`],
            ["Address", centre.address],
            ["Contact", <span key="p" className="tabular">{centre.contact_phone}</span>],
            ["Email", centre.contact_email ?? "—"],
            ["Live since", centre.live_since ? fmtDate(centre.live_since) : "—"],
            [
              "Coordinates",
              centre.lat != null && centre.lng != null ? (
                <span key="ll" className="font-mono text-xs tabular">
                  {centre.lat.toFixed(4)}, {centre.lng.toFixed(4)}
                </span>
              ) : (
                "—"
              ),
            ],
          ].map(([k, v], i) => (
            <div key={i} className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-2 last:border-0">
              <dt className="text-sm text-muted-foreground">{k}</dt>
              <dd className="text-right text-sm font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <Panel title="Enrolment">
        <div className="space-y-4">
          <Meter
            value={centre.enrolled_count ?? 0}
            max={centre.max_trainees ?? 1}
            label="Enrolled / sanctioned"
            threshold={{ warning: 0.9, danger: 1 }}
          />
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg border p-3">
              <p className="tabular text-xl font-semibold">{centre.enrolled_count ?? 0}</p>
              <p className="text-xs text-muted-foreground">Enrolled</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="tabular text-xl font-semibold">{centre.max_trainees ?? 0}</p>
              <p className="text-xs text-muted-foreground">Sanctioned</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="tabular text-xl font-semibold">{Math.round(centre.risk_score ?? 0)}</p>
              <p className="text-xs text-muted-foreground">Risk score</p>
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}

/* ---------------- Attendance ---------------- */

interface AttendanceRow {
  session_date: string;
  start_ts: string;
  claimed: number | null;
  observed: number | null;
  ci_low: number | null;
  ci_high: number | null;
  frames: number | null;
  any_uncertain: number;
  delta: number | null;
}

function dateStr(daysAgo: number) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

export function AttendanceTab({ cid }: { cid: string }) {
  const q = useQuery({
    queryKey: ["centre-attendance", cid],
    queryFn: () => api<AttendanceRow[]>(`/centres/${cid}/attendance?from_date=${dateStr(30)}&to_date=${dateStr(0)}`),
    refetchInterval: 60_000,
  });

  const rows = q.data ?? [];
  const claimed = rows.reduce((s, r) => s + (r.claimed ?? 0), 0);
  const observed = rows.reduce((s, r) => s + (r.observed ?? 0), 0);
  const uncertain = rows.filter((r) => r.any_uncertain).length;

  if (q.error) return <ErrorState onRetry={() => q.refetch()} />;
  if (q.isLoading) return <Skeleton className="h-72 w-full" />;

  if (rows.length === 0) {
    return (
      <Panel title="Attendance series (last 30 days)">
        <EmptyState
          icon={Inbox}
          title="No sessions in the last 30 days"
          hint="Claimed vs observed attendance appears here after the first closed session."
        />
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <Panel
        title="Claimed vs observed (last 30 days)"
        action={
          <div className="flex gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-info" aria-hidden />
              Claimed
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--sev-high)" }} aria-hidden />
              Observed
            </span>
          </div>
        }
      >
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows.map((r) => ({ ...r, label: r.session_date.slice(5) }))} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeWidth={1} />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} axisLine={{ stroke: "var(--border)" }} tickLine={false} minTickGap={24} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={40} />
              <ReTooltip
                cursor={{ stroke: "var(--border)" }}
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "var(--popover-foreground)",
                  boxShadow: "var(--shadow-pop)",
                }}
              />
              <Line type="monotone" dataKey="claimed" stroke="var(--info)" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
              <Line type="monotone" dataKey="observed" stroke="var(--sev-high)" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
          {rows.length} session(s): {claimed} claimed vs {observed} observed in total (difference {claimed - observed}
          ){uncertain > 0 && ` · ${uncertain} session(s) marked uncertain`}.
        </p>
      </Panel>

      <Panel title="Sessions">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="pb-2 font-medium">Date</th>
                <th className="pb-2 text-right font-medium">Claimed</th>
                <th className="pb-2 text-right font-medium">Observed</th>
                <th className="pb-2 text-right font-medium">Range</th>
                <th className="pb-2 text-right font-medium">Frames</th>
                <th className="pb-2 text-right font-medium">Difference</th>
                <th className="pb-2 font-medium">State</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-border/60 last:border-0">
                  <td className="py-2 tabular">{r.session_date}</td>
                  <td className="py-2 text-right tabular">{r.claimed ?? "—"}</td>
                  <td className="py-2 text-right tabular">{r.observed ?? "—"}</td>
                  <td className="py-2 text-right tabular text-muted-foreground">
                    {r.ci_low != null ? `${r.ci_low}–${r.ci_high}` : "—"}
                  </td>
                  <td className="py-2 text-right tabular text-muted-foreground">{r.frames ?? "—"}</td>
                  <td className={`py-2 text-right tabular ${(r.delta ?? 0) > 0 ? "text-danger" : ""}`}>
                    {r.delta ?? "—"}
                  </td>
                  <td className="py-2">{r.any_uncertain ? <UncertainChip /> : <Badge variant="success">OK</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

/* ---------------- Equipment ---------------- */

interface EquipmentRow {
  class: string;
  label: string;
  sanctioned_qty: number;
  declared_qty: number;
  observed?: number | null;
  ci_low?: number | null;
  ci_high?: number | null;
  operability?: string;
  required?: boolean;
}

export function EquipmentTab({ cid }: { cid: string }) {
  const q = useQuery({
    queryKey: ["centre-equipment", cid],
    queryFn: () => api<EquipmentRow[]>(`/centres/${cid}/equipment`),
    refetchInterval: 60_000,
  });

  const rows = q.data ?? [];
  const short = rows.filter((r) => r.declared_qty < r.sanctioned_qty).length;

  if (q.error) return <ErrorState onRetry={() => q.refetch()} />;
  if (q.isLoading) return <Skeleton className="h-48 w-full" />;
  if (rows.length === 0)
    return (
      <Panel title="Equipment">
        <EmptyState
          icon={Inbox}
          title="No equipment rules for this trade"
          hint="The trade template defines what should be present. Add rules to the template to track them."
        />
      </Panel>
    );

  return (
    <Panel
      title="Equipment"
      action={short > 0 ? <Badge variant="warning">{short} short</Badge> : <Badge variant="success">All declared</Badge>}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="pb-2 font-medium">Item</th>
              <th className="pb-2 text-right font-medium">Sanctioned</th>
              <th className="pb-2 text-right font-medium">Declared</th>
              <th className="pb-2 text-right font-medium">Observed</th>
              <th className="pb-2 text-right font-medium">Range</th>
              <th className="pb-2 font-medium">State</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const shortfall = r.declared_qty < r.sanctioned_qty;
              const observedOff = r.observed != null && r.observed !== r.declared_qty;
              return (
                <tr key={r.class} className="border-b border-border/60 last:border-0">
                  <td className="py-2">
                    <span className="font-medium">{r.label}</span>
                    {r.required && <span className="ml-1.5 text-xs text-muted-foreground">required</span>}
                    <span className="ml-2 font-mono text-xs text-muted-foreground">{r.class}</span>
                  </td>
                  <td className="py-2 text-right tabular">{r.sanctioned_qty}</td>
                  <td className={`py-2 text-right tabular ${shortfall ? "text-danger font-medium" : ""}`}>{r.declared_qty}</td>
                  <td className="py-2 text-right tabular">{r.observed ?? "—"}</td>
                  <td className="py-2 text-right tabular text-muted-foreground">
                    {r.ci_low != null ? `${r.ci_low}–${r.ci_high}` : "—"}
                  </td>
                  <td className="py-2">
                    {shortfall ? (
                      <Badge variant="destructive">Shortfall</Badge>
                    ) : observedOff ? (
                      <Badge variant="warning">Differs from observed</Badge>
                    ) : (
                      <Badge variant="success">Consistent</Badge>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/* ---------------- Cameras ---------------- */

export function CamerasTab({ cid, canWrite }: { cid: string; canWrite: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["centre", cid],
    queryFn: () => api<{ centre: Centre; cameras: Camera[]; open_flags: Flag[] }>(`/centres/${cid}`),
    refetchInterval: 15_000,
  });
  const [rejectCam, setRejectCam] = React.useState<Camera | null>(null);
  const [reason, setReason] = React.useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["centre", cid] });

  const approve = useMutation({
    mutationFn: (id: string) => api(`/cameras/${id}/approve`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Camera approved.");
      invalidate();
    },
    onError: (e) => {
      const err = e as { code?: string; message?: string };
      toast.error(getErrorMessage(err.code, err.message));
    },
  });

  const reject = useMutation({
    mutationFn: ({ id, why }: { id: string; why: string }) =>
      api(`/cameras/${id}/reject`, { method: "POST", body: JSON.stringify({ reason: why }) }),
    onSuccess: () => {
      toast.success("Camera rejected.");
      setRejectCam(null);
      setReason("");
      invalidate();
    },
    onError: (e) => {
      const err = e as { code?: string; message?: string };
      toast.error(getErrorMessage(err.code, err.message));
    },
  });

  const cams = q.data?.cameras ?? [];

  if (q.error) return <ErrorState onRetry={() => q.refetch()} />;
  if (q.isLoading) return <Skeleton className="h-48 w-full" />;
  if (cams.length === 0)
    return (
      <Panel title="Cameras">
        <EmptyState
          icon={CameraIcon}
          title="No cameras yet"
          hint="The centre submits camera setups from their edge app; they appear here for approval."
        />
      </Panel>
    );

  return (
    <>
      <Panel title={`Cameras (${cams.length})`}>
        <div className="space-y-3">
          {cams.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{c.name}</p>
                <p className="truncate font-mono text-xs text-muted-foreground">{c.source_uri}</p>
                {c.reject_reason && <p className="mt-1 text-xs text-danger">Rejected: {c.reject_reason}</p>}
              </div>
              <CameraStatusChip status={c.status} />
              <DecisionChip status={c.setup_status === "draft" ? "pending" : c.setup_status} />
              <span className="tabular text-xs text-muted-foreground">
                {c.last_seen ? `Last seen ${timeAgo(c.last_seen)}` : "Never seen"}
              </span>
              {canWrite && c.setup_status === "submitted" && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => approve.mutate(c.id)}
                    loading={approve.isPending && approve.variables === c.id}
                  >
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" aria-hidden />
                    Approve
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => setRejectCam(c)}>
                    <XCircle className="mr-1 h-3.5 w-3.5" aria-hidden />
                    Reject
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </Panel>

      <Dialog open={!!rejectCam} onOpenChange={(o) => !o && setRejectCam(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject camera setup</DialogTitle>
            <DialogDescription>
              {rejectCam?.name} — the centre sees your reason and can resubmit.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="cam-reason">Reason (required)</Label>
            <Textarea id="cam-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setRejectCam(null)} disabled={reject.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!reason.trim()}
              loading={reject.isPending}
              onClick={() => rejectCam && reject.mutate({ id: rejectCam.id, why: reason.trim() })}
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ---------------- Flags ---------------- */

export function FlagsTab({ cid }: { cid: string }) {
  const router = useRouter();
  const q = useQuery({
    queryKey: ["flags", "centre", cid],
    queryFn: () => api<{ items: Flag[] }>(`/flags?centre_id=${cid}&limit=100`),
    refetchInterval: 30_000,
  });

  const columns: DataTableColumn<Flag>[] = [
    { key: "sev", header: "Severity", render: (f) => <SeverityDot severity={f.severity} /> },
    { key: "type", header: "Type", render: (f) => <FlagTypeChip type={f.type} /> },
    { key: "status", header: "Status", render: (f) => <FlagStatusChip status={f.status ?? "open"} /> },
    { key: "reason", header: "Reason", render: (f) => <span className="line-clamp-2">{f.reason}</span> },
    {
      key: "time",
      header: "Raised",
      render: (f) => <span className="tabular text-muted-foreground">{timeAgo(f.created_at)}</span>,
    },
  ];

  return (
    <DataTable
      caption="Flags for this centre"
      columns={columns}
      rows={q.data?.items ?? []}
      getRowId={(f) => f.id}
      loading={q.isLoading}
      error={q.error}
      onRetry={() => q.refetch()}
      onRowClick={(f) => router.push(`/flags/${f.id}`)}
      empty={
        <EmptyState
          icon={Inbox}
          title="No flags for this centre"
          hint="Camera disagreements and equipment checks raise flags here."
        />
      }
    />
  );
}

/* ---------------- Evidence ---------------- */

interface EvidenceItem {
  id: string;
  kind: string;
  session_id?: string | null;
  url: string;
  created_at: string;
}

export function EvidenceTab({ cid }: { cid: string }) {
  const q = useQuery({
    queryKey: ["centre-evidence", cid],
    queryFn: () => api<{ items: EvidenceItem[] }>(`/centres/${cid}/evidence?limit=50`),
    refetchInterval: 60_000,
  });

  const items = q.data?.items ?? [];

  if (q.error) return <ErrorState onRetry={() => q.refetch()} />;
  if (q.isLoading)
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="aspect-video" />
        ))}
      </div>
    );
  if (items.length === 0)
    return (
      <Panel title="Evidence">
        <EmptyState
          icon={FileImage}
          title="No evidence stored yet"
          hint="Captured frames and annotated thumbnails are kept here with the session they came from."
        />
      </Panel>
    );

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((e) => (
        <figure key={e.id} className="overflow-hidden rounded-lg border bg-card">
          <SignedImage url={e.url} alt={`${e.kind} evidence`} className="aspect-video w-full object-cover" />
          <figcaption className="space-y-0.5 p-2">
            <p className="text-xs font-medium capitalize">{e.kind}</p>
            <p className="text-[11px] text-muted-foreground">{fmtIST(e.created_at)}</p>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

/* ---------------- Notices ---------------- */

export function NoticesTab({ cid, onIssue }: { cid: string; onIssue: () => void }) {
  const q = useQuery({
    queryKey: ["notices", cid],
    queryFn: () => api<{ items: Notice[] }>(`/notices?centre_id=${cid}&limit=50`),
    refetchInterval: 30_000,
  });

  const items = q.data?.items ?? [];
  const LEVEL_BADGE: Record<string, "info" | "warning" | "destructive" | "violet" | "secondary"> = {
    advisory: "info",
    notice: "secondary",
    warning: "warning",
    suspension: "destructive",
    termination: "violet",
  };

  if (q.error) return <ErrorState onRetry={() => q.refetch()} />;
  if (q.isLoading) return <Skeleton className="h-48 w-full" />;

  return (
    <Panel
      title="Notices and actions"
      action={
        <Button size="sm" variant="secondary" onClick={onIssue}>
          Issue notice
        </Button>
      }
    >
      {items.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No notices issued"
          hint="Advisories, warnings and enforcement actions for this centre appear here."
        />
      ) : (
        <ol className="relative space-y-5 border-l border-border pl-5">
          {items.map((n) => (
            <li key={n.id} className="relative">
              <span className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" aria-hidden />
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={LEVEL_BADGE[n.level] ?? "secondary"}>{n.level}</Badge>
                <span className="text-sm font-medium">{n.subject}</span>
                <span className="ml-auto text-xs text-muted-foreground">{fmtIST(n.created_at)}</span>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm text-muted-foreground">{n.body}</p>
              {n.reply && (
                <p className="mt-2 rounded-lg border bg-surface p-2.5 text-sm">
                  <span className="text-xs font-medium text-muted-foreground">Centre reply</span>
                  <br />
                  {n.reply}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

/* ---------------- Timeline ---------------- */

interface AuditEntry {
  id: string;
  actor?: string;
  action: string;
  entity: string;
  entity_id: string;
  meta?: Record<string, unknown>;
  ts: string;
}

export function TimelineTab({ cid }: { cid: string }) {
  const q = useQuery({
    queryKey: ["centre-timeline", cid],
    queryFn: () => api<{ items: AuditEntry[] }>(`/centres/${cid}/timeline?limit=100`),
    refetchInterval: 60_000,
  });

  const items = q.data?.items ?? [];

  if (q.error) return <ErrorState onRetry={() => q.refetch()} />;
  if (q.isLoading) return <Skeleton className="h-64 w-full" />;
  if (items.length === 0)
    return (
      <Panel title="Timeline">
        <EmptyState
          icon={ScrollText}
          title="Nothing recorded yet"
          hint="Every decision, approval and enforcement action on this centre lands in the timeline."
        />
      </Panel>
    );

  return (
    <Panel title="Timeline">
      <ol className="relative space-y-4 border-l border-border pl-5">
        {items.map((e) => (
          <li key={e.id} className="relative">
            <span className="absolute -left-[25px] top-1.5 h-2 w-2 rounded-full bg-primary" aria-hidden />
            <p className="text-sm">
              <span className="font-medium">{e.action}</span>{" "}
              <span className="text-muted-foreground">on {e.entity}</span>
            </p>
            {e.meta && Object.keys(e.meta).length > 0 && (
              <p className="font-mono text-xs text-muted-foreground">
                {Object.entries(e.meta)
                  .map(([k, v]) => `${k}=${String(v)}`)
                  .join(" · ")}
              </p>
            )}
            <p className="text-xs text-muted-foreground">{fmtIST(e.ts)}</p>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
