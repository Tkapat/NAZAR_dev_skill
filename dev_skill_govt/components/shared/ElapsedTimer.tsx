"use client";

import * as React from "react";
import { fmtClock } from "@/lib/format";
import { useNow } from "@/hooks/useNow";
import { cn } from "@/lib/utils";

/**
 * Ticking elapsed timer. `serverSeconds` is the value at fetch time;
 * locally add (now - fetchedAt) every second. Reset on each poll.
 * aria-live off: no per-second announcements.
 */
export function ElapsedTimer({
  serverSeconds,
  fetchedAt,
  className,
}: {
  serverSeconds: number | null | undefined;
  fetchedAt: number;
  className?: string;
}) {
  const now = useNow();
  if (serverSeconds == null) return null;
  const elapsed = serverSeconds + Math.max(0, (now - fetchedAt) / 1000);
  return (
    <span className={cn("tabular font-mono", className)} aria-live="off">
      {fmtClock(elapsed)}
    </span>
  );
}

/** sentence form: "Live for 00:42:10" (mono ticking) used on live cards */
export function LiveElapsedLabel({
  serverSeconds,
  fetchedAt,
  className,
}: {
  serverSeconds: number | null | undefined;
  fetchedAt: number;
  className?: string;
}) {
  const now = useNow();
  if (serverSeconds == null) return null;
  const elapsed = serverSeconds + Math.max(0, (now - fetchedAt) / 1000);
  return (
    <span className={cn("tabular font-mono", className)} aria-live="off">
      Live for {fmtClock(elapsed)}
    </span>
  );
}
