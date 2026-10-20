"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { fmtIST, timeAgo } from "@/lib/format";
import { ENFORCEMENT_LEVELS } from "@/lib/constants";
import { useMe } from "@/hooks/useMe";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { NoticeDialog } from "@/components/shared/NoticeDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Gavel, Send } from "lucide-react";
import type { Centre, Notice } from "@/types";

const LEVEL_BADGE: Record<string, "info" | "warning" | "destructive" | "violet" | "secondary"> = {
  advisory: "info",
  notice: "secondary",
  warning: "warning",
  suspension: "destructive",
  termination: "violet",
};

export default function EnforcementPage() {
  const { canWrite } = useMe();
  const [centreId, setCentreId] = React.useState("");
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const noticesQ = useQuery({
    queryKey: ["notices", "all"],
    queryFn: () => api<{ items: Notice[] }>("/notices?limit=100"),
    refetchInterval: 30_000,
  });

  const centresQ = useQuery({
    queryKey: ["centres", "list"],
    queryFn: () => api<Centre[]>("/centres"),
    staleTime: 60_000,
  });

  const centres = centresQ.data ?? [];
  const selected = centres.find((c) => c.id === centreId);
  const notices = React.useMemo(() => noticesQ.data?.items ?? [], [noticesQ.data]);

  const counts = React.useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of ENFORCEMENT_LEVELS) c[l.id] = 0;
    for (const n of notices) if (n.level in c) c[n.level] += 1;
    return c;
  }, [notices]);

  const flaggedCentres = centres
    .filter((c) => c.status === "suspended" || c.status === "terminated" || (c.risk_score ?? 0) > 60)
    .slice(0, 6);

  if (noticesQ.error) {
    return (
      <div className="rounded-lg border bg-card">
        <ErrorState onRetry={() => noticesQ.refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Enforcement"
        description="The escalation ladder: advisories first, suspension and termination last. Every action is a notice the centre must answer."
        action={
          canWrite ? (
            <div className="flex items-center gap-2">
              <Select value={centreId} onValueChange={setCentreId}>
                <SelectTrigger className="w-64" aria-label="Select centre">
                  <SelectValue placeholder="Select a centre…" />
                </SelectTrigger>
                <SelectContent>
                  {centres.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.code} — {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button disabled={!centreId} onClick={() => setDialogOpen(true)}>
                <Send className="mr-1.5 h-4 w-4" aria-hidden />
                Issue notice
              </Button>
            </div>
          ) : undefined
        }
      />

      {/* Ladder */}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {ENFORCEMENT_LEVELS.map((l, i) => (
          <Card key={l.id} className={l.id === "suspension" || l.id === "termination" ? "border-danger/40" : undefined}>
            <CardContent className="space-y-1 p-4">
              <div className="flex items-center justify-between">
                <Badge variant={LEVEL_BADGE[l.id]}>{i + 1}</Badge>
                <span className="tabular text-2xl font-semibold">{noticesQ.isLoading ? "—" : counts[l.id]}</span>
              </div>
              <p className="text-sm font-medium">{l.label}</p>
              <p className="text-xs text-muted-foreground">
                {l.id === "advisory" && "Informational letters"}
                {l.id === "notice" && "Formal notice, centre must respond"}
                {l.id === "warning" && "Final warning"}
                {l.id === "suspension" && "Batches stopped"}
                {l.id === "termination" && "Permanent closure"}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Recent notices</CardTitle>
            </CardHeader>
            <CardContent>
              {noticesQ.isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : notices.length === 0 ? (
                <EmptyState
                  icon={Gavel}
                  title="No notices issued yet"
                  hint="Start with an advisory. Suspension and termination should come last, with flags linked."
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <caption className="sr-only">Issued notices</caption>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Level</TableHead>
                        <TableHead>Centre</TableHead>
                        <TableHead>Subject</TableHead>
                        <TableHead>Reply</TableHead>
                        <TableHead>Issued</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {notices.map((n) => {
                        const c = centres.find((x) => x.id === n.centre_id);
                        return (
                          <TableRow key={n.id}>
                            <TableCell>
                              <Badge variant={LEVEL_BADGE[n.level] ?? "secondary"}>{n.level}</Badge>
                            </TableCell>
                            <TableCell>
                              {c ? (
                                <a href={`/centres/${c.id}`} className="text-primary hover:underline">
                                  <span className="font-mono text-xs">{c.code}</span>
                                  <span className="ml-1.5 text-xs text-muted-foreground">{c.name}</span>
                                </a>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            <TableCell className="max-w-xs">
                              <span className="line-clamp-2 text-sm">{n.subject}</span>
                            </TableCell>
                            <TableCell>
                              {n.reply ? (
                                <Badge variant="success">Replied</Badge>
                              ) : (
                                <Badge variant="neutral">No reply</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="tabular text-xs text-muted-foreground">
                                    {timeAgo(n.created_at)}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>{fmtIST(n.created_at)}</TooltipContent>
                              </Tooltip>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Needs attention</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {centresQ.isLoading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)
            ) : flaggedCentres.length === 0 ? (
              <EmptyState
                icon={Gavel}
                title="Nothing needs enforcement"
                hint="Centres appear here when suspended, terminated, or risk goes above 60."
              />
            ) : (
              flaggedCentres.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {c.code} · risk {Math.round(c.risk_score ?? 0)}
                    </p>
                  </div>
                  <a
                    href={`/centres/${c.id}`}
                    className="shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-accent"
                  >
                    Open
                  </a>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {selected && (
        <NoticeDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          centreId={selected.id}
          centreLabel={`${selected.code} — ${selected.name}`}
          defaultLevel="notice"
        />
      )}
    </div>
  );
}
