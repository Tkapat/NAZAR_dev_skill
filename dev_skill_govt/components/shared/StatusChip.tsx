import {
  AlertOctagon,
  AlertTriangle,
  Ban,
  CalendarOff,
  CalendarX2,
  CheckCircle2,
  ChevronUp,
  ChevronsUp,
  Circle,
  CircleDashed,
  Clock,
  HelpCircle,
  Minus,
  Pause,
  Play,
  Radio,
  Timer,
  WifiOff,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CENTRE_STATUS_LABEL,
  DAY_STATUS,
  FLAG_STATUS_LABEL,
  FLAG_TYPES,
  LIVE_STATE,
  RUN_END_REASON,
  SEVERITY,
  SESSION_STATUS,
  type Severity,
} from "@/lib/constants";

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

/* ---------- live room state ---------- */

export const LIVE_STATE_ICON = {
  live: Radio,
  idle: Pause,
  offline: WifiOff,
  tampered: AlertTriangle,
  provisional: Clock,
  error: AlertOctagon,
} as const;

const LIVE_TONE: Record<string, string> = {
  live: "text-success",
  idle: "text-muted-foreground",
  offline: "text-muted-foreground",
  tampered: "text-warning",
  provisional: "text-uncertain",
  error: "text-danger",
};

/** icon + label (never colour alone); "Live" carries the pulsing dot, setup pending is dashed. */
export function LiveStateChip({ state, className }: { state: string; className?: string }) {
  const known = state in LIVE_STATE;
  const key = state as keyof typeof LIVE_STATE;
  const Icon = known ? LIVE_STATE_ICON[key] : Circle;
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full border border-current/30 bg-current/10 px-2 text-xs font-medium",
        known ? LIVE_TONE[state] : "text-muted-foreground",
        state === "provisional" && "border-dashed",
        className
      )}
    >
      {state === "live" && <span className="h-2 w-2 rounded-full bg-current live-dot" aria-hidden />}
      <Icon className="h-3 w-3" aria-hidden />
      {known ? LIVE_STATE[key].label : state}
    </span>
  );
}

/* ---------- calendar day status ---------- */

export const DAY_STATUS_ICON = {
  ok: CheckCircle2,
  attention: AlertTriangle,
  critical: AlertOctagon,
  missed: CalendarX2,
  partial: CircleDashed,
  cancelled: Ban,
  no_data: Minus,
  holiday: CalendarOff,
  upcoming: Clock,
  none: Minus,
} as const;

const DAY_TONE: Record<string, string> = {
  ok: "text-success",
  attention: "text-warning",
  critical: "text-danger",
  missed: "text-danger",
  partial: "text-warning",
  cancelled: "text-muted-foreground",
  no_data: "text-muted-foreground",
  holiday: "text-info",
  upcoming: "text-uncertain",
  none: "text-muted-foreground",
};

/** icon + label for a calendar day status (never colour alone). */
export function DayStatusChip({ status, className }: { status: string; className?: string }) {
  const known = status in DAY_STATUS;
  const key = status as keyof typeof DAY_STATUS;
  const Icon = known ? DAY_STATUS_ICON[key] : Minus;
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full border border-current/30 bg-current/10 px-2 text-xs font-medium",
        known ? DAY_TONE[status] : "text-muted-foreground",
        status === "missed" && "border-dashed",
        className
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {known ? DAY_STATUS[key].label : status}
    </span>
  );
}

/* ---------- session status (v4) ---------- */

const SESSION_STATUS_ICON = {
  scheduled: Clock,
  running: Radio,
  closed: CheckCircle2,
  missed: CalendarX2,
  cancelled: Ban,
} as const;

const SESSION_TONE: Record<string, string> = {
  scheduled: "text-muted-foreground",
  running: "text-success",
  closed: "text-success",
  missed: "text-danger",
  cancelled: "text-muted-foreground",
};

/** icon + label for a session; Running has the pulsing live dot; Cancelled is dashed. */
export function SessionStatusChip({
  status,
  lineThrough = false,
  className,
}: {
  status: string;
  lineThrough?: boolean;
  className?: string;
}) {
  const known = status in SESSION_STATUS;
  const key = status as keyof typeof SESSION_STATUS;
  const Icon = known ? SESSION_STATUS_ICON[key] : Clock;
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full border border-current/30 bg-current/10 px-2 text-xs font-medium",
        known ? SESSION_TONE[status] : "text-muted-foreground",
        status === "missed" && "border-dashed",
        className
      )}
    >
      {status === "running" && <span className="h-2 w-2 rounded-full bg-current live-dot" aria-hidden />}
      <Icon className="h-3 w-3" aria-hidden />
      <span className={lineThrough && status === "cancelled" ? "line-through" : undefined}>
        {known ? SESSION_STATUS[key].label : status}
      </span>
    </span>
  );
}

/* ---------- monitor run end reason (v4) ---------- */

const RUN_REASON_TONE: Record<string, string> = {
  manual: "text-muted-foreground",
  timeout: "text-warning",
  session_end: "text-success",
  error: "text-danger",
  system: "text-info",
};

export function RunEndReasonChip({ reason, running = false, className }: { reason?: string | null; running?: boolean; className?: string }) {
  if (running) {
    return (
      <span
        className={cn(
          "inline-flex h-6 items-center gap-1.5 rounded-full border border-current/30 bg-current/10 px-2 text-xs font-medium text-success",
          className
        )}
      >
        <span className="h-2 w-2 rounded-full bg-current live-dot" aria-hidden />
        Running
      </span>
    );
  }
  const label = reason ? RUN_END_REASON[reason] ?? reason : "—";
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs font-medium",
        reason ? (RUN_REASON_TONE[reason] ?? "text-muted-foreground") : "text-muted-foreground",
        !reason && "border-border bg-surface",
        reason && "border-current/30 bg-current/10",
        className
      )}
    >
      {label}
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
