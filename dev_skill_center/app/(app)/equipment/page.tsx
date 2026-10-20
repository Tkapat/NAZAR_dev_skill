"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Wrench } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { fmtShortDate } from "@/lib/format";
import { messageFrom } from "@/lib/strings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { RequestDialog } from "@/components/shared/RequestDialog";
import { DecisionChip } from "@/components/shared/StatusChip";
import type { EquipmentItem, MyCentre, Repair } from "@/lib/types";

// max expected-fix date for the repair dialog (module scope, not render)
const MAX_FIX_DATE = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);

const OBS_CHIP: Record<string, { label: string; cls: string }> = {
  ok: { label: "OK", cls: "border-success/40 bg-success/10 text-success" },
  missing: { label: "Missing", cls: "border-warning/40 bg-warning/10 text-warning" },
  idle: { label: "Idle", cls: "border-info/40 bg-info/10 text-info" },
  repair_approved: { label: "Repair approved", cls: "border-info/40 bg-info/10 text-info" },
  unknown: { label: "Not observed yet", cls: "border-border bg-surface text-muted-foreground" },
};

function RepairDialog({
  open,
  onOpenChange,
  item,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: EquipmentItem | null;
  onDone: () => void;
}) {
  const [qty, setQty] = React.useState("1");
  const [reason, setReason] = React.useState("");
  const [fixDate, setFixDate] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setQty("1");
      setReason("");
      setFixDate("");
    }
  }, [open]);

  const submit = async () => {
    if (!item) return;
    setSaving(true);
    try {
      await api("/my/repair-declarations", {
        method: "POST",
        body: JSON.stringify({
          equipment_class: item.class,
          qty: Number(qty) || 1,
          reason: reason.trim(),
          expected_fix_date: fixDate,
        }),
      });
      toast.success("Repair declared. The department will review it.");
      onOpenChange(false);
      onDone();
    } catch (err) {
      toast.error(messageFrom(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Declare repair</DialogTitle>
          <DialogDescription>
            {item?.label ?? ""} — pending government approval. Approved repairs pause observation checks until
            the fix date.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rep-qty">Quantity</Label>
            <Input id="rep-qty" type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rep-reason">What is wrong?</Label>
            <Input
              id="rep-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Motor makes a loud noise"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rep-date">Expected fix date (max 30 days)</Label>
            <Input
              id="rep-date"
              type="date"
              value={fixDate}
              onChange={(e) => setFixDate(e.target.value)}
              max={MAX_FIX_DATE}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!reason.trim() || !fixDate || saving} loading={saving}>
            Declare repair
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function EquipmentPage() {
  const qc = useQueryClient();
  const [repairItem, setRepairItem] = React.useState<EquipmentItem | null>(null);
  const [extraOpen, setExtraOpen] = React.useState(false);
  const [draftQty, setDraftQty] = React.useState<Record<string, string>>({});
  const [savingClass, setSavingClass] = React.useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["equipment"],
    queryFn: () => api<{ items: EquipmentItem[] }>("/my/equipment"),
    refetchInterval: 15_000,
  });
  const centreQ = useQuery({
    queryKey: ["centre", "mine"],
    queryFn: () => api<MyCentre>("/my/centre"),
  });

  if (error) return <ErrorState onRetry={refetch} />;

  const items = data?.items ?? [];
  const repairs = items.flatMap((i) => i.repairs ?? []);
  const classes = items.map((i) => ({ class: i.class, label: i.label }));

  const saveDeclared = async (item: EquipmentItem) => {
    const raw = draftQty[item.class] ?? String(item.declared_qty);
    const qty = Math.max(0, Number(raw) || 0);
    setSavingClass(item.class);
    try {
      await api("/my/equipment", {
        method: "PUT",
        body: JSON.stringify({ class: item.class, declared_qty: qty }),
      });
      toast.success("Inventory saved.");
      await qc.invalidateQueries({ queryKey: ["equipment"] });
      await qc.invalidateQueries({ queryKey: ["centre", "mine"] });
    } catch (err) {
      toast.error(messageFrom(err));
    } finally {
      setSavingClass(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Setup"
        title="Equipment"
        description="Declare what your centre actually has. The camera check compares this with what it sees."
        action={
          <Button onClick={() => setExtraOpen(true)} variant="secondary">
            <Plus className="mr-1.5 h-4 w-4" aria-hidden />
            Request more
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : items.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Wrench}
            title="No equipment declared"
            hint="Your scheme includes required equipment. Declare what you have so attendance checks make sense."
          />
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((it) => {
            const obs = OBS_CHIP[it.observed_status] ?? OBS_CHIP.unknown;
            const differs = it.declared_qty !== it.sanctioned_qty;
            const qty = draftQty[it.class] ?? String(it.declared_qty);
            return (
              <li key={it.class} className="card p-5">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      {it.label}
                      {!it.required && (
                        <span className="ml-2 rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] text-muted-foreground">
                          Optional
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Sanctioned {it.sanctioned_qty} · Declared {it.declared_qty}
                      {it.observed_at ? ` · Last observed ${fmtShortDate(it.observed_at.slice(0, 10))}` : ""}
                    </p>
                  </div>
                  <span className={`inline-flex h-6 items-center rounded-full border px-2 text-xs font-medium ${obs.cls}`}>
                    {obs.label}
                  </span>
                </div>

                {differs && (
                  <p className="mt-3 rounded-[12px] border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
                    Your declared quantity differs from what was sanctioned. That is fine — declare what you
                    truly have.
                  </p>
                )}

                {(it.repair_pending || it.repair_approved) && (
                  <p className="mt-3 flex items-center gap-2 text-sm text-info">
                    <Wrench className="h-4 w-4" aria-hidden />
                    {it.repair_approved ? "Repair approved" : "Repair pending approval"}
                  </p>
                )}

                <div className="mt-4 flex flex-wrap items-end gap-3">
                  <div className="space-y-1">
                    <Label htmlFor={`qty-${it.class}`} className="text-xs">
                      Declared quantity
                    </Label>
                    <Input
                      id={`qty-${it.class}`}
                      type="number"
                      min={0}
                      value={qty}
                      onChange={(e) => setDraftQty((d) => ({ ...d, [it.class]: e.target.value }))}
                      className="h-10 w-28"
                      disabled={savingClass === it.class}
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => saveDeclared(it)}
                    loading={savingClass === it.class}
                    disabled={qty === String(it.declared_qty)}
                  >
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setRepairItem(it)}>
                    <Wrench className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    Declare repair
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {repairs.length > 0 && (
        <section className="card overflow-hidden" aria-label="Repairs">
          <h2 className="border-b border-border px-5 py-4 text-sm font-semibold">Repairs</h2>
          <ul className="divide-y divide-border">
            {repairs.map((r: Repair) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <span className="min-w-0 flex-1">
                  {items.find((i) => i.class === r.equipment_class)?.label ?? r.equipment_class} × {r.qty}
                  <span className="block text-xs text-muted-foreground">{r.reason}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  Fix by {r.expected_fix_date ? fmtShortDate(r.expected_fix_date) : "—"}
                  {r.approved_until ? ` · approved until ${fmtShortDate(r.approved_until.slice(0, 10))}` : ""}
                </span>
                <DecisionChip status={r.status} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <RepairDialog
        open={!!repairItem}
        onOpenChange={(v) => !v && setRepairItem(null)}
        item={repairItem}
        onDone={() => {
          qc.invalidateQueries({ queryKey: ["equipment"] });
          qc.invalidateQueries({ queryKey: ["requests"] });
        }}
      />
      <RequestDialog
        open={extraOpen}
        onOpenChange={setExtraOpen}
        kind="equipment"
        title="Request more equipment"
        equipmentClasses={classes}
        centre={centreQ.data?.centre ?? null}
        onCreated={() => qc.invalidateQueries({ queryKey: ["requests"] })}
      />
    </div>
  );
}
