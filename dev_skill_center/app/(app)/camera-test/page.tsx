"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Camera, RotateCcw, VideoOff, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { messageFrom } from "@/lib/strings";
import { useGSAP } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/shared/PageHeader";
import { useWebcam } from "@/hooks/useWebcam";
import type { Camera as CameraType } from "@/lib/types";

export default function CameraTestPage() {
  const cam = useWebcam();
  const camStatus = cam.status;
  const [analyzing, setAnalyzing] = React.useState(false);
  const [result, setResult] = React.useState<{
    person_count: number;
    equipment: Record<string, { detected: number; required: boolean; label: string }>;
    detections: Array<{ class: string; confidence: number; bbox: number[] }>;
  } | null>(null);
  const [cameraId, setCameraId] = React.useState("");
  const [showBoxes, setShowBoxes] = React.useState(true);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const camRef = React.useRef(cam);
  React.useEffect(() => {
    camRef.current = cam;
  });
  const setVideo = React.useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    camRef.current.setVideo(el);
  }, []);

  const camsQ = useQuery({
    queryKey: ["cameras"],
    queryFn: () => api<{ items: CameraType[] }>("/my/cameras?limit=25"),
  });

  useGSAP(() => {
    if (!canvasRef.current || !result) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    const video = videoRef.current;
    if (!video) return;

    // Draw detection boxes
    if (showBoxes && result.detections.length > 0) {
      const videoRect = canvasRef.current.getBoundingClientRect();
      const scaleX = video.videoWidth / videoRect.width;
      const scaleY = video.videoHeight / videoRect.height;

      result.detections.forEach((d) => {
        const [x1, y1, x2, y2] = d.bbox;
        ctx.strokeStyle = d.class === "person" ? "#0E7C6B" : "#0F766E";
        ctx.lineWidth = 2;
        ctx.strokeRect(x1 / scaleX, y1 / scaleY, (x2 - x1) / scaleX, (y2 - y1) / scaleY);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.font = "12px sans-serif";
        ctx.fillText(`${d.class} ${(d.confidence * 100).toFixed(0)}%`, x1 / scaleX, y1 / scaleY - 4);
      });
    }
  }, [result, showBoxes]);

  const analyze = async () => {
    if (!cameraId || cam.status !== "live") return;
    setAnalyzing(true);
    try {
      const image_b64 = cam.capture();
      if (!image_b64) {
        toast.error("Camera not ready");
        return;
      }
      const j = await api<{
        person_count: number;
        equipment: Record<string, { detected: number; required: boolean; label: string }>;
        detections: Array<{ class: string; confidence: number; bbox: number[] }>;
      }>("/edge/analyze-frame", {
        method: "POST",
        body: JSON.stringify({ camera_id: cameraId, image_b64 }),
      });
      setResult(j);
    } catch (err) {
      toast.error(messageFrom(err));
    } finally {
      setAnalyzing(false);
    }
  };

  const startAuto = () => {
    if (!cameraId) return () => {};
    const interval = setInterval(() => {
      if (cam.status === "live") analyze();
    }, 2000);
    return () => clearInterval(interval);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Test"
        title="Live Camera Test"
        description="Use your PC camera to test person/equipment detection in real-time."
      />

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <section className="card p-5" aria-label="Camera preview">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="space-y-2 flex-1">
              <label className="text-sm font-medium">Select Camera</label>
              {camsQ.isLoading ? (
                <span className="text-sm text-muted-foreground">Loading...</span>
              ) : (
                <Select value={cameraId} onValueChange={setCameraId}>
                  <SelectTrigger aria-label="Camera">
                    <SelectValue placeholder={camsQ.data?.items.length ? "Select camera" : "No cameras"} />
                  </SelectTrigger>
                  <SelectContent>
                    {camsQ.data?.items.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} ({c.resolution})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[16px] bg-surface-2" style={{ aspectRatio: "16 / 9" }}>
            {camStatus !== "live" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
                {camStatus === "denied" ? (
                  <>
                    <VideoOff className="h-8 w-8 text-muted-foreground" aria-hidden />
                    <p className="text-sm font-medium">Camera access denied</p>
                    <p className="max-w-xs text-xs text-muted-foreground">
                      Allow camera access in your browser settings.
                    </p>
                    <Button size="sm" variant="secondary" onClick={() => cam.start()}>
                      <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                      Try again
                    </Button>
                  </>
                ) : (
                  <>
                    <Camera className="h-8 w-8 text-muted-foreground" aria-hidden />
                    <Button size="sm" onClick={() => cam.start()} disabled={camStatus === "starting"}>
                      {camStatus === "starting" ? <RotateCcw className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                      Start camera
                    </Button>
                  </>
                )}
              </div>
            )}

            <video
              ref={setVideo}
              playsInline
              muted
              className="h-full w-full object-cover"
              aria-label="Camera preview"
            />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 h-full w-full pointer-events-none"
              style={{ width: "100%", height: "100%" }}
            />

            {camStatus === "live" && (
              <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center gap-2">
                <Button
                  onClick={analyze}
                  loading={analyzing}
                  disabled={!cameraId || analyzing}
                  className="flex-1"
                >
                  Analyze frame
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const cleanup = startAuto();
                    setTimeout(cleanup, 30000);
                    toast.info("Auto-analyze for 30s");
                  }}
                  disabled={!cameraId || analyzing}
                >
                  Auto (30s)
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowBoxes(!showBoxes)}
                >
                  {showBoxes ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            )}
          </div>

          <p className="mt-2 text-xs text-muted-foreground">
            Point the camera at your classroom. The detector finds people, monitors, chairs, and other equipment.
          </p>
        </section>

        <section className="card p-5 space-y-4" aria-label="Results">
          <h2 className="text-sm font-semibold">Detection Results</h2>

          {result ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-[12px] border border-border bg-surface p-4 text-center">
                  <p className="text-xs font-medium text-muted-foreground">People detected</p>
                  <p className="mt-1 text-3xl font-bold tabular">{result.person_count}</p>
                </div>
                <div className="rounded-[12px] border border-border bg-surface p-4 text-center">
                  <p className="text-xs font-medium text-muted-foreground">Objects found</p>
                  <p className="mt-1 text-3xl font-bold tabular">
                    {result.detections.length}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium">Equipment</p>
                {Object.entries(result.equipment).map(([cls, eq]) => (
                  <div key={cls} className="flex items-center gap-2 rounded-[10px] border border-border bg-surface px-3 py-2 text-sm">
                    <span className="flex-1">{eq.label} ({cls})</span>
                    <span className={eq.detected > 0 ? "text-success" : "text-warning"}>
                      {eq.detected > 0 ? "Detected" : "Not found"}
                    </span>
                    <span className="tabular text-muted-foreground">{eq.detected}</span>
                  </div>
                ))}
              </div>

              <details className="mt-4 rounded-[10px] border border-border bg-surface p-3">
                <summary className="text-xs font-medium cursor-pointer">All detections</summary>
                <pre className="mt-2 text-[10px] font-mono overflow-auto max-h-40">
                  {JSON.stringify(result.detections, null, 2)}
                </pre>
              </details>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              Start the camera and click &quot;Analyze frame&quot; to see detections.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}