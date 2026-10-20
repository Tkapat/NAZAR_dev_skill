"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { api } from "@/lib/api";
import { WEEKDAYS } from "@/lib/constants";
import { messageFrom } from "@/lib/strings";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import type { Centre } from "@/lib/types";

export type RequestKind = "equipment" | "enrolment" | "batch" | "camera";

interface RequestDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: RequestKind;
  title?: string;
  /** equipment: class to preselect */
  equipmentClass?: string;
  /** equipment: known class options */
  equipmentClasses?: { class: string; label: string }[];
  centre?: Centre | null;
  onCreated?: () => void;
}

/**
 * POST /my/requests {kind, payload, reason}.
 * Payload shapes per plan:
 *   equipment {class, extra_qty}; enrolment {extra_trainees};
 *   batch {name, weekdays, start_time, end_time, trainer_id};
 *   camera {name, source_uri}.
 */
export function RequestDialog({
  open,
  onOpenChange,
  kind,
  title,
  equipmentClass,
  equipmentClasses = [],
  centre,
  onCreated,
}: RequestDialogProps) {
  const qc = useQueryClient();
  const [reason, setReason] = React.useState("");
  const [extraQty, setExtraQty] = React.useState("1");
  const [extraTrainees, setExtraTrainees] = React.useState("5");
  const [eqClass, setEqClass] = React.useState(equipmentClass ?? "");
  const [name, setName] = React.useState("");
  const [source, setSource] = React.useState("");
  const [days, setDays] = React.useState<number[]>([1, 3, 5]);
  const [startTime, setStartTime] = React.useState("09:30");
  const [endTime, setEndTime] = React.useState("11:30");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setReason("");
      setExtraQty("1");
      setExtraTrainees("5");
      setEqClass(equipmentClass ?? equipmentClasses[0]?.class ?? "");
      setName("");
      setSource("");
      setDays([1, 3, 5]);
      setStartTime("09:30");
      setEndTime("11:30");
    }
  }, [open, equipmentClass, equipmentClasses]);

  const payload = React.useMemo((): Record<string, unknown> => {
    switch (kind) {
      case "equipment":
        return { class: eqClass, extra_qty: Number(extraQty) || 1 };
      case "enrolment":
        return { extra_trainees: Number(extraTrainees) || 1 };
      case "batch":
        return {
          name: name.trim(),
          weekdays: days,
          start_time: startTime,
          end_time: endTime,
          trainer_id: null,
        };
      case "camera":
        return { name: name.trim(), source_uri: source.trim() };
    }
  }, [kind, eqClass, extraQty, extraTrainees, name, days, startTime, endTime, source]);

  const canSubmit =
    !!reason.trim() &&
    (kind === "equipment"
      ? !!eqClass && Number(extraQty) > 0
      : kind === "enrolment"
        ? Number(extraTrainees) > 0
        : kind === "batch"
          ? !!name.trim() && days.length > 0
          : !!name.trim() && !!source.trim());

  const submit = async () => {
    setSaving(true);
    try {
      await api("/my/requests", {
        method: "POST",
        body: JSON.stringify({ kind, payload, reason: reason.trim() }),
      });
      toast.success("Request sent. The department will review it.");
      await qc.invalidateQueries({ queryKey: ["requests"] });
      onOpenChange(false);
      onCreated?.();
    } catch (err) {
      toast.error(messageFrom(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title ?? "Send a request"}</DialogTitle>
          <DialogDescription>
            <span className="inline-flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5" aria-hidden />
              Needs government approval
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {kind === "equipment" && (
            <>
              <div className="space-y-2">
                <Label>Equipment</Label>
                {equipmentClasses.length > 0 ? (
                  <Select value={eqClass} onValueChange={setEqClass}>
                    <SelectTrigger aria-label="Equipment">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {equipmentClasses.map((c) => (
                        <SelectItem key={c.class} value={c.class}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input value={eqClass} onChange={(e) => setEqClass(e.target.value)} placeholder="sewing_machine" className="font-mono" />
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="rq-qty">Extra quantity</Label>
                <Input
                  id="rq-qty"
                  type="number"
                  min={1}
                  value={extraQty}
                  onChange={(e) => setExtraQty(e.target.value)}
                />
              </div>
            </>
          )}

          {kind === "enrolment" && (
            <div className="space-y-2">
              <Label htmlFor="rq-extra">Extra trainees</Label>
              <Input
                id="rq-extra"
                type="number"
                min={1}
                value={extraTrainees}
                onChange={(e) => setExtraTrainees(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Sanctioned limit: {centre?.max_trainees ?? "—"}.
              </p>
            </div>
          )}

          {kind === "batch" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="rq-name">Batch name</Label>
                <Input id="rq-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Weekend Lab" />
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
                        onClick={() => setDays((cur) => (on ? cur.filter((n) => n !== d.n) : [...cur, d.n].sort()))}
                        className={cn(
                          "h-10 min-w-11 rounded-full border px-3 text-sm font-medium transition-colors",
                          on
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-card text-muted-foreground hover:bg-accent",
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
                  <Label htmlFor="rq-st">Start</Label>
                  <Input id="rq-st" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rq-et">End</Label>
                  <Input id="rq-et" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                </div>
              </div>
            </>
          )}

          {kind === "camera" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="rq-cname">Camera name</Label>
                <Input id="rq-cname" value={name} onChange={(e) => setName(e.target.value)} placeholder="Lab 102" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rq-src">Source (RTSP URL)</Label>
                <Input id="rq-src" value={source} onChange={(e) => setSource(e.target.value)} className="font-mono text-sm" />
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="rq-reason">Reason</Label>
            <Textarea
              id="rq-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Explain why this is needed…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit || saving} loading={saving}>
            Send request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
