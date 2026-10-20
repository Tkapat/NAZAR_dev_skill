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
import type { User } from "@/types";

const ALLOWED_ROLES = ["super_admin", "scheme_officer", "auditor"];

/** Least-privilege stand-in rendered in the static shell while GET /me resolves.
 *  Role-gated UI (canWrite, admin-only nav) stays hidden until the real user loads. */
const PENDING_USER: User = {
  id: "",
  login_id: "",
  role: "auditor",
  full_name: "",
  must_change_password: false,
  active: true,
  mfa_enabled: false,
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
 * Wraps (app) routes. The shell (sidebar/topbar/page content) is rendered
 * immediately so every segment exists in the static shell for instant
 * navigations; the session check runs on mount:
 *  - no tokens.access -> redirect /login
 *  - GET /me (api() refreshes silently if expired)
 *  - role check (wrong app -> logout + message)
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [pathname, setPathname] = React.useState("");
  const [user, setUser] = React.useState<User | null>(null);
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
        const me = await api<User>("/me");
        if (cancelled) return;

        if (!ALLOWED_ROLES.includes(me.role)) {
          await logout();
          toast.error("This account belongs to the Centre portal.");
          router.replace("/login");
          return;
        }

        if (me.must_change_password && pathname !== "/change-password") {
          router.replace("/change-password");
          return;
        }

        if (pathname.startsWith("/users") && me.role !== "super_admin") {
          router.replace("/overview");
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
        <div className="w-full max-w-md rounded-lg border bg-card">
          <ErrorState message={error} onRetry={() => { setError(null); setNonce((n) => n + 1); }} />
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
      <AppShell user={resolved}>
        <UserProvider user={resolved}>{children}</UserProvider>
      </AppShell>
    </>
  );
}
