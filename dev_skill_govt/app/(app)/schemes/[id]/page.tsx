"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Layers, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { getErrorMessage } from "@/lib/strings";
import { useMe } from "@/hooks/useMe";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorState } from "@/components/shared/ErrorState";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Scheme {
  id: string;
  name: string;
  code: string;
  description?: string;
  active: boolean;
}

interface Template {
  id: string;
  scheme_id: string;
  trade_name: string;
  detector_classes: string[];
  equipment_rules: unknown[];
  active: boolean;
  updated_at?: string;
  created_at?: string;
}

export default function SchemeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { isSuperAdmin } = useMe();

  const [open, setOpen] = React.useState(false);
  const [tradeName, setTradeName] = React.useState("");
  const [classes, setClasses] = React.useState("");

  const schemeQ = useQuery({
    queryKey: ["scheme", id],
    queryFn: () => api<Scheme>(`/schemes/${id}`),
    staleTime: 30_000,
  });

  const templatesQ = useQuery({
    queryKey: ["templates", id],
    queryFn: () => api<Template[]>(`/schemes/${id}/templates?active_only=false`),
    staleTime: 30_000,
  });

  const create = useMutation({
    mutationFn: () =>
      api<Template>(`/schemes/${id}/templates`, {
        method: "POST",
        body: JSON.stringify({
          trade_name: tradeName,
          detector_classes: classes.split(",").map((c) => c.trim()).filter(Boolean),
          equipment_rules: [],
        }),
      }),
    onSuccess: (t) => {
      toast.success("Trade template created.");
      qc.invalidateQueries({ queryKey: ["templates", id] });
      setOpen(false);
      setTradeName("");
      setClasses("");
      router.push(`/schemes/${id}/templates/${t.id}`);
    },
    onError: (e) => {
      const err = e as { code?: string; message?: string };
      toast.error(getErrorMessage(err.code, err.message));
    },
  });

  if (schemeQ.error) {
    return (
      <div className="rounded-lg border bg-card">
        <ErrorState onRetry={() => schemeQ.refetch()} />
      </div>
    );
  }

  const columns: DataTableColumn<Template>[] = [
    { key: "name", header: "Trade", render: (t) => <span className="font-medium">{t.trade_name}</span> },
    {
      key: "classes",
      header: "Detector classes",
      render: (t) => (
        <span className="flex flex-wrap gap-1">
          {(t.detector_classes ?? []).length === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            t.detector_classes.slice(0, 4).map((c) => (
              <Badge key={c} variant="secondary" className="font-mono text-[11px]">
                {c}
              </Badge>
            ))
          )}
        </span>
      ),
    },
    {
      key: "rules",
      header: "Equipment rules",
      numeric: true,
      render: (t) => t.equipment_rules?.length ?? 0,
    },
    {
      key: "active",
      header: "State",
      render: (t) => <Badge variant={t.active ? "success" : "neutral"}>{t.active ? "Active" : "Inactive"}</Badge>,
    },
    {
      key: "updated",
      header: "Updated",
      render: (t) => <span className="tabular text-muted-foreground">{fmtDate(t.updated_at ?? t.created_at ?? new Date().toISOString())}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={schemeQ.data?.code}
        title={schemeQ.data?.name ?? "Scheme"}
        description={schemeQ.data?.description}
        action={
          <>
            <Button variant="ghost" size="sm" onClick={() => router.push("/schemes")}>
              <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden />
              All schemes
            </Button>
            {isSuperAdmin && (
              <Button onClick={() => setOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" aria-hidden />
                New template
              </Button>
            )}
          </>
        }
      />

      {schemeQ.isLoading ? (
        <Skeleton className="h-8 w-64" />
      ) : (
        <p className="text-sm text-muted-foreground">
          {templatesQ.data?.length ?? 0} trade template(s) under this scheme. Click a template to edit detection rules.
        </p>
      )}

      <DataTable
        caption="Trade templates"
        columns={columns}
        rows={templatesQ.data ?? []}
        getRowId={(t) => t.id}
        loading={templatesQ.isLoading}
        error={templatesQ.error}
        onRetry={() => templatesQ.refetch()}
        onRowClick={(t) => router.push(`/schemes/${id}/templates/${t.id}`)}
        empty={
          <EmptyState
            icon={Layers}
            title="No trade templates"
            hint="A template tells the camera which classes to detect and what equipment is required for this trade."
            action={
              isSuperAdmin ? (
                <Button size="sm" onClick={() => setOpen(true)}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  New template
                </Button>
              ) : undefined
            }
          />
        }
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New trade template</DialogTitle>
            <DialogDescription>Add detection classes now; equipment rules can be edited after creation.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tname">Trade name</Label>
              <Input id="tname" value={tradeName} onChange={(e) => setTradeName(e.target.value)} placeholder="e.g. Electrician" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tclasses">Detector classes (comma separated)</Label>
              <Input
                id="tclasses"
                value={classes}
                onChange={(e) => setClasses(e.target.value)}
                placeholder="person, toolbox, wire stripper"
                className="font-mono"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={create.isPending}>
              Cancel
            </Button>
            <Button loading={create.isPending} disabled={!tradeName.trim()} onClick={() => create.mutate()}>
              Create template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
