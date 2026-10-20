"use client";

import * as React from "react";
import { AlertTriangle, Printer } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CopyButton } from "./CopyButton";
import { ProgressRing } from "./ProgressRing";

export interface CredentialRow {
  label: string;
  value: string;
}

interface CredentialsModalProps {
  open: boolean;
  /** Called when the user confirms they saved it. Clear secrets in the parent. */
  onClose: () => void;
  title?: string;
  rows: CredentialRow[];
  note?: string;
}

const LOCK_MS = 3000;

/** Shown once. Mono values, copy buttons, locked until "I have saved it". */
export function CredentialsModal({ open, onClose, title = "Centre credentials", rows, note, }: CredentialsModalProps) {
  const [elapsed, setElapsed] = React.useState(0);
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setElapsed(0);
      setSaved(false);
      return;
    }
    const start = Date.now();
    const id = setInterval(() => {
      const p = Math.min(1, (Date.now() - start) / LOCK_MS);
      setElapsed(p);
      if (p >= 1) clearInterval(id);
    }, 50);
    return () => clearInterval(id);
  }, [open]);

  const locked = elapsed < 1;

  const handleOpenChange = (next: boolean) => {
    if (!next && !saved) return; // cannot close by Esc / overlay until saved
    if (!next) onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-lg"
        onEscapeKeyDown={(e) => {
          if (!saved) e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (!saved) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Copy these details now — they are shown only once.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 p-3">
              <div className="min-w-0">
                <p className="eyebrow">{row.label}</p>
                <p className="mt-1 truncate font-mono text-sm font-medium">{row.value}</p>
              </div>
              <CopyButton value={row.value} label={`Copy ${row.label}`} />
            </div>
          ))}
        </div>

        <p className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {note ?? "Shown once. Expires in 72 hours. Share only with the centre contact."}
        </p>

        <DialogFooter className="items-center">
          <Button variant="ghost" size="sm" onClick={() => window.print()} disabled={!saved}>
            <Printer className="mr-2 h-4 w-4" aria-hidden />
            Print
          </Button>
          <span className="mr-auto flex items-center gap-2 text-xs text-muted-foreground">
            <ProgressRing ratio={elapsed} size={24} stroke={3} />
            {!saved && "Save these details first"}
          </span>
          <Button
            onClick={() => {
              setSaved(true);
              onClose();
            }}
            disabled={locked}
            className="min-w-44"
          >
            I have saved it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
