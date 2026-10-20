"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Flag as FlagIcon, Search, X } from "lucide-react";
import { api } from "@/lib/api";
import { fmtIST, timeAgo } from "@/lib/format";
import { FLAG_TYPES, SEVERITY, type Severity } from "@/lib/constants";
import { getErrorMessage } from "@/lib/strings";
import { useDebounced } from "@/hooks/useDebounced";
import { useMe } from "@/hooks/useMe";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { FlagStatusChip, FlagTypeChip, SeverityDot, UncertainChip } from "@/components/shared/StatusChip";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Centre, Flag } from "@/types";

const OPEN_STATUSES = new Set(["open", "acknowledged", "centre_responded", "under_review", "escalated"]);

export default function FlagsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { canWrite } = useMe();

  const [severity, setSeverity] = React.useState("all");
  const [status, setStatus] = React.useState("all");
  const [type, setType] = React.useState("all");
  const [state, setState] = React.useState("all");
  const [district, setDistrict] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const debouncedQ = useDebounced(q, 200);

  const centresQ = useQuery({
    queryKey: ["centres", "list"],
    queryFn: () => api<Centre[]>("/centres"),
    staleTime: 60_000,
  });

  const centreById = React.useMemo(() => new Map((centresQ.data ?? []).map((c) => [c.id, c])), [centresQ.data]);
  const districts = React.useMemo(
    () => Array.from(new Set((centresQ.data ?? []).map((c) => c.district))).sort(),
    [centresQ.data]
  );

  const filters = React.useMemo(() => {
    const p = new URLSearchParams({ limit: "25" });
    if (severity !== "all") p.set("severity", severity);
    if (status !== "all") p.set("status", status);
    if (type !== "all") p.set("type", type);
    if (state !== "all") p.set("state", state);
    if (district !== "all") p.set("district", district);
    return p.toString();
  }, [severity, status, type, state, district]);

  const flagsQ = useInfiniteQuery({
    queryKey: ["flags", "console", filters],
    queryFn: ({ pageParam }) =>
      api<{ items: Flag[]; next_cursor: string | null }>(`/flags?${filters}${pageParam ? `&cursor=${pageParam}` : ""}`),
    initialPageParam: "",
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const all = React.useMemo(() => (flagsQ.data?.pages ?? []).flatMap((p) => p.items), [flagsQ.data]);
  const centreCode = (f: Flag) => centreById.get(f.centre_id)?.code ?? "—";

  const rows = React.useMemo(() => {
    const needle = debouncedQ.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((f) =>
      [f.type, f.reason, centreCode(f), centreById.get(f.centre_id)?.name ?? ""].join(" ").toLowerCase().includes(needle)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, debouncedQ, centreById]);

  const bulkAck = useMutation({
    mutationFn: (ids: string[]) =>
      api<{ acknowledged: number }>("/flags/bulk-acknowledge", {
        method: "POST",
        body: JSON.stringify({ ids }),
      }),
    onSuccess: (res) => {
      toast.success(`${res.acknowledged} flag(s) acknowledged.`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["flags"] });
    },
    onError: (e) => {
      const err = e as { code?: string; message?: string };
      toast.error(getErrorMessage(err.code, err.message));
    },
  });

  const filtersActive =
    severity !== "all" || status !== "all" || type !== "all" || state !== "all" || district !== "all" || !!debouncedQ;

  const clearFilters = () => {
    setSeverity("all");
    setStatus("all");
    setType("all");
    setState("all");
    setDistrict("all");
    setQ("");
  };

  const toggle = (id: string, on: boolean) => {
    setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  };

  const ackable = rows.filter((f) => OPEN_STATUSES.has(f.status ?? "open"));
  const allSelected = ackable.length > 0 && ackable.every((f) => selected.has(f.id));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Flags"
        description="Every camera disagreement, equipment gap and integrity problem raised by the system. Acknowledge in bulk, resolve individually."
        action={
          canWrite && selected.size > 0 ? (
            <Button loading={bulkAck.isPending} onClick={() => bulkAck.mutate(Array.from(selected))}>
              Acknowledge {selected.size} selected
            </Button>
          ) : undefined
        }
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search reason, centre…"
              className="w-56 pl-9"
              aria-label="Search flags"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Severity</Label>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger className="w-36" aria-label="Filter severity">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severities</SelectItem>
                {(Object.keys(SEVERITY) as Severity[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {SEVERITY[s].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-44" aria-label="Filter status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {["open", "acknowledged", "centre_responded", "under_review", "resolved", "dismissed", "escalated"].map(
                  (s) => (
                    <SelectItem key={s} value={s}>
                      {s.replace(/_/g, " ")}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-52" aria-label="Filter type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {Object.entries(FLAG_TYPES).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {k} — {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">State</Label>
            <Select value={state} onValueChange={setState}>
              <SelectTrigger className="w-32" aria-label="Filter state">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="flagged">Flagged</SelectItem>
                <SelectItem value="uncertain">Uncertain</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">District</Label>
            <Select value={district} onValueChange={setDistrict}>
              <SelectTrigger className="w-40" aria-label="Filter district">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All districts</SelectItem>
                {districts.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {filtersActive && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Clear filters
            </Button>
          )}

          <span className="ml-auto tabular text-sm text-muted-foreground">{rows.length} shown</span>
        </div>
      </PageHeader>

      {flagsQ.error ? (
        <div className="rounded-lg border bg-card">
          <ErrorState onRetry={() => flagsQ.refetch()} />
        </div>
      ) : flagsQ.isLoading ? (
        <div className="rounded-lg border bg-card p-4">
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border bg-card">
          <EmptyState
            icon={FlagIcon}
            title={filtersActive ? "No flags match these filters" : "No flags raised yet"}
            hint={
              filtersActive
                ? "Try clearing one of the filters above."
                : "Flags appear when the camera disagrees with claimed data. Low-risk items show up here first for triage."
            }
            action={
              filtersActive ? (
                <Button variant="secondary" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <>
          <div className="rounded-lg border bg-card">
            <div className="max-h-[70vh] overflow-auto">
              <Table>
                <caption className="sr-only">Flags console</caption>
                <TableHeader className="sticky top-0 z-10 bg-surface">
                  <TableRow className="hover:bg-transparent">
                    {canWrite && (
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={(v) =>
                            setSelected(v === true ? new Set(ackable.map((f) => f.id)) : new Set())
                          }
                          aria-label="Select all open flags"
                        />
                      </TableHead>
                    )}
                    <TableHead>Severity</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Centre</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Raised</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((f) => {
                    const c = centreById.get(f.centre_id);
                    const selectable = canWrite && OPEN_STATUSES.has(f.status ?? "open");
                    return (
                      <TableRow
                        key={f.id}
                        onClick={() => router.push(`/flags/${f.id}`)}
                        className="cursor-pointer hover:shadow-[inset_2px_0_0_0_var(--primary)]"
                      >
                        {canWrite && (
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            {selectable ? (
                              <Checkbox
                                checked={selected.has(f.id)}
                                onCheckedChange={(v) => toggle(f.id, v === true)}
                                aria-label={`Select flag ${f.type}`}
                              />
                            ) : null}
                          </TableCell>
                        )}
                        <TableCell>
                          <SeverityDot severity={f.severity} />
                        </TableCell>
                        <TableCell>
                          <FlagTypeChip type={f.type} />
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-xs">{c?.code ?? "—"}</span>
                          <span className="ml-2 text-xs text-muted-foreground">{c?.name ?? ""}</span>
                        </TableCell>
                        <TableCell className="max-w-md">
                          <span className="line-clamp-2 text-sm">{f.reason}</span>
                          {f.state === "uncertain" && (
                            <span className="mt-1 inline-block">
                              <UncertainChip />
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <FlagStatusChip status={f.status ?? "open"} />
                        </TableCell>
                        <TableCell>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="tabular text-xs text-muted-foreground">{timeAgo(f.created_at)}</span>
                            </TooltipTrigger>
                            <TooltipContent>{fmtIST(f.created_at)}</TooltipContent>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {flagsQ.hasNextPage && (
              <div className="flex justify-center border-t p-3">
                <Button
                  variant="secondary"
                  size="sm"
                  loading={flagsQ.isFetchingNextPage}
                  onClick={() => flagsQ.fetchNextPage()}
                >
                  Load more
                </Button>
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            {FLAG_TYPES[rows[0]?.type ?? ""]?.hint ?? ""} The full list of flag types is explained in each flag&apos;s detail
            page.
          </p>
        </>
      )}
    </div>
  );
}
