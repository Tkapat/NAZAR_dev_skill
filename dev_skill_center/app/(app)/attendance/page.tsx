/* eslint-disable react-hooks/refs --
   The useWebcam() controller keeps MediaStream/video refs INSIDE the hook.
   Only its plain `status` state and event-handler callbacks cross the render
   boundary — no ref is ever read during render. The compiler taints the whole
   returned object, so the rule is disabled for this file. */
"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarCheck,
  Camera,
  Check,
  Loader2,
  RotateCcw,
  Search,
  ShieldCheck,
  VideoOff,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { fmtRange, fmtShortDate, IST, sessionState, SESSION_STATE_LABEL } from "@/lib/format";
import { animateStep, CountUp, flash, useGSAP } from "@/lib/motion";
import { messageFrom } from "@/lib/strings";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { useMe } from "@/hooks/useMe";
import { useWebcam } from "@/hooks/useWebcam";
import type { Session, Trainee } from "@/lib/types";

function clockOf(ts: string) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ts));
}

function SessionPicker({
  sessions,
  selectedId,
  onSelect,
}: {
  sessions: Session[];
  selectedId: string | null;
  onSelect: (s: Session) => void;
}) {
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {sessions.map((s) => {
        const state = sessionState(s);
        const active = s.id === selectedId;
        return (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onSelect(s)}
              className={cn(
                "card card-hover w-full p-5 text-left transition-colors",
                active && "border-primary ring-1 ring-primary",
              )}
              aria-pressed={active}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{s.batch_name ?? "Session"}</p>
                <span className="text-xs font-medium text-muted-foreground">
                  {SESSION_STATE_LABEL[state]}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {fmtRange(clockOf(s.start_ts), clockOf(s.end_ts))} · {s.trainer_name ?? "—"}
              </p>
              {s.claimed != null && (
                <p className="mt-1 text-xs text-muted-foreground">Claimed {s.claimed}</p>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function VerifyStep({
  session,
  onVerified,
}: {
  session: Session;
  onVerified: () => void;
}) {
  const { user } = useMe();
  const cam = useWebcam();
  const [busy, setBusy] = React.useState(false);
  const [attempts, setAttempts] = React.useState(0);
  const [done, setDone] = React.useState(false);
  const [failing, setFailing] = React.useState<string | null>(null);
  const stepRef = React.useRef<HTMLDivElement>(null);

  useGSAP(() => animateStep(stepRef.current, 1), []);

  const [windowOk, setWindowOk] = React.useState({ tooEarly: true, tooLate: false });
  React.useEffect(() => {
    const check = () => {
      const now = Date.now();
      const startMs = new Date(session.start_ts).getTime();
      const endMs = new Date(session.end_ts).getTime();
      setWindowOk({
        tooEarly: now < startMs - 15 * 60 * 1000,
        tooLate: now > endMs,
      });
    };
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, [session.start_ts, session.end_ts]);
  const { tooEarly, tooLate } = windowOk;

  const scan = async () => {
    const image_b64 = cam.capture();
    if (!image_b64) {
      toast.error("Camera is not ready yet.");
      return;
    }
    setBusy(true);
    setFailing(null);
    try {
      await api(`/my/sessions/${session.id}/staff-scan`, {
        method: "POST",
        body: JSON.stringify({ image_b64 }),
      });
      setDone(true);
      onVerified();
      toast.success("Verified. You can mark attendance.");
    } catch (err) {
      const e = err as { code?: string; message?: string };
      setAttempts((a) => a + 1);
      if (e.code === "FACE_NOT_ENROLLED") {
        setFailing("enrolled");
      } else if (attempts + 1 >= 3) {
        setFailing("escalate");
      } else {
        setFailing("retry");
      }
      toast.error(messageFrom(err));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div ref={stepRef} className="card flex items-center gap-4 p-6">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success">
          <Check className="h-6 w-6" strokeWidth={3} aria-hidden />
        </span>
        <div>
          <p className="text-sm font-semibold">Verified as {user?.full_name ?? "you"}</p>
          <p className="text-sm text-muted-foreground">Step 2 is unlocked — mark your trainees present.</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={stepRef} className="card space-y-4 p-6">
      <div>
        <p className="eyebrow">Step 1</p>
        <h3 className="mt-1 text-lg font-semibold">Verify yourself</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Look at the camera and capture one clear photo of your face.
        </p>
      </div>

      {(tooEarly || tooLate) && (
        <p className="rounded-[12px] border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          {tooEarly
            ? "You can verify from 15 minutes before the session starts."
            : "This session has ended. Ask your centre admin about an edit."}
        </p>
      )}

      <div className="relative overflow-hidden rounded-[16px] bg-surface-2" style={{ aspectRatio: "4 / 3" }}>
        <video
          ref={cam.setVideo}
          playsInline
          muted
          className="h-full w-full object-cover"
          aria-label="Camera preview"
        />
        {cam.status !== "live" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
            {cam.status === "denied" ? (
              <>
                <VideoOff className="h-8 w-8 text-muted-foreground" aria-hidden />
                <p className="text-sm font-medium">Camera access denied</p>
                <p className="max-w-xs text-xs text-muted-foreground">
                  Allow camera access in your browser settings, then try again. On a phone, open this page over
                  HTTPS.
                </p>
                <Button size="sm" variant="secondary" onClick={() => cam.start()}>
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  Try again
                </Button>
              </>
            ) : (
              <>
                <Camera className="h-8 w-8 text-muted-foreground" aria-hidden />
                <Button size="sm" onClick={() => cam.start()} disabled={cam.status === "starting"}>
                  {cam.status === "starting" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : null}
                  Start camera
                </Button>
              </>
            )}
          </div>
        )}
        {/* face guide oval */}
        {cam.status === "live" && (
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 h-[72%] w-[48%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-2 border-dashed border-white/50"
          />
        )}
      </div>

      {failing === "enrolled" && (
        <p className="text-sm text-danger">
          Your face is not enrolled yet.{" "}
          <Link href="/staff" className="font-medium underline underline-offset-2">
            Ask your centre admin
          </Link>{" "}
          to enrol you.
        </p>
      )}
      {failing === "escalate" && (
        <p className="text-sm text-danger">
          Ask your centre admin to help. This will be noted.
        </p>
      )}
      {failing === "retry" && (
        <p className="text-sm text-warning">We could not find one clear face. Try again in better light.</p>
      )}

      <div className="flex items-center gap-2">
        <Button onClick={scan} loading={busy} disabled={tooEarly || tooLate || cam.status !== "live"}>
          <ShieldCheck className="mr-1.5 h-4 w-4" aria-hidden />
          Capture and verify
        </Button>
        <p className="text-xs text-muted-foreground">One photo is used to match your enrolled face template.</p>
      </div>
    </div>
  );
}

function MarkStep({ session }: { session: Session }) {
  const barRef = React.useRef<HTMLDivElement>(null);
  const stepRef = React.useRef<HTMLDivElement>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [search, setSearch] = React.useState("");
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [reasonOpen, setReasonOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [locked, setLocked] = React.useState(session.claimed != null);

  useGSAP(() => animateStep(stepRef.current, 1), [session.id]);

  const rosterQ = useQuery({
    queryKey: ["trainees", "roster", session.batch_id],
    queryFn: () => api<{ items: Trainee[] }>(`/my/trainees?batch_id=${session.batch_id ?? ""}&limit=100`),
    enabled: !!session.batch_id,
  });

  React.useEffect(() => {
    setLocked(session.claimed != null);
    setSelected(new Set());
  }, [session.id, session.claimed]);

  const roster = (rosterQ.data?.items ?? []).filter((t) => t.active !== false);
  const filtered = search
    ? roster.filter(
        (t) =>
          t.full_name.toLowerCase().includes(search.toLowerCase()) ||
          (t.external_id ?? "").toLowerCase().includes(search.toLowerCase()),
      )
    : roster;

  const toggle = (id: string) => {
    if (locked) return;
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const claim = async (editReason?: string) => {
    setSubmitting(true);
    try {
      await api(`/my/sessions/${session.id}/claim`, {
        method: "POST",
        body: JSON.stringify({
          present_trainee_ids: Array.from(selected),
          ...(editReason ? { edit_reason: editReason } : {}),
        }),
      });
      setLocked(true);
      setConfirmOpen(false);
      setReasonOpen(false);
      setReason("");
      flash(barRef.current);
      toast.success("Attendance submitted.");
    } catch (err) {
      const e = err as { code?: string };
      if (e.code === "CLAIM_LOCKED") {
        setConfirmOpen(false);
        setReasonOpen(true);
        toast.error("Already submitted. Provide an edit reason.");
      } else {
        toast.error(messageFrom(err));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div ref={stepRef} className="space-y-3">
      <div className="card space-y-4 p-6">
        <div>
          <p className="eyebrow">Step 2</p>
          <h3 className="mt-1 text-lg font-semibold">Mark trainees</h3>
          <p className="text-sm text-muted-foreground">Tick everyone who is in the room right now.</p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or ID"
            aria-label="Search trainees"
            className="pl-9"
          />
        </div>

        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={locked || filtered.length === 0}
            onClick={() => setSelected(new Set(filtered.map((t) => t.id)))}
          >
            Select all
          </Button>
          <Button variant="secondary" size="sm" disabled={locked || selected.size === 0} onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>

        {rosterQ.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-11" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={CalendarCheck}
            title="No trainees in this batch"
            hint="Add trainees from the Trainees page, or check the batch assignment."
          />
        ) : (
          <ul className="max-h-[420px] divide-y divide-border overflow-y-auto rounded-[12px] border border-border">
            {filtered.map((t) => {
              const checked = selected.has(t.id);
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    disabled={locked}
                    onClick={() => toggle(t.id)}
                    className={cn(
                      "flex h-11 w-full items-center gap-3 px-3 text-left text-sm transition-colors hover:bg-accent",
                      locked && "cursor-default opacity-80",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border transition-colors",
                        checked ? "border-primary bg-primary text-primary-foreground" : "border-input",
                      )}
                      aria-hidden
                    >
                      {checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{t.full_name}</span>
                    {t.external_id && (
                      <span className="font-mono text-xs text-muted-foreground">{t.external_id}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div
        ref={barRef}
        className="sticky bottom-20 z-20 flex items-center gap-3 rounded-[16px] border border-border bg-card p-4 shadow-pop md:bottom-4"
      >
        <p className="flex-1 text-sm font-medium">
          Present <CountUp value={selected.size} duration={0.3} /> of {roster.length}
        </p>
        {locked ? (
          <>
            <p className="text-xs font-medium text-success">Submitted</p>
            <Button variant="secondary" size="sm" onClick={() => setReasonOpen(true)}>
              Edit (needs reason)
            </Button>
          </>
        ) : (
          <Button onClick={() => setConfirmOpen(true)} disabled={selected.size === 0} loading={submitting}>
            Submit
          </Button>
        )}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Submit attendance of {selected.size}?</DialogTitle>
            <DialogDescription>You cannot change it without a reason.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={() => claim()} loading={submitting}>
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reasonOpen} onOpenChange={setReasonOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit attendance</DialogTitle>
            <DialogDescription>
              A reason is required. The government can see this reason.
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="e.g. Two trainees left early after the viva"
            className="w-full rounded-[12px] border border-input bg-card p-3 text-sm"
            aria-label="Edit reason"
          />
          <DialogFooter>
            <Button variant="secondary" onClick={() => setReasonOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={() => claim(reason.trim())} disabled={!reason.trim()} loading={submitting}>
              Save edit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AttendanceInner() {
  const params = useSearchParams();
  const preselect = params.get("session");
  const { user, isPending } = useMe();
  const isTrainer = user?.role === "trainer";
  const [selected, setSelected] = React.useState<Session | null>(null);
  const [verified, setVerified] = React.useState(false);

  const todayQ = useQuery({
    queryKey: ["sessions", "today"],
    queryFn: () => api<{ items: Session[] }>("/my/sessions/today"),
    refetchInterval: 15_000,
    enabled: !isPending,
  });
  const pastQ = useQuery({
    queryKey: ["sessions", "past"],
    queryFn: () => api<{ items: Session[] }>("/my/sessions?limit=10"),
    enabled: !isPending && !isTrainer,
  });

  React.useEffect(() => {
    const items = todayQ.data?.items ?? [];
    if (!items.length) return;
    const fromUrl = preselect ? items.find((s) => s.id === preselect) : null;
    const first = fromUrl ?? items.find((s) => sessionState(s) === "active") ?? items[0];
    setSelected((cur) => cur ?? first);
  }, [todayQ.data, preselect]);

  React.useEffect(() => setVerified(false), [selected?.id]);

  if (todayQ.error) return <ErrorState onRetry={() => todayQ.refetch()} />;

  const sessions = todayQ.data?.items ?? [];
  const showVerify = isTrainer && selected && !verified;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Attendance"
        title="Mark attendance"
        description="Pick today's session, verify yourself, then tick the trainees in the room."
      />

      {todayQ.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={CalendarCheck}
            title="No sessions today"
            hint="Sessions are created from your batch timetable. Ask your admin to check the schedule."
          />
        </div>
      ) : (
        <>
          <SessionPicker sessions={sessions} selectedId={selected?.id ?? null} onSelect={setSelected} />

          {selected && (
            <div className="space-y-4">
              {showVerify && <VerifyStep session={selected} onVerified={() => setVerified(true)} />}
              {(!isTrainer || verified) && <MarkStep key={selected.id} session={selected} />}
            </div>
          )}
        </>
      )}

      {!isTrainer && !pastQ.isLoading && (pastQ.data?.items?.length ?? 0) > 0 && (
        <section className="card overflow-hidden" aria-label="Past sessions">
          <h2 className="border-b border-border px-5 py-4 text-sm font-semibold">Past sessions</h2>
          <ul className="divide-y divide-border">
            {(pastQ.data?.items ?? []).slice(0, 10).map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <span className="w-24 shrink-0 text-muted-foreground">{fmtShortDate(s.session_date)}</span>
                <span className="min-w-0 flex-1 truncate">{s.batch_name ?? "Session"}</span>
                <span className="tabular text-muted-foreground">
                  Claimed {s.claimed ?? "—"}
                  {s.observed != null ? ` · Camera saw ${s.observed}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-muted-foreground">
        Cameras count people anonymously. Trainee faces are never identified.
      </p>
    </div>
  );
}

export default function AttendancePage() {
  return (
    <React.Suspense fallback={<div className="space-y-4"><Skeleton className="h-8 w-56" /><Skeleton className="h-64" /></div>}>
      <AttendanceInner />
    </React.Suspense>
  );
}
