"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Upload, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { messageFrom } from "@/lib/strings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Meter } from "@/components/ui/meter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { RequestDialog } from "@/components/shared/RequestDialog";
import type { Batch, MyCentre, Trainee } from "@/lib/types";

function AddTraineeDialog({
  open,
  onOpenChange,
  batches,
  atCap,
  onExtra,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  batches: Batch[];
  atCap: boolean;
  onExtra: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = React.useState("");
  const [externalId, setExternalId] = React.useState("");
  const [batchId, setBatchId] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName("");
      setExternalId("");
      setBatchId("");
    }
  }, [open]);

  const submit = async () => {
    setSaving(true);
    try {
      await api("/my/trainees", {
        method: "POST",
        body: JSON.stringify({
          full_name: name.trim(),
          external_id: externalId.trim() || null,
          batch_id: batchId || null,
        }),
      });
      toast.success("Trainee added.");
      await qc.invalidateQueries({ queryKey: ["trainees"] });
      await qc.invalidateQueries({ queryKey: ["centre", "mine"] });
      onOpenChange(false);
    } catch (err) {
      const e = err as { code?: string };
      if (e.code === "ENROLMENT_CAP_REACHED") {
        toast.error("Sanctioned limit reached. Request extra enrolment.");
        onOpenChange(false);
        onExtra();
      } else {
        toast.error(messageFrom(err));
      }
    } finally {
      setSaving(false);
    }
  };

  if (atCap) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Enrolment limit reached</DialogTitle>
            <DialogDescription>
              Your sanctioned limit is reached. Request extra enrolment — the department will decide.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button
              onClick={() => {
                onOpenChange(false);
                onExtra();
              }}
            >
              Request extra enrolment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add trainee</DialogTitle>
          <DialogDescription>No photo is ever taken of trainees.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="t-name">Full name</Label>
            <Input id="t-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ravi Kumar" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="t-id">External ID (optional)</Label>
            <Input id="t-id" value={externalId} onChange={(e) => setExternalId(e.target.value)} placeholder="ADM-2026-014" className="font-mono" />
          </div>
          <div className="space-y-2">
            <Label>Batch</Label>
            <Select value={batchId} onValueChange={setBatchId}>
              <SelectTrigger aria-label="Batch">
                <SelectValue placeholder="No batch" />
              </SelectTrigger>
              <SelectContent>
                {batches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving} disabled={!name.trim() || saving}>
            Add trainee
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CsvImportDialog({
  open,
  onOpenChange,
  batches,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  batches: Batch[];
  onDone: () => void;
}) {
  const [rows, setRows] = React.useState<{ full_name: string; external_id?: string }[]>([]);
  const [batchId, setBatchId] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [added, setAdded] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (open) {
      setRows([]);
      setAdded(null);
    }
  }, [open]);

  const parse = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      const header = lines[0]?.toLowerCase() ?? "";
      const start = header.includes("name") ? 1 : 0;
      const parsed = lines
        .slice(start)
        .map((l) => {
          const [full_name, external_id] = l.split(",").map((c) => c.trim());
          return { full_name, external_id: external_id || undefined };
        })
        .filter((r) => r.full_name);
      setRows(parsed.slice(0, 200));
    };
    reader.readAsText(file);
  };

  const run = async () => {
    setSending(true);
    let n = 0;
    try {
      for (const r of rows) {
        try {
          await api("/my/trainees", {
            method: "POST",
            body: JSON.stringify({
              full_name: r.full_name,
              external_id: r.external_id ?? null,
              batch_id: batchId || null,
            }),
          });
          n += 1;
        } catch {
          break; // stop at the cap and report
        }
      }
      setAdded(n);
      onDone();
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import trainees (CSV)</DialogTitle>
          <DialogDescription>
            Two columns: name, external ID. A header row is optional. We stop at the cap and tell you how many
            were added.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="csv-file">CSV file</Label>
            <Input
              id="csv-file"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) parse(f);
              }}
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <Label>Batch</Label>
            <Select value={batchId} onValueChange={setBatchId}>
              <SelectTrigger aria-label="Batch">
                <SelectValue placeholder="No batch" />
              </SelectTrigger>
              <SelectContent>
                {batches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {rows.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-[12px] border border-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">External ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5">{r.full_name}</td>
                      <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">{r.external_id ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {added != null && (
            <p className="rounded-[12px] border border-success/40 bg-success/10 p-3 text-sm text-success">
              Added {added} of {rows.length} trainees.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={sending}>
            Close
          </Button>
          <Button onClick={run} loading={sending} disabled={rows.length === 0 || sending}>
            Import {rows.length} trainee{rows.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function TraineesPage() {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = React.useState(false);
  const [csvOpen, setCsvOpen] = React.useState(false);
  const [extraOpen, setExtraOpen] = React.useState(false);
  const [deactivateId, setDeactivateId] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [batchFilter, setBatchFilter] = React.useState("all");
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [accum, setAccum] = React.useState<Trainee[]>([]);

  const centreQ = useQuery({
    queryKey: ["centre", "mine"],
    queryFn: () => api<MyCentre>("/my/centre"),
  });
  const batchesQ = useQuery({
    queryKey: ["batches"],
    queryFn: () => api<{ items: Batch[] }>("/my/batches?limit=50"),
  });
  const listQ = useQuery({
    queryKey: ["trainees", batchFilter],
    queryFn: () =>
      api<{ items: Trainee[]; next_cursor: string | null }>(
        `/my/trainees?limit=25${batchFilter !== "all" ? `&batch_id=${batchFilter}` : ""}`,
      ),
  });

  React.useEffect(() => {
    setAccum(listQ.data?.items ?? []);
    setCursor(listQ.data?.next_cursor ?? null);
  }, [listQ.data]);

  const centre = centreQ.data?.centre;
  const enrolled = centre?.enrolled_count ?? 0;
  const max = centre?.max_trainees ?? 0;
  const atCap = max > 0 && enrolled >= max;

  const all = accum;
  const filtered = search
    ? all.filter(
        (t) =>
          t.full_name.toLowerCase().includes(search.toLowerCase()) ||
          (t.external_id ?? "").toLowerCase().includes(search.toLowerCase()),
      )
    : all;

  const loadMore = async () => {
    if (!cursor) return;
    const q = await api<{ items: Trainee[]; next_cursor: string | null }>(
      `/my/trainees?limit=25&cursor=${cursor}${batchFilter !== "all" ? `&batch_id=${batchFilter}` : ""}`,
    );
    setAccum((cur) => [...cur, ...q.items]);
    setCursor(q.next_cursor);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="People"
        title="Trainees"
        description="Trainees are never photographed or scanned."
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setCsvOpen(true)}>
              <Upload className="mr-1.5 h-4 w-4" aria-hidden />
              Import CSV
            </Button>
            <Button onClick={() => setAddOpen(true)} disabled={atCap}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden />
              Add trainee
            </Button>
          </div>
        }
      />

      <div className="card p-5">
        <Meter
          value={enrolled}
          max={max || 1}
          label={`${enrolled} / ${max} enrolled`}
          threshold={{ warning: 0.9, danger: 1 }}
        />
        {atCap && (
          <div className="mt-3 flex items-center gap-3">
            <p className="flex-1 text-sm text-warning">Sanctioned limit reached.</p>
            <Button size="sm" onClick={() => setExtraOpen(true)}>
              Request extra enrolment
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or ID"
            aria-label="Search trainees"
            className="pl-9"
          />
        </div>
        <Select value={batchFilter} onValueChange={setBatchFilter}>
          <SelectTrigger aria-label="Filter by batch" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All batches</SelectItem>
            {(batchesQ.data?.items ?? []).map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {listQ.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : listQ.error ? (
        <ErrorState onRetry={() => listQ.refetch()} />
      ) : filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Users}
            title={search ? "No trainees match" : "No trainees yet"}
            hint={search ? "Try a different name or ID." : "Add trainees one by one, or import a CSV."}
            action={
              !search ? (
                <Button size="sm" onClick={() => setAddOpen(true)}>
                  <UserPlus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  Add trainee
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 border-b border-border bg-surface text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">ID</th>
                  <th className="px-4 py-3 font-medium">Batch</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((t) => {
                  const batch = (batchesQ.data?.items ?? []).find((b) => b.id === t.batch_id);
                  return (
                    <tr key={t.id}>
                      <td className="px-4 py-3 font-medium">{t.full_name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{t.external_id ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{batch?.name ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex h-6 items-center rounded-full border px-2 text-xs font-medium ${
                            t.active
                              ? "border-success/40 bg-success/10 text-success"
                              : "border-border bg-surface text-muted-foreground"
                          }`}
                        >
                          {t.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {t.active && (
                          <Button size="sm" variant="ghost" onClick={() => setDeactivateId(t.id)}>
                            Deactivate
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {cursor && (
            <div className="flex justify-center border-t border-border p-3">
              <Button variant="secondary" size="sm" onClick={loadMore}>
                Load more
              </Button>
            </div>
          )}
        </div>
      )}

      <AddTraineeDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        batches={batchesQ.data?.items ?? []}
        atCap={atCap}
        onExtra={() => setExtraOpen(true)}
      />
      <CsvImportDialog
        open={csvOpen}
        onOpenChange={setCsvOpen}
        batches={batchesQ.data?.items ?? []}
        onDone={() => {
          qc.invalidateQueries({ queryKey: ["trainees"] });
          qc.invalidateQueries({ queryKey: ["centre", "mine"] });
        }}
      />
      <RequestDialog
        open={extraOpen}
        onOpenChange={setExtraOpen}
        kind="enrolment"
        title="Request extra enrolment"
      />
      <ConfirmDialog
        open={!!deactivateId}
        onOpenChange={(v) => !v && setDeactivateId(null)}
        title="Deactivate this trainee?"
        description="They stay in past attendance records but stop counting toward the cap."
        destructive
        confirmLabel="Deactivate"
        onConfirm={async () => {
          if (!deactivateId) return;
          try {
            await api(`/my/trainees/${deactivateId}/deactivate`, { method: "POST" });
            toast.success("Trainee deactivated.");
            await qc.invalidateQueries({ queryKey: ["trainees"] });
            await qc.invalidateQueries({ queryKey: ["centre", "mine"] });
          } catch (err) {
            toast.error(messageFrom(err));
          } finally {
            setDeactivateId(null);
          }
        }}
      />
    </div>
  );
}
