"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertOctagon,
  Camera,
  Circle,
  Info,
  Loader2,
  Play,
  Radio,
  RotateCcw,
  Square,
  Timer,
  TriangleAlert,
  VideoOff,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api, apiUpload } from "@/lib/api";
import { messageFrom } from "@/lib/strings";
import { CountUp, useGSAP } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { Sparkline } from "@/components/shared/Sparkline";
import { ComplianceBoard } from "@/components/shared/ComplianceBoard";
import { useWebcam } from "@/hooks/useWebcam";
import type {
  Camera as CameraType,
  ComplianceResponse,
  DemoClaimResponse,
  DemoSessionResponse,
  FrameResponse,
  LiveDiagnostics,
  LiveSession,
  LiveStatus,
  MonitorRunResponse,
  MyLiveResponse,
} from "@/lib/types";

/* ------------------------------------------------------------- constants */

const FIRST_FRAME_TIMEOUT = 40_000;
const SUBSEQUENT_TIMEOUT = 15_000;
const DIAGNOSTICS_AFTER_MS = 20_000;
const INTERVALS = [5, 10, 30] as const;

type Tone = "danger" | "warning";

const ALERT_CLASS: Record<Tone, string> = {
  danger: "border-danger/30 bg-danger/10 text-danger",
  warning: "border-warning/40 bg-warning/10 text-warning",
};

const FRAME_ERROR: Record<string, string> = {
  FILE_TOO_LARGE: "That picture was too large to send (max 1.5 MB). Try a smaller camera resolution.",
  BAD_FILE: "The camera picture could not be read. Check the lens and lighting, then try again.",
  TOO_FAST: "Sending a little too fast — waiting a full interval before the next frame.",
  NOT_FOUND: "This camera cannot be used from a browser. Add a browser camera in Setup → Cameras.",
  DETECTOR_UNAVAILABLE: "The counting model is still loading or unavailable. This can take up to 30 s on first use.",
  CENTRE_INACTIVE: "Your centre is not active. Contact your district coordinator.",
};

const REASON_LABEL: Record<string, string> = {
  dark: "The picture is too dark. Add more light to the room.",
  covered: "The lens looks covered. Check the camera.",
  blurry: "The picture is blurry. Clean the lens or steady the camera.",
  frozen: "The picture looks frozen. Check the camera connection.",
  moved: "The camera seems to have moved. Check its position.",
};

const STATE_META: Record<string, { label: string; cls: string; Icon: React.ComponentType<{ className?: string }> }> = {
  live: { label: "Live", cls: "border-success/40 bg-success/10 text-success", Icon: Radio },
  idle: { label: "Idle", cls: "border-border bg-surface text-muted-foreground", Icon: Timer },
  offline: { label: "Offline", cls: "border-border bg-surface text-muted-foreground", Icon: Circle },
  tampered: { label: "Camera problem", cls: "border-danger/40 bg-danger/10 text-danger", Icon: AlertOctagon },
  provisional: { label: "Setup pending", cls: "border-warning/40 bg-warning/10 text-warning", Icon: Timer },
  error: { label: "Detector error", cls: "border-danger/40 bg-danger/10 text-danger", Icon: AlertOctagon },
};
const STATE_NO_DATA = { label: "No data", cls: "border-border bg-surface text-muted-foreground", Icon: Circle };

/* --------------------------------------------------------------- helpers */

function frameMessage(err: unknown): string {
  const e = (err ?? {}) as { status?: number; code?: string };
  if (typeof e.code === "string" && FRAME_ERROR[e.code]) return FRAME_ERROR[e.code];
  return messageFrom(err);
}

function frameStatusLine(err: unknown): string {
  const e = (err ?? {}) as { status?: number; code?: string; message?: string };
  if (e.status) return `${e.status} ${e.code ?? e.message ?? ""}`.trim();
  return "Network error";
}

const reasonText = (r: string) => REASON_LABEL[r] ?? r;
const prettyClass = (cls: string) => cls.replace(/_/g, " ").replace(/^./, (m) => m.toUpperCase());

function fmtElapsed(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function LiveStateChip({ state, className }: { state?: string | null; className?: string }) {
  const meta = STATE_META[state ?? ""] ?? STATE_NO_DATA;
  const Icon = meta.Icon;
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2 text-xs font-medium", meta.cls, className)}>
      <Icon className={cn("h-3 w-3", state === "live" && "live-dot")} aria-hidden />
      {meta.label}
    </span>
  );
}

/* ------------------------------------------------------------------ page */

export default function LiveMonitorPage() {
  const qc = useQueryClient();
  const cam = useWebcam();
  const { status: camStatus, capture, start: startCam, stop: stopCam } = cam;
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const camRef = React.useRef(cam);
  React.useEffect(() => {
    camRef.current = cam;
  });
  const setVideo = React.useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    camRef.current.setVideo(el);
  }, []);

  /* ------------------------------------------------------------- state */

  const [streaming, setStreaming] = React.useState(false);
  const [warmingUp, setWarmingUp] = React.useState(false);
  const [waitS, setWaitS] = React.useState(10);
  const [frame, setFrame] = React.useState<FrameResponse | null>(null);
  const [spark, setSpark] = React.useState<number[]>([]);
  const [banner, setBanner] = React.useState<{ tone: Tone; text: string } | null>(null);
  const [statusLine, setStatusLine] = React.useState<string | null>(null);
  const [sessionHint, setSessionHint] = React.useState<LiveSession | null>(null);
  const [startingDemo, setStartingDemo] = React.useState(false);
  const [stopping, setStopping] = React.useState(false);
  const [stopSummary, setStopSummary] = React.useState<{ frames: number; elapsed: string } | null>(null);
  const [showDiagnostics, setShowDiagnostics] = React.useState(false);
  const [updatesSent, setUpdatesSent] = React.useState(0);
  const [elapsedS, setElapsedS] = React.useState(0);
  const [startedAt, setStartedAt] = React.useState<number | null>(null);
  const [claimInput, setClaimInput] = React.useState("");
  const [settingClaim, setSettingClaim] = React.useState(false);

  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const waitRef = React.useRef(10 * 1000);
  const rowRef = React.useRef<LiveStatus | null>(null);
  const framesSentRef = React.useRef(0);
  const firstFrameRef = React.useRef(false);
  const cameraIdRef = React.useRef<string | null>(null);

  /* ------------------------------------------------------------ queries */

  const liveQ = useQuery({
    queryKey: ["live", "mine"],
    queryFn: () => api<MyLiveResponse>("/my/live"),
    refetchInterval: 10_000,
  });
  const diagQ = useQuery({
    queryKey: ["live", "diagnostics"],
    queryFn: () => api<LiveDiagnostics>("/my/live/diagnostics"),
    enabled: showDiagnostics,
    refetchInterval: 10_000,
  });
  const complianceQ = useQuery({
    queryKey: ["compliance"],
    queryFn: () => api<ComplianceResponse>("/my/compliance"),
    refetchInterval: 5_000,
    enabled: streaming || !!frame,
  });

  const rows = React.useMemo(() => liveQ.data?.items ?? [], [liveQ.data]);
  const counts = liveQ.data?.counts;
  const row = rows[0] ?? null;
  const session = row?.session ?? sessionHint;

  /* --------------------------------------------------------- session */

  React.useEffect(() => {
    if (!sessionHint) return;
    const end = Date.parse(sessionHint.end_ts ?? "");
    if (!Number.isFinite(end)) {
      setSessionHint(null);
      return;
    }
    const ms = end - Date.now();
    if (ms <= 0) {
      setSessionHint(null);
      return;
    }
    const id = setTimeout(() => setSessionHint(null), ms);
    return () => clearTimeout(id);
  }, [sessionHint]);

  React.useEffect(() => {
    rowRef.current = row;
  }, [row]);

  /* ---------------------------------------------------- elapsed clock */

  React.useEffect(() => {
    if (!streaming) return;
    const id = setInterval(() => {
      if (startedAt) {
        setElapsedS(Math.floor((Date.now() - startedAt) / 1000));
      }
    }, 1000);
    return () => clearInterval(id);
  }, [streaming, startedAt]);

  /* --------------------------------------------------- streaming logic */

  const applyWait = React.useCallback((seconds?: number) => {
    const s = Math.max(5, Math.round(seconds ?? waitRef.current / 1000));
    waitRef.current = s * 1000;
    setWaitS(s);
  }, []);

  const sendFrame = React.useCallback(
    async (timeout: number) => {
      const camId = cameraIdRef.current;
      if (!camId || camStatus !== "live") return false;
      const b64 = capture();
      if (!b64) return false;

      let blob: Blob;
      try {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        blob = new Blob([bytes], { type: "image/jpeg" });
      } catch {
        setBanner({ tone: "danger", text: FRAME_ERROR.BAD_FILE });
        return false;
      }
      if (blob.size > 1_500_000) {
        setBanner({ tone: "danger", text: FRAME_ERROR.FILE_TOO_LARGE });
        return false;
      }

      const fd = new FormData();
      fd.append("file", blob, "frame.jpg");
      try {
        const j = await apiUpload<FrameResponse>(`/my/cameras/${camId}/frame`, fd, true, timeout);
        if (j.accepted === false) return false;
        framesSentRef.current += 1;
        setUpdatesSent(framesSentRef.current);
        if (!firstFrameRef.current) {
          firstFrameRef.current = true;
          setWarmingUp(false);
        }
        const reasons = j.state === "tampered" ? (j.reasons ?? []) : [];
        setBanner(
          reasons.length
            ? { tone: "warning", text: `The picture looks wrong: ${reasons.map(reasonText).join(" ")}` }
            : null,
        );
        setStatusLine(null);
        setFrame(j);
        const p = j.people;
        if (typeof p === "number") setSpark((s) => [...s, p].slice(-30));
        if (j.next_interval_s) applyWait(j.next_interval_s);
        return true;
      } catch (err) {
        const e = (err ?? {}) as { status?: number; code?: string };
        if (e.code === "TOO_FAST") {
          applyWait(rowRef.current?.interval_s ?? waitRef.current / 1000);
          setStatusLine("429 TOO_FAST");
          return false;
        }
        if (e.code === "CENTRE_INACTIVE" || e.code === "NOT_FOUND" || e.status === 404) {
          setStreaming(false);
          setBanner({ tone: "danger", text: frameMessage(err) });
          setStatusLine(frameStatusLine(err));
          return false;
        }
        setBanner({
          tone: e.status ? "danger" : "warning",
          text: e.status ? frameMessage(err) : "Connection problem — we will keep trying.",
        });
        setStatusLine(frameStatusLine(err));
        return false;
      }
    },
    [camStatus, capture, applyWait],
  );

  React.useEffect(() => {
    if (!streaming) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let isFirst = true;

    const tick = async () => {
      if (cancelled) return;
      const timeout = isFirst ? FIRST_FRAME_TIMEOUT : SUBSEQUENT_TIMEOUT;
      const ok = await sendFrame(timeout);
      if (cancelled) return;
      if (ok) isFirst = false;
      timer = setTimeout(tick, waitRef.current);
    };
    timer = setTimeout(tick, 300);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [streaming, sendFrame]);

  /* --------------------------------------------------- diagnostics auto-open */

  React.useEffect(() => {
    if (!streaming || firstFrameRef.current) return;
    const id = setTimeout(() => {
      if (!firstFrameRef.current) setShowDiagnostics(true);
    }, DIAGNOSTICS_AFTER_MS);
    return () => clearTimeout(id);
  }, [streaming]);

  /* ---------------------------------------------------- canvas overlay */

  const draw = React.useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.clearRect(0, 0, w, h);

    const video = videoRef.current;
    const boxes = frame?.boxes ?? [];
    if (camStatus !== "live" || !video?.videoWidth || !video.videoHeight || !boxes.length) return;

    const scale = Math.max(w / video.videoWidth, h / video.videoHeight);
    const dw = video.videoWidth * scale;
    const dh = video.videoHeight * scale;
    const ox = (w - dw) / 2;
    const oy = (h - dh) / 2;

    ctx.lineWidth = 2;
    ctx.font = "12px sans-serif";
    for (const b of boxes) {
      const x = ox + b.x1 * dw;
      const y = oy + b.y1 * dh;
      const bw = (b.x2 - b.x1) * dw;
      const bh = (b.y2 - b.y1) * dh;
      ctx.strokeStyle = b.cls === "person" ? "#0E7C6B" : "#0F766E";
      ctx.strokeRect(x, y, bw, bh);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fillText(`${b.cls}${b.conf != null ? ` ${Math.round(b.conf * 100)}%` : ""}`, x, Math.max(12, y - 4));
    }
  }, [frame, camStatus, videoRef]);

  useGSAP(() => {
    draw();
  }, [draw]);

  React.useEffect(() => {
    const container = canvasRef.current?.parentElement;
    if (!container) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(container);
    return () => ro.disconnect();
  }, [draw]);

  React.useEffect(
    () => () => {
      stopCam();
      const c = canvasRef.current;
      c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    },
    [stopCam],
  );

  /* ------------------------------------------------------------- actions */

  const startDemo = async () => {
    setStartingDemo(true);
    try {
      const j = await api<DemoSessionResponse>("/my/live/demo-session", {
        method: "POST",
        body: JSON.stringify({ minutes: 60 }),
      });
      setSessionHint({
        id: j.session_id,
        label: j.label ?? "Demo session",
        start_ts: j.start_ts,
        end_ts: j.end_ts ?? new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      });
      toast.success(j.reused ? "Reusing the active session." : "Demo session started for 60 minutes.");
      void liveQ.refetch();
    } catch (err) {
      toast.error(messageFrom(err));
    } finally {
      setStartingDemo(false);
    }
  };

  const ensureBrowserCamera = async (): Promise<string> => {
    if (cameraIdRef.current) return cameraIdRef.current;
    // Try to find existing browser camera
    const liveCams = liveQ.data?.items ?? [];
    const browserCam = liveCams.find((c) => c.source_kind === "browser");
    if (browserCam?.camera_id) {
      cameraIdRef.current = browserCam.camera_id;
      return browserCam.camera_id;
    }
    // Create new browser camera
    try {
      const created = await api<CameraType>("/my/cameras", {
        method: "POST",
        body: JSON.stringify({ name: "This computer", source_uri: "browser", resolution: "1280x720" }),
      });
      cameraIdRef.current = created.id;
      await qc.invalidateQueries({ queryKey: ["live", "mine"] });
      return created.id;
    } catch (err) {
      const e = err as { status?: number; code?: string };
      if (e.status === 409 || e.code === "CAMERA_EXISTS") {
        await qc.invalidateQueries({ queryKey: ["live", "mine"] });
        await new Promise((r) => setTimeout(r, 500));
        const liveCams2 = liveQ.data?.items ?? [];
        const browserCam2 = liveCams2.find((c) => c.source_kind === "browser");
        if (browserCam2?.camera_id) {
          cameraIdRef.current = browserCam2.camera_id;
          return browserCam2.camera_id;
        }
      }
      throw err;
    }
  };

  const missing: string[] = [];
  if (!session) missing.push("a session");
  if (camStatus === "denied") missing.push("camera access (permission denied)");

  const canStart = missing.length === 0 && !streaming;

  const startStreaming = async () => {
    if (!canStart) return;
    const camId = await ensureBrowserCamera();
    if (!camId) {
      setBanner({ tone: "danger", text: "Could not create or find browser camera." });
      return;
    }
    setBanner(null);
    setStatusLine(null);
    setWarmingUp(true);
    firstFrameRef.current = false;
    framesSentRef.current = 0;
    setUpdatesSent(0);
    setStartedAt(Date.now());
    setElapsedS(0);

    try {
      // 1. PUT camera live settings
      await api(`/my/cameras/${camId}/live`, {
        method: "PUT",
        body: JSON.stringify({ enabled: true, interval_s: waitS }),
      });
      // 2. Start monitor run
      await api<MonitorRunResponse>(`/my/cameras/${camId}/monitor/start`, { method: "POST" });
      // 3. Ensure webcam is on
      if (camStatus !== "live") await startCam();
      // 4. Start streaming loop
      setStreaming(true);
    } catch (err) {
      setWarmingUp(false);
      setBanner({ tone: "danger", text: messageFrom(err) });
    }
  };

  const stopStreaming = async () => {
    const camId = cameraIdRef.current;
    if (!camId) return;
    setStopping(true);
    try {
      await api(`/my/cameras/${camId}/monitor/stop`, {
        method: "POST",
        body: JSON.stringify({ reason: "manual" }),
      });
      const frames = framesSentRef.current;
      const elapsed = fmtElapsed(elapsedS);
      setStreaming(false);
      setWarmingUp(false);
      stopCam();
      setStopSummary({ frames, elapsed });
      void liveQ.refetch();
      void complianceQ.refetch();
    } catch (err) {
      toast.error(messageFrom(err));
    } finally {
      setStopping(false);
    }
  };

  const setDemoClaim = async () => {
    if (!session || !claimInput) return;
    setSettingClaim(true);
    try {
      const claimed = parseInt(claimInput, 10);
      if (isNaN(claimed) || claimed < 0 || claimed > 500) {
        toast.error("Claim must be between 0 and 500.");
        return;
      }
      await api<DemoClaimResponse>("/my/live/demo-claim", {
        method: "POST",
        body: JSON.stringify({ session_id: session.id, claimed }),
      });
      toast.success(`Claim set to ${claimed}. Compliance board will update.`);
      void complianceQ.refetch();
      void liveQ.refetch();
    } catch (err) {
      toast.error(messageFrom(err));
    } finally {
      setSettingClaim(false);
    }
  };

  /* ---------------------------------------------------------- derived */

  const state = frame?.state ?? row?.state ?? null;
  const people = typeof frame?.people === "number" ? frame.people : (row?.people ?? null);
  const claimed = row?.claimed ?? null;
  const labels = row?.labels ?? {};
  const items = frame?.items && Object.keys(frame.items).length > 0 ? frame.items : (row?.items ?? {});
  const itemList = Object.entries(items).map(([cls, v]) => ({
    key: cls,
    text: `${labels[cls] ?? prettyClass(cls)} ${v.present} (${v.in_use} in use)`,
  }));
  const reasons = React.useMemo(() => {
    const fromFrame = frame?.state === "tampered" ? (frame.reasons ?? []) : [];
    const fromRow = row?.quality && row.quality.ok === false ? (row.quality.reasons ?? []) : [];
    return [...new Set(fromFrame.length ? fromFrame : fromRow)];
  }, [frame, row]);
  const sparkData = (spark.length ? spark : (row?.spark ?? [])).slice(-30);

  /* -------------------------------------------------------------- view */

  if (liveQ.error && !liveQ.data) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Monitor" title="Live Monitor" />
        <div className="card">
          <ErrorState onRetry={() => liveQ.refetch()} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Monitor"
        title="Live Monitor"
        description="Use this computer's camera to watch the room during a session. Each frame is counted on your server, then discarded — only people and equipment numbers are kept."
      />

      {/* ---- banner ---- */}
      {banner && (
        <div role="alert" className={cn("flex items-start gap-2 rounded-[12px] border p-3 text-sm", ALERT_CLASS[banner.tone])}>
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p className="flex-1">{banner.text}</p>
          <button type="button" onClick={() => setBanner(null)} aria-label="Dismiss message" className="shrink-0 rounded p-0.5 transition-opacity hover:opacity-70">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      {/* ---- session card ---- */}
      {!liveQ.isLoading && !session && (
        <div className="card">
          <EmptyState
            icon={Play}
            title="No active session"
            hint="Counts are only saved during a session. Start a demo session to try the Live Monitor now."
            action={
              <div className="flex gap-3">
                <Button onClick={startDemo} loading={startingDemo}>
                  <Play className="mr-1.5 h-4 w-4" aria-hidden />
                  Start a 60-minute demo session
                </Button>
                <Button asChild variant="secondary">
                  <Link href="/schedule">Plan a session</Link>
                </Button>
              </div>
            }
          />
        </div>
      )}

      {/* ---- session info when active ---- */}
      {session && !streaming && (
        <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="eyebrow">Active session</p>
            <p className="text-sm font-semibold">
              {session.label ?? "Session"} · {session.start_ts ? new Date(session.start_ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
              {session.end_ts ? ` – ${new Date(session.end_ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
            </p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/schedule">Plan another</Link>
          </Button>
        </div>
      )}

<div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        {/* ---- camera preview ---- */}
        <section className="card p-5" aria-label="Camera preview">
          <div className="relative overflow-hidden rounded-[16px] bg-surface-2" style={{ aspectRatio: "16 / 9" }}>
            {camStatus !== "live" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
                {camStatus === "denied" ? (
                  <>
                    <VideoOff className="h-8 w-8 text-muted-foreground" aria-hidden />
                    <p className="text-sm font-medium">Camera access denied</p>
                    <p className="max-w-xs text-xs text-muted-foreground">
                      Allow camera access in your browser settings, then try again. On a phone, open this page over HTTPS.
                    </p>
                    <Button size="sm" variant="secondary" onClick={() => startCam()}>
                      <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                      Try again
                    </Button>
                  </>
                ) : (
                  <>
                    <Camera className="h-8 w-8 text-muted-foreground" aria-hidden />
                    <Button size="sm" onClick={() => startCam()} disabled={camStatus === "starting"}>
                      {camStatus === "starting" ? <RotateCcw className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                      Start camera
                    </Button>
                  </>
                )}
              </div>
            )}

            <video ref={setVideo} playsInline muted onLoadedMetadata={draw} className="h-full w-full object-cover" aria-label="Camera preview" />
            <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />

            {streaming && camStatus === "live" && (
              <span className="absolute left-3 top-3 inline-flex h-6 items-center gap-1.5 rounded-full border border-success/40 bg-success/10 px-2 text-xs font-medium text-success">
                <span className="h-2 w-2 rounded-full bg-success live-dot" aria-hidden />
                Streaming
              </span>
            )}
            {warmingUp && (
              <span className="absolute left-3 top-3 inline-flex h-6 items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-2 text-xs font-medium text-warning">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                Warming up the counter…
              </span>
            )}
          </div>

          {/* ---- status line ---- */}
          {statusLine && (
            <p className="mt-2 text-xs font-mono text-danger">{statusLine}</p>
          )}

          {/* ---- start / stop ---- */}
          {!streaming ? (
            <div className="mt-4 space-y-2">
              {missing.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-warning">Needs:</span> {missing.join(", ")}
                </p>
              )}
              <Button onClick={startStreaming} disabled={!canStart} className="w-full sm:w-auto">
                <Play className="mr-1.5 h-4 w-4" aria-hidden />
                Start streaming
              </Button>
              {missing.includes("a session") && (
                <Button variant="secondary" onClick={startDemo} loading={startingDemo} className="ml-2">
                  Start a 60-minute demo session
                </Button>
              )}
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {/* ---- monitoring clock card ---- */}
              <div className="flex flex-wrap items-center gap-4 rounded-[12px] border border-border bg-surface p-3">
                <div>
                  <p className="text-xs text-muted-foreground">Monitoring since</p>
                  <p className="text-sm font-medium tabular">
                    {startedAt ? new Date(startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Elapsed</p>
                  <p className="text-sm font-medium tabular">{fmtElapsed(elapsedS)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Frames sent</p>
                  <p className="text-sm font-medium tabular">{updatesSent}</p>
                </div>
                <div className="flex-1" />
                <div className="flex items-center gap-2">
                  <Label htmlFor="interval" className="text-xs text-muted-foreground">Interval</Label>
                  <Select value={String(waitS)} onValueChange={(v) => applyWait(Number(v))}>
                    <SelectTrigger id="interval" className="w-20 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INTERVALS.map((s) => (
                        <SelectItem key={s} value={String(s)}>
                          {s}s
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button onClick={stopStreaming} loading={stopping} variant="secondary" className="w-full sm:w-auto">
                <Square className="mr-1.5 h-4 w-4" aria-hidden />
                Stop streaming
              </Button>
            </div>
          )}

          {/* ---- demo claim ---- */}
          {session && (
            <div className="mt-4 rounded-[12px] border border-border bg-surface p-4 space-y-2">
              <Label htmlFor="demo-claim" className="text-sm font-medium">
                Pretend the register says N trainees were present
              </Label>
              <div className="flex gap-2">
                <Input
                  id="demo-claim"
                  type="number"
                  min={0}
                  max={500}
                  value={claimInput}
                  onChange={(e) => setClaimInput(e.target.value)}
                  placeholder="e.g. 12"
                  className="w-28"
                />
                <Button size="sm" onClick={setDemoClaim} loading={settingClaim} disabled={!claimInput}>
                  Set claim
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                This creates a fake attendance claim so you can see what happens when the count differs.
              </p>
            </div>
          )}

          <p className="mt-3 text-xs text-muted-foreground">
            Point the camera at the classroom. The detector finds people, chairs, desks and monitors, and draws what it sees on this preview.
          </p>
        </section>

        {/* ---- right column ---- */}
        <section className="card p-5 space-y-4" aria-label="Right now">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Right now</h2>
            <LiveStateChip state={state} />
          </div>

          {liveQ.isLoading && !frame ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-24" />
              <Skeleton className="h-16 w-40" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <>
              <div>
                <p className="eyebrow">People</p>
                <p className="mt-1 text-[40px] font-semibold leading-none tabular">
                  {people != null ? <CountUp value={people} /> : "—"}
                </p>
                {claimed != null && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Claimed <span className="tabular font-medium text-foreground">{claimed}</span> / Camera saw{" "}
                    <span className="tabular font-medium text-foreground">{people ?? "—"}</span>
                  </p>
                )}
              </div>

              {reasons.length > 0 && (
                <ul className="space-y-1 rounded-[12px] border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
                  {reasons.map((r) => (
                    <li key={r}>{reasonText(r)}</li>
                  ))}
                </ul>
              )}

              {itemList.length > 0 && (
                <div className="space-y-2">
                  <p className="eyebrow">Equipment</p>
                  <div className="flex flex-wrap gap-2">
                    {itemList.map((it) => (
                      <span key={it.key} className="inline-flex h-7 items-center rounded-full border border-border bg-surface px-2.5 text-xs font-medium">
                        {it.text}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <p className="eyebrow">Last {sparkData.length} counts</p>
                {sparkData.length > 1 ? (
                  <Sparkline data={sparkData} className="h-12 w-full" />
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {streaming && warmingUp ? "Warming up the counter…" : "Waiting for the first frame…"}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowDiagnostics(!showDiagnostics)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                <Info className="h-3.5 w-3.5" aria-hidden />
                {showDiagnostics ? "Hide" : "Show"} diagnostics
              </button>
            </>
          )}
        </section>
      </div>

      {/* ---- diagnostics panel ---- */}
      {showDiagnostics && (
        <section className="card p-5" aria-label="Diagnostics">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Diagnostics</h2>
            <button type="button" onClick={() => setShowDiagnostics(false)} aria-label="Close diagnostics" className="rounded p-0.5 hover:opacity-70">
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
          {diagQ.isLoading ? (
            <div className="mt-3 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-60" />
            </div>
          ) : diagQ.error ? (
            <p className="mt-3 text-sm text-muted-foreground">Could not load diagnostics.</p>
          ) : diagQ.data ? (
            <div className="mt-3 space-y-2">
              <p className="text-sm font-medium">Advice:</p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {diagQ.data.advice.length === 0 ? (
                  <li>No issues detected.</li>
                ) : (
                  diagQ.data.advice.map((a, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
                      {a}
                    </li>
                  ))
                )}
              </ul>
            </div>
          ) : null}
        </section>
      )}

      {/* ---- compliance board ---- */}
      {complianceQ.data?.session && (
        <section aria-label="Compliance">
          <ComplianceBoard
            data={complianceQ.data}
            isLoading={complianceQ.isLoading}
            error={complianceQ.error}
            onRetry={() => complianceQ.refetch()}
          />
        </section>
      )}

      {/* ---- all cameras ---- */}
      <section className="card overflow-hidden" aria-label="All cameras">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">All cameras</h2>
          {counts && (
            <p className="tabular text-xs text-muted-foreground">
              {counts.live} live · {counts.idle} idle · {counts.offline} offline · {counts.tampered} camera problem{counts.tampered === 1 ? "" : "s"} · {counts.provisional} setup pending
            </p>
          )}
        </div>
        {liveQ.isLoading && rows.length === 0 ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={Radio} title="No cameras reporting yet" hint="Add a camera to see its status here." />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.camera_id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.camera_name}</span>
                <span className="tabular text-xs text-muted-foreground">{typeof r.people === "number" ? `${r.people} people` : "—"}</span>
                <LiveStateChip state={r.state} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---- privacy note (no face mentions) ---- */}
      <p className="text-xs text-muted-foreground">
        Camera pictures are analysed on your server and discarded immediately. Only people and equipment counts and blurred thumbnails are kept.
      </p>

      {/* ---- stop summary dialog ---- */}
      <Dialog open={!!stopSummary} onOpenChange={() => setStopSummary(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Monitoring stopped</DialogTitle>
            <DialogDescription>Your session has ended. Here&apos;s what was monitored.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-[12px] border border-border bg-surface p-3">
              <span className="text-sm text-muted-foreground">Frames sent</span>
              <span className="text-lg font-semibold tabular">{stopSummary?.frames ?? 0}</span>
            </div>
            <div className="flex items-center justify-between rounded-[12px] border border-border bg-surface p-3">
              <span className="text-sm text-muted-foreground">Time monitored</span>
              <span className="text-lg font-semibold tabular">{stopSummary?.elapsed ?? "00:00"}</span>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setStopSummary(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}