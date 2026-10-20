"use client";

import * as React from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Download, History } from "lucide-react";
import { api } from "@/lib/api";
import { fmtIST } from "@/lib/format";
import { getErrorMessage } from "@/lib/strings";
import { useMe } from "@/hooks/useMe";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface AuditEntry {
  id: string;
  actor?: string;
  action: string;
  entity: string;
  entity_id: string;
  meta?: Record<string, unknown>;
  ts: string;
}

export default function AuditLogPage() {
  const { isSuperAdmin, isAuditor } = useMe();
  const [entity, setEntity] = React.useState("");
  const [fromDate, setFromDate] = React.useState("");
  const [toDate, setToDate] = React.useState("");

  const usersQ = useQuery({
    queryKey: ["users", "map"],
    queryFn: () => api<{ items: { id: string; full_name: string; login_id: string }[] }>("/users?limit=100"),
    enabled: isSuperAdmin,
    staleTime: 120_000,
  });
  const actorName = React.useMemo(() => {
    const m = new Map<string, string>();
    (usersQ.data?.items ?? []).forEach((u) => m.set(u.id, `${u.full_name} (${u.login_id})`));
    return m;
  }, [usersQ.data]);

  const filters = React.useMemo(() => {
    const p = new URLSearchParams({ limit: "50" });
    if (entity.trim()) p.set("entity", entity.trim());
    if (fromDate) p.set("from_date", fromDate);
    if (toDate) p.set("to_date", `${toDate}T23:59:59`);
    return p.toString();
  }, [entity, fromDate, toDate]);

  const logQ = useInfiniteQuery({
    queryKey: ["audit-log", filters],
    queryFn: ({ pageParam }) =>
      api<{ items: AuditEntry[]; next_cursor: string | null }>(
        `/audit-log?${filters}${pageParam ? `&cursor=${pageParam}` : ""}`
      ),
    initialPageParam: "",
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    staleTime: 30_000,
  });

  const rows = React.useMemo(() => (logQ.data?.pages ?? []).flatMap((p) => p.items), [logQ.data]);

  const forbidden =
    logQ.error &&
    ((logQ.error as { status?: number }).status === 403 || (logQ.error as { code?: string }).code === "FORBIDDEN");

  const exportCsv = () => {
    const header = ["ts", "actor", "action", "entity", "entity_id"];
    const lines = [
      header.join(","),
      ...rows.map((r) =>
        [r.ts, actorName.get(r.actor ?? "") ?? r.actor ?? "", r.action, r.entity, r.entity_id]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(",")
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "audit-log.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const metaText = (m?: Record<string, unknown>) =>
    m && Object.keys(m).length
      ? Object.entries(m)
          .map(([k, v]) => `${k}=${String(v)}`)
          .join(" · ")
      : "";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit log"
        description="Immutable record of every action taken in this portal. The ledger behind each entry is hash-chained on the server."
        action={
          rows.length > 0 ? (
            <Button variant="secondary" size="sm" onClick={exportCsv}>
              <Download className="mr-1.5 h-4 w-4" aria-hidden />
              Export CSV
            </Button>
          ) : undefined
        }
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="entity" className="text-xs text-muted-foreground">
              Entity
            </Label>
            <Input
              id="entity"
              value={entity}
              onChange={(e) => setEntity(e.target.value)}
              placeholder="e.g. flag, centre, application"
              className="w-48"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="from" className="text-xs text-muted-foreground">
              From
            </Label>
            <Input id="from" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="to" className="text-xs text-muted-foreground">
              To
            </Label>
            <Input id="to" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-40" />
          </div>
          {(entity || fromDate || toDate) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setEntity("");
                setFromDate("");
                setToDate("");
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      </PageHeader>

      {forbidden ? (
        <div className="rounded-lg border bg-card">
          <EmptyState
            icon={History}
            title="Audit log is limited to super admins and auditors"
            hint="Ask an administrator if you need read access to the audit trail."
          />
        </div>
      ) : logQ.error ? (
        <div className="rounded-lg border bg-card">
          <ErrorState
            message={getErrorMessage((logQ.error as { code?: string }).code)}
            onRetry={() => logQ.refetch()}
          />
        </div>
      ) : logQ.isLoading ? (
        <div className="rounded-lg border bg-card p-4">
          <div className="space-y-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border bg-card">
          <EmptyState
            icon={History}
            title="No audit entries"
            hint="Actions like approvals, flag decisions and notices are recorded here the moment they happen."
          />
        </div>
      ) : (
        <div className="rounded-lg border bg-card">
          <div className="max-h-[70vh] overflow-auto">
            <Table>
              <caption className="sr-only">Audit log entries</caption>
              <TableHeader className="sticky top-0 z-10 bg-surface">
                <TableRow className="hover:bg-transparent">
                  <TableHead>Time (IST)</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const meta = metaText(r.meta);
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="tabular text-xs text-muted-foreground">{fmtIST(r.ts)}</span>
                          </TooltipTrigger>
                          <TooltipContent>{r.ts}</TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="text-sm">
                        {actorName.get(r.actor ?? "") ?? (
                          <span className="font-mono text-xs text-muted-foreground">
                            {r.actor ? String(r.actor).slice(-6) : "system"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs">{r.action}</span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.entity}
                        <span className="ml-1.5 font-mono text-xs">{String(r.entity_id).slice(-6)}</span>
                      </TableCell>
                      <TableCell className="max-w-md">
                        {meta ? (
                          <span className="line-clamp-2 font-mono text-xs text-muted-foreground">{meta}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {logQ.hasNextPage && (
            <div className="flex justify-center border-t p-3">
              <Button
                variant="secondary"
                size="sm"
                loading={logQ.isFetchingNextPage}
                onClick={() => logQ.fetchNextPage()}
              >
                Load more
              </Button>
            </div>
          )}
        </div>
      )}

      {(isSuperAdmin || isAuditor) && (
        <p className="text-xs text-muted-foreground">
          Entries stream in from every router — application decisions, flag actions, notices, camera approvals and user
          management.
        </p>
      )}
    </div>
  );
}
