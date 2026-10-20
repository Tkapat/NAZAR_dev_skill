"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Lock, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { fmtIST } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { DecisionChip } from "@/components/shared/StatusChip";
import { RequestDialog, type RequestKind } from "@/components/shared/RequestDialog";
import type { ChangeRequest, MyCentre } from "@/lib/types";

const KIND_LABEL: Record<string, string> = {
  equipment: "Equipment",
  enrolment: "Extra enrolment",
  batch: "Batch",
  camera: "Camera",
  repairdeclarations: "Repair",
  changerequests: "Request",
};

function describe(r: ChangeRequest): string {
  if (r.kind === "repairdeclarations" || r.equipment_class) {
    return `Repair ${r.equipment_class ?? ""} × ${r.qty ?? ""}${r.reason ? ` — ${r.reason}` : ""}`;
  }
  const p = (r.payload ?? {}) as Record<string, unknown>;
  if (r.kind === "equipment") return `Extra ${p.class ?? ""} × ${p.extra_qty ?? ""}`;
  if (r.kind === "enrolment") return `Extra ${p.extra_trainees ?? ""} trainees`;
  if (r.kind === "batch") {
    const days = Array.isArray(p.weekdays) ? (p.weekdays as number[]).join(",") : "";
    return `Batch ${p.name ?? ""} (${days}) ${p.start_time ?? ""}-${p.end_time ?? ""}`;
  }
  if (r.kind === "camera") return `Camera ${p.name ?? ""}`;
  return r.reason ?? "Request";
}

export default function RequestsPage() {
  const [kind, setKind] = React.useState<"all" | RequestKind | "repairs">("all");
  const [createKind, setCreateKind] = React.useState<RequestKind | null>(null);
  const qc = useQueryClient();

  const centreQ = useQuery({
    queryKey: ["centre", "mine"],
    queryFn: () => api<MyCentre>("/my/centre"),
  });

  // Backend accepts kind=changerequests | repairdeclarations only;
  // specific change kinds are filtered client-side.
  const query =
    kind === "all"
      ? "/my/requests?limit=25"
      : kind === "repairs"
        ? "/my/requests?kind=repairdeclarations&limit=25"
        : "/my/requests?kind=changerequests&limit=25";

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["requests", kind],
    queryFn: () => api<{ items: ChangeRequest[] }>(query),
    refetchInterval: 15_000,
  });

  if (error) return <ErrorState onRetry={refetch} />;

  const raw = data?.items ?? [];
  const items =
    kind === "all" || kind === "repairs"
      ? raw
      : raw.filter((r) => r.kind === kind);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Requests"
        description="Changes that need government approval, plus your repair declarations."
        action={
          <Button onClick={() => setCreateKind("equipment")}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden />
            New request
          </Button>
        }
      />

      <Tabs value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="equipment">Equipment</TabsTrigger>
          <TabsTrigger value="enrolment">Enrolment</TabsTrigger>
          <TabsTrigger value="batch">Batch</TabsTrigger>
          <TabsTrigger value="camera">Camera</TabsTrigger>
          <TabsTrigger value="repairs">Repairs</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : items.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={ClipboardList}
            title="No requests yet"
            hint="When you need more seats, equipment or a new batch after approval, send a request here."
          />
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((r) => (
            <li key={r.id} className="card flex flex-wrap items-center gap-3 p-5">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                  {KIND_LABEL[r.kind] ?? r.kind}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">{describe(r)}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Sent {r.created_at ? fmtIST(r.created_at) : "—"}
                  {r.decided_at ? ` · decided ${fmtIST(r.decided_at)}` : ""}
                </p>
                {r.decision_comment && (
                  <p className="mt-2 rounded-[12px] border border-border bg-surface p-3 text-sm">
                    <span className="eyebrow">Officer comment</span>
                    <span className="mt-1 block">{r.decision_comment}</span>
                  </p>
                )}
              </div>
              <DecisionChip status={r.status} />
            </li>
          ))}
        </ul>
      )}

      <RequestDialog
        open={!!createKind}
        onOpenChange={(v) => !v && setCreateKind(null)}
        kind={createKind ?? "equipment"}
        equipmentClasses={(centreQ.data?.centre?.equipment ?? []).map((e) => ({
          class: e.class,
          label: e.label,
        }))}
        centre={centreQ.data?.centre ?? null}
        onCreated={() => qc.invalidateQueries({ queryKey: ["requests"] })}
      />
    </div>
  );
}
