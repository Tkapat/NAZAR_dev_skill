"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox, Wrench } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDate, timeAgo } from "@/lib/format";
import { getErrorMessage } from "@/lib/strings";
import { useMe } from "@/hooks/useMe";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Centre } from "@/types";

interface GovtRequest {
  id: string;
  centre_id: string;
  kind: string;
  payload?: Record<string, unknown>;
  equipment_class?: string;
  qty?: number;
  reason?: string;
  status: "pending" | "approved" | "rejected";
  decision_comment?: string;
  decided_at?: string;
  created_at: string;
}

type TabId = "changerequests" | "repairdeclarations";

export default function RequestsPage() {
  const qc = useQueryClient();
  const { canWrite } = useMe();
  const [tab, setTab] = React.useState<TabId>("changerequests");
  const [status, setStatus] = React.useState("pending");
  const [deciding, setDeciding] = React.useState<GovtRequest | null>(null);
  const [approve, setApprove] = React.useState(true);
  const [comment, setComment] = React.useState("");
  const [until, setUntil] = React.useState("");

  const requestsQ = useQuery({
    queryKey: ["requests", tab, status],
    queryFn: () =>
      api<{ items: GovtRequest[] }>(
        `/requests?kind=${tab}${status !== "all" ? `&status=${status}` : ""}&limit=50`
      ),
    refetchInterval: 30_000,
  });

  const centresQ = useQuery({
    queryKey: ["centres", "list"],
    queryFn: () => api<Centre[]>("/centres"),
    staleTime: 60_000,
  });
  const centreById = React.useMemo(() => new Map((centresQ.data ?? []).map((c) => [c.id, c])), [centresQ.data]);

  const decide = useMutation({
    mutationFn: () =>
      api<{ status: string }>(`/requests/${deciding!.id}/decide`, {
        method: "POST",
        body: JSON.stringify({
          approve,
          comment,
          ...(tab === "repairdeclarations" && approve && until ? { approved_until: until } : {}),
        }),
      }),
    onSuccess: (res) => {
      toast.success(`Request ${res.status}.`);
      qc.invalidateQueries({ queryKey: ["requests"] });
      qc.invalidateQueries({ queryKey: ["centres"] });
      setDeciding(null);
      setComment("");
      setUntil("");
    },
    onError: (e) => {
      const err = e as { code?: string; message?: string };
      toast.error(getErrorMessage(err.code, err.message));
    },
  });

  const items = requestsQ.data?.items ?? [];

  const describe = (r: GovtRequest): string => {
    if (r.kind === "repairdeclaration") {
      return `${r.equipment_class ?? "—"} × ${r.qty ?? 1}`;
    }
    if (r.kind === "enrolment") {
      const extra = (r.payload as { extra?: number } | undefined)?.extra;
      return `Extra capacity +${extra ?? "?"} trainees`;
    }
    const p = r.payload ?? {};
    const cls = (p as { class?: string }).class;
    const qty = (p as { qty?: number }).qty;
    if (cls) return `${cls}${qty != null ? ` × ${qty}` : ""}`;
    return Object.entries(p)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join(" · ");
  };

  const columns: DataTableColumn<GovtRequest>[] = [
    {
      key: "centre",
      header: "Centre",
      render: (r) => {
        const c = centreById.get(r.centre_id);
        return c ? (
          <Link href={`/centres/${c.id}`} className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
            <span className="font-mono text-xs">{c.code}</span>
            <span className="ml-1.5 text-xs text-muted-foreground">{c.name}</span>
          </Link>
        ) : (
          "—"
        );
      },
    },
    { key: "kind", header: "Kind", render: (r) => <Badge variant="secondary">{r.kind.replace(/([A-Z])/g, " $1")}</Badge> },
    { key: "what", header: "Requested", render: (r) => <span className="text-sm">{describe(r)}</span> },
    { key: "why", header: "Reason", render: (r) => <span className="line-clamp-2 text-muted-foreground">{r.reason ?? "—"}</span> },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <Badge variant={r.status === "approved" ? "success" : r.status === "rejected" ? "destructive" : "warning"}>
          {r.status}
        </Badge>
      ),
    },
    {
      key: "created",
      header: "Raised",
      render: (r) => <span className="tabular text-muted-foreground">{timeAgo(r.created_at)}</span>,
    },
    {
      key: "actions",
      header: "",
      render: (r) =>
        canWrite && r.status === "pending" ? (
          <span className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
            <Button
              size="sm"
              onClick={() => {
                setDeciding(r);
                setApprove(true);
                setComment("");
              }}
            >
              Review
            </Button>
          </span>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Requests"
        description="Change requests and repair declarations sent by centres. Approving a repair lets the equipment stay declared until the fix date."
      />

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)}>
          <TabsList>
            <TabsTrigger value="changerequests">Change requests</TabsTrigger>
            <TabsTrigger value="repairdeclarations">Repair declarations</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="ml-auto flex items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-36" aria-label="Filter status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <DataTable
        caption="Requests"
        columns={columns}
        rows={items}
        getRowId={(r) => r.id}
        loading={requestsQ.isLoading}
        error={requestsQ.error}
        onRetry={() => requestsQ.refetch()}
        empty={
          <EmptyState
            icon={tab === "repairdeclarations" ? Wrench : Inbox}
            title={status === "pending" ? "No pending requests" : "No requests match"}
            hint={
              tab === "repairdeclarations"
                ? "Repair declarations from centre admins appear here for approval."
                : "Equipment, enrolment and batch change requests appear here for approval."
            }
          />
        }
      />

      <Dialog open={!!deciding} onOpenChange={(o) => !o && setDeciding(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{approve ? "Approve request" : "Reject request"}</DialogTitle>
            <DialogDescription>
              {deciding && centreById.get(deciding.centre_id)
                ? `${centreById.get(deciding.centre_id)!.code} — ${centreById.get(deciding.centre_id)!.name} · ${describe(deciding)}`
                : describingSafe(deciding)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex gap-2">
              <Button
                variant={approve ? "default" : "secondary"}
                className="flex-1"
                onClick={() => setApprove(true)}
                aria-pressed={approve}
              >
                Approve
              </Button>
              <Button
                variant={approve ? "secondary" : "destructive"}
                className="flex-1"
                onClick={() => setApprove(false)}
                aria-pressed={!approve}
              >
                Reject
              </Button>
            </div>

            {approve && tab === "repairdeclarations" && (
              <div className="space-y-2">
                <Label htmlFor="until">Approved until (equipment may stay as declared)</Label>
                <Input id="until" type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="decision-comment">Comment</Label>
              <Textarea
                id="decision-comment"
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={approve ? "Conditions of approval…" : "Why this is rejected…"}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeciding(null)} disabled={decide.isPending}>
              Cancel
            </Button>
            <Button
              variant={approve ? "default" : "destructive"}
              loading={decide.isPending}
              disabled={!comment.trim()}
              onClick={() => decide.mutate()}
            >
              {approve ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function describingSafe(r: GovtRequest | null): string {
  if (!r) return "";
  return `${r.kind} · raised ${fmtDate(r.created_at)}`;
}
