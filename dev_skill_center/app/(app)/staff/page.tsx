"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ScanFace, UserRound } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
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
import { CredentialsModal, type CredentialRow } from "@/components/shared/CredentialsModal";
import type { Staff } from "@/lib/types";

function AddStaffDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [name, setName] = React.useState("");
  const [role, setRole] = React.useState<"trainer" | "official">("trainer");
  const [phone, setPhone] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [creds, setCreds] = React.useState<CredentialRow[] | null>(null);

  React.useEffect(() => {
    if (open) {
      setName("");
      setRole("trainer");
      setPhone("");
    }
  }, [open]);

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const j = await api<{ login_id?: string; temporary_password?: string }>("/my/staff", {
        method: "POST",
        body: JSON.stringify({ full_name: name.trim(), staff_role: role, phone: phone.trim() || null }),
      });
      await qc.invalidateQueries({ queryKey: ["staff"] });
      await qc.invalidateQueries({ queryKey: ["centre", "mine"] });
      onOpenChange(false);
      if (j?.login_id && j?.temporary_password) {
        setCreds([
          { label: "Login ID", value: j.login_id },
          { label: "Temporary password", value: j.temporary_password },
        ]);
      } else {
        toast.success("Staff added.");
      }
    } catch (err) {
      const e = err as { code?: string };
      if (e.code === "LOGIN_EXISTS") {
        toast.error("This login ID already exists.");
      } else {
        toast.error(messageFrom(err));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add staff</DialogTitle>
            <DialogDescription>Creates the person and a login for trainers.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="s-name">Full name</Label>
              <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Anita Sharma" />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as "trainer" | "official")}>
                <SelectTrigger aria-label="Staff role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="trainer">Trainer</SelectItem>
                  <SelectItem value="official">Official</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="s-phone">Phone (optional)</Label>
              <Input id="s-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91…" inputMode="tel" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} loading={saving} disabled={!name.trim() || saving}>
              Add staff
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CredentialsModal
        open={!!creds}
        onClose={() => setCreds(null)}
        rows={creds ?? []}
        title="Staff credentials"
        note="Shown once. Share only with this staff member — they must change the password at first login."
      />
    </>
  );
}

export default function StaffPage() {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = React.useState(false);
  const [deactivateId, setDeactivateId] = React.useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["staff"],
    queryFn: () => api<{ items: Staff[] }>("/my/staff?limit=100"),
    refetchInterval: 15_000,
  });

  if (error) return <ErrorState onRetry={refetch} />;
  const staff = data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="People"
        title="Staff"
        description="Trainers and officials. Faces are enrolled only with consent, and only for staff."
        action={
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden />
            Add staff
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : staff.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={UserRound}
            title="No staff yet"
            hint="Add your trainers first — each one gets a login and can enrol their face for attendance."
            action={
              <Button size="sm" onClick={() => setAddOpen(true)}>
                Add staff
              </Button>
            }
          />
        </div>
      ) : (
        <ul className="space-y-3">
          {staff.map((s) => (
            <li key={s.id} className="card flex flex-wrap items-center gap-4 p-5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  {s.full_name}
                  {!s.active && (
                    <span className="ml-2 rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] text-muted-foreground">
                      Deactivated
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {s.staff_role === "trainer" ? "Trainer" : "Official"}
                  {s.user_id ? "" : " · no login"}
                  {s.phone ? ` · ${s.phone}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex h-6 items-center rounded-full border px-2 text-xs font-medium ${
                    s.face_enrolled
                      ? "border-success/40 bg-success/10 text-success"
                      : "border-border bg-surface text-muted-foreground"
                  }`}
                >
                  {s.face_enrolled ? "Face enrolled" : "Face not enrolled"}
                </span>
                <span
                  className={`inline-flex h-6 items-center rounded-full border px-2 text-xs font-medium ${
                    s.face_consent
                      ? "border-info/40 bg-info/10 text-info"
                      : "border-border bg-surface text-muted-foreground"
                  }`}
                >
                  {s.face_consent ? "Consent given" : "No consent"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {s.active && (
                  <Button asChild size="sm" variant={s.face_enrolled ? "secondary" : "default"}>
                    <Link href={`/staff/${s.id}/face-enrol`}>
                      <ScanFace className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                      {s.face_enrolled ? "Manage face" : "Enrol face"}
                    </Link>
                  </Button>
                )}
                {s.active && (
                  <Button size="sm" variant="ghost" onClick={() => setDeactivateId(s.id)}>
                    Deactivate
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <AddStaffDialog open={addOpen} onOpenChange={setAddOpen} />

      <ConfirmDialog
        open={!!deactivateId}
        onOpenChange={(v) => !v && setDeactivateId(null)}
        title="Deactivate this staff member?"
        description="They lose access immediately. Their enrolled face data is deleted."
        destructive
        confirmLabel="Deactivate"
        onConfirm={async () => {
          if (!deactivateId) return;
          try {
            await api(`/my/staff/${deactivateId}/deactivate`, { method: "POST" });
            toast.success("Staff deactivated.");
            await qc.invalidateQueries({ queryKey: ["staff"] });
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
