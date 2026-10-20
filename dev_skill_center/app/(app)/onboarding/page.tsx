"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { messageFrom } from "@/lib/strings";
import { CHECKLIST_STEPS } from "@/lib/constants";
import { relativeTime } from "@/lib/format";
import { drawSvg, useGSAP } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorState } from "@/components/shared/ErrorState";
import { ProgressRing } from "@/components/shared/ProgressRing";
import type { MyCentre } from "@/lib/types";

/** 6C onboarding: progress ring + 5 checklist rows + submit for approval. */
export default function OnboardingPage() {
  const qc = useQueryClient();
  const [submitting, setSubmitting] = React.useState(false);
  const rowRef = React.useRef<HTMLOListElement>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["centre", "mine"],
    queryFn: () => api<MyCentre>("/my/centre"),
    refetchInterval: 15_000,
  });

  const checklist = data?.checklist;
  const status = data?.status;
  const done4 = !!(checklist?.camera && checklist?.batches && checklist?.staff && checklist?.equipment);
  const stepsDone = [checklist?.camera, checklist?.batches, checklist?.staff, checklist?.equipment];
  const completed = stepsDone.filter(Boolean).length + (checklist?.submitted ? 1 : 0);

  useGSAP(() => {
    drawSvg(rowRef.current, "[data-draw-check]", 0.1);
  }, [completed]);

  const submitForApproval = async () => {
    setSubmitting(true);
    try {
      const cams = await api<{ items: { id: string; setup_status: string }[] }>("/my/cameras?limit=25");
      const drafts = cams.items.filter((c) => c.setup_status === "draft");
      for (const c of drafts) {
        await api(`/my/cameras/${c.id}/submit`, { method: "POST" });
      }
      toast.success("Submitted. The department will review your centre.");
      await qc.invalidateQueries({ queryKey: ["centre", "mine"] });
    } catch (err) {
      toast.error(messageFrom(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6" aria-busy>
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
          <Skeleton className="h-56" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }
  if (error || !data) {
    return <ErrorState onRetry={refetch} />;
  }

  const banner =
    status === "awaiting_camera_approval" ? (
      <div className="card border-warning/40 bg-warning/10 p-5 text-sm">
        <p className="font-semibold text-warning">Awaiting government approval</p>
        <p className="mt-1 text-muted-foreground">
          Submitted {data.submitted_at ? relativeTime(data.submitted_at) : "recently"}. You can review
          information while you wait — changes are paused until the department approves your cameras.
        </p>
      </div>
    ) : status === "live" ? (
      <div className="card border-success/40 bg-success/10 p-5 text-sm">
        <p className="font-semibold text-success">Your centre is live</p>
        <p className="mt-1 text-muted-foreground">
          Everything is set up.{" "}
          <Link href="/dashboard" className="font-medium text-primary underline-offset-4 hover:underline">
            Go to your dashboard
          </Link>
          .
        </p>
      </div>
    ) : (
      <div className="card p-5 text-sm">
        <p className="font-semibold">Complete the steps below</p>
        <p className="mt-1 text-muted-foreground">
          Four steps to set up your centre, then submit for government approval.
        </p>
      </div>
    );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Onboarding"
        title="Set up your centre"
        description="Follow the steps in order. You can leave and come back — progress is saved."
      />
      {banner}

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <div className="card flex flex-col items-center justify-center gap-3 p-6">
          <ProgressRing ratio={completed / 5} size={96} stroke={6} label="of 5 steps" />
          <p className="text-center text-xs text-muted-foreground">
            {completed} of 5 done
          </p>
        </div>

        <ol ref={rowRef} className="card divide-y divide-border">
          {CHECKLIST_STEPS.map((step, i) => {
            const done = stepsDone[i] === true;
            return (
              <li key={step.key} data-stagger-item className="flex items-center gap-4 p-5">
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm tabular ${
                    done
                      ? "border-success bg-success/10 text-success"
                      : "border-border text-muted-foreground"
                  }`}
                  aria-hidden
                >
                  {done ? (
                    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path data-draw-check d="m5 13 4 4L19 7" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{step.label}</p>
                  <p className="text-sm text-muted-foreground">{step.hint}</p>
                </div>
                <Button asChild variant={done ? "secondary" : "default"} size="sm">
                  <Link href={step.href}>
                    {done ? "Review" : "Open"}
                    <ArrowRight className="ml-1.5 h-3.5 w-3.5" aria-hidden />
                  </Link>
                </Button>
              </li>
            );
          })}

          <li data-stagger-item className="flex items-center gap-4 p-5">
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm tabular ${
                checklist?.submitted
                  ? "border-success bg-success/10 text-success"
                  : done4
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground"
              }`}
              aria-hidden
            >
              {checklist?.submitted ? (
                <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path data-draw-check d="m5 13 4 4L19 7" />
                </svg>
              ) : (
                5
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Submit for government approval</p>
              <p className="text-sm text-muted-foreground">
                Sends your cameras and details for review.
              </p>
            </div>
            {checklist?.submitted ? (
              <span className="text-sm font-medium text-success">Submitted</span>
            ) : (
              <Button
                size="sm"
                disabled={!done4 || submitting}
                onClick={submitForApproval}
                title={done4 ? undefined : "Complete the four steps first"}
              >
                {submitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : <Send className="mr-1.5 h-4 w-4" aria-hidden />}
                Submit
              </Button>
            )}
          </li>
        </ol>
      </div>

      {status === "awaiting_camera_approval" && (
        <p className="text-xs text-muted-foreground">
          You can review everything, but changes are paused while the department checks your cameras.
        </p>
      )}
    </div>
  );
}
