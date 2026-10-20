"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Plus, Video, Wifi, Monitor, MousePointer } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { messageFrom } from "@/lib/strings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { CameraStatusChip } from "@/components/shared/StatusChip";
import type { Camera } from "@/lib/types";

const SETUP_LABEL: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
};
const SETUP_CHIP: Record<string, string> = {
  draft: "border-border bg-surface text-muted-foreground",
  submitted: "border-info/40 bg-info/10 text-info",
  approved: "border-success/40 bg-success/10 text-success",
  rejected: "border-danger/40 bg-danger/10 text-danger",
};

const KIND_CHIP: Record<string, string> = {
  browser: "border-primary/40 bg-primary/10 text-primary",
  rtsp: "border-info/40 bg-info/10 text-info",
  webcam: "border-purple/40 bg-purple/10 text-purple",
  file: "border-amber/40 bg-amber/10 text-amber",
};

const KIND_LABEL: Record<string, string> = {
  browser: "Browser",
  rtsp: "RTSP",
  webcam: "Server webcam",
  file: "Sample video",
};

type SourceKind = "browser" | "rtsp" | "file" | "webcam";

const SOURCE_OPTIONS: { kind: SourceKind; label: string; icon: React.ComponentType<{ className?: string }>; description: string }[] = [
  { kind: "browser", label: "This computer's webcam", icon: MousePointer, description: "Use the browser's getUserMedia (no URL needed)" },
  { kind: "rtsp", label: "Network camera (RTSP)", icon: Wifi, description: "RTSP/RTMP stream URL from an IP camera" },
  { kind: "file", label: "Sample video (demo)", icon: Monitor, description: "Pick a sample video file from the edge device" },
  { kind: "webcam", label: "Webcam on the server", icon: Video, description: "Server-side webcam index (e.g. webcam:0)" },
];

function AddCameraDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [name, setName] = React.useState("");
  const [sourceKind, setSourceKind] = React.useState<SourceKind>("browser");
  const [sourceUri, setSourceUri] = React.useState("");
  const [resolution, setResolution] = React.useState("1280x720");
  const [saving, setSaving] = React.useState(false);
  const [fieldError, setFieldError] = React.useState<string | null>(null);

  const videosQ = useQuery({
    queryKey: ["edge", "videos"],
    queryFn: () => api<{ videos: string[] }>("/edge/videos"),
    enabled: open && sourceKind === "file",
  });

  React.useEffect(() => {
    if (open) {
      setName("");
      setSourceKind("browser");
      setSourceUri("");
      setResolution("1280x720");
      setFieldError(null);
    }
  }, [open]);

  const submit = async () => {
    if (!name.trim()) return;
    if (sourceKind !== "browser" && !sourceUri.trim()) return;
    setSaving(true);
    setFieldError(null);
    try {
      await api("/my/cameras", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          source_uri: sourceKind === "browser" ? "browser" : sourceUri.trim(),
          resolution: resolution.trim(),
        }),
      });
      toast.success("Camera added. Draw the classroom area next.");
      await qc.invalidateQueries({ queryKey: ["cameras"] });
      await qc.invalidateQueries({ queryKey: ["centre", "mine"] });
      onOpenChange(false);
    } catch (err) {
      const e = err as { status?: number; code?: string; message?: string };
      if (e.code === "CAMERA_EXISTS" || e.status === 409) {
        setFieldError("A camera with this name already exists.");
      } else {
        toast.error(messageFrom(err));
      }
    } finally {
      setSaving(false);
    }
  };

  const needsUri = sourceKind !== "browser";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add camera</DialogTitle>
          <DialogDescription>
            Choose the source type, give it a name, then draw the classroom area.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cam-name">Name</Label>
            <Input id="cam-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Lab 101" />
          </div>

          <div className="space-y-2">
            <Label className="block text-sm font-medium">Source type</Label>
            <div className="grid gap-2 grid-cols-2" role="radiogroup" aria-label="Source type">
              {SOURCE_OPTIONS.map((opt) => (
                <button
                  key={opt.kind}
                  type="button"
                  role="radio"
                  aria-checked={sourceKind === opt.kind}
                  onClick={() => {
                    setSourceKind(opt.kind);
                    setSourceUri("");
                    setFieldError(null);
                  }}
                  className={`relative flex flex-col items-start gap-1.5 rounded-[12px] border p-3 text-left transition-all ${
                    sourceKind === opt.kind
                      ? "border-primary/50 bg-primary/5"
                      : "border-border bg-surface hover:border-primary/30"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <opt.icon className="h-4 w-4" aria-hidden />
                    <span className="font-medium text-sm">{opt.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground ml-6">{opt.description}</p>
                </button>
              ))}
            </div>
          </div>

          {needsUri && (
            <div className="space-y-2">
              <Label htmlFor="cam-source">{sourceKind === "rtsp" ? "RTSP/RTMP URL" : "Sample video"}</Label>
              {sourceKind === "file" && videosQ.data && videosQ.data.videos.length > 0 ? (
                <>
                  <Select value={sourceUri} onValueChange={setSourceUri}>
                    <SelectTrigger id="cam-source" aria-label="Sample video">
                      <SelectValue placeholder="Choose a sample video" />
                    </SelectTrigger>
                    <SelectContent>
                      {videosQ.data.videos.map((v) => (
                        <SelectItem key={v} value={`file:${v}`}>
                          <span className="font-mono text-xs">{v}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Or enter a file: name manually above.</p>
                </>
              ) : (
                <Input
                  id="cam-source"
                  value={sourceUri}
                  onChange={(e) => setSourceUri(e.target.value)}
                  placeholder={sourceKind === "rtsp" ? "rtsp://…" : "file:video.mp4"}
                  className="font-mono text-sm"
                  aria-invalid={!!fieldError}
                />
              )}
              {fieldError && <p className="text-sm text-danger" role="alert">{fieldError}</p>}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="cam-res">Resolution</Label>
            <Select value={resolution} onValueChange={setResolution}>
              <SelectTrigger id="cam-res" aria-label="Resolution">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="640x480">640 × 480</SelectItem>
                <SelectItem value="1280x720">1280 × 720 (HD)</SelectItem>
                <SelectItem value="1920x1080">1920 × 1080 (Full HD)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving} disabled={!name.trim() || (needsUri && !sourceUri.trim()) || saving}>
            Add camera
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function CamerasPage() {
  const [addOpen, setAddOpen] = React.useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["cameras"],
    queryFn: () => api<{ items: Camera[] }>("/my/cameras?limit=25"),
    refetchInterval: 15_000,
  });

  if (error) return <ErrorState onRetry={refetch} />;
  const cams = data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Setup"
        title="Cameras"
        description="Each classroom camera needs its class area drawn before the government can approve it."
        action={
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden />
            Add camera
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : cams.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Video}
            title="No cameras yet"
            hint="Add the camera that watches your classroom. You will draw the class area in the next step."
            action={
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" aria-hidden />
                Add camera
              </Button>
            }
          />
        </div>
      ) : (
        <ul className="space-y-3">
          {cams.map((c) => (
            <li key={c.id} className="card card-hover flex flex-wrap items-center gap-4 p-5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">{c.name}</p>
                  <span
                    className={`inline-flex h-5 items-center rounded-full border px-1.5 text-[10px] font-medium ${KIND_CHIP[c.source_kind] ?? "border-border bg-surface text-muted-foreground"}`}
                  >
                    {KIND_LABEL[c.source_kind] ?? c.source_kind}
                  </span>
                </div>
                <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{c.source_uri}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {c.resolution ?? "—"} · Last seen {c.last_seen ? relativeTime(c.last_seen) : "never"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <CameraStatusChip status={c.status} />
                <span
                  className={`inline-flex h-6 items-center rounded-full border px-2 text-xs font-medium ${SETUP_CHIP[c.setup_status] ?? SETUP_CHIP.draft}`}
                >
                  {SETUP_LABEL[c.setup_status] ?? c.setup_status}
                </span>
              </div>
              {c.setup_status === "rejected" && c.reject_reason && (
                <p className="w-full rounded-[12px] border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
                  Rejected: {c.reject_reason}
                </p>
              )}
              <Button asChild size="sm" variant={c.roi_polygon ? "secondary" : "default"}>
                <Link href={`/cameras/${c.id}/setup`}>
                  {c.roi_polygon ? "Review setup" : "Draw class area"}
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" aria-hidden />
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      )}

      <AddCameraDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
