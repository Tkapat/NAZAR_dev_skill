"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { WEEKDAYS } from "@/lib/constants";
import { fmtClock, fmtDate } from "@/lib/format";
import { messageFrom } from "@/lib/strings";
import { cn } from "@/lib/utils";
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
import type { Batch, Staff } from "@/lib/types";

function BatchDialog({
  open,
  onOpenChange,
  editing,
  staff,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Batch | null;
  staff: Staff[];
}) {
  const qc = useQueryClient();
  const [name, setName] = React.useState("");
  const [trainerId, setTrainerId] = React.useState("");
  const [days, setDays] = React.useState<number[]>([1, 3, 5]);
  const [startTime, setStartTime] = React.useState("09:30");
  const [endTime, setEndTime] = React.useState("11:30");
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setTrainerId(editing.trainer_id ?? "");
      setDays(editing.weekdays ?? []);
      setStartTime(editing.start_time ?? "09:30");
      setEndTime(editing.end_time ?? "11:30");
      setStartDate(editing.start_date ?? "");
      setEndDate(editing.end_date ?? "");
    } else {
      setName("");
      setTrainerId("");
      setDays([1, 3, 5]);
      setStartTime("09:30");
      setEndTime("11:30");
      setStartDate("");
      setEndDate("");
    }
  }, [open, editing]);

  const submit = async () => {
    setSaving(true);
    const body = {
      name: name.trim(),
      trainer_id: trainerId || null,
      weekdays: days,
      start_time: startTime,
      end_time: endTime,
      start_date: startDate || null,
      end_date: endDate || null,
    };
    try {
      if (editing) {
        await api(`/my/batches/${editing.id}`, { method: "PUT", body: JSON.stringify(body) });
        toast.success("Batch updated. Upcoming sessions were regenerated.");
      } else {
        await api("/my/batches", { method: "POST", body: JSON.stringify(body) });
        toast.success("Batch created.");
      }
      await qc.invalidateQueries({ queryKey: ["batches"] });
      await qc.invalidateQueries({ queryKey: ["centre", "mine"] });
      onOpenChange(false);
    } catch (err) {
      const e = err as { code?: string };
      if (e.code === "NEEDS_APPROVAL") {
        toast.info("Changes to your timetable need government approval. We will send a request for you.");
        await api("/my/requests", {
          method: "POST",
          body: JSON.stringify({
            kind: "batch",
            payload: body,
            reason: editing ? "Edit batch timetable" : "New batch after approval",
          }),
        }).catch(() => {});
        await qc.invalidateQueries({ queryKey: ["requests"] });
        onOpenChange(false);
      } else {
        toast.error(messageFrom(err));
      }
    } finally {
      setSaving(false);
    }
  };

  const trainers = staff.filter((s) => s.staff_role === "trainer" && s.active);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit batch" : "New batch"}</DialogTitle>
          <DialogDescription>
            Monitoring runs only inside these windows.
            {editing && " Changes are logged and the government can see them."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="b-name">Batch name</Label>
            <Input id="b-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Morning Lab" />
          </div>
          <div className="space-y-2">
            <Label>Trainer</Label>
            <Select value={trainerId} onValueChange={setTrainerId}>
              <SelectTrigger aria-label="Trainer">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                {trainers.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Weekdays</Label>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((d) => {
                const on = days.includes(d.n);
                return (
                  <button
                    key={d.n}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setDays((cur) => (on ? cur.filter((n) => n !== d.n) : [...cur, d.n].sort()))
                    }
                    className={cn(
                      "h-10 min-w-11 rounded-full border px-3 text-sm font-medium transition-colors",
                      on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {d.short}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="b-start">Start time</Label>
              <Input id="b-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="b-end">End time</Label>
              <Input id="b-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="b-sdate">Start date</Label>
              <Input id="b-sdate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="b-edate">End date</Label>
              <Input id="b-edate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          <div className="rounded-[12px] border border-border bg-surface p-3">
            <p className="eyebrow">Weekly preview</p>
            <p className="mt-1 text-sm">
              {days.length === 0
                ? "Pick at least one weekday."
                : days
                    .map((n) => WEEKDAYS.find((d) => d.n === n)?.long)
                    .filter(Boolean)
                    .join(", ")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {fmtClock(startTime)} - {fmtClock(endTime)}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            loading={saving}
            disabled={!name.trim() || days.length === 0 || saving}
          >
            {editing ? "Save changes" : "Create batch"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HolidayCard() {
  const qc = useQueryClient();
  const [date, setDate] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [removeId, setRemoveId] = React.useState<string | null>(null);

  const q = useQuery({
    queryKey: ["holidays"],
    queryFn: () => api<{ items: { id: string; holiday_date: string; reason?: string }[] }>("/my/holidays?limit=25"),
  });

  const add = async () => {
    setAdding(true);
    try {
      await api("/my/holidays", {
        method: "POST",
        body: JSON.stringify({ holiday_date: date, reason: reason.trim() || "Holiday" }),
      });
      setDate("");
      setReason("");
      await qc.invalidateQueries({ queryKey: ["holidays"] });
    } catch (err) {
      toast.error(messageFrom(err));
    } finally {
      setAdding(false);
    }
  };

  return (
    <section className="card p-5" aria-label="Holidays">
      <h2 className="text-sm font-semibold">Holidays</h2>
      <p className="mt-1 text-xs text-muted-foreground">No sessions are generated on these dates.</p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="h-date" className="text-xs">
            Date
          </Label>
          <Input id="h-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-10" />
        </div>
        <div className="min-w-40 flex-1 space-y-1">
          <Label htmlFor="h-reason" className="text-xs">
            Reason
          </Label>
          <Input id="h-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Diwali" className="h-10" />
        </div>
        <Button size="sm" onClick={add} disabled={!date || adding} loading={adding}>
          <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
          Add
        </Button>
      </div>
      {q.data && q.data.items.length > 0 && (
        <ul className="mt-3 divide-y divide-border border-t border-border">
          {q.data.items.map((h) => (
            <li key={h.id} className="flex items-center gap-2 py-2 text-sm">
              <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="tabular">{fmtDate(h.holiday_date)}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{h.reason}</span>
              <button
                type="button"
                aria-label="Remove holiday"
                onClick={() => setRemoveId(h.id)}
                className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={!!removeId}
        onOpenChange={(v) => !v && setRemoveId(null)}
        title="Remove holiday?"
        description="Sessions will be generated again for this date."
        destructive
        confirmLabel="Remove"
        onConfirm={async () => {
          if (!removeId) return;
          await api(`/my/holidays/${removeId}`, { method: "DELETE" }).catch(() => {});
          setRemoveId(null);
          qc.invalidateQueries({ queryKey: ["holidays"] });
        }}
      />
    </section>
  );
}

export default function SchedulePage() {
  const [addOpen, setAddOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Batch | null>(null);

  const batchesQ = useQuery({
    queryKey: ["batches"],
    queryFn: () => api<{ items: Batch[] }>("/my/batches?limit=25"),
    refetchInterval: 15_000,
  });
  const staffQ = useQuery({
    queryKey: ["staff", "all"],
    queryFn: () => api<{ items: Staff[] }>("/my/staff?limit=100"),
  });

  if (batchesQ.error) return <ErrorState onRetry={() => batchesQ.refetch()} />;

  const batches = batchesQ.data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="People"
        title="Batches & timetable"
        description="Monitoring runs only inside these windows."
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setAddOpen(true);
            }}
          >
            <Plus className="mr-1.5 h-4 w-4" aria-hidden />
            New batch
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <section aria-label="Batches">
          {batchesQ.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
          ) : batches.length === 0 ? (
            <div className="card">
              <EmptyState
                icon={CalendarDays}
                title="No batches yet"
                hint="A batch links trainees, a trainer and a timetable. Sessions appear once a batch exists."
                action={
                  <Button
                    size="sm"
                    onClick={() => {
                      setEditing(null);
                      setAddOpen(true);
                    }}
                  >
                    Create batch
                  </Button>
                }
              />
            </div>
          ) : (
            <ul className="space-y-3">
              {batches.map((b) => (
                <li key={b.id} className="card card-hover p-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">
                        {b.name}
                        {!b.active && (
                          <span className="ml-2 rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] text-muted-foreground">
                            Inactive
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {(b.weekdays ?? [])
                          .map((n) => WEEKDAYS.find((d) => d.n === n)?.short)
                          .filter(Boolean)
                          .join(" · ") || "No weekdays"}{" "}
                        · {fmtClock(b.start_time)} - {fmtClock(b.end_time)}
                      </p>
                      {b.start_date && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {fmtDate(b.start_date)}
                          {b.end_date ? ` → ${fmtDate(b.end_date)}` : " → ongoing"}
                        </p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setEditing(b);
                        setAddOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <HolidayCard />
      </div>

      <BatchDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        editing={editing}
        staff={staffQ.data?.items ?? []}
      />
    </div>
  );
}
