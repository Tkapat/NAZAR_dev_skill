"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "./EmptyState";

interface ChartCardProps {
  title: string;
  /** range / series control rendered top-right */
  control?: React.ReactNode;
  loading?: boolean;
  empty?: boolean;
  emptyTitle?: string;
  emptyHint?: string;
  /** mandatory text summary below the chart (accessibility) */
  summary?: string;
  children: React.ReactNode;
  className?: string;
}

export function ChartCard({
  title,
  control,
  loading,
  empty,
  emptyTitle = "No data for this range",
  emptyHint,
  summary,
  children,
  className,
}: ChartCardProps) {
  return (
    <div className={cn("card p-6", className)}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {control}
      </div>

      {loading ? (
        <Skeleton className="h-56 w-full" />
      ) : empty ? (
        <EmptyState
          icon={(p) => (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}>
              <path d="M4 19V5" />
              <path d="M4 19h16" />
              <path d="m7 14 3-4 3 2 4-6" />
            </svg>
          )}
          title={emptyTitle}
          hint={emptyHint}
        />
  ) : (
    <>{children}</>
  )}

      {summary && !loading && !empty && (
        <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">{summary}</p>
      )}
    </div>
  );
}
