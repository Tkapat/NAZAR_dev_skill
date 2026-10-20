"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/strings";
import { useMe } from "@/hooks/useMe";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorState } from "@/components/shared/ErrorState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";

interface EquipmentRule {
  class: string;
  label: string;
  min_units_per_trainee: number;
  required: boolean;
  operability?: string;
}

interface Template {
  id: string;
  scheme_id: string;
  trade_name: string;
  detector_classes: string[];
  equipment_rules: EquipmentRule[];
  presence_rule: string;
  count_tolerance: number;
  agree_ratio: number;
  min_confidence: number;
  base_frames: number;
  step_frames: number;
  max_frames: number;
  active: boolean;
  detector_backend?: "auto" | "coco" | "world";
  model?: string;
  imgsz?: number;
  min_box_area?: number;
  class_confidence?: Record<string, number>;
  class_aliases?: Record<string, string>;
}

const DETECTOR_BACKENDS = [
  { value: "auto", label: "Auto" },
  { value: "coco", label: "COCO" },
  { value: "world", label: "World" },
];

const MODELS = [
  { value: "yolo11n", label: "YOLO11n (fastest)" },
  { value: "yolo11s", label: "YOLO11s (balanced)" },
  { value: "yolo11m", label: "YOLO11m (most accurate)" },
];

function num(v: string, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parseJsonMap(v: string): Record<string, number | string> | undefined {
  const t = v.trim();
  if (!t) return {};
  try {
    const parsed = JSON.parse(t);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    return undefined;
  } catch {
    return undefined;
  }
}

export default function TemplateEditorPage() {
  const { id, tid } = useParams<{ id: string; tid: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { isSuperAdmin } = useMe();

  const [form, setForm] = React.useState<Template | null>(null);
  const [confText, setConfText] = React.useState("");
  const [aliasText, setAliasText] = React.useState("");
  const [confError, setConfError] = React.useState(false);
  const [aliasError, setAliasError] = React.useState(false);

  const q = useQuery({
    queryKey: ["template", tid],
    queryFn: () => api<Template>(`/templates/${tid}`),
    staleTime: 30_000,
  });

  React.useEffect(() => {
    if (q.data && !form) {
      setForm({
        ...q.data,
        detector_classes: q.data.detector_classes ?? [],
        equipment_rules: q.data.equipment_rules ?? [],
        detector_backend: q.data.detector_backend ?? "auto",
        model: q.data.model ?? "yolo11s",
        imgsz: q.data.imgsz ?? 640,
        min_box_area: q.data.min_box_area ?? 900,
        class_confidence: q.data.class_confidence ?? {},
        class_aliases: q.data.class_aliases ?? {},
      });
      setConfText(JSON.stringify(q.data.class_confidence ?? {}, null, 2));
      setAliasText(JSON.stringify(q.data.class_aliases ?? {}, null, 2));
    }
  }, [q.data, form]);

  const buildBody = (f: Template): Partial<Template> => {
    const body: Partial<Template> = { ...f };
    const conf = parseJsonMap(confText);
    const alias = parseJsonMap(aliasText);
    if (conf === undefined) setConfError(true);
    else {
      setConfError(false);
      body.class_confidence = conf as Record<string, number>;
    }
    if (alias === undefined) setAliasError(true);
    else {
      setAliasError(false);
      body.class_aliases = alias as Record<string, string>;
    }
    return body;
  };

  const save = useMutation({
    mutationFn: (body: Partial<Template>) =>
      api<Template>(`/templates/${tid}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: (data) => {
      toast.success("Template saved.");
      setForm({
        ...data,
        detector_classes: data.detector_classes ?? [],
        equipment_rules: data.equipment_rules ?? [],
        detector_backend: data.detector_backend ?? "auto",
        model: data.model ?? "yolo11s",
        imgsz: data.imgsz ?? 640,
        min_box_area: data.min_box_area ?? 900,
        class_confidence: data.class_confidence ?? {},
        class_aliases: data.class_aliases ?? {},
      });
      setConfText(JSON.stringify(data.class_confidence ?? {}, null, 2));
      setAliasText(JSON.stringify(data.class_aliases ?? {}, null, 2));
      qc.invalidateQueries({ queryKey: ["templates", id] });
    },
    onError: (e) => {
      const err = e as { code?: string; message?: string };
      toast.error(getErrorMessage(err.code, err.message));
    },
  });

  if (q.error) {
    return (
      <div className="rounded-lg border bg-card">
        <ErrorState onRetry={() => q.refetch()} />
      </div>
    );
  }

  if (q.isLoading || !form) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-72" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  const editable = isSuperAdmin;
  const set = <K extends keyof Template>(k: K, v: Template[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const setRule = (i: number, patch: Partial<EquipmentRule>) =>
    setForm((f) =>
      f ? { ...f, equipment_rules: f.equipment_rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) } : f
    );

  const dirty = JSON.stringify(form) !== JSON.stringify(q.data);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Trade template"
        title={form.trade_name}
        description="Detection classes, equipment rules and counting thresholds used by the camera for this trade."
        action={
          <>
            <Button variant="ghost" size="sm" onClick={() => router.push(`/schemes/${id}`)}>
              <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden />
              Back to scheme
            </Button>
            {editable && (
              <Button
                disabled={!dirty}
                loading={save.isPending}
                onClick={() => save.mutate(buildBody(form))}
              >
                Save changes
              </Button>
            )}
          </>
        }
      />

      {!editable && (
        <p className="rounded-lg border bg-surface px-4 py-3 text-sm text-muted-foreground">
          Only super admins can edit templates. You can review every value here.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Detection</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="active">Template active</Label>
              <Switch id="active" checked={form.active} disabled={!editable} onCheckedChange={(v) => set("active", v)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="classes">Detector classes</Label>
              <Input
                id="classes"
                className="font-mono"
                disabled={!editable}
                value={form.detector_classes.join(", ")}
                onChange={(e) =>
                  set(
                    "detector_classes",
                    e.target.value.split(",").map((c) => c.trim()).filter(Boolean)
                  )
                }
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="det-backend">Detector backend</Label>
                <select
                  id="det-backend"
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  disabled={!editable}
                  value={form.detector_backend ?? "auto"}
                  onChange={(e) => set("detector_backend", e.target.value as Template["detector_backend"])}
                >
                  {DETECTOR_BACKENDS.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="det-model">Model</Label>
                <select
                  id="det-model"
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  disabled={!editable}
                  value={form.model ?? "yolo11s"}
                  onChange={(e) => set("model", e.target.value)}
                >
                  {MODELS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="imgsz">Image size (px)</Label>
                <Input
                  id="imgsz"
                  type="number"
                  step={32}
                  disabled={!editable}
                  value={form.imgsz ?? 640}
                  onChange={(e) => set("imgsz", num(e.target.value, 640))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="min-box">Min box area (px²)</Label>
                <Input
                  id="min-box"
                  type="number"
                  disabled={!editable}
                  value={form.min_box_area ?? 900}
                  onChange={(e) => set("min_box_area", num(e.target.value, 900))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="class-conf">Per-class confidence (JSON: {`{"W01": 0.4}`})</Label>
              <textarea
                id="class-conf"
                rows={3}
                className="w-full rounded-md border bg-background px-2 py-1.5 font-mono text-xs"
                disabled={!editable}
                value={confText}
                onChange={(e) => setConfText(e.target.value)}
                spellCheck={false}
              />
              {confError && <p className="text-xs text-danger">Invalid JSON object.</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="class-alias">Class aliases (JSON: {`{"S01": "sewing machine"}`})</Label>
              <textarea
                id="class-alias"
                rows={3}
                className="w-full rounded-md border bg-background px-2 py-1.5 font-mono text-xs"
                disabled={!editable}
                value={aliasText}
                onChange={(e) => setAliasText(e.target.value)}
                spellCheck={false}
              />
              {aliasError && <p className="text-xs text-danger">Invalid JSON object.</p>}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="presence">Presence rule</Label>
                <Input
                  id="presence"
                  disabled={!editable}
                  value={form.presence_rule}
                  onChange={(e) => set("presence_rule", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tol">Count tolerance</Label>
                <Input
                  id="tol"
                  type="number"
                  disabled={!editable}
                  value={form.count_tolerance}
                  onChange={(e) => set("count_tolerance", num(e.target.value, 0))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agree">Agree ratio (0–1)</Label>
                <Input
                  id="agree"
                  type="number"
                  step="0.05"
                  disabled={!editable}
                  value={form.agree_ratio}
                  onChange={(e) => set("agree_ratio", num(e.target.value, 0.6))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="conf">Min confidence (0–1)</Label>
                <Input
                  id="conf"
                  type="number"
                  step="0.05"
                  disabled={!editable}
                  value={form.min_confidence}
                  onChange={(e) => set("min_confidence", num(e.target.value, 0.35))}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="basef">Base frames</Label>
                <Input
                  id="basef"
                  type="number"
                  disabled={!editable}
                  value={form.base_frames}
                  onChange={(e) => set("base_frames", num(e.target.value, 10))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stepf">Step frames</Label>
                <Input
                  id="stepf"
                  type="number"
                  disabled={!editable}
                  value={form.step_frames}
                  onChange={(e) => set("step_frames", num(e.target.value, 5))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxf">Max frames</Label>
                <Input
                  id="maxf"
                  type="number"
                  disabled={!editable}
                  value={form.max_frames}
                  onChange={(e) => set("max_frames", num(e.target.value, 40))}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Equipment rules</CardTitle>
            {editable && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  setForm((f) =>
                    f
                      ? {
                          ...f,
                          equipment_rules: [
                            ...f.equipment_rules,
                            { class: "", label: "", min_units_per_trainee: 1, required: true },
                          ],
                        }
                      : f
                  )
                }
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Add rule
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {form.equipment_rules.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No equipment rules yet. Rules power the Equipment tab and plausibility warnings on applications.
              </p>
            )}
            {form.equipment_rules.map((r, i) => (
              <div key={i} className="space-y-2 rounded-lg border p-3">
                <div className="flex gap-2">
                  <Input
                    placeholder="Class (e.g. W01)"
                    className="font-mono"
                    disabled={!editable}
                    value={r.class}
                    onChange={(e) => setRule(i, { class: e.target.value })}
                    aria-label="Rule class"
                  />
                  <Input
                    placeholder="Label (e.g. Wire stripper)"
                    disabled={!editable}
                    value={r.label}
                    onChange={(e) => setRule(i, { label: e.target.value })}
                    aria-label="Rule label"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    aria-label="Remove rule"
                    disabled={!editable}
                    onClick={() =>
                      setForm((f) =>
                        f ? { ...f, equipment_rules: f.equipment_rules.filter((_, j) => j !== i) } : f
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <Input
                      type="number"
                      className="w-20 tabular"
                      disabled={!editable}
                      value={r.min_units_per_trainee}
                      onChange={(e) => setRule(i, { min_units_per_trainee: num(e.target.value, 1) })}
                      aria-label="Min units per trainee"
                    />
                    <span className="text-muted-foreground">units / trainee</span>
                  </label>
                  <label className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={r.required}
                      disabled={!editable}
                      onChange={(e) => setRule(i, { required: e.target.checked })}
                    />
                    Required
                  </label>
                  <label className="flex items-center gap-1.5 text-sm">
                    <span className="text-muted-foreground">Operability</span>
                    <select
                      className="h-8 rounded-md border bg-background px-2 text-xs"
                      disabled={!editable}
                      value={r.operability ?? "assumed"}
                      onChange={(e) => setRule(i, { operability: e.target.value })}
                      aria-label="Operability"
                    >
                      <option value="assumed">Assumed OK</option>
                      <option value="checked">Checked each session</option>
                      <option value="optional">Optional</option>
                    </select>
                  </label>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
