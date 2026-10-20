"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Copy,
  FileText,
  Loader2,
  MapPin,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { WEEKDAYS } from "@/lib/constants";
import { messageFrom } from "@/lib/strings";
import { animateStep, drawSvg, useGSAP } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BrandMark } from "@/components/shared/BrandMark";
import { Stepper } from "@/components/shared/Stepper";
import { Skeleton } from "@/components/ui/skeleton";
import type { Scheme, TradeTemplate } from "@/lib/types";

const LocationMap = dynamic(() => import("@/components/apply/LocationMap"), {
  ssr: false,
  loading: () => <div className="skeleton h-[280px] w-full rounded-[16px]" />,
});

const STEPS = ["Applicant", "Centre & scheme", "Capacity", "Location", "Documents"] as const;
const APPLICANT_TYPES = [
  { id: "municipality", label: "Municipality" },
  { id: "panchayat", label: "Panchayat" },
  { id: "ngo", label: "NGO" },
  { id: "other", label: "Other" },
];
const INTERNET = [
  { id: "none", label: "None" },
  { id: "intermittent", label: "Intermittent" },
  { id: "stable", label: "Stable" },
];
const MAX_FILE_MB = 5;
const MAX_FILES = 5;

interface Trainer {
  name: string;
  qualification: string;
}
interface EqRow {
  class: string;
  label: string;
  qty: string;
}
interface BatchRow {
  name: string;
  days: number[];
  start: string;
  end: string;
}

function header() {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex h-16 w-full max-w-[960px] items-center justify-between px-4">
        <Link href="/login" aria-label="Dev_skill — home">
          <BrandMark />
        </Link>
        <Link
          href="/login"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </div>
    </header>
  );
}

export default function ApplyPage() {
  const [step, setStep] = React.useState(0);
  const stageRef = React.useRef<HTMLDivElement>(null);
  const successRef = React.useRef<HTMLDivElement>(null);

  // step 1
  const [applicantName, setApplicantName] = React.useState("");
  const [applicantType, setApplicantType] = React.useState("municipality");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  // step 2
  const [centreName, setCentreName] = React.useState("");
  const [schemeId, setSchemeId] = React.useState("");
  const [templateId, setTemplateId] = React.useState("");
  // step 3
  const [trainers, setTrainers] = React.useState<Trainer[]>([{ name: "", qualification: "" }]);
  const [maxTrainees, setMaxTrainees] = React.useState("30");
  const [equipment, setEquipment] = React.useState<EqRow[]>([]);
  // step 4
  const [address, setAddress] = React.useState("");
  const [district, setDistrict] = React.useState("");
  const [stateName, setStateName] = React.useState("");
  const [lat, setLat] = React.useState(22.5726);
  const [lng, setLng] = React.useState(88.3639);
  const [roomSize, setRoomSize] = React.useState("");
  const [camCount, setCamCount] = React.useState("1");
  const [resolution, setResolution] = React.useState("1280x720");
  const [internet, setInternet] = React.useState("stable");
  const [batches, setBatches] = React.useState<BatchRow[]>([]);
  // step 5
  const [files, setFiles] = React.useState<File[]>([]);
  const [submitting, setSubmitting] = React.useState(false);
  const [uploaded, setUploaded] = React.useState(0);
  const [trackingCode, setTrackingCode] = React.useState<string | null>(null);

  useGSAP(() => {
    if (stageRef.current) animateStep(stageRef.current, 1);
  }, [step]);

  useGSAP(() => {
    if (!trackingCode || !successRef.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    import("gsap").then(({ gsap }) => {
      gsap.fromTo(
        successRef.current,
        { opacity: 0, scale: 0.98 },
        { opacity: 1, scale: 1, duration: 0.4, ease: "power2.out", clearProps: "transform,opacity" },
      );
      drawSvg(successRef.current, "[data-draw]", 0.12);
    });
  }, [trackingCode]);

  const schemesQ = useQuery({
    queryKey: ["public", "schemes"],
    queryFn: () => api<Scheme[]>("/public/schemes"),
  });

  const scheme = schemesQ.data?.find((s) => s.id === schemeId);
  const template: TradeTemplate | undefined = scheme?.templates.find((t) => t.id === templateId);

  // prefill equipment when the trade changes
  React.useEffect(() => {
    if (!template) return;
    const max = Number(maxTrainees) || 0;
    setEquipment(
      template.equipment_rules.map((r) => ({
        class: r.class,
        label: r.label,
        qty: String(Math.ceil(r.min_units_per_trainee * max)),
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  let plausibility: string | null = null;
  if (template) {
    const max = Number(maxTrainees) || 0;
    for (const r of template.equipment_rules) {
      const expected = Math.ceil(r.min_units_per_trainee * max);
      const row = equipment.find((e) => e.class === r.class);
      if (row && (Number(row.qty) || 0) < expected) {
        plausibility = `Template expects at least ${expected} ${r.label.toLowerCase()} for ${max} trainees.`;
        break;
      }
    }
  }

  const canNext = [
    !!applicantName.trim() && !!phone.trim(),
    !!centreName.trim() && !!templateId,
    !!maxTrainees && equipment.length >= 0,
    !!address.trim() && !!district.trim() && !!stateName.trim(),
    true,
  ][step];

  const go = (dir: 1 | -1) => {
    if (dir === 1 && !canNext) return;
    setStep((s) => Math.max(0, Math.min(STEPS.length - 1, s + dir)));
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (next.length >= MAX_FILES) {
        toast.error(`Max ${MAX_FILES} files.`);
        break;
      }
      if (!/\/(pdf|jpeg|png)$/.test(f.type)) {
        toast.error("PDF, JPG or PNG only.");
        continue;
      }
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        toast.error("Max 5 MB per file.");
        continue;
      }
      next.push(f);
    }
    setFiles(next);
  };

  const submit = async () => {
    setSubmitting(true);
    setUploaded(0);
    try {
      const body = {
        applicant_name: applicantName.trim(),
        applicant_type: applicantType,
        contact_phone: phone.trim(),
        contact_email: email.trim() || null,
        centre_name: centreName.trim(),
        trade_template_id: templateId,
        trainers: trainers.filter((t) => t.name.trim()),
        max_trainees: Number(maxTrainees) || 0,
        equipment: equipment.map((e) => ({
          class: e.class,
          label: e.label,
          qty: Number(e.qty) || 0,
        })),
        address: address.trim(),
        district: district.trim(),
        state: stateName.trim(),
        lat,
        lng,
        room_info: {
          size_sqft: Number(roomSize) || null,
          cameras: Number(camCount) || 0,
          resolution,
        },
        internet_availability: internet,
        proposed_batches: batches.filter((b) => b.name.trim()),
      };
      const j = await api<{ tracking_code: string; plausibility_warnings?: string[] }>(
        "/public/applications",
        { method: "POST", body: JSON.stringify(body) },
      );
      const code = j.tracking_code;

      for (const f of files) {
        const fd = new FormData();
        fd.append("file", f);
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/public/applications/${code}/documents?phone=${encodeURIComponent(phone.trim())}`,
          { method: "POST", body: fd },
        );
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          toast.error(d?.detail?.detail ?? "A document failed to upload. You can retry from tracking.");
        }
        setUploaded((n) => n + 1);
      }

      setTrackingCode(code);
      (j.plausibility_warnings ?? []).forEach((w) => toast.warning(w));
    } catch (err) {
      toast.error(messageFrom(err));
    } finally {
      setSubmitting(false);
    }
  };

  /* ---------------------------------------------------------- success */

  if (trackingCode) {
    return (
      <div className="min-h-screen bg-background">
        {header()}
        <main className="mx-auto w-full max-w-[560px] px-4 py-16">
          <div ref={successRef} className="card p-8 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success">
              <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path data-draw d="m5 13 4 4L19 7" />
              </svg>
            </span>
            <h1 className="display mt-4 text-[28px]">Application submitted</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Keep this code and your phone number to track your application.
            </p>
            <div className="mt-6 flex items-center justify-center gap-2">
              <span className="font-mono text-[28px] font-semibold tracking-tight">{trackingCode}</span>
              <button
                type="button"
                aria-label="Copy tracking code"
                onClick={() => {
                  navigator.clipboard?.writeText(trackingCode);
                  toast.success("Copied");
                }}
                className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Copy className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <p className="mt-6 text-xs text-muted-foreground">
              {files.length > 0 ? `${uploaded} of ${files.length} documents uploaded.` : "No documents attached."}
            </p>
            <div className="mt-6 flex justify-center gap-2">
              <Button asChild variant="secondary">
                <Link href="/apply/track">Track application</Link>
              </Button>
              <Button asChild>
                <Link href="/login">Go to sign in</Link>
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  /* ------------------------------------------------------------- form */

  return (
    <div className="min-h-screen bg-background">
      {header()}
      <main className="mx-auto w-full max-w-[720px] px-4 py-8">
        <p className="eyebrow">New centre</p>
        <h1 className="display mt-2 text-[32px]">Apply for a centre</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Five short steps. You can come back to this page — nothing is sent until the final submit.
        </p>

        <Stepper
          className="mt-6"
          steps={STEPS.map((label) => ({ label }))}
          current={step}
          onStepClick={(i) => i < step && setStep(i)}
        />

        <div ref={stageRef} className="card mt-6 p-6 md:p-8">
          {step === 0 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="a-name">Applicant name</Label>
                <Input id="a-name" value={applicantName} onChange={(e) => setApplicantName(e.target.value)} placeholder="Ramesh Verma" />
              </div>
              <div className="space-y-2">
                <Label>Applicant type</Label>
                <Select value={applicantType} onValueChange={setApplicantType}>
                  <SelectTrigger aria-label="Applicant type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {APPLICANT_TYPES.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="a-phone">Phone</Label>
                  <Input id="a-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="+91…" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="a-email">Email (optional)</Label>
                  <Input id="a-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.org" />
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="c-name">Centre name</Label>
                <Input id="c-name" value={centreName} onChange={(e) => setCentreName(e.target.value)} placeholder="Sunrise Skill Centre" />
              </div>
              <div className="space-y-2">
                <Label>Scheme</Label>
                {schemesQ.isLoading ? (
                  <Skeleton className="h-11" />
                ) : (
                  <Select
                    value={schemeId}
                    onValueChange={(v) => {
                      setSchemeId(v);
                      setTemplateId("");
                    }}
                  >
                    <SelectTrigger aria-label="Scheme">
                      <SelectValue placeholder={schemesQ.data?.length ? "Select" : "Loading…"} />
                    </SelectTrigger>
                    <SelectContent>
                      {(schemesQ.data ?? []).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              {scheme && (
                <div className="space-y-2">
                  <Label>Trade</Label>
                  <Select value={templateId} onValueChange={setTemplateId}>
                    <SelectTrigger aria-label="Trade">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {scheme.templates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.trade_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {template && (
                    <div className="rounded-[12px] border border-border bg-surface p-3 text-xs text-muted-foreground">
                      <p className="eyebrow">This trade needs</p>
                      <ul className="mt-1.5 space-y-1">
                        {template.equipment_rules.map((r) => (
                          <li key={r.class}>
                            {r.label} — {r.min_units_per_trainee} per trainee
                            {!r.required && " (optional)"}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="max-t">Maximum trainees</Label>
                <Input id="max-t" type="number" min={1} value={maxTrainees} onChange={(e) => setMaxTrainees(e.target.value)} />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Trainers</Label>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setTrainers((t) => [...t, { name: "", qualification: "" }])}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
                    Add trainer
                  </Button>
                </div>
                {trainers.map((t, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      value={t.name}
                      placeholder="Name"
                      aria-label={`Trainer ${i + 1} name`}
                      onChange={(e) =>
                        setTrainers((rows) => rows.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))
                      }
                    />
                    <Input
                      value={t.qualification}
                      placeholder="Qualification"
                      aria-label={`Trainer ${i + 1} qualification`}
                      onChange={(e) =>
                        setTrainers((rows) =>
                          rows.map((r, j) => (j === i ? { ...r, qualification: e.target.value } : r)),
                        )
                      }
                    />
                    <button
                      type="button"
                      aria-label="Remove trainer"
                      onClick={() => setTrainers((rows) => rows.filter((_, j) => j !== i))}
                      className="rounded-[12px] border border-border px-3 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                <Label>Equipment</Label>
                {equipment.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Pick a trade in step 2 to prefill the equipment this course needs.
                  </p>
                ) : (
                  <>
                    {plausibility && (
                      <p className="rounded-[12px] border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
                        {plausibility}
                      </p>
                    )}
                    {equipment.map((row, i) => (
                      <div key={row.class} className="flex items-center gap-3">
                        <span className="min-w-0 flex-1 truncate text-sm">{row.label}</span>
                        <Input
                          type="number"
                          min={0}
                          value={row.qty}
                          aria-label={`${row.label} quantity`}
                          onChange={(e) =>
                            setEquipment((rows) => rows.map((r, j) => (j === i ? { ...r, qty: e.target.value } : r)))
                          }
                          className="h-10 w-24"
                        />
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="l-addr">Address</Label>
                <Textarea id="l-addr" value={address} onChange={(e) => setAddress(e.target.value)} rows={2} placeholder="Street, area, pin code" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="l-dist">District</Label>
                  <Input id="l-dist" value={district} onChange={(e) => setDistrict(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="l-state">State</Label>
                  <Input id="l-state" value={stateName} onChange={(e) => setStateName(e.target.value)} />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Location</Label>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      if (!navigator.geolocation) {
                        toast.error("This browser cannot share your location.");
                        return;
                      }
                      navigator.geolocation.getCurrentPosition(
                        (pos) => {
                          setLat(Number(pos.coords.latitude.toFixed(5)));
                          setLng(Number(pos.coords.longitude.toFixed(5)));
                        },
                        () => toast.error("Could not read your location. Drag the pin instead."),
                      );
                    }}
                  >
                    <MapPin className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    Use my location
                  </Button>
                </div>
                <LocationMap lat={lat} lng={lng} onMove={(p) => { setLat(p[0]); setLng(p[1]); }} />
                <p className="tabular text-xs text-muted-foreground">
                  {lat}, {lng} — drag the pin to adjust.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="l-size">Room size (sq ft)</Label>
                  <Input id="l-size" type="number" min={0} value={roomSize} onChange={(e) => setRoomSize(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="l-cams">Number of cameras</Label>
                  <Input id="l-cams" type="number" min={0} value={camCount} onChange={(e) => setCamCount(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Resolution</Label>
                  <Select value={resolution} onValueChange={setResolution}>
                    <SelectTrigger aria-label="Resolution">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="640x480">640 × 480</SelectItem>
                      <SelectItem value="1280x720">1280 × 720</SelectItem>
                      <SelectItem value="1920x1080">1920 × 1080</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Internet availability</Label>
                <Select value={internet} onValueChange={setInternet}>
                  <SelectTrigger aria-label="Internet availability">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INTERNET.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Proposed batches (optional)</Label>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setBatches((b) => [...b, { name: "", days: [1, 3, 5], start: "09:30", end: "11:30" }])}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
                    Add batch
                  </Button>
                </div>
                {batches.map((b, i) => (
                  <div key={i} className="space-y-2 rounded-[12px] border border-border p-3">
                    <div className="flex gap-2">
                      <Input
                        value={b.name}
                        placeholder="Batch name"
                        aria-label={`Batch ${i + 1} name`}
                        onChange={(e) => setBatches((rows) => rows.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))}
                      />
                      <button
                        type="button"
                        aria-label="Remove batch"
                        onClick={() => setBatches((rows) => rows.filter((_, j) => j !== i))}
                        className="rounded-[12px] border border-border px-3 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {WEEKDAYS.map((d) => {
                        const on = b.days.includes(d.n);
                        return (
                          <button
                            key={d.n}
                            type="button"
                            aria-pressed={on}
                            onClick={() =>
                              setBatches((rows) =>
                                rows.map((r, j) =>
                                  j === i
                                    ? {
                                        ...r,
                                        days: on ? r.days.filter((n) => n !== d.n) : [...r.days, d.n].sort(),
                                      }
                                    : r,
                                ),
                              )
                            }
                            className={cn(
                              "h-8 rounded-full border px-2.5 text-xs font-medium",
                              on ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground",
                            )}
                          >
                            {d.short}
                          </button>
                        );
                      })}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input type="time" value={b.start} aria-label="Start time" onChange={(e) => setBatches((rows) => rows.map((r, j) => (j === i ? { ...r, start: e.target.value } : r)))} />
                      <Input type="time" value={b.end} aria-label="End time" onChange={(e) => setBatches((rows) => rows.map((r, j) => (j === i ? { ...r, end: e.target.value } : r)))} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="docs">Documents (PDF, JPG or PNG — max {MAX_FILES} files, {MAX_FILE_MB} MB each)</Label>
                <Input id="docs" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" multiple onChange={(e) => addFiles(e.target.files)} className="h-12" />
                {files.length > 0 && (
                  <ul className="divide-y divide-border rounded-[12px] border border-border">
                    {files.map((f, i) => (
                      <li key={i} className="flex items-center gap-2 px-3 py-2 text-sm">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="min-w-0 flex-1 truncate">{f.name}</span>
                        <span className="tabular text-xs text-muted-foreground">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                        <button
                          type="button"
                          aria-label={`Remove ${f.name}`}
                          onClick={() => setFiles((fs) => fs.filter((_, j) => j !== i))}
                          className="rounded-full p-1 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-[16px] border border-border bg-surface p-4 text-sm">
                <p className="eyebrow">Review</p>
                <dl className="mt-2 space-y-1.5">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Applicant</dt>
                    <dd className="text-right font-medium">{applicantName || "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Centre</dt>
                    <dd className="text-right font-medium">{centreName || "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Trade</dt>
                    <dd className="text-right font-medium">{template?.trade_name ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Capacity</dt>
                    <dd className="tabular text-right font-medium">{maxTrainees || "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Location</dt>
                    <dd className="text-right font-medium">
                      {district ? `${district}, ${stateName}` : "—"}
                    </dd>
                  </div>
                </dl>
              </div>

              <Button onClick={submit} loading={submitting} disabled={submitting} className="w-full" size="lg">
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                    Submitting{files.length ? ` (${uploaded}/${files.length} files)` : ""}…
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" aria-hidden />
                    Submit application
                  </>
                )}
              </Button>
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <Button variant="ghost" onClick={() => go(-1)} disabled={step === 0}>
            <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden />
            Back
          </Button>
          {step < STEPS.length - 1 && (
            <Button onClick={() => go(1)} disabled={!canNext}>
              Next
              <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
            </Button>
          )}
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Already applied?{" "}
          <Link href="/apply/track" className="font-medium text-primary underline-offset-4 hover:underline">
            Track your application
          </Link>
        </p>
      </main>
    </div>
  );
}
