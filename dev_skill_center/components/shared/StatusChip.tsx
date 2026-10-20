import {
  AlertOctagon,
  CheckCircle2,
  ChevronUp,
  ChevronsUp,
  Circle,
  HelpCircle,
  Minus,
  Pause,
  Play,
  Timer,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CENTRE_STATUS_LABEL, FLAG_STATUS_LABEL, FLAG_TYPES, SEVERITY, type Severity } from "@/lib/constants";

/* ---------- severity ---------- */

const SEV_ICON = { low: Minus, medium: ChevronUp, high: ChevronsUp, critical: AlertOctagon } as const;
const SEV_CLASS: Record<Severity, string> = {
  low: "text-sev-low",
  medium: "text-sev-medium",
  high: "text-sev-high",
  critical: "text-sev-critical",
};

/** dot + icon + label (never colour only) */
export function SeverityDot({ severity, withLabel = true, className }: { severity: string; withLabel?: boolean; className?: string }) {
  const sev = (SEVERITY[severity as Severity] ? severity : "low") as Severity;
  const Icon = SEV_ICON[sev];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", SEV_CLASS[sev], className)}>
      <span className="h-2 w-2 rounded-full bg-current" aria-hidden />
      <Icon className="h-3 w-3" strokeWidth={2} aria-hidden />
      {withLabel && <span>{SEVERITY[sev].label}</span>}
      <span className="sr-only">{SEVERITY[sev].label} severity</span>
    </span>
  );
}

/* ---------- centre status ---------- */

const CENTRE_TONE: Record<string, { dot: string; text: string; Icon?: typeof Play }> = {
  live: { dot: "bg-success live-dot", text: "text-success" },
  pending_setup: { dot: "bg-muted-foreground", text: "text-muted-foreground" },
  awaiting_camera_approval: { dot: "bg-warning", text: "text-warning" },
  suspended: { dot: "bg-warning", text: "text-warning", Icon: Pause },
  terminated: { dot: "bg-danger", text: "text-danger", Icon: XCircle },
};

export function CentreStatusChip({ status, className }: { status: string; className?: string }) {
  const tone = CENTRE_TONE[status] ?? CENTRE_TONE.pending_setup;
  const Icon = tone.Icon;
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full border border-current/30 bg-current/10 px-2 text-xs font-medium",
        tone.text,
        className
      )}
    >
      {Icon ? <Icon className="h-3 w-3" aria-hidden /> : <span className={cn("h-2 w-2 rounded-full", tone.dot)} aria-hidden />}
      {CENTRE_STATUS_LABEL[status] ?? status}
    </span>
  );
}

/* ---------- flag status ---------- */

const FLAG_TONE: Record<string, string> = {
  open: "text-warning border-warning/30 bg-warning/10",
  acknowledged: "text-info border-info/30 bg-info/10",
  centre_responded: "text-info border-info/30 bg-info/10",
  under_review: "text-info border-info/30 bg-info/10",
  resolved: "text-success border-success/30 bg-success/10",
  dismissed: "text-muted-foreground border-muted-foreground/30 bg-muted",
  escalated: "text-danger border-danger/30 bg-danger/10",
};

export function FlagStatusChip({ status, className }: { status: string; className?: string }) {
  const tone = FLAG_TONE[status] ?? FLAG_TONE.open;
  return (
    <span className={cn("inline-flex h-6 items-center rounded-full border px-2 text-xs font-medium", tone, className)}>
      {FLAG_STATUS_LABEL[status] ?? status}
    </span>
  );
}

/* ---------- flag type ---------- */

export function FlagTypeChip({ type, className }: { type: string; className?: string }) {
  const meta = FLAG_TYPES[type];
  return (
    <span
      className={cn("inline-flex h-6 items-center gap-1 rounded-full border border-border bg-surface px-2 text-xs font-medium", className)}
      title={meta?.hint}
    >
      <span className="font-mono">{type}</span>
      <span className="text-muted-foreground">{meta?.name ?? type}</span>
    </span>
  );
}

/* ---------- uncertain (violet, dashed, help icon) ---------- */

export function UncertainChip({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full border border-dashed border-uncertain/50 bg-uncertain/10 px-2 text-xs font-medium text-uncertain",
        className
      )}
    >
      <HelpCircle className="h-3 w-3" aria-hidden />
      Uncertain
    </span>
  );
}

/* ---------- camera status ---------- */

const CAM_ICON = { online: Play, offline: Circle, tampered: AlertOctagon, unknown: Circle } as const;
const CAM_TONE: Record<string, string> = {
  online: "text-success",
  offline: "text-muted-foreground",
  tampered: "text-danger",
  unknown: "text-muted-foreground",
};

export function CameraStatusChip({ status, className }: { status: string; className?: string }) {
  const Icon = CAM_ICON[status as keyof typeof CAM_ICON] ?? Circle;
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full border border-current/30 bg-current/10 px-2 text-xs font-medium",
        CAM_TONE[status] ?? CAM_TONE.unknown,
        className
      )}
    >
      <Icon className={cn("h-3 w-3", status === "online" && "live-dot")} aria-hidden />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

/* ---------- generic decision chip ---------- */

export function DecisionChip({ status }: { status: string }) {
  const map: Record<string, string> = {
    approved: "text-success border-success/30 bg-success/10",
    rejected: "text-danger border-danger/30 bg-danger/10",
    pending: "text-warning border-warning/30 bg-warning/10",
    expired: "text-muted-foreground border-muted-foreground/30 bg-muted",
  };
  const Icon = status === "approved" ? CheckCircle2 : status === "rejected" ? XCircle : status === "pending" ? Timer : Circle;
  return (
    <span className={cn("inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs font-medium", map[status] ?? map.pending)}>
      <Icon className="h-3 w-3" aria-hidden />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
