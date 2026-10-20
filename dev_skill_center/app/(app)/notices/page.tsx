"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Send } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { fmtIST } from "@/lib/format";
import { messageFrom } from "@/lib/strings";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import type { Notice } from "@/lib/types";

const LEVEL_CHIP: Record<string, string> = {
  advisory: "border-border bg-surface text-muted-foreground",
  notice: "border-info/40 bg-info/10 text-info",
  warning: "border-warning/40 bg-warning/10 text-warning",
  suspension: "border-danger/40 bg-danger/10 text-danger",
  termination: "border-danger/40 bg-danger/10 text-danger",
};
const LEVEL_LABEL: Record<string, string> = {
  advisory: "Advisory",
  notice: "Notice",
  warning: "Warning",
  suspension: "Suspension",
  termination: "Termination",
};

export default function NoticesPage() {
  const qc = useQueryClient();
  const [replies, setReplies] = React.useState<Record<string, string>>({});
  const [sendingId, setSendingId] = React.useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["notices"],
    queryFn: () => api<{ items: Notice[] }>("/my/notices?limit=25"),
    refetchInterval: 15_000,
  });

  const markRead = async (n: Notice) => {
    if (n.read_at) return;
    try {
      await api(`/my/notices/${n.id}/read`, { method: "POST" });
      qc.invalidateQueries({ queryKey: ["notices"] });
    } catch {
      /* non-critical */
    }
  };

  const reply = async (n: Notice) => {
    const text = (replies[n.id] ?? "").trim();
    if (!text) return;
    setSendingId(n.id);
    try {
      await api(`/my/notices/${n.id}/reply`, {
        method: "POST",
        body: JSON.stringify({ comment: text }),
      });
      toast.success("Reply sent.");
      setReplies((r) => ({ ...r, [n.id]: "" }));
      await qc.invalidateQueries({ queryKey: ["notices"] });
    } catch (err) {
      toast.error(messageFrom(err));
    } finally {
      setSendingId(null);
    }
  };

  if (error) return <ErrorState onRetry={refetch} />;

  const notices = data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Notices"
        description="Messages from the department about your centre."
      />

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : notices.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Bell}
            title="No notices"
            hint="Important messages from the department — like warnings or approval updates — appear here."
          />
        </div>
      ) : (
        <ul className="space-y-3">
          {notices.map((n) => {
            const unread = !n.read_at;
            return (
              <li
                key={n.id}
                className={cn("card p-5", unread && "border-primary/40")}
                onMouseEnter={() => markRead(n)}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex h-6 items-center rounded-full border px-2 text-xs font-medium ${LEVEL_CHIP[n.level] ?? LEVEL_CHIP.advisory}`}
                  >
                    {LEVEL_LABEL[n.level] ?? n.level}
                  </span>
                  {unread && (
                    <span className="flex items-center gap-1 text-xs font-medium text-primary">
                      <span className="h-2 w-2 rounded-full bg-primary" aria-hidden />
                      Unread
                    </span>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {n.created_at ? fmtIST(n.created_at) : ""}
                  </span>
                </div>
                <p className="mt-2 text-sm font-semibold">{n.subject}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{n.body}</p>

                {n.flag_ids && n.flag_ids.length > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Linked to {n.flag_ids.length} flag{n.flag_ids.length === 1 ? "" : "s"} — see the Flags page.
                  </p>
                )}

                {n.reply ? (
                  <div className="mt-3 rounded-[12px] border border-border bg-surface p-3 text-sm">
                    <p className="eyebrow">Your reply</p>
                    <p className="mt-1">{n.reply}</p>
                    {n.replied_at && (
                      <p className="mt-1 text-xs text-muted-foreground">{fmtIST(n.replied_at)}</p>
                    )}
                  </div>
                ) : (
                  <div className="mt-3 space-y-2">
                    <Textarea
                      value={replies[n.id] ?? ""}
                      onChange={(e) => setReplies((r) => ({ ...r, [n.id]: e.target.value }))}
                      rows={2}
                      placeholder="Write a reply…"
                      aria-label={`Reply to ${n.subject}`}
                    />
                    <Button
                      size="sm"
                      onClick={() => reply(n)}
                      disabled={!(replies[n.id] ?? "").trim()}
                      loading={sendingId === n.id}
                    >
                      <Send className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                      Reply
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
