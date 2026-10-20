"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { CheckCircle2, KeyRound, Monitor, Moon, ShieldCheck, Sun, User } from "lucide-react";
import { api } from "@/lib/api";
import { fmtIST } from "@/lib/format";
import { getErrorMessage } from "@/lib/strings";
import { useMe } from "@/hooks/useMe";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { CopyButton } from "@/components/shared/CopyButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Meter } from "@/components/ui/meter";

function passwordStrength(p: string) {
  let score = 0;
  if (p.length >= 10) score++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) score++;
  if (/\d/.test(p)) score++;
  if (/[^A-Za-z0-9]/.test(p)) score++;
  return score; // 0..4
}

const RULES = [
  { id: "len", label: "At least 10 characters", test: (p: string) => p.length >= 10 },
  { id: "case", label: "Upper and lower case", test: (p: string) => /[a-z]/.test(p) && /[A-Z]/.test(p) },
  { id: "digit", label: "At least one digit", test: (p: string) => /\d/.test(p) },
  { id: "special", label: "At least one special character", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

export default function SettingsPage() {
  const { user, refetch } = useMe();
  const qc = useQueryClient();
  const { theme, setTheme } = useTheme();

  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");

  const [mfaStep, setMfaStep] = React.useState<"idle" | "setup">("idle");
  const [mfaSecret, setMfaSecret] = React.useState<{ secret: string; otpauth_uri: string } | null>(null);
  const [code, setCode] = React.useState("");

  const changePw = useMutation({
    mutationFn: () =>
      api("/me/change-password", {
        method: "POST",
        body: JSON.stringify({ current_password: current, new_password: next }),
      }),
    onSuccess: () => {
      toast.success("Password changed. Other sessions were signed out.");
      setCurrent("");
      setNext("");
      setConfirm("");
      refetch();
    },
    onError: (e) => {
      const err = e as { code?: string; message?: string };
      toast.error(getErrorMessage(err.code, err.message));
    },
  });

  const startMfa = useMutation({
    mutationFn: () => api<{ secret: string; otpauth_uri: string }>("/me/mfa/setup", { method: "POST" }),
    onSuccess: (res) => {
      setMfaSecret(res);
      setMfaStep("setup");
    },
    onError: (e) => {
      const err = e as { code?: string; message?: string };
      toast.error(getErrorMessage(err.code, err.message));
    },
  });

  const enableMfa = useMutation({
    mutationFn: () => api<{ mfa_enabled: boolean }>("/me/mfa/enable", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
    onSuccess: () => {
      toast.success("Two-factor authentication enabled.");
      setMfaStep("idle");
      setMfaSecret(null);
      setCode("");
      refetch();
      qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e) => {
      const err = e as { code?: string; message?: string };
      toast.error(getErrorMessage(err.code, err.message));
    },
  });

  const strength = passwordStrength(next);
  const canSubmit =
    !!current && !!next && next === confirm && RULES.every((r) => r.test(next));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Your profile, password and security. Changes here affect only your account."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-4 w-4" aria-hidden />
              Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <dl className="space-y-2.5">
              {[
                ["Full name", user?.full_name ?? "—"],
                ["Login ID", <span key="l" className="font-mono text-sm">{user?.login_id ?? "—"}</span>],
                ["Role", <Badge key="r" variant="info">{user?.role?.replace("_", " ") ?? "—"}</Badge>],
                ["Centre", user?.centre ? `${user.centre.code} — ${user.centre.name}` : "—"],
                [
                  "Last login",
                  <span key="ll" className="tabular text-sm">
                    {user?.last_login_at ? fmtIST(user.last_login_at) : "—"}
                  </span>,
                ],
              ].map(([k, v], i) => (
                <div key={i} className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-2 last:border-0">
                  <dt className="text-sm text-muted-foreground">{k}</dt>
                  <dd className="text-right text-sm font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sun className="h-4 w-4" aria-hidden />
              Appearance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Theme applies to this browser only.</p>
            <div className="flex gap-2">
              {[
                { id: "light", label: "Light", Icon: Sun },
                { id: "dark", label: "Dark", Icon: Moon },
                { id: "system", label: "System", Icon: Monitor },
              ].map(({ id, label, Icon }) => (
                <Button
                  key={id}
                  variant={theme === id ? "default" : "secondary"}
                  size="sm"
                  onClick={() => setTheme(id)}
                  aria-pressed={theme === id}
                >
                  <Icon className="mr-1.5 h-4 w-4" aria-hidden />
                  {label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" aria-hidden />
              Change password
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (canSubmit) changePw.mutate();
              }}
              className="space-y-4"
              noValidate
            >
              <div className="space-y-2">
                <Label htmlFor="cur">Current password</Label>
                <Input
                  id="cur"
                  type="password"
                  autoComplete="current-password"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new">New password</Label>
                <Input
                  id="new"
                  type="password"
                  autoComplete="new-password"
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                />
                {next && <Meter value={strength} max={4} label="Strength" showValue={false} threshold={{ warning: 0.5, danger: 0.3 }} />}
              </div>
              <div className="space-y-2">
                <Label htmlFor="conf">Confirm new password</Label>
                <Input
                  id="conf"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
                {confirm && confirm !== next && (
                  <p className="text-xs text-danger">Passwords do not match.</p>
                )}
              </div>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {RULES.map((r) => {
                  const ok = r.test(next);
                  return (
                    <li
                      key={r.id}
                      className={`flex items-center gap-1.5 text-xs ${ok ? "text-success" : "text-muted-foreground"}`}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                      {r.label}
                    </li>
                  );
                })}
              </ul>
              <Button type="submit" className="w-full" disabled={!canSubmit} loading={changePw.isPending}>
                Update password
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" aria-hidden />
              Two-factor authentication
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {user?.mfa_enabled
                  ? "TOTP is enabled. A code from your authenticator app is required at every login."
                  : "Add a time-based one-time password (TOTP) app for a second step at login."}
              </p>
              <Badge variant={user?.mfa_enabled ? "success" : "warning"}>
                {user?.mfa_enabled ? "Enabled" : "Disabled"}
              </Badge>
            </div>

            {mfaStep === "setup" && mfaSecret ? (
              <div className="space-y-3 rounded-lg border p-4">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Secret key</p>
                  <div className="flex items-center gap-2">
                    <code className="break-all font-mono text-sm">{mfaSecret.secret}</code>
                    <CopyButton value={mfaSecret.secret} />
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Provisioning URI</p>
                  <div className="flex items-center gap-2">
                    <code className="break-all font-mono text-xs text-muted-foreground">
                      {mfaSecret.otpauth_uri}
                    </code>
                    <CopyButton value={mfaSecret.otpauth_uri} label="Copy URI" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Input
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="6-digit code"
                    className="w-40 tabular font-mono"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    aria-label="TOTP code"
                  />
                  <Button
                    loading={enableMfa.isPending}
                    disabled={code.length !== 6}
                    onClick={() => enableMfa.mutate()}
                  >
                    Verify and enable
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Add the secret to your authenticator app first, then enter the 6-digit code it shows.
                </p>
              </div>
            ) : (
              <Button
                variant="secondary"
                disabled={!!user?.mfa_enabled}
                loading={startMfa.isPending}
                onClick={() => startMfa.mutate()}
              >
                <ShieldCheck className="mr-1.5 h-4 w-4" aria-hidden />
                {user?.mfa_enabled ? "Already enabled" : "Set up authenticator"}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
