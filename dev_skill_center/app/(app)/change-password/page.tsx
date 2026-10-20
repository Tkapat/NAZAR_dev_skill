"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, ShieldCheck, UserCheck, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { tokens } from "@/lib/auth";
import { messageFrom } from "@/lib/strings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Meter } from "@/components/ui/meter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/PageHeader";
import { useMe } from "@/hooks/useMe";

const RULES = [
  { test: (v: string) => v.length >= 10, label: "At least 10 characters" },
  { test: (v: string) => /[a-z]/.test(v), label: "A lower-case letter" },
  { test: (v: string) => /[A-Z]/.test(v), label: "An upper-case letter" },
  { test: (v: string) => /\d/.test(v), label: "A number" },
  { test: (v: string) => /[^A-Za-z0-9]/.test(v), label: "A special character" },
];

export default function ChangePasswordPage() {
  const router = useRouter();
  const { user, isPending, refetch } = useMe();
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [accepted, setAccepted] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const passed = RULES.filter((r) => r.test(next)).length;
  const allOk = passed === RULES.length;
  const matches = next.length > 0 && next === confirm;
  const firstLogin = !isPending && !!user?.must_change_password;
  const canSubmit = allOk && matches && !!current && (!firstLogin || accepted);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    try {
      const j = await api<{ access_token: string; refresh_token: string }>("/me/change-password", {
        method: "POST",
        body: JSON.stringify({
          current_password: current,
          new_password: next,
          accepted_notice: true,
        }),
      });
      if (j?.access_token) tokens.set(j.access_token, j.refresh_token);
      // Refetch user to clear must_change_password flag
      await refetch();
      toast.success("Password updated. Welcome in.");
      router.replace("/");
    } catch (err) {
      toast.error(messageFrom(err));
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <PageHeader
        eyebrow="First step"
        title="Choose a new password"
        description="Your department set a temporary password. Replace it with one only you know."
      />
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>New password</CardTitle>
          <CardDescription>The rules below keep your centre account safe.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="current">Current password</Label>
              <Input
                id="current"
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new">New password</Label>
              <Input
                id="new"
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                autoComplete="new-password"
                required
              />
              {next.length > 0 && (
                <Meter
                  value={passed}
                  max={RULES.length}
                  label="Strength"
                  threshold={{ warning: 0.4, danger: 0.2 }}
                  showValue={false}
                />
              )}
              <ul className="space-y-1">
                {RULES.map((r) => {
                  const ok = r.test(next);
                  return (
                    <li
                      key={r.label}
                      className={`flex items-center gap-1.5 text-xs ${ok ? "text-success" : "text-muted-foreground"}`}
                    >
                      {ok ? <Check className="h-3.5 w-3.5" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />}
                      {r.label}
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm new password</Label>
              <Input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
                aria-invalid={confirm.length > 0 && !matches}
              />
              {confirm.length > 0 && !matches && (
                <p className="text-xs text-danger">Passwords do not match.</p>
              )}
            </div>

            {firstLogin && (
              <div className="space-y-3 rounded-[16px] border border-border bg-surface p-4">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
                  Before you continue
                </p>
                <ul className="space-y-2 text-xs leading-relaxed text-muted-foreground">
                  <li className="flex gap-2">
                    <Camera className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                    Cameras count people anonymously.
                  </li>
                  <li className="flex gap-2">
                    <UserCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                    Faces are used only for staff, and only with consent.
                  </li>
                  <li className="flex gap-2">
                    <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                    No raw video leaves the centre.
                  </li>
                </ul>
                <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                  <Checkbox
                    checked={accepted}
                    onCheckedChange={(v) => setAccepted(v === true)}
                    aria-label="I understand the data-use notice"
                    className="mt-0.5"
                  />
                  <span>
                    I understand: cameras count people anonymously; faces are used only for staff, only with
                    consent; no raw video leaves the centre.
                  </span>
                </label>
              </div>
            )}

            <Button type="submit" className="w-full" loading={saving} disabled={!canSubmit || saving}>
              Save new password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
