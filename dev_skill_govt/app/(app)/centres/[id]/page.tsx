"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, CalendarClock, CalendarDays, KeyRound, MoreHorizontal, Radio, ScrollText, ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";
import { fmtPct, timeAgo } from "@/lib/format";
import { isYmd, todayIST } from "@/lib/calendar";
import { getErrorMessage } from "@/lib/strings";
import { useMe } from "@/hooks/useMe";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorState } from "@/components/shared/ErrorState";
import { CentreStatusChip, SeverityDot } from "@/components/shared/StatusChip";
import { NoticeDialog } from "@/components/shared/NoticeDialog";
import { CredentialsModal, type CredentialRow } from "@/components/shared/CredentialsModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Camera, Centre, Flag } from "@/types";
import {
  AttendanceTab,
  CamerasTab,
  EquipmentTab,
  EvidenceTab,
  FlagsTab,
  NoticesTab,
  OverviewTab,
  TimelineTab,
} from "./tabs";
import { LiveTab } from "./live-tab";
import { CalendarTab } from "./calendar-tab";
import { ScheduleTab } from "./schedule-tab";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "live", label: "Live", icon: Radio },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "schedule", label: "Schedule", icon: CalendarClock },
  { id: "attendance", label: "Attendance" },
  { id: "equipment", label: "Equipment" },
  { id: "cameras", label: "Cameras" },
  { id: "flags", label: "Flags" },
  { id: "evidence", label: "Evidence" },
  { id: "notices", label: "Notices and actions" },
  { id: "timeline", label: "Timeline" },
];

export default function CentreDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { canWrite } = useMe();

  const [tab, setTab] = React.useState("overview");
  const [date, setDate] = React.useState<string | null>(null);

  React.useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const t = p.get("tab");
    const d = p.get("date");
    if (t && TABS.some((x) => x.id === t)) setTab(t);
    if (d && isYmd(d)) setDate(d);
  }, []);

  const q = useQuery({
    queryKey: ["centre", id],
    queryFn: () => api<{ centre: Centre; cameras: Camera[]; open_flags: Flag[] }>(`/centres/${id}`),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const [noticeOpen, setNoticeOpen] = React.useState(false);
  const [noticeLevel, setNoticeLevel] = React.useState("notice");
  const [creds, setCreds] = React.useState<CredentialRow[] | null>(null);

  const resetCreds = useMutation({
    mutationFn: () =>
      api<{ login_id: string; temporary_password: string; expires_in_hours: number; note: string }>(
        `/centres/${id}/reset-credentials`,
        { method: "POST" }
      ),
    onSuccess: (res) => {
      setCreds([
        { label: "Centre login ID", value: res.login_id },
        { label: "Temporary password", value: res.temporary_password },
        { label: "Expiry", value: `${res.expires_in_hours} hours` },
      ]);
      toast.success("Credentials reset. New temporary password generated.");
    },
    onError: (e) => {
      const err = e as { code?: string; message?: string };
      toast.error(getErrorMessage(err.code, err.message));
    },
  });

  const setTabAndUrl = (t: string) => {
    setTab(t);
    const params = new URLSearchParams({ tab: t });
    if (t === "calendar" && date) params.set("date", date);
    router.replace(`/centres/${id}?${params.toString()}`, { scroll: false });
  };

  const setCalendarDate = (d: string | null) => {
    setDate(d);
    const params = new URLSearchParams({ tab: "calendar" });
    if (d) params.set("date", d);
    router.replace(`/centres/${id}?${params.toString()}`, { scroll: false });
  };

  const openTodayInCalendar = () => {
    const d = todayIST();
    setTab("calendar");
    setDate(d);
    const params = new URLSearchParams({ tab: "calendar", date: d });
    router.replace(`/centres/${id}?${params.toString()}`, { scroll: false });
  };

  const centre = q.data?.centre;
  const openFlags = q.data?.open_flags ?? [];

  if (q.error) {
    const err = q.error as { code?: string; message?: string };
    return (
      <div className="rounded-lg border bg-card">
        <ErrorState message={getErrorMessage(err.code, err.message)} onRetry={() => q.refetch()} />
      </div>
    );
  }

  if (q.isLoading || !centre) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-80" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={centre.code}
        title={centre.name}
        description={`${centre.district}, ${centre.state} · updated ${timeAgo(centre.updated_at)}`}
        action={
          <>
            <Button variant="ghost" size="sm" onClick={() => router.push("/centres")}>
              <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden />
              All centres
            </Button>
            {canWrite && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" size="sm" aria-label="Centre actions">
                    <MoreHorizontal className="h-4 w-4" aria-hidden />
                    Actions
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Enforcement</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => { setNoticeLevel("notice"); setNoticeOpen(true); }}>
                    <ScrollText className="mr-2 h-4 w-4" aria-hidden />
                    Issue notice
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setNoticeLevel("suspension"); setNoticeOpen(true); }}>
                    <ShieldAlert className="mr-2 h-4 w-4" aria-hidden />
                    Suspend centre
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setNoticeLevel("termination"); setNoticeOpen(true); }}>
                    <AlertTriangle className="mr-2 h-4 w-4" aria-hidden />
                    Terminate centre
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Access</DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={() =>
                      resetCreds.mutate(undefined, {
                        onSuccess: () => qc.invalidateQueries({ queryKey: ["centre", id] }),
                      })
                    }
                  >
                    <KeyRound className="mr-2 h-4 w-4" aria-hidden />
                    Reset credentials
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <CentreStatusChip status={centre.status} />
          <Badge variant="outline">
            Risk <span className="ml-1 tabular font-semibold">{fmtPct(centre.risk_score ?? 0)}</span>
          </Badge>
          <Badge variant={openFlags.length > 0 ? "warning" : "secondary"}>
            {openFlags.length} open flag{openFlags.length === 1 ? "" : "s"}
          </Badge>
          {centre.status_reason && (
            <span className="text-xs text-muted-foreground">Reason: {centre.status_reason}</span>
          )}
          {openFlags.length > 0 && (
            <span className="flex items-center gap-2">
              {openFlags.slice(0, 3).map((f) => (
                <Link key={f.id} href={`/flags/${f.id}`} className="inline-flex items-center gap-1 text-xs hover:underline">
                  <SeverityDot severity={f.severity} withLabel={false} />
                  {f.type}
                </Link>
              ))}
            </span>
          )}
        </div>
      </PageHeader>

      <Tabs value={tab} onValueChange={setTabAndUrl}>
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0">
          {TABS.map((t) => (
            <TabsTrigger
              key={t.id}
              value={t.id}
              className="rounded-md border border-transparent data-[state=active]:border-border data-[state=active]:bg-surface"
            >
              {"icon" in t && t.icon ? <t.icon className="mr-1.5 h-3.5 w-3.5" aria-hidden /> : null}
              {t.label}
              {t.id === "flags" && openFlags.length > 0 && (
                <span className="ml-1.5 tabular text-xs text-warning">{openFlags.length}</span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab centre={centre} />
        </TabsContent>
        <TabsContent value="live" className="mt-4">
          <LiveTab cid={id} onOpenToday={openTodayInCalendar} />
        </TabsContent>
        <TabsContent value="calendar" className="mt-4">
          <CalendarTab cid={id} date={date} onDateChange={setCalendarDate} />
        </TabsContent>
        <TabsContent value="schedule" className="mt-4">
          <ScheduleTab cid={id} />
        </TabsContent>
        <TabsContent value="attendance" className="mt-4">
          <AttendanceTab cid={id} />
        </TabsContent>
        <TabsContent value="equipment" className="mt-4">
          <EquipmentTab cid={id} />
        </TabsContent>
        <TabsContent value="cameras" className="mt-4">
          <CamerasTab cid={id} canWrite={!!canWrite} />
        </TabsContent>
        <TabsContent value="flags" className="mt-4">
          <FlagsTab cid={id} />
        </TabsContent>
        <TabsContent value="evidence" className="mt-4">
          <EvidenceTab cid={id} />
        </TabsContent>
        <TabsContent value="notices" className="mt-4">
          <NoticesTab cid={id} onIssue={() => { setNoticeLevel("notice"); setNoticeOpen(true); }} />
        </TabsContent>
        <TabsContent value="timeline" className="mt-4">
          <TimelineTab cid={id} />
        </TabsContent>
      </Tabs>

      <NoticeDialog
        open={noticeOpen}
        onOpenChange={setNoticeOpen}
        centreId={id}
        centreLabel={`${centre.code} — ${centre.name}`}
        defaultLevel={noticeLevel}
        flagIds={openFlags.map((f) => f.id)}
        onCreated={() => qc.invalidateQueries({ queryKey: ["centre", id] })}
      />

      <CredentialsModal
        open={!!creds}
        onClose={() => setCreds(null)}
        title="New credentials generated"
        rows={creds ?? []}
        note="Shown once. Share securely."
      />
    </div>
  );
}
