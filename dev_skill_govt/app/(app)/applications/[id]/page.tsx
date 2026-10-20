"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, CheckCircle2, HelpCircle, XCircle, ExternalLink } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDate, fmtIST, timeAgo } from "@/lib/format";
import { getErrorMessage } from "@/lib/strings";
import { useMe } from "@/hooks/useMe";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorState } from "@/components/shared/ErrorState";
import { EmptyState } from "@/components/shared/EmptyState";
import { DecisionChip } from "@/components/shared/StatusChip";
import { CredentialsModal, type CredentialRow } from "@/components/shared/CredentialsModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Application, ApplicationEvent } from "@/types";

const ACTIONABLE = ["submitted", "under_review", "resubmitted"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 pb-2 last:border-0 last:pb-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value ?? "—"}</span>
    </div>
  );
}

export default function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { canWrite } = useMe();

  const appQ = useQuery({
    queryKey: ["application", id],
    queryFn: () => api<Application & { plausibility_warnings?: string[] }>(`/applications/${id}`),
    refetchInterval: 30_000,
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
      return { schemeMap, tradeMap };
    },
    staleTime: 60_000,
  });

  const [dialog, setDialog] = React.useState<"approve" | "query" | "reject" | null>(null);
  const [comment, setComment] = React.useState("");
  const [creds, setCreds] = React.useState<{ rows: CredentialRow[]; note?: string } | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["application", id] });
    qc.invalidateQueries({ queryKey: ["applications"] });
  };

  const action = useMutation({
    mutationFn: ({ kind, body }: { kind: "approve" | "query" | "reject"; body?: object }) =>
      api<Record<string, unknown>>(`/applications/${id}/${kind}`, {
        method: "POST",
        body: JSON.stringify(body ?? {}),
      }),
    onSuccess: (res, vars) => {
      invalidate();
      setDialog(null);
      setComment("");
      if (vars.kind === "approve") {
        const r = res as { login_id?: string; temporary_password?: string; expires_in_hours?: number; note?: string; centre_id?: string };
        if (r.login_id && r.temporary_password) {
          setCreds({
            rows: [
              { label: "Centre login ID", value: r.login_id },
              { label: "Temporary password", value: r.temporary_password },
              { label: "Expiry", value: `${r.expires_in_hours ?? 72} hours` },
            ],
            note: r.note,
          });
        }
        toast.success("Application approved. Centre created.");
      } else {
        toast.success(vars.kind === "query" ? "Query raised." : "Application rejected.");
      }
    },
    onError: (e) => {
      const err = e as { code?: string; message?: string };
      toast.error(getErrorMessage(err.code, err.message));
    },
  });

  const app = appQ.data;
  const loading = appQ.isLoading;
  const error = appQ.error;

  if (error) {
    const err = error as { code?: string; message?: string };
    return (
      <div className="rounded-lg border bg-card">
        <ErrorState message={getErrorMessage(err.code, err.message)} onRetry={() => appQ.refetch()} />
      </div>
    );
  }

  if (loading || !app) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-72" />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-40 w-full" />
            ))}
          </div>
          <div className="space-y-4">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </div>
    );
  }

  const warnings = app.plausibility_warnings ?? [];
  const actionable = canWrite && ACTIONABLE.includes(app.status);
  const events: ApplicationEvent[] = app.events ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={app.tracking_code}
        title={app.centre_name}
        description={`${app.district}, ${app.state} · submitted ${fmtDate(app.submitted_at)}`}
        action={
          <Button variant="ghost" size="sm" onClick={() => router.push("/applications")}>
            <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden />
            All applications
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Section title="Applicant">
            <Field label="Name" value={app.applicant_name} />
            <Field label="Type" value={<span className="capitalize">{app.applicant_type}</span>} />
            <Field label="Phone" value={<span className="tabular">{app.contact_phone}</span>} />
            <Field label="Email" value={app.contact_email ?? "—"} />
          </Section>

          <Section title="Centre">
            <Field label="Centre name" value={app.centre_name} />
            <Field label="Address" value={app.address} />
            <Field label="District" value={app.district} />
            <Field label="State" value={app.state} />
            <Field
              label="Coordinates"
              value={
                app.lat != null && app.lng != null ? (
                  <span className="tabular font-mono text-xs">
                    {app.lat.toFixed(4)}, {app.lng.toFixed(4)}
                  </span>
                ) : (
                  "—"
                )
              }
            />
          </Section>

          <Section title="Scheme & trade">
            <Field label="Scheme" value={labelsQ.data?.schemeMap[app.scheme_id] ?? "—"} />
            <Field label="Trade" value={labelsQ.data?.tradeMap[app.trade_template_id] ?? "—"} />
            <Field label="Max trainees" value={<span className="tabular">{app.max_trainees}</span>} />
            <Field label="Internet" value={<span className="capitalize">{app.internet_availability ?? "—"}</span>} />
            {app.room_info && (
              <>
                <Field label="Room size" value={<span className="tabular">{app.room_info.size_sqft} sq ft</span>} />
                <Field label="Room cameras" value={<span className="tabular">{app.room_info.cameras}</span>} />
                <Field label="Camera resolution" value={app.room_info.resolution} />
              </>
            )}
          </Section>

          <Section title="Trainers">
            {app.trainers?.length ? (
              <ul className="divide-y divide-border">
                {app.trainers.map((t, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 py-2">
                    <span className="text-sm font-medium">{t.name}</span>
                    <span className="text-xs text-muted-foreground">{t.qualification}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={HelpCircle} title="No trainers listed" hint="The applicant did not add trainer details." />
            )}
          </Section>

          <Section title="Equipment">
            {app.equipment?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="pb-2 font-medium">Item</th>
                      <th className="pb-2 font-medium">Class</th>
                      <th className="pb-2 text-right font-medium">Declared qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {app.equipment.map((e, i) => (
                      <tr key={i} className="border-b border-border/60 last:border-0">
                        <td className="py-2">{e.label ?? e.class}</td>
                        <td className="py-2 font-mono text-xs text-muted-foreground">{e.class}</td>
                        <td className="py-2 text-right tabular">{e.qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState icon={HelpCircle} title="No equipment declared" hint="Declared items appear here for verification." />
            )}
          </Section>

          <Section title="Documents">
            {app.documents?.length ? (
              <ul className="divide-y divide-border">
                {app.documents.map((d, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 truncate text-sm">{d.name}</span>
                    <span className="shrink-0 tabular text-xs text-muted-foreground">
                      {Math.max(1, Math.round(d.size / 1024))} KB · {d.content_type}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={HelpCircle}
                title="No documents attached"
                hint="Uploaded proofs (registration, land, room photos) appear here."
              />
            )}
          </Section>

          <Section title="Event history">
            {events.length ? (
              <ol className="relative space-y-4 border-l border-border pl-4">
                {events.map((e, i) => (
                  <li key={i} className="relative">
                    <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary" aria-hidden />
                    <p className="text-sm font-medium capitalize">{e.action.replace(/_/g, " ")}</p>
                    {e.comment && <p className="text-sm text-muted-foreground">{e.comment}</p>}
                    <p className="text-xs text-muted-foreground">{fmtIST(e.ts)}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState icon={HelpCircle} title="No events yet" hint="Every review action is recorded here." />
            )}
          </Section>
        </div>

        {/* Right: decision panel */}
        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle>Decision</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <DecisionChip status={app.status === "resubmitted" ? "pending" : app.status} />
                <span className="text-xs text-muted-foreground">{timeAgo(app.submitted_at)}</span>
              </div>

              {app.review_comment && (
                <p className="rounded-lg border bg-surface p-3 text-sm text-muted-foreground">{app.review_comment}</p>
              )}

              {warnings.length > 0 && (
                <div className="rounded-lg border border-warning/40 bg-warning/10 p-3">
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-warning">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                    Plausibility warnings
                  </p>
                  <ul className="space-y-1 text-sm">
                    {warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {app.status === "approved" && app.centre_id && (
                <Button asChild variant="secondary" className="w-full">
                  <Link href={`/centres/${app.centre_id}`}>
                    <ExternalLink className="mr-1.5 h-4 w-4" aria-hidden />
                    Open centre record
                  </Link>
                </Button>
              )}

              {actionable ? (
                <div className="space-y-2">
                  <Button
                    className="w-full"
                    onClick={() => setDialog("approve")}
                    loading={action.isPending && action.variables?.kind === "approve"}
                  >
                    <CheckCircle2 className="mr-1.5 h-4 w-4" aria-hidden />
                    Approve & create centre
                  </Button>
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => setDialog("query")}
                    loading={action.isPending && action.variables?.kind === "query"}
                  >
                    <HelpCircle className="mr-1.5 h-4 w-4" aria-hidden />
                    Raise query
                  </Button>
                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={() => setDialog("reject")}
                    loading={action.isPending && action.variables?.kind === "reject"}
                  >
                    <XCircle className="mr-1.5 h-4 w-4" aria-hidden />
                    Reject
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  This application is closed — no further decisions can be taken.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Approve confirmation */}
      <Dialog open={dialog === "approve"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve this application?</DialogTitle>
            <DialogDescription>
              A centre record is created and a one-time login credential is generated. The temporary password is
              shown only once.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDialog(null)} disabled={action.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => action.mutate({ kind: "approve" })}
              loading={action.isPending && action.variables?.kind === "approve"}
            >
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Query / reject with comment */}
      <Dialog open={dialog === "query" || dialog === "reject"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog === "reject" ? "Reject application" : "Raise a query"}</DialogTitle>
            <DialogDescription>
              {dialog === "reject"
                ? "The applicant sees this comment on the tracking page."
                : "Ask the applicant to clarify or resubmit. The comment is sent back to them."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="comment">Comment {dialog === "reject" ? "(required)" : ""}</Label>
            <Textarea
              id="comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={dialog === "reject" ? "Reason for rejection…" : "What needs clarification…"}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDialog(null)} disabled={action.isPending}>
              Cancel
            </Button>
            <Button
              variant={dialog === "reject" ? "destructive" : "default"}
              disabled={!comment.trim() && dialog === "reject"}
              loading={action.isPending && action.variables?.kind !== "approve"}
              onClick={() => action.mutate({ kind: dialog!, body: { comment } })}
            >
              {dialog === "reject" ? "Reject" : "Send query"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CredentialsModal
        open={!!creds}
        onClose={() => setCreds(null)}
        title="Centre credentials generated"
        rows={creds?.rows ?? []}
        note={creds?.note}
      />
    </div>
  );
}
