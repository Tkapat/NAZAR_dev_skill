export const FLAG_TYPES: Record<string, { name: string; hint: string }> = {
  A1: { name: "Attendance inflation", hint: "Claimed attendance is higher than the camera count" },
  A2: { name: "Over capacity", hint: "More people observed than the sanctioned maximum" },
  A3: { name: "Enrolment mismatch", hint: "Claimed attendance is higher than enrolled trainees" },
  A4: { name: "Ghost session", hint: "Attendance claimed but nobody observed" },
  A5: { name: "Unregistered attendees", hint: "Camera saw more people than were claimed" },
  E1: { name: "Equipment missing", hint: "Fewer items seen than sanctioned" },
  E2: { name: "Equipment non-operational", hint: "Item present but appears switched off or unused" },
  E3: { name: "Declaration mismatch", hint: "Declared inventory differs from sanctioned" },
  S1: { name: "Trainer not verified", hint: "No face-verified trainer for this session" },
  C1: { name: "Camera problem", hint: "Camera offline, covered, moved, frozen or dark" },
  C2: { name: "Replay suspicion", hint: "Footage looks repeated from an earlier session" },
  C3: { name: "Missed capture windows", hint: "Fewer captures than planned" },
  D1: { name: "Data integrity", hint: "Record chain or signature failed verification" },
  U1: { name: "Unverifiable count", hint: "Counts unstable; needs human review" },
  P1: { name: "Capacity implausible", hint: "Equipment does not match trainee capacity" },
  M1: { name: "Session not held", hint: "A scheduled session ended with no camera data" },
};

export const SEVERITY = {
  low: { label: "Low", cssVar: "--sev-low", icon: "Minus" },
  medium: { label: "Medium", cssVar: "--sev-medium", icon: "ChevronUp" },
  high: { label: "High", cssVar: "--sev-high", icon: "ChevronsUp" },
  critical: { label: "Critical", cssVar: "--sev-critical", icon: "AlertOctagon" },
} as const;

export type Severity = keyof typeof SEVERITY;

export const LIVE_STATE = {
  live: { label: "Live", icon: "Radio", tone: "success" },
  idle: { label: "Idle", icon: "Pause", tone: "muted" },
  offline: { label: "Offline", icon: "WifiOff", tone: "muted" },
  tampered: { label: "Camera problem", icon: "AlertTriangle", tone: "warning" },
  provisional: { label: "Setup pending", icon: "Clock", tone: "uncertain" },
  error: { label: "Detector error", icon: "AlertOctagon", tone: "danger" },
} as const;

export const SOURCE_KIND_LABEL: Record<string, string> = {
  browser: "Browser",
  rtsp: "RTSP",
  webcam: "Server webcam",
  file: "Sample video",
};

/** Neutral compliance verdict labels (people). */
export const PEOPLE_VERDICT_LABEL: Record<string, string> = {
  waiting: "Waiting for data",
  match: "Matches",
  inflated: "Attendance inflated",
  over_capacity: "Over capacity",
  unclaimed: "No claim submitted",
  unverifiable: "Count unstable",
  ghost: "Claimed but nobody seen",
  unregistered: "More seen than claimed",
};

/** Neutral compliance verdict labels (equipment). */
export const EQUIP_VERDICT_LABEL: Record<string, string> = {
  waiting: "Waiting for data",
  ok: "OK",
  missing: "Missing",
  declaration_mismatch: "Declaration differs",
  non_operational: "Not operational",
};

export const COMPLIANCE_LEVEL_LABEL: Record<string, string> = {
  waiting: "Waiting",
  ok: "All matched",
  attention: "Worth a look",
  critical: "Needs your response",
};

/**
 * A session is "Held" only when actual_start_ts exists. If the API returns
 * closed without an actual start, defensively show "Not held".
 */
export function sessionDisplayStatus(status: string, actualStartTs?: string | null): string {
  if (status === "closed" && !actualStartTs) return "missed";
  return status;
}

export const ITEM_LABEL: Record<string, string> = {
  person: "People",
  chair: "Chair",
  desk: "Desk",
  monitor: "Monitor",
  laptop: "Laptop",
  keyboard: "Keyboard",
  mouse: "Mouse",
  "cell phone": "Phone",
  book: "Book",
  bottle: "Bottle",
  bench: "Bench",
  couch: "Couch",
  "sewing machine": "Sewing machine",
};

export const DAY_STATUS = {
  ok: { label: "OK", icon: "CheckCircle2", tone: "success" },
  attention: { label: "Attention", icon: "AlertTriangle", tone: "warning" },
  critical: { label: "Critical", icon: "AlertOctagon", tone: "danger" },
  missed: { label: "Not held", icon: "CalendarX2", tone: "danger" },
  partial: { label: "Partly held", icon: "CircleDashed", tone: "warning" },
  cancelled: { label: "Cancelled", icon: "Ban", tone: "muted" },
  no_data: { label: "No data", icon: "Minus", tone: "muted" },
  holiday: { label: "Holiday", icon: "CalendarOff", tone: "info" },
  upcoming: { label: "Scheduled", icon: "Clock", tone: "uncertain" },
  none: { label: "No session", icon: "Minus", tone: "muted" },
} as const;

export type DayStatus = keyof typeof DAY_STATUS;

export const SESSION_STATUS = {
  scheduled: { label: "Upcoming", icon: "Clock", tone: "muted" },
  running: { label: "Running", icon: "Radio", tone: "success" },
  closed: { label: "Held", icon: "CheckCircle2", tone: "success" },
  missed: { label: "Not held", icon: "CalendarX2", tone: "danger" },
  cancelled: { label: "Cancelled", icon: "Ban", tone: "muted" },
} as const;

export type SessionStatusKey = keyof typeof SESSION_STATUS;

export const RUN_END_REASON: Record<string, string> = {
  manual: "Stopped by user",
  timeout: "Timed out",
  session_end: "Session ended",
  error: "Error",
  system: "System",
};

export const SESSION_KIND: Record<string, string> = {
  scheduled: "Recurring",
  oneoff: "One-off",
  adhoc: "Demo",
};

export const FLAG_STATUS_LABEL: Record<string, string> = {
  open: "Open",
  acknowledged: "Acknowledged",
  centre_responded: "Centre responded",
  under_review: "Under review",
  resolved: "Resolved",
  dismissed: "Dismissed",
  escalated: "Escalated",
};

export const CENTRE_STATUS_LABEL: Record<string, string> = {
  pending_setup: "Setting up",
  awaiting_camera_approval: "Awaiting camera approval",
  live: "Live",
  suspended: "Suspended",
  terminated: "Terminated",
};

export const ENFORCEMENT_LEVELS = [
  { id: "advisory", label: "Advisory" },
  { id: "notice", label: "Notice" },
  { id: "warning", label: "Warning" },
  { id: "suspension", label: "Suspension" },
  { id: "termination", label: "Termination" },
] as const;

export const APPLICATION_TABS = [
  { id: "submitted", label: "Pending" },
  { id: "under_review", label: "Under review" },
  { id: "query_raised", label: "Query raised" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
] as const;

export const GOVT_ROLES = ["super_admin", "scheme_officer", "auditor"] as const;
export type GovtRole = (typeof GOVT_ROLES)[number];

export const COPY_DONE = "Copied";
