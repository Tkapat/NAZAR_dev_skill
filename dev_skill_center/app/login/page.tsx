"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { login } from "@/lib/auth";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/strings";
import type { Me } from "@/lib/types";
import { drawSvg, useGSAP } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandMark } from "@/components/shared/BrandMark";

/** 6C 6.1 — brand + classroom line drawing (drawn once) + login card. */
export default function LoginPage() {
  const router = useRouter();
  const artRef = React.useRef<HTMLDivElement>(null);
  const [loginId, setLoginId] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [show, setShow] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  useGSAP(() => {
    drawSvg(artRef.current, "[data-draw]", 0.08);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginId.trim() || !password) return;
    setLoading(true);
    try {
      await login(loginId, password);
      const me = await api<Me>("/me");
      if (me.role === "centre_admin" && me.centre && me.centre.status !== "live") {
        router.replace("/onboarding");
      } else {
        router.replace("/");
      }
    } catch (err) {
      const e2 = err as { code?: string; message?: string };
      toast.error(getErrorMessage(e2.code, e2.message));
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* art */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-surface p-10 lg:flex" aria-hidden>
        <Link href="/" className="relative z-10">
          <BrandMark />
        </Link>
        <div ref={artRef} className="relative z-10 mx-auto w-full max-w-md">
          <svg viewBox="0 0 400 260" fill="none" className="w-full" role="img" aria-label="Classroom illustration">
            {/* projector screen */}
            <rect data-draw x="70" y="24" width="260" height="120" rx="8" className="stroke-border-strong" strokeWidth="1.5" />
            <path data-draw d="M200 144v14" className="stroke-border-strong" strokeWidth="1.5" />
            <path data-draw d="M150 158h100" className="stroke-border-strong" strokeWidth="1.5" />
            <path data-draw d="M100 60h80M100 84h120M100 108h60" className="stroke-primary/60" strokeWidth="1.5" strokeLinecap="round" />
            {/* laptops row 1 */}
            <path data-draw d="M86 210h48l6-22H92z" className="stroke-border-strong" strokeWidth="1.5" strokeLinejoin="round" />
            <path data-draw d="M84 210h52" className="stroke-border-strong" strokeWidth="1.5" strokeLinecap="round" />
            <path data-draw d="M176 210h48l6-22h-48z" className="stroke-border-strong" strokeWidth="1.5" strokeLinejoin="round" />
            <path data-draw d="M174 210h52" className="stroke-border-strong" strokeWidth="1.5" strokeLinecap="round" />
            <path data-draw d="M266 210h48l6-22h-48z" className="stroke-border-strong" strokeWidth="1.5" strokeLinejoin="round" />
            <path data-draw d="M264 210h52" className="stroke-border-strong" strokeWidth="1.5" strokeLinecap="round" />
            {/* chairs */}
            <path data-draw d="M96 214v18M126 214v18" className="stroke-border-strong" strokeWidth="1.5" strokeLinecap="round" />
            <path data-draw d="M186 214v18M216 214v18" className="stroke-border-strong" strokeWidth="1.5" strokeLinecap="round" />
            <path data-draw d="M276 214v18M306 214v18" className="stroke-border-strong" strokeWidth="1.5" strokeLinecap="round" />
            {/* floor */}
            <path data-draw d="M40 238h320" className="stroke-border-strong" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <p className="mt-8 max-w-sm text-sm leading-relaxed text-muted-foreground">
            One place for attendance, batches and equipment — so your centre stays ready for every verification.
          </p>
        </div>
        <p className="relative z-10 text-xs text-muted-foreground">Dev_Skill · Skill development monitoring</p>
        <div className="absolute inset-0 dotgrid opacity-40" aria-hidden />
      </div>

      {/* form */}
      <div className="flex flex-col justify-center px-4 py-12 sm:px-10">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <BrandMark />
          </div>
          <p className="eyebrow">Centre portal</p>
          <h1 className="display mt-2 text-[34px]">Your centre, supported.</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in with the Login ID given by your department.
          </p>

          <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="login-id">Centre ID or Trainer ID</Label>
              <Input
                id="login-id"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                placeholder="DSK-WB-0001"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                className="font-mono"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  className="pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  aria-label={show ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                >
                  {show ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loading || !loginId.trim() || !password}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              Sign in
            </Button>
          </form>

          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <Link href="/apply" className="font-medium text-primary underline-offset-4 hover:underline">
              Apply for a new centre
            </Link>
            <Link href="/apply/track" className="font-medium text-primary underline-offset-4 hover:underline">
              Track application
            </Link>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Trouble signing in? Ask your district coordinator to reset the password.
          </p>
        </div>
      </div>
    </div>
  );
}
