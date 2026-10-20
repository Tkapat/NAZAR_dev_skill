"use client";

import * as React from "react";
import { formatTimeOnly, fmtDuration, fmtIST } from "@/lib/format";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RunEndReasonChip } from "@/components/shared/StatusChip";
import { cn } from "@/lib/utils";
import type { RunRow } from "@/types";

function RunRowItem({ run }: { run: RunRow }) {
  const running = !run.ended_at;
  const duration =
    run.duration_s != null
      ? run.duration_s
      : run.ended_at
        ? (new Date(run.ended_at).getTime() - new Date(run.started_at).getTime()) / 1000
        : null;

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <span className="tabular font-mono text-muted-foreground">
        {formatTimeOnly(run.started_at)}
        {" – "}
        {running ? (
          <span className="inline-flex items-center gap-1 text-success">
            <span className="h-1.5 w-1.5 rounded-full bg-current live-dot" aria-hidden />
            Running
          </span>
        ) : (
          formatTimeOnly(run.ended_at)
        )}
      </span>
      {duration != null && <span className="tabular text-muted-foreground">{fmtDuration(duration)}</span>}
      <RunEndReasonChip reason={running ? null : run.end_reason} running={running} className="h-5 text-[11px]" />
      <span className="text-muted-foreground">
        by {run.by === "user" ? run.by_name || "user" : "system"}
        {run.camera_name ? ` · ${run.camera_name}` : ""}
      </span>
      <span className="tabular ml-auto text-muted-foreground">
        {run.frames_ok ?? 0} ok / {run.frames_bad ?? 0} bad
      </span>
    </li>
  );
}

/** Monitoring runs list: started – ended (or Running) – duration – end-reason chip – by – frames. */
export function RunList({ runs, empty, className }: { runs: RunRow[]; empty?: React.ReactNode; className?: string }) {
  if (!runs.length) {
    return <p className={cn("text-sm text-muted-foreground", className)}>{empty ?? "No monitoring runs."}</p>;
  }
  return (
    <ul className={cn("divide-y divide-border", className)}>
      {runs.map((r) => (
        <RunRowItem key={r.id} run={r} />
      ))}
    </ul>
  );
}

/** tooltip-wrapped exact IST start time helper used by run/session headers */
export function TsTooltip({ ts, children, className }: { ts: string | null | undefined; children: React.ReactNode; className?: string }) {
  if (!ts) return <span className={className}>—</span>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={className}>{children}</span>
      </TooltipTrigger>
      <TooltipContent>{fmtIST(ts)}</TooltipContent>
    </Tooltip>
  );
}
