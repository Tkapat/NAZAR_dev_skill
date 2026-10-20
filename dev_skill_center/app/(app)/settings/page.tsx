"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, KeyRound, LogOut, Moon, ShieldCheck, Sun, UserCheck } from "lucide-react";
import { useTheme } from "next-themes";
import { logout } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";
import { CentreStatusChip } from "@/components/shared/StatusChip";
import { useMe } from "@/hooks/useMe";

export default function SettingsPage() {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const { user } = useMe();
  const isDark = resolvedTheme === "dark";

  const roleLabel = user?.role === "centre_admin" ? "Centre admin" : "Trainer";

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader eyebrow="Account" title="Settings" />

      <section className="card p-6" aria-label="Profile">
        <p className="eyebrow">Profile</p>
        <dl className="mt-3 space-y-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Name</dt>
            <dd className="font-medium">{user?.full_name || "—"}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Login ID</dt>
            <dd className="font-mono text-xs font-medium">{user?.login_id || "—"}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Role</dt>
            <dd className="font-medium">{roleLabel}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Centre</dt>
            <dd className="flex items-center gap-2 font-medium">
              {user?.centre?.name ?? "—"}
              {user?.centre?.status && <CentreStatusChip status={user.centre.status} />}
            </dd>
          </div>
        </dl>
      </section>

      <section className="card divide-y divide-border" aria-label="Preferences">
        <button
          type="button"
          onClick={() => setTheme(isDark ? "light" : "dark")}
          className="flex w-full items-center gap-3 p-5 text-left text-sm font-medium transition-colors hover:bg-accent"
        >
          {isDark ? <Sun className="h-4 w-4 text-muted-foreground" aria-hidden /> : <Moon className="h-4 w-4 text-muted-foreground" aria-hidden />}
          {isDark ? "Light theme" : "Dark theme"}
        </button>
        <Link
          href="/change-password"
          className="flex items-center gap-3 p-5 text-sm font-medium transition-colors hover:bg-accent"
        >
          <KeyRound className="h-4 w-4 text-muted-foreground" aria-hidden />
          Change password
        </Link>
      </section>

      <section className="card p-6" aria-label="Data use notice">
        <p className="eyebrow">Data-use notice</p>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
          <li className="flex gap-2">
            <Camera className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
            Cameras count people anonymously. Individuals are never identified.
          </li>
          <li className="flex gap-2">
            <UserCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
            Staff verification uses only an encrypted template, stored with consent.
          </li>
          <li className="flex gap-2">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
            No raw video leaves the centre. Evidence thumbnails are blurred before they are shared.
          </li>
        </ul>
      </section>

      <Button
        variant="secondary"
        className="w-full"
        onClick={async () => {
          await logout();
          router.replace("/login");
        }}
      >
        <LogOut className="mr-2 h-4 w-4" aria-hidden />
        Log out
      </Button>
    </div>
  );
}
