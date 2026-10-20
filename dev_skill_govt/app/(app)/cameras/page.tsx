"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera as CameraIcon, CheckCircle2, Eye, EyeOff, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { fmtIST, timeAgo } from "@/lib/format";
import { getErrorMessage } from "@/lib/strings";
import { SOURCE_KIND_LABEL } from "@/lib/constants";
import { useMe } from "@/hooks/useMe";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { KpiCard, KpiRowSkeleton } from "@/components/shared/KpiCard";
import { CameraStatusChip, DecisionChip } from "@/components/shared/StatusChip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Camera, Centre } from "@/types";

export default function CamerasPage() {
  const qc = useQueryClient();
  const { canWrite } = useMe();
  const [status, setStatus] = React.useState("all");
  const [setup, setSetup] = React.useState("all");
  const [rejectCam, setRejectCam] = React.useState<Camera | null>(null);
  const [reason, setReason] = React.useState("");

  const camerasQ = useQuery({
    queryKey: ["cameras", "all"],
    queryFn: () => api<{ items: Camera[] }>("/cameras?limit=100"),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const centresQ = useQuery({
    queryKey: ["centres", "list"],
    queryFn: () => api<Centre[]>("/centres"),
    staleTime: 60_000,
  });

  const centreById = React.useMemo(() => new Map((centresQ.data ?? []).map((c) => [c.id, c])), [centresQ.data]);
  const cams = camerasQ.data?.items ?? [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["cameras"] });
    qc.invalidateQueries({ queryKey: ["centres"] });
  };

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

  const pending = cams.filter((c) => c.setup_status === "submitted");
  const online = cams.filter((c) => c.status === "online").length;
  const offline = cams.filter((c) => c.status === "offline").length;
  const tampered = cams.filter((c) => c.status === "tampered").length;

  const rows = cams.filter((c) => {
    if (status !== "all" && c.status !== status) return false;
    if (setup !== "all" && c.setup_status !== setup) return false;
    return true;
  });

  const columns: DataTableColumn<Camera>[] = [
    { key: "name", header: "Camera", render: (c) => <span className="font-medium">{c.name}</span> },
    {
      key: "kind",
      header: "Kind",
      render: (c) =>
        c.source_kind ? (
          <Badge variant="secondary" className="font-mono text-[10px]">
            {SOURCE_KIND_LABEL[c.source_kind] ?? c.source_kind}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      key: "centre",
      header: "Centre",
      render: (c) => {
        const centre = centreById.get(c.centre_id);
        return centre ? (
          <Link href={`/centres/${centre.id}`} className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
            <span className="font-mono text-xs">{centre.code}</span>
            <span className="ml-1.5 text-xs text-muted-foreground">{centre.name}</span>
          </Link>
        ) : (
          "—"
        );
      },
    },
    { key: "runtime", header: "Runtime", render: (c) => <CameraStatusChip status={c.status} /> },
    { key: "setup", header: "Setup", render: (c) => <DecisionChip status={c.setup_status} /> },
    {
      key: "seen",
      header: "Last seen",
      render: (c) => (
        <span className="tabular text-muted-foreground">{c.last_seen ? timeAgo(c.last_seen) : "Never"}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (c) =>
        canWrite && c.setup_status === "submitted" ? (
          <span className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
            <Button
              size="sm"
              loading={approve.isPending && approve.variables === c.id}
              onClick={() => approve.mutate(c.id)}
            >
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" aria-hidden />
              Approve
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setRejectCam(c)}>
              <XCircle className="mr-1 h-3.5 w-3.5" aria-hidden />
              Reject
            </Button>
          </span>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cameras"
        description="Live camera health across every centre, plus setup approvals. Approving the last submitted camera takes the centre live."
      />

      {camerasQ.isLoading ? (
        <KpiRowSkeleton count={4} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <KpiCard eyebrow="Cameras total" value={cams.length} loading={false} />
          <KpiCard eyebrow="Online" value={online} loading={false} />
          <KpiCard eyebrow="Offline" value={offline} href="/cameras" loading={false} />
          <KpiCard eyebrow="Tampered" value={tampered} loading={false} />
        </div>
      )}

      {canWrite && pending.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Awaiting setup approval ({pending.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pending.map((c) => {
              const centre = centreById.get(c.centre_id);
              return (
                <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {centre ? `${centre.code} — ${centre.name}` : "Unknown centre"} · submitted{" "}
                      {c.submitted_at ? timeAgo(c.submitted_at) : "—"}
                    </p>
                    {c.reference_quality && (
                      <p className="tabular text-xs text-muted-foreground">
                        Brightness {c.reference_quality.brightness.toFixed(1)} · Sharpness{" "}
                        {c.reference_quality.sharpness.toFixed(1)} · Coverage{" "}
                        {c.reference_quality.coverage.toFixed(1)}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      loading={approve.isPending && approve.variables === c.id}
                      onClick={() => approve.mutate(c.id)}
                    >
                      <Eye className="mr-1 h-3.5 w-3.5" aria-hidden />
                      Approve setup
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => setRejectCam(c)}>
                      <EyeOff className="mr-1 h-3.5 w-3.5" aria-hidden />
                      Reject
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Runtime status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-44" aria-label="Filter runtime status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="online">Online</SelectItem>
              <SelectItem value="offline">Offline</SelectItem>
              <SelectItem value="tampered">Tampered</SelectItem>
              <SelectItem value="unknown">Unknown</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Setup status</Label>
          <Select value={setup} onValueChange={setSetup}>
            <SelectTrigger className="w-44" aria-label="Filter setup status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <DataTable
        caption="Cameras"
        columns={columns}
        rows={rows}
        getRowId={(c) => c.id}
        loading={camerasQ.isLoading}
        error={camerasQ.error}
        onRetry={() => camerasQ.refetch()}
        empty={
          <EmptyState
            icon={CameraIcon}
            title="No cameras match"
            hint="Cameras submitted by centres appear here once the edge app registers them."
          />
        }
      />

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

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <CameraIcon className="h-3.5 w-3.5" aria-hidden />
        Cameras count people anonymously. Trainee faces are never identified.
        <span className="ml-auto">{fmtIST(new Date())}</span>
      </p>
    </div>
  );
}
