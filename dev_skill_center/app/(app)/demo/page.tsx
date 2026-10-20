"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { FlaskConical, Play, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { CountUp } from "@/lib/motion";
import { messageFrom } from "@/lib/strings";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorState } from "@/components/shared/ErrorState";
import { SignedImage } from "@/components/shared/SignedImage";
import { FlagStatusChip, SeverityDot } from "@/components/shared/StatusChip";
import { useMe } from "@/hooks/useMe";
import type { Camera, DemoRunResult, EdgeStatus, Session } from "@/lib/types";

const STEPS = ["Capture", "Quality", "Detect", "Blur", "Consolidate", "Compare"] as const;

const SCENARIOS = [
  { id: "normal", label: "Normal class", video: "lab_normal.mp4" },
  { id: "few", label: "Few students", video: "lab_few.mp4" },
  { id: "equipment", label: "Equipment removed", video: "lab_no_equipment.mp4" },
  { id: "covered", label: "Camera covered", video: "lab_covered.mp4" },
  { id: "frozen", label: "Frozen feed", video: "lab_frozen.mp4" },
  { id: "dark", label: "Dark room", video: "lab_dark.mp4" },
];

function PipelineSteps({ running, done }: { running: boolean; done: boolean }) {
  const ref = React.useRef<HTMLOListElement>(null);
  const [active, setActive] = React.useState(0);

  React.useEffect(() => {
    if (!running) {
      setActive(done ? STEPS.length : 0);
      return;
    }
    setActive(0);
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setActive((a) => Math.min(STEPS.length - 1, Math.max(a, i % STEPS.length)));
    }, 700);
    return () => clearInterval(id);
  }, [running, done]);

  return (
    <ol ref={ref} className="space-y-2" aria-label="Analysis pipeline">
      {STEPS.map((s, i) => {
        const complete = done || (running && i < active);
        const current = running && i === active;
        return (
          <li key={s} className="flex items-center gap-3">
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs tabular transition-colors",
                complete
                  ? "border-success bg-success/10 text-success"
                  : current
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground",
              )}
              aria-hidden
            >
              {complete ? "✓" : i + 1}
            </span>
            <span
              className={cn(
                "text-sm",
                complete || current ? "font-medium" : "text-muted-foreground",
              )}
            >
              {s}
              {current && <span className="ml-2 text-xs text-muted-foreground">Analysing…</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function FrameChart({ perFrame, claimed }: { perFrame: number[]; claimed: number | null }) {
  const max = Math.max(1, ...perFrame, claimed ?? 0);
  return (
    <div>
      <div className="relative flex h-32 items-end gap-1" role="img" aria-label="Per-frame person counts">
        {perFrame.map((v, i) => (
          <div
            key={i}
            className="flex-1 rounded-t-[3px] bg-primary/70"
            style={{ height: `${(v / max) * 100}%` }}
            title={`${v}`}
          />
        ))}
        {claimed != null && (
          <div
            className="absolute inset-x-0 border-t-2 border-dashed border-danger"
            style={{ bottom: `${(claimed / max) * 100}%` }}
            aria-hidden
          />
        )}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Bars = people the camera saw in each frame. Dashed line = claimed attendance ({claimed ?? "—"}).
      </p>
    </div>
  );
}

export default function DemoPage() {
  const { user } = useMe();
  const [cameraId, setCameraId] = React.useState("");
  const [sessionId, setSessionId] = React.useState("");
  const [scenario, setScenario] = React.useState("normal");
  const [claimedOverride, setClaimedOverride] = React.useState("");
  const [running, setRunning] = React.useState(false);
  const [result, setResult] = React.useState<DemoRunResult | null>(null);
  const [offline, setOffline] = React.useState(false);

  const camsQ = useQuery({
    queryKey: ["cameras"],
    queryFn: () => api<{ items: Camera[] }>("/my/cameras?limit=25"),
  });
  const sessionsQ = useQuery({
    queryKey: ["sessions", "all-demo"],
    queryFn: () => api<{ items: Session[] }>("/my/sessions?limit=10"),
  });
  const videosQ = useQuery({
    queryKey: ["edge", "videos"],
    queryFn: () => api<{ videos: string[] }>("/edge/videos"),
  });
  const statusQ = useQuery({
    queryKey: ["edge", "status"],
    queryFn: () => api<EdgeStatus>("/edge/status"),
    refetchInterval: offline ? 3000 : 15000,
  });

  React.useEffect(() => {
    const cams = camsQ.data?.items ?? [];
    if (!cameraId && cams.length) setCameraId(cams[0].id);
  }, [camsQ.data, cameraId]);

  React.useEffect(() => {
    const sessions = sessionsQ.data?.items ?? [];
    if (!sessionId && sessions.length) setSessionId(sessions[0].id);
  }, [sessionsQ.data, sessionId]);

  React.useEffect(() => {
    setOffline(!statusQ.data?.online);
  }, [statusQ.data?.online]);

  const run = async () => {
    if (!cameraId || !sessionId) return;
    setRunning(true);
    setResult(null);
    try {
      const sc = SCENARIOS.find((s) => s.id === scenario) ?? SCENARIOS[0];
      const video = videosQ.data?.videos.includes(sc.video) ? sc.video : (videosQ.data?.videos[0] ?? sc.video);
      const j = await api<DemoRunResult>("/edge/demo/run", {
        method: "POST",
        body: JSON.stringify({
          camera_id: cameraId,
          session_id: sessionId,
          video,
          scenario,
          claimed_override: claimedOverride === "" ? null : Number(claimedOverride),
        }),
      });
      setResult(j);
    } catch (err) {
      toast.error(messageFrom(err));
    } finally {
      setRunning(false);
    }
  };

  const setOfflineMode = async (value: boolean) => {
    try {
      await api("/edge/offline", { method: "POST", body: JSON.stringify({ value }) });
      setOffline(value);
      if (!value) {
        await api("/edge/sync-now", { method: "POST" });
        toast.success("Back online. Queued records synced.");
      } else {
        toast.info("Simulating offline. Records will queue.");
      }
      statusQ.refetch();
    } catch (err) {
      toast.error(messageFrom(err));
    }
  };

  if (user && user.role !== "centre_admin") {
    return <ErrorState message="Demo Lab is available to centre admins only." />;
  }
  if (camsQ.error) return <ErrorState onRetry={() => camsQ.refetch()} />;

  const cams = camsQ.data?.items ?? [];
  const sessions = sessionsQ.data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Demo"
        title="Demo Lab"
        description="Run the camera analysis pipeline on sample videos. Everything shown here is real output."
        action={
          <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2 text-xs font-medium text-primary">
            <FlaskConical className="h-3 w-3" aria-hidden />
            Demo
          </span>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <section className="card space-y-4 p-6" aria-label="Controls">
          <div className="space-y-2">
            <Label>Camera</Label>
            <Select value={cameraId} onValueChange={setCameraId}>
              <SelectTrigger aria-label="Camera">
                <SelectValue placeholder={cams.length ? "Select" : "No cameras"} />
              </SelectTrigger>
              <SelectContent>
                {cams.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Session</Label>
            <Select value={sessionId} onValueChange={setSessionId}>
              <SelectTrigger aria-label="Session">
                <SelectValue placeholder={sessions.length ? "Select" : "No sessions"} />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.batch_name ?? "Session"} · {s.session_date}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Scenario</Label>
            <Select value={scenario} onValueChange={setScenario}>
              <SelectTrigger aria-label="Scenario">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCENARIOS.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Sample video: <span className="font-mono">{SCENARIOS.find((s) => s.id === scenario)?.video}</span>
              {videosQ.data && !videosQ.data.videos.includes(SCENARIOS.find((s) => s.id === scenario)!.video) && (
                <span className="text-warning"> (not on server — first available video will be used)</span>
              )}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="claimed">Claimed attendance (optional override)</Label>
            <Input
              id="claimed"
              type="number"
              min={0}
              value={claimedOverride}
              onChange={(e) => setClaimedOverride(e.target.value)}
              placeholder="e.g. 18"
            />
          </div>
          <Button onClick={run} loading={running} disabled={!cameraId || !sessionId || running} className="w-full">
            <Play className="mr-1.5 h-4 w-4" aria-hidden />
            Run session analysis
          </Button>

          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Simulate offline</p>
                <p className="text-xs text-muted-foreground">Records queue locally, then sync.</p>
              </div>
              <Button
                size="sm"
                variant={offline ? "default" : "secondary"}
                onClick={() => setOfflineMode(!offline)}
              >
                {offline ? <Wifi className="mr-1.5 h-3.5 w-3.5" aria-hidden /> : <WifiOff className="mr-1.5 h-3.5 w-3.5" aria-hidden />}
                {offline ? "Go online and sync" : "Go offline"}
              </Button>
            </div>
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Status</dt>
                <dd className={statusQ.data?.online ? "text-success" : "text-warning"}>
                  {statusQ.data?.online ? "Online" : "Offline"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Unsynced records</dt>
                <dd className="tabular">{statusQ.data?.unsynced_count ?? 0}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Ledger</dt>
                <dd className={statusQ.data?.chain_ok ? "text-success" : "text-danger"}>
                  {statusQ.data?.chain_ok ? "Ledger verified" : "Chain broken"}
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="card space-y-5 p-6" aria-label="Results">
          <div>
            <p className="eyebrow">Pipeline</p>
            <div className="mt-3">
              <PipelineSteps running={running} done={!!result} />
            </div>
          </div>

          {camsQ.isLoading || sessionsQ.isLoading ? (
            <Skeleton className="h-40" />
          ) : result ? (
            <div className="space-y-5 border-t border-border pt-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-[16px] border border-border bg-surface p-4">
                  <p className="eyebrow">Claimed</p>
                  <p className="tabular mt-1 text-3xl font-semibold">
                    <CountUp value={result.claimed ?? 0} />
                  </p>
                </div>
                <div className="rounded-[16px] border border-border bg-surface p-4">
                  <p className="eyebrow">Camera saw</p>
                  <p className="tabular mt-1 text-3xl font-semibold text-primary">
                    <CountUp value={result.observed ?? 0} />
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    State: {result.state} · CI {result.ci_low ?? "—"}–{result.ci_high ?? "—"}
                  </p>
                </div>
              </div>

              {result.thumbnails.length > 0 && (
                <div>
                  <p className="eyebrow mb-2">Blurred thumbnails</p>
                  <div className="grid grid-cols-3 gap-2">
                    {result.thumbnails.slice(0, 3).map((u, i) => (
                      <SignedImage key={i} url={u} alt={`Frame ${i + 1}`} gallery={result.thumbnails} className="h-24 w-full" />
                    ))}
                  </div>
                </div>
              )}

              {result.per_frame.length > 0 && (
                <div>
                  <p className="eyebrow mb-2">Per-frame counts</p>
                  <FrameChart perFrame={result.per_frame.slice(0, 40)} claimed={result.claimed} />
                </div>
              )}

              {result.flags.length > 0 && (
                <div>
                  <p className="eyebrow mb-2">Flags raised</p>
                  <ul className="space-y-2">
                    {result.flags.map((f, i) => (
                      <li key={f.id ?? i} className="flex items-center gap-2 text-sm">
                        <SeverityDot severity={f.severity} />
                        <span className="min-w-0 flex-1">{f.reason}</span>
                        <FlagStatusChip status={f.status} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p className="border-t border-border pt-5 text-sm text-muted-foreground">
              Pick a scenario and run the analysis. Real detections, blur and flags will appear here.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
