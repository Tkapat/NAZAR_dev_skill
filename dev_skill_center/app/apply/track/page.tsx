"use client";

import * as React from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { messageFrom } from "@/lib/strings";
import { drawSvg, useGSAP } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandMark } from "@/components/shared/BrandMark";

interface TrackResult {
  status: string;
  review_comment?: string | null;
}

const TIMELINE: { key: string; label: string }[] = [
  { key: "submitted", label: "Submitted" },
  { key: "under_review", label: "Under review" },
  { key: "approved", label: "Approved" },
];

function statusIndex(status: string) {
  if (status === "submitted" || status === "resubmitted") return 0;
  if (status === "under_review" || status === "query_raised") return 1;
  if (status === "approved") return 2;
  return 0;
}

function header() {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex h-16 w-full max-w-[960px] items-center justify-between px-4">
        <Link href="/login" aria-label="Dev_skill — home">
          <BrandMark />
        </Link>
        <Link href="/login" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          Sign in
        </Link>
      </div>
    </header>
  );
}

export default function TrackPage() {
  const [code, setCode] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<TrackResult | null>(null);
  const [notFound, setNotFound] = React.useState(false);
  const [resubmitting, setResubmitting] = React.useState(false);
  const [maxTrainees, setMaxTrainees] = React.useState("");
  const [equipmentText, setEquipmentText] = React.useState("");
  const railRef = React.useRef<HTMLOListElement>(null);

  useGSAP(() => {
    if (!result || !railRef.current) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    drawSvg(railRef.current, "[data-draw]", 0.12);
    if (reduce) return;
    import("gsap").then(({ gsap }) => {
      gsap.from("[data-tl-node]", {
        opacity: 0,
        y: 6,
        duration: 0.35,
        stagger: 0.12,
        ease: "power2.out",
        clearProps: "opacity,transform",
      });
    });
  }, [result]);

  const track = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !phone.trim()) return;
    setBusy(true);
    setNotFound(false);
    setResult(null);
    try {
      const j = await api<TrackResult>(
        `/public/applications/track?code=${encodeURIComponent(code.trim())}&phone=${encodeURIComponent(phone.trim())}`,
      );
      setResult(j);
    } catch {
      // generic message — never reveal which field was wrong
      setNotFound(true);
    } finally {
      setBusy(false);
    }
  };

  const resubmit = async () => {
    setResubmitting(true);
    try {
      // backend accepts max_trainees + equipment overrides on resubmit
      const parsedEquipment = equipmentText
        .split("\n")
        .map((l) => l.split(","))
        .filter((parts) => parts.length >= 2)
        .map((parts) => ({
          label: parts[0].trim(),
          qty: Number(parts[1].trim()) || 0,
        }));
      await api(`/public/applications/${code.trim()}`, {
        method: "PUT",
        body: JSON.stringify({
          contact_phone: phone.trim(),
          max_trainees: maxTrainees ? Number(maxTrainees) : undefined,
          equipment: parsedEquipment.length ? parsedEquipment : undefined,
        }),
      });
      toast.success("Resubmitted. The department will review it again.");
      setResult({ status: "resubmitted" });
    } catch (err) {
      toast.error(messageFrom(err));
    } finally {
      setResubmitting(false);
    }
  };

  const idx = result ? statusIndex(result.status) : 0;
  const isRejected = result?.status === "rejected";
  const needsEdit = result?.status === "query_raised";
  const isApproved = result?.status === "approved";

  return (
    <div className="min-h-screen bg-background">
      {header()}
      <main className="mx-auto w-full max-w-[560px] px-4 py-10">
        <p className="eyebrow">Track</p>
        <h1 className="display mt-2 text-[32px]">Track your application</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Enter the tracking code from your submission and the phone number you used.
        </p>

        <form onSubmit={track} className="card mt-6 space-y-4 p-6">
          <div className="space-y-2">
            <Label htmlFor="t-code">Tracking code</Label>
            <Input
              id="t-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="DSP-XXXX-XXXX"
              className="font-mono"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="t-phone">Phone number</Label>
            <Input id="t-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="+91…" />
          </div>
          <Button type="submit" loading={busy} disabled={!code.trim() || !phone.trim() || busy} className="w-full">
            <Search className="mr-1.5 h-4 w-4" aria-hidden />
            Track
          </Button>
          {notFound && (
            <p className="rounded-[12px] border border-border bg-surface p-3 text-sm text-muted-foreground">
              No application found for these details.
            </p>
          )}
        </form>

        {result && (
          <section className="card mt-6 p-6" aria-label="Status">
            <p className="eyebrow">Status</p>

            {isRejected ? (
              <div className="mt-3 rounded-[12px] border border-danger/40 bg-danger/10 p-4 text-sm">
                <p className="font-semibold text-danger">Not approved</p>
                <p className="mt-1 text-muted-foreground">
                  The department could not approve this application. You can apply again with corrected details.
                </p>
              </div>
            ) : (
              <ol ref={railRef} className="relative mt-4 space-y-6 pl-8">
                <span
                  data-draw
                  aria-hidden
                  className="absolute left-[11px] top-2 h-[calc(100%-16px)] w-0.5 origin-top bg-primary/40"
                  style={{ display: "block" }}
                />
                {TIMELINE.map((n, i) => {
                  const done = i <= idx;
                  return (
                    <li key={n.key} data-tl-node className="relative">
                      <span
                        className={`absolute -left-8 top-0.5 flex h-6 w-6 items-center justify-center rounded-full border text-[11px] tabular ${
                          done
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-card text-muted-foreground"
                        }`}
                        aria-hidden
                      >
                        {i + 1}
                      </span>
                      <p className={`text-sm font-semibold ${done ? "" : "text-muted-foreground"}`}>{n.label}</p>
                      {n.key === "approved" && isApproved && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          Your centre has been approved. The department will share your login details with your
                          contact person.
                        </p>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}

            {needsEdit && (
              <div className="mt-5 space-y-4">
                <div className="rounded-[12px] border border-warning/40 bg-warning/10 p-4 text-sm">
                  <p className="font-semibold text-warning">The department has a question</p>
                  {result.review_comment && <p className="mt-1 text-muted-foreground">{result.review_comment}</p>}
                </div>
                <div className="space-y-3">
                  <p className="text-sm font-semibold">Edit and resubmit</p>
                  <div className="space-y-2">
                    <Label htmlFor="r-max">Maximum trainees</Label>
                    <Input id="r-max" type="number" min={1} value={maxTrainees} onChange={(e) => setMaxTrainees(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="r-eq">Equipment (one per line: label, quantity)</Label>
                    <textarea
                      id="r-eq"
                      rows={4}
                      value={equipmentText}
                      onChange={(e) => setEquipmentText(e.target.value)}
                      placeholder={"Sewing machine, 15\nOverlock machine, 2"}
                      className="w-full rounded-[12px] border border-input bg-card p-3 text-sm"
                    />
                  </div>
                  <Button onClick={resubmit} loading={resubmitting} className="w-full">
                    Resubmit
                  </Button>
                </div>
              </div>
            )}
          </section>
        )}

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Want to start over?{" "}
          <Link href="/apply" className="font-medium text-primary underline-offset-4 hover:underline">
            Apply for a new centre
          </Link>
        </p>
      </main>
    </div>
  );
}
