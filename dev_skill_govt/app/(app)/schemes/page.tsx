"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Layers, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/strings";
import { useMe } from "@/hooks/useMe";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Scheme {
  id: string;
  name: string;
  code: string;
  description?: string;
  active: boolean;
  created_at: string;
}

export default function SchemesPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { isSuperAdmin } = useMe();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [code, setCode] = React.useState("");
  const [description, setDescription] = React.useState("");

  const q = useQuery({
    queryKey: ["schemes", "list"],
    queryFn: () => api<Scheme[]>("/schemes?active_only=false"),
    staleTime: 30_000,
  });

  const create = useMutation({
    mutationFn: () =>
      api("/schemes", {
        method: "POST",
        body: JSON.stringify({ name, code, description: description || null }),
      }),
    onSuccess: () => {
      toast.success("Scheme created.");
      qc.invalidateQueries({ queryKey: ["schemes"] });
      setOpen(false);
      setName("");
      setCode("");
      setDescription("");
    },
    onError: (e) => {
      const err = e as { code?: string; message?: string };
      toast.error(getErrorMessage(err.code, err.message));
    },
  });

  const columns: DataTableColumn<Scheme>[] = [
    { key: "code", header: "Code", render: (s) => <span className="font-mono text-xs">{s.code}</span> },
    { key: "name", header: "Scheme", render: (s) => <span className="font-medium">{s.name}</span> },
    {
      key: "description",
      header: "Description",
      render: (s) => <span className="line-clamp-2 text-muted-foreground">{s.description ?? "—"}</span>,
    },
    {
      key: "active",
      header: "State",
      render: (s) => <Badge variant={s.active ? "success" : "neutral"}>{s.active ? "Active" : "Inactive"}</Badge>,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Schemes"
        description="Government schemes and their trade templates. Templates define what the camera should look for — equipment rules, detection classes and count thresholds."
        action={
          isSuperAdmin ? (
            <Button onClick={() => setOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden />
              New scheme
            </Button>
          ) : undefined
        }
      />

      <DataTable
        caption="Schemes"
        columns={columns}
        rows={q.data ?? []}
        getRowId={(s) => s.id}
        loading={q.isLoading}
        error={q.error}
        onRetry={() => q.refetch()}
        onRowClick={(s) => router.push(`/schemes/${s.id}`)}
        empty={
          <EmptyState
            icon={Layers}
            title="No schemes yet"
            hint="Create a scheme, then add trade templates under it."
          />
        }
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New scheme</DialogTitle>
            <DialogDescription>Group trade templates under one government scheme.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sname">Name</Label>
              <Input id="sname" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. PMKVY 4.0" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="scode">Code</Label>
              <Input id="scode" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="PMKVY40" className="font-mono" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sdesc">Description</Label>
              <Textarea id="sdesc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={create.isPending}>
              Cancel
            </Button>
            <Button loading={create.isPending} disabled={!name.trim() || !code.trim()} onClick={() => create.mutate()}>
              Create scheme
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
