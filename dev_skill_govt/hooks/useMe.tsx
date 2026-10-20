"use client";

import * as React from "react";
import { useEffect, useRef, useState } from "react";
import type { User } from "@/types";

const UserContext = React.createContext<User | null>(null);

export function UserProvider({ user, children }: { user: User; children: React.ReactNode }) {
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}

interface UseMeResult {
  user: User | null;
  isLoading: boolean;
  /** True while AuthGate still shows the least-privilege placeholder user. */
  isPending: boolean;
  error: unknown;
  refetch: () => Promise<void>;
  isSuperAdmin: boolean;
  isSchemeOfficer: boolean;
  isAuditor: boolean;
  canWrite: boolean;
}

/** Reads the AuthGate user from context (no extra /me call).
 *  Falls back to a fetch when rendered outside the provider (e.g. /change-password). */
export function useMe(): UseMeResult {
  const ctx = React.useContext(UserContext);
  const [fetched, setFetched] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(ctx === null);
  const [error, setError] = useState<unknown>(null);
  const seq = useRef(0);

  const refetch = async () => {
    const id = ++seq.current;
    try {
      const { api } = await import("@/lib/api");
      const me = await api<User>("/me");
      if (id === seq.current) {
        setFetched(me);
        setError(null);
      }
    } catch (e) {
      if (id === seq.current) setError(e);
    } finally {
      if (id === seq.current) setIsLoading(false);
    }
  };

  useEffect(() => {
    if (ctx === null) refetch();
  }, [ctx]);

  const user = ctx ?? fetched;
  const role = user?.role;
  const isPending = ctx !== null && !ctx.id;
  return {
    user,
    isLoading: ctx === null ? isLoading : isPending,
    isPending,
    error,
    refetch,
    isSuperAdmin: role === "super_admin",
    isSchemeOfficer: role === "scheme_officer",
    isAuditor: role === "auditor",
    canWrite: role === "super_admin" || role === "scheme_officer",
  };
}
