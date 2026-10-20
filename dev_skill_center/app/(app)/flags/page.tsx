"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HelpCircle, MessageSquare, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { fmtIST, relativeTime } from "@/lib/format";
import { messageFrom } from "@/lib/strings";
import { Button } from "@/components/ui/button";
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
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { SignedImage } from "@/components/shared/SignedImage";
import { FlagStatusChip, FlagTypeChip, SeverityDot, UncertainChip } from "@/components/shared/StatusChip";
import type { Flag } from "@/lib/types";

function FlagDetail({
  flag,
  onClose,
}: {
  flag: Flag | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [comment, setComment] = React.useState("");
  const [sending, setSending] = React.useState(false);

  const flagId = flag?.id;
  React.useEffect(() => {
    setComment("");
  }, [flagId]);

  const respond = async () => {
    if (!flag || !comment.trim()) return;
    setSending(true);
    try {
      await api(`/my/flags/${flag.id}/respond`, {
        method: "POST",
        body: JSON.stringify({ comment: comment.trim() }),
      });
      toast.success("Response sent. The department will review it.");
      await qc.invalidateQueries({ queryKey: ["flags"] });
      onClose();
    } catch (err) {
      toast.error(messageFrom(err));
    } finally {
      setSending(false);
    }
  };

  if (!flag) return null;

  return (
    <Dialog open={!!flag} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <FlagTypeChip type={flag.type} />
            <SeverityDot severity={flag.severity} />
          </DialogTitle>
          <DialogDescription>
            {flag.state === "uncertain"
              ? "The camera could not count reliably. No action is needed unless asked."
              : "We noticed a difference between your attendance and the camera count. You can respond with an explanation."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-[12px] border border-border bg-surface p-4 text-sm">
            <p>{flag.reason}</p>
            {(flag.claimed_count != null || flag.observed_count != null) && (
              <p className="tabular mt-2 text-muted-foreground">
                Claimed {flag.claimed_count ?? "—"} · Camera saw {flag.observed_count ?? "—"}
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              {flag.created_at ? fmtIST(flag.created_at) : ""}
            </p>
          </div>

          {flag.evidence_urls && flag.evidence_urls.length > 0 && (
            <div>
              <p className="eyebrow mb-2">Evidence (blurred)</p>
              <div className="grid grid-cols-3 gap-2">
                {flag.evidence_urls.slice(0, 3).map((u, i) => (
                  <SignedImage
                    key={`${flag.id}-${i}`}
                    url={u}
                    alt={`Evidence ${i + 1}`}
                    gallery={flag.evidence_urls ?? []}
                    className="h-24 w-full"
                  />
                ))}
              </div>
            </div>
          )}

          {flag.events && flag.events.length > 0 && (
            <div>
              <p className="eyebrow mb-2">Timeline</p>
              <ol className="space-y-2 border-l border-border pl-4 text-sm">
                {flag.events.map((ev, i) => (
                  <li key={i} className="relative">
                    <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-border" aria-hidden />
                    <p className="font-medium capitalize">{ev.action.replace(/_/g, " ")}</p>
                    {ev.comment && <p className="text-muted-foreground">{ev.comment}</p>}
                    <p className="text-xs text-muted-foreground">{fmtIST(ev.ts)}</p>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {flag.status === "open" || flag.status === "acknowledged" ? (
            <div className="space-y-2">
              <Label htmlFor="flag-comment">Respond</Label>
              <Textarea
                id="flag-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder="e.g. Power cut for 20 minutes — attendance was marked before it."
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              You already responded. The department will review it.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          {(flag.status === "open" || flag.status === "acknowledged") && (
            <Button onClick={respond} disabled={!comment.trim()} loading={sending}>
              <MessageSquare className="mr-1.5 h-4 w-4" aria-hidden />
              Send response
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function FlagsPage() {
  const [openFlag, setOpenFlag] = React.useState<Flag | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["flags", "mine"],
    queryFn: () => api<{ items: Flag[] }>("/my/flags?limit=25"),
    refetchInterval: 15_000,
  });

  if (error) return <ErrorState onRetry={refetch} />;

  const flags = data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Flags"
        description="Differences the camera noticed. Responding helps the department understand your centre."
      />

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : flags.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={TriangleAlert}
            title="No flags"
            hint="If the camera sees fewer people than claimed — or the feed looks wrong — a flag appears here so you can explain."
          />
        </div>
      ) : (
        <ul className="space-y-3">
          {flags.map((f) => (
            <li key={f.id} className="card card-hover flex flex-wrap items-center gap-3 p-5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <FlagTypeChip type={f.type} />
                  <SeverityDot severity={f.severity} />
                  {f.state === "uncertain" && <UncertainChip />}
                </div>
                <p className="mt-2 text-sm font-medium">{f.reason}</p>
                {(f.claimed_count != null || f.observed_count != null) && (
                  <p className="tabular mt-0.5 text-xs text-muted-foreground">
                    Claimed {f.claimed_count ?? "—"} · Camera saw {f.observed_count ?? "—"}
                  </p>
                )}
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {f.created_at ? relativeTime(f.created_at) : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {f.evidence_urls && f.evidence_urls.length > 0 && (
                  <SignedImage
                    url={f.evidence_urls[0]}
                    alt="Evidence thumbnail"
                    gallery={f.evidence_urls}
                    className="h-14 w-20"
                  />
                )}
                <FlagStatusChip status={f.status} />
                <Button size="sm" variant="secondary" onClick={() => setOpenFlag(f)}>
                  Open
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <FlagDetail
        flag={openFlag}
        onClose={() => {
          setOpenFlag(null);
          refetch();
        }}
      />

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        Cameras count people anonymously. Trainee faces are never identified.
      </p>
    </div>
  );
}
