/* eslint-disable react-hooks/refs --
   The useWebcam() controller keeps MediaStream/video refs INSIDE the hook.
   Only its plain `status` state and event-handler callbacks cross the render
   boundary — no ref is ever read during render. The compiler taints the whole
   returned object, so the rule is disabled for this file. */
"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RotateCcw, ScanFace, Trash2, VideoOff } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { messageFrom } from "@/lib/strings";
import { drawSvg, shake, useGSAP } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorState } from "@/components/shared/ErrorState";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useMe } from "@/hooks/useMe";
import { useWebcam } from "@/hooks/useWebcam";
import type { Staff } from "@/lib/types";

export default function FaceEnrolPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useMe();
  const cam = useWebcam();
  const frameRef = React.useRef<HTMLDivElement>(null);
  const tickRef = React.useRef<HTMLDivElement>(null);

  const [consent, setConsent] = React.useState(false);
  const [previews, setPreviews] = React.useState<string[]>([]);
  const [frames, setFrames] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);
  const [removeOpen, setRemoveOpen] = React.useState(false);

  const staffQ = useQuery({
    queryKey: ["staff", "one", id],
    queryFn: async () => {
      const list = await api<{ items: Staff[] }>("/my/staff?limit=100");
      const found = list.items.find((s) => s.id === id);
      if (!found) throw { code: "NOT_FOUND", message: "Staff record not found" };
      return found;
    },
  });

  useGSAP(() => {
    if (done) drawSvg(tickRef.current, "[data-draw]", 0.15);
  }, [done]);

  React.useEffect(() => {
    return () => {
      for (const p of previews) URL.revokeObjectURL(p);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cleanup on unmount only
  }, []);

  const clearFrames = () => {
    setPreviews((old) => {
      for (const p of old) URL.revokeObjectURL(p);
      return [];
    });
    setFrames([]);
  };

  const capture = () => {
    const image_b64 = cam.capture();
    if (!image_b64) {
      toast.error("Camera is not ready yet.");
      return;
    }
    const bytes = Uint8Array.from(atob(image_b64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" }));
    setPreviews((old) => [...old, url]);
    setFrames((old) => [...old, image_b64]);
    setError(null);
  };

  const enrol = async () => {
    if (frames.length === 0 || !consent) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/my/staff/${id}/face-enrol`, {
        method: "POST",
        body: JSON.stringify({ frames_b64: frames, consent: true }),
      });
      setDone(true);
      await qc.invalidateQueries({ queryKey: ["staff"] });
      toast.success("Face enrolled.");
    } catch (err) {
      const e = err as { code?: string };
      if (e.code === "BAD_FACE") {
        setError("We could not find one clear face. Try again in better light, alone in the frame.");
      } else if (e.code === "FORBIDDEN" || e.code === "WRONG_CENTRE") {
        setError("You do not have access to this.");
      } else {
        setError(messageFrom(err));
      }
      shake(frameRef.current);
    } finally {
      setBusy(false);
    }
  };

  const removeFace = async () => {
    try {
      await api(`/my/staff/${id}/face`, { method: "DELETE" });
      setDone(false);
      clearFrames();
      await qc.invalidateQueries({ queryKey: ["staff"] });
      await staffQ.refetch();
      toast.success("Face data removed.");
    } catch (err) {
      toast.error(messageFrom(err));
    } finally {
      setRemoveOpen(false);
    }
  };

  if (staffQ.isLoading) {
    return (
      <div className="space-y-4" aria-busy>
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-96" />
      </div>
    );
  }
  if (staffQ.error) return <ErrorState onRetry={() => staffQ.refetch()} />;
  const staff = staffQ.data!;

  const isSelf = !!user && (user.id === staff.user_id || user.login_id === staff.user_id);

  if (done || staff.face_enrolled) {
    return (
      <div className="mx-auto max-w-md space-y-6">
        <PageHeader eyebrow="Staff" title="Face enrolled" description={`${staff.full_name} can now verify attendance with their face.`} />
        <div ref={tickRef} className="card flex flex-col items-center gap-3 p-8 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10 text-success">
            <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path data-draw d="m5 13 4 4L19 7" />
            </svg>
          </span>
          <p className="text-sm font-semibold">Enrolled</p>
          <p className="text-xs text-muted-foreground">
            Only an encrypted template is stored — no photo is kept.
          </p>
        </div>
        <div className="flex justify-between gap-2">
          <Button variant="secondary" onClick={() => router.push("/staff")}>
            Back to staff
          </Button>
          <Button variant="destructive" onClick={() => setRemoveOpen(true)}>
            <Trash2 className="mr-1.5 h-4 w-4" aria-hidden />
            Remove face data
          </Button>
        </div>
        <ConfirmDialog
          open={removeOpen}
          onOpenChange={setRemoveOpen}
          title="Remove face data?"
          description="The encrypted template is deleted. This person will need their admin's help to verify attendance again."
          destructive
          confirmLabel="Remove"
          onConfirm={removeFace}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <PageHeader
        eyebrow="Staff"
        title="Enrol face"
        description={`${staff.full_name} · ${staff.staff_role === "trainer" ? "Trainer" : "Official"}`}
      />

      <div className="card space-y-4 p-6">
        <p className="text-sm leading-relaxed text-muted-foreground">
          I agree that my face will be converted to an encrypted template used only to verify my own
          attendance. No photo is stored.
        </p>
        <label className="flex cursor-pointer items-start gap-2.5 text-sm">
          <Checkbox
            checked={consent}
            onCheckedChange={(v) => setConsent(v === true)}
            aria-label="Consent to enrol face"
            className="mt-0.5"
            disabled={busy || isSelf === false}
          />
          <span>
            I consent
            {!isSelf && (
              <span className="block text-xs text-muted-foreground">
                Only the staff member themselves can consent.
              </span>
            )}
          </span>
        </label>

        <div ref={frameRef} className="relative overflow-hidden rounded-[16px] bg-surface-2" style={{ aspectRatio: "4 / 3" }}>
          {previews.length > 0 ? (
            <div className="flex h-full w-full items-center justify-center gap-2 p-3">
              {previews.map((p, i) => (
                // eslint-disable-next-line @next/next/no-img-element -- transient blob preview, revoked on unmount
                <img
                  key={i}
                  src={p}
                  alt={`Captured frame ${i + 1}`}
                  className="h-full max-w-[32%] rounded-lg border object-cover"
                />
              ))}
            </div>
          ) : (
            <video ref={cam.setVideo} playsInline muted className="h-full w-full object-cover" aria-label="Camera preview" />
          )}
          {cam.status !== "live" && previews.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
              {cam.status === "denied" ? (
                <>
                  <VideoOff className="h-8 w-8 text-muted-foreground" aria-hidden />
                  <p className="text-sm font-medium">Camera access denied</p>
                  <p className="max-w-xs text-xs text-muted-foreground">
                    Allow camera access in your browser, then try again. On a phone, open this page over HTTPS.
                  </p>
                  <Button size="sm" variant="secondary" onClick={() => cam.start()}>
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    Try again
                  </Button>
                </>
              ) : (
                <>
                  <ScanFace className="h-8 w-8 text-muted-foreground" aria-hidden />
                  <Button size="sm" onClick={() => cam.start()} disabled={cam.status === "starting"}>
                    {cam.status === "starting" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : null}
                    Start camera
                  </Button>
                </>
              )}
            </div>
          )}
          {cam.status === "live" && previews.length === 0 && (
            <div
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-1/2 h-[72%] w-[48%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-2 border-dashed border-white/50"
            />
          )}
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex flex-wrap gap-2">
          {previews.length === 0 ? (
            <Button onClick={capture} disabled={cam.status !== "live" || !consent} className="flex-1">
              Capture frame 1
            </Button>
          ) : (
            <>
              {previews.length < 3 && (
                <Button variant="secondary" onClick={capture} disabled={cam.status !== "live"} className="flex-1">
                  Capture frame {previews.length + 1}
                </Button>
              )}
              <Button variant="secondary" onClick={clearFrames}>
                <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden />
                Retake all
              </Button>
              <Button onClick={enrol} loading={busy} disabled={!consent || busy} className="flex-1">
                Enrol ({previews.length} frame{previews.length === 1 ? "" : "s"})
              </Button>
            </>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Sit in good light, face the camera, and keep one person in the frame. Capture 1–3 frames for a
          stronger template.
        </p>
      </div>
    </div>
  );
}
