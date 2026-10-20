"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Send } from "lucide-react";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/strings";
import { ENFORCEMENT_LEVELS } from "@/lib/constants";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface NoticeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  centreId: string;
  /** shown in the dialog header, e.g. "CODE — Name" */
  centreLabel?: string;
  defaultLevel?: string;
  flagIds?: string[];
  onCreated?: () => void;
}

const LEVEL_HELP: Record<string, string> = {
  advisory: "Informational — no status change.",
  notice: "Formal notice; the centre must respond.",
  warning: "Final warning before enforcement action.",
  suspension: "Stops batches until you reinstate. Sets the centre status to Suspended.",
  termination: "Permanent closure. Sets the centre status to Terminated.",
};

export function NoticeDialog({
  open,
  onOpenChange,
  centreId,
  centreLabel,
  defaultLevel = "notice",
  flagIds = [],
  onCreated,
}: NoticeDialogProps) {
  const qc = useQueryClient();
  const [level, setLevel] = React.useState(defaultLevel);
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [typed, setTyped] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setLevel(defaultLevel);
      setSubject("");
      setBody("");
      setTyped("");
    }
  }, [open, defaultLevel]);

  const isHeavy = level === "suspension" || level === "termination";

  const create = useMutation({
    mutationFn: () =>
      api("/notices", {
        method: "POST",
        body: JSON.stringify({
          centre_id: centreId,
          level,
          subject,
          body,
          flag_ids: flagIds,
          ...(isHeavy ? { confirmation: typed } : {}),
        }),
      }),
    onSuccess: () => {
      toast.success("Notice issued.");
      qc.invalidateQueries({ queryKey: ["notices"] });
      qc.invalidateQueries({ queryKey: ["centre", centreId] });
      qc.invalidateQueries({ queryKey: ["centres"] });
      onOpenChange(false);
      onCreated?.();
    },
    onError: (e) => {
      const err = e as { code?: string; message?: string };
      toast.error(getErrorMessage(err.code, err.message));
    },
  });

  const canSend = !!subject.trim() && !!body.trim() && (!isHeavy || typed.trim() === centreLabel?.split(" ")[0]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Issue notice</DialogTitle>
          <DialogDescription>
            {centreLabel ? `To ${centreLabel}` : "The centre admin sees this in their notices list."}
            {flagIds.length > 0 && ` · ${flagIds.length} flag(s) linked`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Level</Label>
            <Select value={level} onValueChange={setLevel}>
              <SelectTrigger aria-label="Notice level">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ENFORCEMENT_LEVELS.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{LEVEL_HELP[level]}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notice-subject">Subject</Label>
            <Input
              id="notice-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Repeated attendance mismatch"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notice-body">Body</Label>
            <Textarea
              id="notice-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              placeholder="Explain what was found and what the centre must do…"
            />
          </div>

          {isHeavy && centreLabel && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-warning">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                This changes the centre status — type the centre code to confirm
              </p>
              <Input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={centreLabel.split(" ")[0]}
                className="font-mono"
                autoComplete="off"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={create.isPending}>
            Cancel
          </Button>
          <Button loading={create.isPending} disabled={!canSend} onClick={() => create.mutate()}>
            <Send className="mr-1.5 h-4 w-4" aria-hidden />
            Issue notice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
