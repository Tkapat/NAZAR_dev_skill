"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { FileText, Search } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { APPLICATION_TABS } from "@/lib/constants";
import { useDebounced } from "@/hooks/useDebounced";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Application } from "@/types";

interface LabelMaps {
  schemeMap: Record<string, string>;
  tradeMap: Record<string, string>;
}

async function fetchApplicationsWithLabels(): Promise<{ apps: Application[]; labels: LabelMaps }> {
  const [apps, schemes] = await Promise.all([
    api<Application[]>("/applications"),
    api<{ id: string; name: string; code: string }[]>("/schemes").catch(() => []),
  ]);
  const templates = await Promise.all(
    schemes.map((s) =>
      api<{ id: string; trade_name: string }[]>(`/schemes/${s.id}/templates`).catch(() => [])
    )
  );
  const schemeMap: Record<string, string> = {};
  const tradeMap: Record<string, string> = {};
  schemes.forEach((s) => (schemeMap[s.id] = s.name));
  templates.forEach((list) => list.forEach((t) => (tradeMap[t.id] = t.trade_name)));
  return { apps, labels: { schemeMap, tradeMap } };
}

export default function ApplicationsPage() {
  const router = useRouter();
  const [tab, setTab] = React.useState("submitted");
  const [q, setQ] = React.useState("");
  const debounced = useDebounced(q, 200);

  React.useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t && APPLICATION_TABS.some((x) => x.id === t)) setTab(t);
  }, []);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["applications", "all"],
    queryFn: fetchApplicationsWithLabels,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const apps = React.useMemo(() => data?.apps ?? [], [data]);
  const labels = data?.labels;

  const counts = React.useMemo(() => {
    const c: Record<string, number> = {};
    for (const t of APPLICATION_TABS) c[t.id] = 0;
    for (const a of apps) {
      const key = a.status === "resubmitted" ? "submitted" : a.status;
      if (key in c) c[key] += 1;
    }
    return c;
  }, [apps]);

  const rows = React.useMemo(() => {
    const needle = debounced.trim().toLowerCase();
    return apps.filter((a) => {
      const key = a.status === "resubmitted" ? "submitted" : a.status;
      if (key !== tab) return false;
      if (!needle) return true;
      return [a.tracking_code, a.centre_name, a.applicant_name, a.district]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [apps, tab, debounced]);

  const columns: DataTableColumn<Application>[] = [
    {
      key: "tracking",
      header: "Tracking code",
      render: (a) => <span className="font-mono text-xs">{a.tracking_code}</span>,
    },
    { key: "centre", header: "Centre", render: (a) => <span className="font-medium">{a.centre_name}</span> },
    { key: "applicant", header: "Applicant", render: (a) => a.applicant_name },
    {
      key: "scheme",
      header: "Scheme / trade",
      render: (a) => (
        <span className="text-muted-foreground">
          {labels?.schemeMap[a.scheme_id] ?? "—"}
          <span className="mx-1">·</span>
          {labels?.tradeMap[a.trade_template_id] ?? "—"}
        </span>
      ),
    },
    { key: "district", header: "District", render: (a) => a.district },
    { key: "max", header: "Max trainees", numeric: true, render: (a) => a.max_trainees },
    {
      key: "submitted",
      header: "Submitted",
      render: (a) => <span className="tabular text-muted-foreground">{fmtDate(a.submitted_at)}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Applications"
        description="New centre applications arrive here for review. Pending, query and decision history stay attached to the tracking code."
        action={
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search code, centre, applicant…"
              className="w-64 pl-9"
              aria-label="Search applications"
            />
          </div>
        }
      />

      <Tabs value={tab} onValueChange={(v) => router.replace(`/applications?tab=${v}`, { scroll: false })}>
        <TabsList>
          {APPLICATION_TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>
              {t.label}
              <span className="ml-1.5 tabular text-xs text-muted-foreground">{counts[t.id] ?? 0}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <DataTable
        caption="Applications"
        columns={columns}
        rows={rows}
        getRowId={(a) => a.id}
        loading={isLoading}
        error={error}
        onRetry={() => refetch()}
        onRowClick={(a) => router.push(`/applications/${a.id}`)}
        empty={
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2">
              <FileText className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} aria-hidden />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">No applications in this tab</p>
              <p className="mx-auto max-w-[45ch] text-sm text-muted-foreground">
                {debounced
                  ? "Nothing matches your search in this tab."
                  : "Applications submitted by centres appear here for review."}
              </p>
            </div>
          </div>
        }
      />
    </div>
  );
}
