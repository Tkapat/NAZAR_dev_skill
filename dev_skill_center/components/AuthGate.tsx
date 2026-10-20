"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { tokens, logout } from "@/lib/auth";
import { getErrorMessage } from "@/lib/strings";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { ErrorState } from "@/components/shared/ErrorState";
import { UserProvider } from "@/hooks/useMe";
import type { Me } from "@/lib/types";

const ALLOWED_ROLES = ["centre_admin", "trainer"];

/** centre_admin only — trainers are redirected to /. */
const ADMIN_ONLY_PREFIXES = [
  "/cameras",
  "/schedule",
  "/trainees",
  "/staff",
  "/equipment",
  "/requests",
  "/demo",
  "/onboarding",
];

/** Least-privilege stand-in rendered in the static shell while GET /me resolves. */
const PENDING_USER: Me = {
  id: "",
  login_id: "",
  role: "trainer",
  centre_id: null,
  full_name: "",
  must_change_password: false,
  mfa_enabled: false,
  centre: null,
};

/** Reads the URL behind a Suspense boundary (cacheComponents forbids bare
 *  usePathname during prerender of dynamic routes) and mirrors it into state. */
function PathnameSync({ onPathname }: { onPathname: (p: string) => void }) {
  const pathname = usePathname();
  React.useEffect(() => {
    onPathname(pathname);
  }, [pathname, onPathname]);
  return null;
}

/**
 * Wraps (app) routes. The shell renders immediately so every segment exists in
 * the static shell for instant navigations; the session check runs on mount:
 *  - no tokens.access -> redirect /login
 *  - GET /me (api() refreshes silently if expired)
 *  - role check (wrong app -> logout + message)
 *  - must_change_password is surfaced to the UI (banner on /, /change-password);
 *    the backend still blocks every data endpoint until the password is changed.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [pathname, setPathname] = React.useState("");
  const [user, setUser] = React.useState<Me | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!tokens.access) {
        router.replace("/login");
        return;
      }
      try {
        const me = await api<Me>("/me");
        if (cancelled) return;

        if (!ALLOWED_ROLES.includes(me.role)) {
          await logout();
          toast.error("This account belongs to the Government portal.");
          router.replace("/login");
          return;
        }

        if (
          me.role === "trainer" &&
          ADMIN_ONLY_PREFIXES.some((p) => pathname.startsWith(p))
        ) {
          router.replace("/");
          return;
        }

        setUser(me);
      } catch (err: unknown) {
        if (cancelled) return;
        const e = err as { status?: number; code?: string; message?: string } | null;
        if (e?.status === 401 || e?.code === "TOKEN_EXPIRED" || e?.code === "BAD_TOKEN") {
          router.replace("/login");
          return;
        }
        setError(getErrorMessage(e?.code, e?.message));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname, router, nonce]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md card">
          <ErrorState
            message={error}
            onRetry={() => {
              setError(null);
              setNonce((n) => n + 1);
            }}
          />
        </div>
      </div>
    );
  }

  const resolved = user ?? PENDING_USER;
  return (
    <>
      <React.Suspense fallback={null}>
        <PathnameSync onPathname={setPathname} />
      </React.Suspense>
      <AppShell user={resolved} pathname={pathname}>
        <UserProvider user={resolved}>{children}</UserProvider>
      </AppShell>
    </>
  );
}
