"use client";

import * as React from "react";
import { CheckCircle, Eye, EyeOff, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { tokens } from "@/lib/auth";
import { getErrorMessage } from "@/lib/strings";
import { shake } from "@/lib/gsap";
import { BrandMark } from "@/components/shared/BrandMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Meter } from "@/components/ui/meter";
import { toast } from "sonner";

function scorePassword(pwd: string) {
  let score = 0;
  if (pwd.length >= 10) score += 30;
  if (/[a-z]/.test(pwd)) score += 17;
  if (/[A-Z]/.test(pwd)) score += 17;
  if (/\d/.test(pwd)) score += 18;
  if (/[^\w\s]/.test(pwd)) score += 18;
  return Math.min(100, score);
}

const RULES = [
  { label: "10+ characters", test: (p: string) => p.length >= 10 },
  { label: "Upper + lower", test: (p: string) => /[a-z]/.test(p) && /[A-Z]/.test(p) },
  { label: "Digit", test: (p: string) => /\d/.test(p) },
  { label: "Special", test: (p: string) => /[^\w\s]/.test(p) },
];

export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [show, setShow] = React.useState(false);
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const cardRef = React.useRef<HTMLDivElement>(null);

  const strength = scorePassword(newPassword);
  const rulesOk = RULES.every((r) => r.test(newPassword));

  React.useEffect(() => {
    if (error) shake(cardRef.current);
  }, [error]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (!rulesOk) {
      setError("Password does not meet the requirements below");
      return;
    }

    setLoading(true);
    try {
      const res = await api<{ access_token?: string; refresh_token?: string }>("/me/change-password", {
        method: "POST",
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      if (res.access_token && res.refresh_token) {
        tokens.set(res.access_token, res.refresh_token);
      }
      toast.success("Password changed. You are signed in with the new password.");
      router.push("/overview");
      router.refresh();
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string } | null;
      setError(getErrorMessage(e?.code, e?.message));
    } finally {
      setLoading(false);
    }
  };

  const toggle = (setter: (v: boolean) => void, v: boolean) => setter(!v);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 py-12">
      <BrandMark />
      <div ref={cardRef} className="w-full max-w-[400px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Change password</CardTitle>
            <CardDescription>
              {currentPassword ? "Set a new permanent password" : "Enter your temporary password and choose a new one"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Current password</Label>
                <div className="relative">
                  <Lock
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    id="currentPassword"
                    type={show ? "text" : "password"}
                    placeholder="Temporary password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="pl-10 pr-10"
                    required
                    disabled={loading}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => toggle(setShow, show)}
                    className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                    aria-label={show ? "Hide passwords" : "Show passwords"}
                  >
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="newPassword">New password</Label>
                <Input
                  id="newPassword"
                  type={show ? "text" : "password"}
                  placeholder="New password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  disabled={loading}
                  autoComplete="new-password"
                />
                <Meter value={strength} max={100} label="Strength" showValue={false} threshold={{ warning: 0.4, danger: 0.25 }} />
                <ul className="grid grid-cols-2 gap-1">
                  {RULES.map((r) => {
                    const ok = r.test(newPassword);
                    return (
                      <li
                        key={r.label}
                        className={`flex items-center gap-1.5 text-xs ${ok ? "text-success" : "text-muted-foreground"}`}
                      >
                        <CheckCircle className="h-3.5 w-3.5" aria-hidden />
                        {r.label}
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm new password</Label>
                <Input
                  id="confirmPassword"
                  type={show ? "text" : "password"}
                  placeholder="Repeat the new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={loading}
                  autoComplete="new-password"
                />
              </div>

              <p className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
                <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                Minimum 10 characters with an uppercase letter, a lowercase letter, a digit and a special character.
              </p>

              {error && (
                <p role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-center text-sm text-danger">
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={loading} loading={loading} size="lg">
                Update password
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
