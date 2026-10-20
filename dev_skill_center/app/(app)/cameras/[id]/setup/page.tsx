"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Plus, Trash2, Undo2, X, Video } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { messageFrom } from "@/lib/strings";
import { animateStep, useGSAP } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorState } from "@/components/shared/ErrorState";
import { SignedImage } from "@/components/shared/SignedImage";
import { CameraStatusChip } from "@/components/shared/StatusChip";
import { useWebcam } from "@/hooks/useWebcam";
import type { Camera, ReferenceFrame } from "@/lib/types";

type Pt = [number, number];
interface Zone {
  name: string;
  polygon: Pt[];
}

const MIN_AREA = 0.02;
const r4 = (n: number) => Math.round(n * 10000) / 10000;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

function polygonArea(pts: Pt[]) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

function qualityAdvice(q?: ReferenceFrame["quality"]) {
  if (!q) return [];
  const out: { label: string; ok: boolean; advice: string }[] = [];
  const brightness = q.brightness ?? 0.5;
  const sharpness = q.sharpness ?? 0.5;
  const coverage = q.coverage ?? 0.5;
  out.push({
    label: `Brightness ${Math.round(brightness * 100)}%`,
    ok: brightness >= 0.3,
    advice: brightness < 0.3 ? "Too dark: add light or move the camera" : "Good light",
  });
  out.push({
    label: `Sharpness ${Math.round(sharpness * 100)}%`,
    ok: sharpness >= 0.35,
    advice: sharpness < 0.35 ? "Blurry: clean the lens or steady the camera" : "Clear image",
  });
  out.push({
    label: `Coverage ${Math.round(coverage * 100)}%`,
    ok: coverage >= 0.3,
    advice: coverage < 0.3 ? "People look small: move the camera closer" : "Good coverage",
  });
  return out;
}

export default function CameraSetupPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const svgRef = React.useRef<SVGSVGElement>(null);
  const stageRef = React.useRef<HTMLDivElement>(null);

  const [mode, setMode] = React.useState<"roi" | "zones">("roi");
  const [roi, setRoi] = React.useState<Pt[]>([]);
  const [zones, setZones] = React.useState<Zone[]>([]);
  const [zoneName, setZoneName] = React.useState("");
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [clearOpen, setClearOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [capturingRef, setCapturingRef] = React.useState(false);
  const camWebcam = useWebcam();

  const camQ = useQuery({
    queryKey: ["camera", id],
    queryFn: () => api<Camera>(`/my/cameras/${id}`),
  });
  const refQ = useQuery({
    queryKey: ["camera", id, "reference"],
    queryFn: () => api<ReferenceFrame>(`/my/cameras/${id}/reference-frame`),
    retry: false,
  });

  // load saved shapes exactly once per camera
  React.useEffect(() => {
    const c = camQ.data;
    if (!c) return;
    setRoi((c.roi_polygon as Pt[] | null) ?? []);
    setZones((c.zones as Zone[] | null) ?? []);
    setDirty(false);
  }, [camQ.data]);

  // stop webcam on unmount
  React.useEffect(() => {
    return () => {
      camWebcam.stop();
    };
  }, [camWebcam]);

  useGSAP(() => {
    if (!stageRef.current) return;
    animateStep(stageRef.current, 1);
    // quality chips fade in
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      import("gsap").then(({ gsap }) => {
        gsap.from("[data-quality-chip]", {
          opacity: 0,
          y: 4,
          duration: 0.3,
          stagger: 0.05,
          ease: "power2.out",
          clearProps: "opacity,transform",
        });
      });
    }
  }, [refQ.data]);

  const activePoly = mode === "roi" ? roi : zones[zones.length - 1]?.polygon ?? [];
  const setActivePoly = (pts: Pt[]) => {
    setDirty(true);
    if (mode === "roi") setRoi(pts);
    else
      setZones((zs) =>
        zs.length === 0 ? zs : zs.map((z, i) => (i === zs.length - 1 ? { ...z, polygon: pts } : z)),
      );
  };

  const toNorm = (e: React.PointerEvent): Pt => {
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    return [r4(clamp01((e.clientX - rect.left) / rect.width)), r4(clamp01((e.clientY - rect.top) / rect.height))];
  };

  const onSvgPointerDown = (e: React.PointerEvent) => {
    if (dragIndex !== null) return;
    if (mode === "roi" && roi.length >= 3 && isClosed(roi)) return;
    const p = toNorm(e);
    setActivePoly([...activePoly, p]);
  };

  const isClosed = (pts: Pt[]) => pts.length >= 3;

  const onHandleDown = (i: number) => (e: React.PointerEvent) => {
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    setDragIndex(i);
  };
  const onSvgPointerMove = (e: React.PointerEvent) => {
    if (dragIndex === null) return;
    const p = toNorm(e);
    const next = activePoly.map((pt, i) => (i === dragIndex ? p : pt));
    setActivePoly(next);
  };
  const onSvgPointerUp = () => setDragIndex(null);

  const undo = () => setActivePoly(activePoly.slice(0, -1));
  const clear = () => {
    setActivePoly([]);
    setClearOpen(false);
  };

  const captureReferenceFrame = async () => {
    if (capturingRef) return;
    setCapturingRef(true);
    try {
      if (camWebcam.status !== "live") {
        await camWebcam.start();
        // Wait for camera to be ready
        await new Promise((r) => setTimeout(r, 1000));
      }
      const image_b64 = camWebcam.capture(0.8);
      if (!image_b64) {
        toast.error("Camera not ready. Please try again.");
        return;
      }
      await api(`/my/cameras/${id}/reference-frame`, {
        method: "POST",
        body: JSON.stringify({ image_b64 }),
      });
      toast.success("Reference frame captured.");
      await qc.invalidateQueries({ queryKey: ["camera", id, "reference"] });
    } catch (err) {
      toast.error(messageFrom(err));
    } finally {
      setCapturingRef(false);
    }
  };

  const save = async (silent = false) => {
    if (roi.length >= 3 && polygonArea(roi) < MIN_AREA) {
      toast.error("Draw a bigger classroom area — the current one is too small.");
      return false;
    }
    const cleanedZones = zones
      .filter((z) => z.polygon.length >= 3 && z.name.trim())
      .map((z) => ({ name: z.name.trim(), polygon: z.polygon }));
    setSaving(true);
    try {
      await api(`/my/cameras/${id}/setup`, {
        method: "PUT",
        body: JSON.stringify({
          roi_polygon: roi.length >= 3 ? roi : null,
          zones: cleanedZones.length ? cleanedZones : null,
        }),
      });
      setDirty(false);
      await qc.invalidateQueries({ queryKey: ["camera", id] });
      if (!silent) toast.success("Draft saved.");
      return true;
    } catch (err) {
      toast.error(messageFrom(err));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const submit = async () => {
    if (roi.length < 3) {
      toast.error("Draw the classroom area first.");
      return;
    }
    if (polygonArea(roi) < MIN_AREA) {
      toast.error("Draw a bigger classroom area — the current one is too small.");
      return;
    }
    setSubmitting(true);
    try {
      const ok = await save(true);
      if (!ok) return;
      await api(`/my/cameras/${id}/submit`, { method: "POST" });
      toast.success("Submitted for government approval.");
      await qc.invalidateQueries({ queryKey: ["cameras"] });
      await qc.invalidateQueries({ queryKey: ["centre", "mine"] });
      router.push("/cameras");
    } catch (err) {
      toast.error(messageFrom(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (camQ.isLoading) {
    return (
      <div className="space-y-4" aria-busy>
        <Skeleton className="h-8 w-56" />
        <Skeleton className="aspect-video w-full" />
      </div>
    );
  }
  if (camQ.error || !camQ.data) return <ErrorState onRetry={() => camQ.refetch()} />;

  const cam = camQ.data;
  const w = cam.reference_width ?? refQ.data?.width ?? 1280;
  const h = cam.reference_height ?? refQ.data?.height ?? 720;
  const hasFrame = !!refQ.data?.url || !!cam.reference_blob_id;
  const refUrl = refQ.data?.url ?? (cam.reference_blob_id ? `/files/evidence/${cam.reference_blob_id}` : null);
  const advices = qualityAdvice(refQ.data?.quality ?? cam.reference_quality ?? undefined);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Cameras"
        title={cam.name}
        description="Draw the classroom area the camera should watch. Reload reproduces your shapes exactly."
        action={
          <CameraStatusChip status={cam.status} />
        }
      />

      {cam.setup_status === "rejected" && cam.reject_reason && (
        <div className="rounded-[16px] border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
          <p className="font-semibold">The government rejected this camera</p>
          <p className="mt-1">{cam.reject_reason}</p>
          <p className="mt-1 text-muted-foreground">Fix the area or the camera position, then submit again.</p>
        </div>
      )}

      <Tabs value={mode} onValueChange={(v) => setMode(v as "roi" | "zones")}>
        <TabsList>
          <TabsTrigger value="roi">Classroom area</TabsTrigger>
          <TabsTrigger value="zones">Workstation zones</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="card overflow-hidden p-4">
          <div
            ref={stageRef}
            className="relative w-full overflow-hidden rounded-[16px] bg-surface-2"
            style={{ aspectRatio: `${w} / ${h}` }}
          >
            {hasFrame ? (
              <>
                <SignedImage
                  url={refUrl}
                  alt={`Reference frame for ${cam.name}`}
                  className="h-full w-full rounded-[16px]"
                />
                {cam.source_kind === "browser" && (
                  <div className="absolute bottom-3 right-3">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={captureReferenceFrame}
                      disabled={capturingRef || camWebcam.status === "starting"}
                      className="gap-1.5"
                    >
                      {camWebcam.status === "live" ? (
                        <>
                          <Video className="h-3.5 w-3.5" aria-hidden />
                          Update reference frame
                        </>
                      ) : (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                          Starting camera…
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                <span>No reference frame yet.</span>
                {cam.source_kind === "browser" ? (
                  <div className="flex flex-col items-center gap-2 text-xs text-muted-foreground">
                    <span>Point the camera at the empty classroom and capture a reference frame.</span>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={captureReferenceFrame}
                      disabled={capturingRef || camWebcam.status === "starting"}
                    >
                      {camWebcam.status === "live" ? (
                        <>Capture reference frame</>
                      ) : (
                        <>Starting camera…</>
                      )}
                    </Button>
                  </div>
                ) : (
                  <span>Point the camera at the empty classroom and capture a frame.</span>
                )}
              </div>
            )}

            <svg
              ref={svgRef}
              viewBox="0 0 1 1"
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full touch-none cursor-crosshair"
              onPointerDown={onSvgPointerDown}
              onPointerMove={onSvgPointerMove}
              onPointerUp={onSvgPointerUp}
              role="application"
              aria-label="Draw the classroom area by tapping points"
            >
              {/* filled classroom area */}
              {roi.length >= 2 && (
                <polygon
                  points={roi.map((p) => p.join(",")).join(" ")}
                  className="fill-primary/15 stroke-primary"
                  strokeWidth={0.004}
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                  style={{ strokeWidth: 2 }}
                />
              )}
              {/* zones */}
              {zones.map((z) =>
                z.polygon.length >= 2 ? (
                  <polygon
                    key={z.name}
                    points={z.polygon.map((p) => p.join(",")).join(" ")}
                    className="fill-info/10 stroke-info"
                    strokeWidth={2}
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null,
              )}
              {/* points + handles for the active polygon */}
              {activePoly.map((p, i) => (
                <g key={i}>
                  <circle
                    cx={p[0]}
                    cy={p[1]}
                    r={0.006}
                    className="fill-primary"
                    style={{ animation: dragIndex === i ? undefined : "none" }}
                  />
                  <rect
                    x={p[0] - 0.015}
                    y={p[1] - 0.015}
                    width={0.03}
                    height={0.03}
                    className="fill-transparent stroke-primary"
                    strokeWidth={1.5}
                    vectorEffect="non-scaling-stroke"
                    onPointerDown={onHandleDown(i)}
                    style={{ cursor: "grab" }}
                  />
                </g>
              ))}
            </svg>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={undo} disabled={activePoly.length === 0}>
              <Undo2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Undo
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setClearOpen(true)} disabled={activePoly.length === 0}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Clear
            </Button>
            <p className="ml-auto text-xs text-muted-foreground">
              {activePoly.length} point{activePoly.length === 1 ? "" : "s"}
              {mode === "roi" && roi.length >= 3 ? " · shape closed" : ""}
            </p>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Tap the image to add points. Drag the squares to adjust. Minimum 3 points.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Cameras count people anonymously. Individuals are never identified.
          </p>
        </div>

        <div className="space-y-4">
          {advices.length > 0 && (
            <div className="card space-y-2 p-5">
              <p className="eyebrow">Frame quality</p>
              {advices.map((a) => (
                <div key={a.label} data-quality-chip className="flex items-start gap-2 text-sm">
                  <span
                    className={cn(
                      "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                      a.ok ? "bg-success/10 text-success" : "bg-warning/10 text-warning",
                    )}
                    aria-hidden
                  >
                    {a.ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                  </span>
                  <span>
                    <span className="font-medium">{a.label}</span>
                    <span className="block text-xs text-muted-foreground">{a.advice}</span>
                  </span>
                </div>
              ))}
            </div>
          )}

          {mode === "zones" && (
            <div className="card space-y-3 p-5">
              <p className="eyebrow">Workstation zones</p>
              <p className="text-xs text-muted-foreground">
                Name each zone (WS1, WS2…), then tap the image to draw it.
              </p>
              <div className="flex gap-2">
                <Input
                  value={zoneName}
                  onChange={(e) => setZoneName(e.target.value)}
                  placeholder="WS1"
                  aria-label="Zone name"
                  className="h-10"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!zoneName.trim()}
                  onClick={() => {
                    if (zones.some((z) => z.name === zoneName.trim())) {
                      toast.error("That zone name is already used.");
                      return;
                    }
                    setZones((zs) => [...zs, { name: zoneName.trim(), polygon: [] }]);
                    setZoneName("");
                  }}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
                  Add
                </Button>
              </div>
              {zones.length > 0 && (
                <ul className="space-y-1.5">
                  {zones.map((z, i) => (
                    <li key={z.name} className="flex items-center gap-2 text-sm">
                      <button
                        type="button"
                        onClick={() => {
                          // bring this zone to "active" (last) for drawing
                          setZones((zs) => {
                            const next = [...zs];
                            const [item] = next.splice(i, 1);
                            return [...next, item];
                          });
                        }}
                        className={cn(
                          "flex-1 rounded-[10px] px-2 py-1.5 text-left transition-colors hover:bg-accent",
                          i === zones.length - 1 && "bg-accent-soft text-primary",
                        )}
                      >
                        {z.name}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {z.polygon.length} points{i === zones.length - 1 ? " · drawing" : ""}
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${z.name}`}
                        onClick={() => setZones((zs) => zs.filter((_, j) => j !== i))}
                        className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="card space-y-3 p-5">
            <p className="eyebrow">Privacy</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Cameras count people anonymously. Individuals are never identified.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => save()} loading={saving} className="flex-1">
              Save draft
            </Button>
            <Button onClick={submit} loading={submitting || saving} disabled={submitting} className="flex-1">
              {submitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : null}
              Submit for approval
            </Button>
          </div>
          {dirty && <p className="text-xs text-warning">Unsaved changes.</p>}
        </div>
      </div>

      <Dialog open={clearOpen} onOpenChange={setClearOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Clear the shape?</DialogTitle>
            <DialogDescription>This removes all points you drew. You can redraw it.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setClearOpen(false)}>
              Keep it
            </Button>
            <Button variant="destructive" onClick={clear}>
              Clear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
