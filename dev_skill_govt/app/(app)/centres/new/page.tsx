"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/strings";
import { useMe } from "@/hooks/useMe";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { Stepper } from "@/components/shared/Stepper";
import { CredentialsModal, type CredentialRow } from "@/components/shared/CredentialsModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle } from "lucide-react";

const STEPS = [
  { label: "Scheme & trade" },
  { label: "Centre details" },
  { label: "Capacity" },
  { label: "Equipment" },
  { label: "Review" },
];

interface Template {
  id: string;
  trade_name: string;
  scheme_id: string;
  equipment_rules: { class: string; label: string; required?: boolean; min_units_per_trainee?: number }[];
}

interface TrainerRow {
  name: string;
  qualification: string;
}

export default function NewCentrePage() {
  const router = useRouter();
  const { isSuperAdmin, isLoading: meLoading } = useMe();
  const [step, setStep] = React.useState(0);
  const [creds, setCreds] = React.useState<CredentialRow[] | null>(null);

  const [schemeId, setSchemeId] = React.useState("");
  const [tradeId, setTradeId] = React.useState("");
  const [name, setName] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [district, setDistrict] = React.useState("");
  const [state, setState] = React.useState("West Bengal");
  const [lat, setLat] = React.useState("");
  const [lng, setLng] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [maxTrainees, setMaxTrainees] = React.useState("30");
  const [internet, setInternet] = React.useState("stable");
  const [roomSize, setRoomSize] = React.useState("");
  const [roomCameras, setRoomCameras] = React.useState("4");
  const [resolution, setResolution] = React.useState("1080p");
  const [trainers, setTrainers] = React.useState<TrainerRow[]>([{ name: "", qualification: "" }]);
  const [qty, setQty] = React.useState<Record<string, string>>({});
  const [warnings, setWarnings] = React.useState<string[]>([]);

  const schemesQ = useQuery({
    queryKey: ["schemes", "all"],
    queryFn: () => api<{ id: string; name: string }[]>("/schemes"),
    staleTime: 60_000,
  });

  const tradesQ = useQuery({
    queryKey: ["templates", schemeId],
    queryFn: () => api<Template[]>(`/schemes/${schemeId}/templates`),
    enabled: !!schemeId,
    staleTime: 60_000,
  });

  const templates = tradesQ.data ?? [];
  const selected = templates.find((t) => t.id === tradeId);

  React.useEffect(() => {
    if (schemeId && !templates.some((t) => t.id === tradeId)) setTradeId(templates[0]?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates]);

  const rules = selected?.equipment_rules ?? [];

  const create = useMutation({
    mutationFn: async () => {
      const body = {
        trade_template_id: tradeId,
        centre_name: name.trim(),
        address: address.trim(),
        district: district.trim(),
        state: state.trim(),
        lat: lat ? Number(lat) : null,
        lng: lng ? Number(lng) : null,
        contact_phone: phone.trim(),
        contact_email: email.trim() || null,
        max_trainees: Number(maxTrainees) || 0,
        internet_availability: internet,
        room_info:
          roomSize || roomCameras
            ? { size_sqft: Number(roomSize) || 0, cameras: Number(roomCameras) || 0, resolution }
            : undefined,
        trainers: trainers.filter((t) => t.name.trim()),
        equipment: rules.map((r) => ({
          class: r.class,
          label: r.label,
          qty: Number(qty[r.class] ?? 0) || 0,
        })),
      };
      const res = await api<{ login_id: string; temporary_password: string; expires_in_hours: number; note: string; plausibility_warnings?: string[]; centre_id: string }>(
        "/centres",
        { method: "POST", body: JSON.stringify(body) }
      );
      return res;
    },
    onSuccess: (res) => {
      setWarnings(res.plausibility_warnings ?? []);
      setCreds([
        { label: "Centre login ID", value: res.login_id },
        { label: "Temporary password", value: res.temporary_password },
        { label: "Expiry", value: `${res.expires_in_hours} hours` },
      ]);
      toast.success("Centre created.");
    },
    onError: (e) => {
      const err = e as { code?: string; message?: string };
      toast.error(getErrorMessage(err.code, err.message));
    },
  });

  const stepValid = (): boolean => {
    switch (step) {
      case 0:
        return !!schemeId && !!tradeId;
      case 1:
        return !!(name.trim() && address.trim() && district.trim() && phone.trim().length >= 8);
      case 2:
        return Number(maxTrainees) > 0;
      case 3:
        return true;
      default:
        return true;
    }
  };

  if (!meLoading && !isSuperAdmin) {
    return (
      <div className="rounded-lg border bg-card">
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <p className="text-sm font-medium">Only super admins can create centres directly</p>
          <p className="max-w-[45ch] text-sm text-muted-foreground">
            Centres normally start as an application that goes through review.
          </p>
          <Button asChild variant="secondary" size="sm">
            <Link href="/applications">Open applications</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="New centre"
        description="Direct creation skips the application review. A one-time credential is generated for the centre admin."
        action={
          <Button variant="ghost" size="sm" onClick={() => router.push("/centres")}>
            <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden />
            Cancel
          </Button>
        }
      />

      <Stepper steps={STEPS} current={step} onStepClick={(i) => i < step && setStep(i)} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>{STEPS[step].label}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {step === 0 && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="scheme">Scheme</Label>
                    <Select value={schemeId} onValueChange={setSchemeId}>
                      <SelectTrigger id="scheme">
                        <SelectValue placeholder={schemesQ.isLoading ? "Loading…" : "Select a scheme"} />
                      </SelectTrigger>
                      <SelectContent>
                        {(schemesQ.data ?? []).map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="trade">Trade</Label>
                    <Select value={tradeId} onValueChange={setTradeId} disabled={!schemeId || tradesQ.isLoading}>
                      <SelectTrigger id="trade">
                        <SelectValue placeholder={tradesQ.isLoading ? "Loading…" : "Select a trade"} />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.trade_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {tradesQ.isLoading && schemeId && <Skeleton className="h-10 w-full" />}
                </>
              )}

              {step === 1 && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="cname">Centre name</Label>
                    <Input id="cname" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Model ITI Centre" />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="addr">Address</Label>
                    <Textarea id="addr" value={address} onChange={(e) => setAddress(e.target.value)} rows={2} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dist">District</Label>
                    <Input id="dist" value={district} onChange={(e) => setDistrict(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">State</Label>
                    <Input id="state" value={state} onChange={(e) => setState(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lat">Latitude (optional)</Label>
                    <Input id="lat" value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" placeholder="22.5726" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lng">Longitude (optional)</Label>
                    <Input id="lng" value={lng} onChange={(e) => setLng(e.target.value)} inputMode="decimal" placeholder="88.3639" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Contact phone</Label>
                    <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Contact email (optional)</Label>
                    <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                </div>
              )}

              {step === 2 && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="max">Max trainees (sanctioned capacity)</Label>
                      <Input id="max" value={maxTrainees} onChange={(e) => setMaxTrainees(e.target.value)} inputMode="numeric" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="net">Internet</Label>
                      <Select value={internet} onValueChange={setInternet}>
                        <SelectTrigger id="net">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="stable">Stable</SelectItem>
                          <SelectItem value="intermittent">Intermittent</SelectItem>
                          <SelectItem value="none">None</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="rsize">Room size (sq ft, optional)</Label>
                      <Input id="rsize" value={roomSize} onChange={(e) => setRoomSize(e.target.value)} inputMode="numeric" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="rcam">Room cameras</Label>
                      <Input id="rcam" value={roomCameras} onChange={(e) => setRoomCameras(e.target.value)} inputMode="numeric" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="res">Camera resolution</Label>
                      <Input id="res" value={resolution} onChange={(e) => setResolution(e.target.value)} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Trainers</Label>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setTrainers((t) => [...t, { name: "", qualification: "" }])}
                      >
                        <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                        Add trainer
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {trainers.map((t, i) => (
                        <div key={i} className="flex gap-2">
                          <Input
                            placeholder="Name"
                            value={t.name}
                            onChange={(e) =>
                              setTrainers((rows) => rows.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))
                            }
                          />
                          <Input
                            placeholder="Qualification"
                            value={t.qualification}
                            onChange={(e) =>
                              setTrainers((rows) =>
                                rows.map((r, j) => (j === i ? { ...r, qualification: e.target.value } : r))
                              )
                            }
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 shrink-0"
                            aria-label="Remove trainer"
                            onClick={() => setTrainers((rows) => rows.filter((_, j) => j !== i))}
                            disabled={trainers.length === 1}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {step === 3 && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Quantities come from the trade template. Change them only if this centre&apos;s inventory genuinely
                    differs.
                  </p>
                  {rules.length === 0 ? (
                    <p className="text-sm text-muted-foreground">This trade template has no equipment rules.</p>
                  ) : (
                    <div className="space-y-2">
                      {rules.map((r) => (
                        <div key={r.class} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                          <div>
                            <p className="text-sm font-medium">
                              {r.label}
                              {r.required && <span className="ml-1.5 text-xs text-danger">Required</span>}
                            </p>
                            <p className="font-mono text-xs text-muted-foreground">{r.class}</p>
                          </div>
                          <Input
                            className="w-24 tabular"
                            value={qty[r.class] ?? ""}
                            onChange={(e) => setQty((q) => ({ ...q, [r.class]: e.target.value }))}
                            inputMode="numeric"
                            aria-label={`Quantity for ${r.label}`}
                            placeholder="0"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {step === 4 && (
                <div className="space-y-3">
                  <dl className="grid gap-3 sm:grid-cols-2">
                    {[
                      ["Scheme", schemesQ.data?.find((s) => s.id === schemeId)?.name ?? "—"],
                      ["Trade", selected?.trade_name ?? "—"],
                      ["Centre", name],
                      ["District", `${district}, ${state}`],
                      ["Capacity", maxTrainees],
                      ["Contact", phone],
                    ].map(([k, v]) => (
                      <div key={k} className="rounded-lg border p-3">
                        <dt className="text-xs text-muted-foreground">{k}</dt>
                        <dd className="text-sm font-medium">{v || "—"}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="rounded-lg border p-3 text-sm text-muted-foreground">
                    {rules.length} equipment item{rules.length === 1 ? "" : "s"} ·{" "}
                    {trainers.filter((t) => t.name.trim()).length} trainer(s)
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Step</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {step === 0 && "Pick the scheme and trade this centre will operate."}
                {step === 1 && "Where the centre is and who to call."}
                {step === 2 && "Sanctioned capacity, room details and trainers."}
                {step === 3 && "Declared equipment counts for the trade."}
                {step === 4 && "Check everything, then create the centre and its login."}
              </p>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
                  <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden />
                  Back
                </Button>
                {step < STEPS.length - 1 ? (
                  <Button onClick={() => setStep((s) => s + 1)} disabled={!stepValid()} className="flex-1">
                    Next
                    <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
                  </Button>
                ) : (
                  <Button
                    className="flex-1"
                    loading={create.isPending}
                    disabled={!stepValid()}
                    onClick={() => create.mutate()}
                  >
                    Create centre
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {warnings.length > 0 && step === 4 && (
            <Alert variant="warning">
              <AlertTriangle className="h-4 w-4" aria-hidden />
              <AlertTitle>Plausibility warnings</AlertTitle>
              <AlertDescription>
                <ul className="list-disc space-y-1 pl-4">
                  {warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </div>
      </div>

      <CredentialsModal
        open={!!creds}
        onClose={() => {
          setCreds(null);
          router.push("/centres");
        }}
        title="Centre created — credentials"
        rows={creds ?? []}
        note="Shown once. Share securely."
      />
    </div>
  );
}
