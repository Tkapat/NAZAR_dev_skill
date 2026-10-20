"use client";

import * as React from "react";
import { Suspense } from "react";
import { Eye, EyeOff, Lock, Mail, ShieldCheck, FileCheck2, ScanEye, Check } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { login, mfaLogin } from "@/lib/auth";
import { getErrorMessage } from "@/lib/strings";
import { gsap, useGSAP, DUR, EASE, motionOk, shake } from "@/lib/gsap";
import { BrandMark } from "@/components/shared/BrandMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const POINTS = [
  { icon: ScanEye, text: "Anonymous counting — faces are never identified" },
  { icon: ShieldCheck, text: "Blurred evidence frames, visible only to reviewers" },
  { icon: FileCheck2, text: "Tamper-evident records on an append-only ledger" },
];

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/overview";

  const [loginId, setLoginId] = React.useState("admin@govt");
  const [password, setPassword] = React.useState("devskilladmin");
  const [showPassword, setShowPassword] = React.useState(false);
  const [mfaRequired, setMfaRequired] = React.useState(false);
  const [mfaToken, setMfaToken] = React.useState("");
  const [mfaCode, setMfaCode] = React.useState("");
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const cardRef = React.useRef<HTMLDivElement>(null);

  /* login timeline: static design, one entrance for the form card */
  useGSAP(() => {
    if (!motionOk() || !cardRef.current) return;
    gsap.fromTo(
      cardRef.current,
      { opacity: 0, y: 16 },
      { opacity: 1, y: 0, duration: DUR.slow, ease: EASE.out, clearProps: "opacity,transform" }
    );
  }, []);

  React.useEffect(() => {
    if (error) shake(cardRef.current);
  }, [error]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (!mfaRequired) {
        const res = await login(loginId, password);
        if (res.mfa_required) {
          setMfaRequired(true);
          setMfaToken(res.mfa_token);
        } else {
          router.push(callbackUrl);
          router.refresh();
        }
      } else {
        await mfaLogin(mfaToken, mfaCode);
        router.push(callbackUrl);
        router.refresh();
      }
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string } | null;
      setError(getErrorMessage(e?.code, e?.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[45%_55%]">
      {/* Left: brand panel (desktop only) */}
      <aside className="relative hidden flex-col justify-between border-r border-border bg-surface p-12 lg:flex">
        <div className="login-grid pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative">
          <BrandMark />
        </div>
        <div className="relative space-y-6">
          <h1 className="text-[36px] font-semibold leading-[1.1] tracking-[-0.02em]">
            Every claim,
            <br />
            verified.
          </h1>
          <p className="max-w-[45ch] text-sm text-muted-foreground">
            AI video analytics keeps skill centres accountable — cameras count, records are checked, and nobody watches
            people.
          </p>
          <ul className="space-y-3">
            {POINTS.map((p) => (
              <li key={p.text} className="flex items-start gap-2.5 text-sm">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-primary">
                  <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
                </span>
                <span className="text-foreground/90">{p.text}</span>
                <p.icon className="ml-auto h-4 w-4 text-muted-foreground" aria-hidden />
              </li>
            ))}
          </ul>
        </div>
        <p className="relative eyebrow">Government Monitoring Portal</p>
      </aside>

      {/* Right: form */}
      <main className="relative flex items-center justify-center p-6">
        <div className="login-grid pointer-events-none absolute inset-0 lg:hidden" aria-hidden />
        <div ref={cardRef} className="relative w-full max-w-[400px]">
          <Card>
            <CardHeader>
              <div className="mb-2 lg:hidden">
                <BrandMark />
              </div>
              <CardTitle className="text-xl">
                {mfaRequired ? "Enter MFA code" : "Government Monitoring Portal"}
              </CardTitle>
              <CardDescription>
                {mfaRequired
                  ? "Enter the 6-digit code from your authenticator app"
                  : "Sign in with your government email and password"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {!mfaRequired && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="loginId">Login ID (email)</Label>
                      <div className="relative">
                        <Mail
                          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                          aria-hidden
                        />
                        <Input
                          id="loginId"
                          type="text"
                          inputMode="email"
                          placeholder="gov@department.gov.in"
                          value={loginId}
                          onChange={(e) => setLoginId(e.target.value)}
                          className="pl-10"
                          required
                          disabled={loading}
                          autoComplete="username"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <div className="relative">
                        <Lock
                          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                          aria-hidden
                        />
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="pl-10 pr-10"
                          required
                          disabled={loading}
                          autoComplete="current-password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                          aria-label={showPassword ? "Hide password" : "Show password"}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {mfaRequired && (
                  <div className="space-y-2">
                    <Label htmlFor="mfaCode">Authenticator code</Label>
                    <Input
                      id="mfaCode"
                      type="text"
                      placeholder="123456"
                      value={mfaCode}
                      onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
                      maxLength={6}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      required
                      disabled={loading}
                      className="text-center font-mono text-2xl tracking-[0.4em]"
                    />
                  </div>
                )}

                {error && (
                  <p role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-center text-sm text-danger">
                    {error}
                  </p>
                )}

                <Button type="submit" className="w-full" disabled={loading} loading={loading} size="lg">
                  {mfaRequired ? "Verify" : "Sign in"}
                </Button>

                {mfaRequired && (
                  <button
                    type="button"
                    className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setMfaRequired(false);
                      setMfaCode("");
                      setError("");
                    }}
                  >
                    Back to password
                  </button>
                )}
              </form>
            </CardContent>
          </Card>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Official use only. Unauthorized access prohibited.
          </p>
        </div>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="skeleton h-9 w-40" />
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
