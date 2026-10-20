"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  /** right-align + tabular figures for numbers */
  numeric?: boolean;
  mono?: boolean;
  className?: string;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  loading?: boolean;
  loadingMore?: boolean;
  error?: unknown;
  onRetry?: () => void;
  onRowClick?: (row: T) => void;
  empty?: React.ReactNode;
  /** mirrored skeleton while loading (same heights / column count) */
  skeletonRows?: number;
  nextCursor?: string | null;
  onLoadMore?: () => void;
  caption?: string;
  className?: string;
}

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  loading,
  loadingMore,
  error,
  onRetry,
  onRowClick,
  empty,
  skeletonRows = 6,
  nextCursor,
  onLoadMore,
  caption,
  className,
}: DataTableProps<T>) {
  if (error) {
    return (
      <div className="rounded-lg border bg-card">
        <ErrorState onRetry={onRetry} />
      </div>
    );
  }

  if (loading) {
    return (
      <div className={cn("rounded-lg border bg-card", className)}>
        <div className="overflow-x-auto">
          <Table>
            {caption && <caption className="sr-only">{caption}</caption>}
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {columns.map((c) => (
                  <TableHead key={c.key} className={cn(c.numeric && "text-right")}>
                    <Skeleton className="h-3 w-20" />
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: skeletonRows }).map((_, r) => (
                <TableRow key={r} className="hover:bg-transparent">
                  {columns.map((c, i) => (
                    <TableCell key={c.key}>
                      <Skeleton className={cn("h-4", i === 0 ? "w-32" : "w-20")} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="rounded-lg border bg-card">
        {empty ?? (
          <EmptyState
            icon={(p) => (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}>
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M3 9h18" />
              </svg>
            )}
            title="Nothing here yet"
          />
        )}
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg border bg-card", className)}>
      <div className="max-h-[70vh] overflow-auto">
        <Table>
          {caption && <caption className="sr-only">{caption}</caption>}
          <TableHeader className="sticky top-0 z-10 bg-surface">
            <TableRow className="hover:bg-transparent">
              {columns.map((c) => (
                <TableHead key={c.key} className={cn(c.numeric && "text-right", c.className)}>
                  {c.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const id = getRowId(row);
              return (
                <TableRow
                  key={id}
                  data-row-id={id}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    onRowClick && "cursor-pointer hover:shadow-[inset_2px_0_0_0_var(--primary)]"
                  )}
                >
                  {columns.map((c) => (
                    <TableCell
                      key={c.key}
                      className={cn(
                        c.numeric && "tabular text-right",
                        c.mono && "font-mono text-xs text-muted-foreground",
                        c.className
                      )}
                    >
                      {c.render(row)}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {onLoadMore && nextCursor && (
        <div className="flex justify-center border-t p-3">
          <Button variant="secondary" size="sm" onClick={onLoadMore} loading={loadingMore}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
