export type Role = "centre_admin" | "trainer";

export type CentreStatus =
  | "pending_setup"
  | "awaiting_camera_approval"
  | "live"
  | "suspended"
  | "terminated";

export interface Me {
  id: string;
  login_id: string;
  role: Role;
  centre_id: string | null;
  full_name: string;
  must_change_password: boolean;
  mfa_enabled: boolean;
  centre: { id: string; code: string; name: string; status: CentreStatus } | null;
}

export interface Centre {
  id: string;
  code: string;
  name: string;
  max_trainees: number;
  enrolled_count: number;
  status: CentreStatus;
  status_reason?: string | null;
  address?: string;
  district?: string;
  state?: string;
  lat?: number | null;
  lng?: number | null;
  contact_phone?: string;
  equipment?: {
    class: string;
    label: string;
    sanctioned_qty: number;
    declared_qty: number;
  }[];
  risk_score?: number;
  created_at?: string;
  live_since?: string | null;
  submitted_at?: string | null;
}

export interface Checklist {
  camera: boolean;
  batches: boolean;
  staff: boolean;
  equipment: boolean;
  submitted: boolean;
}

export interface CentreStats {
  open_flags: number;
  unread_notices: number;
  sessions_today: number;
  camera_status: "none" | "online" | "offline" | "tampered" | "unknown";
  camera_count: number;
}

export interface MyCentre {
  centre: Centre | null;
  checklist: Checklist | null;
  status: CentreStatus | null;
  submitted_at: string | null;
  stats: CentreStats | null;
  live_summary?: {
    counts: { live: number; idle: number; offline: number; tampered: number; provisional: number };
    cameras: LiveStatus[];
    today: { snapshots: number; people_max: number | null };
  } | null;
}

export type SessionState = "upcoming" | "active" | "closed" | "missed";

export interface Session {
  id: string;
  batch_id: string | null;
  batch_name?: string | null;
  trainer_name?: string | null;
  session_date: string;
  start_ts: string;
  end_ts: string;
  status: string;
  kind?: string;
  label?: string | null;
  claimed?: number | null;
  observed?: number | null;
  ci_low?: number | null;
  ci_high?: number | null;
  observation_state?: string | null;
}

export type CameraSetupStatus = "draft" | "submitted" | "approved" | "rejected";
export type CameraStatus = "online" | "offline" | "tampered" | "unknown";

export interface Camera {
  id: string;
  name: string;
  source_uri: string;
  source_kind: "browser" | "webcam" | "rtsp" | "file";
  resolution?: string | null;
  roi_polygon: [number, number][] | null;
  zones: { name: string; polygon: [number, number][] }[] | null;
  setup_status: CameraSetupStatus;
  status: CameraStatus;
  reject_reason?: string | null;
  last_seen?: string | null;
  created_at?: string;
  reference_blob_id?: string | null;
  reference_width?: number | null;
  reference_height?: number | null;
  reference_quality?: {
    brightness?: number;
    sharpness?: number;
    coverage?: number;
  } | null;
}

export interface ReferenceFrame {
  url: string;
  width: number | null;
  height: number | null;
  quality: { brightness?: number; sharpness?: number; coverage?: number } | null;
}

export interface Batch {
  id: string;
  name: string;
  trainer_id: string | null;
  weekdays: number[];
  start_time: string;
  end_time: string;
  start_date?: string | null;
  end_date?: string | null;
  active: boolean;
  created_at?: string;
}

export interface Staff {
  id: string;
  full_name: string;
  staff_role: "trainer" | "official";
  phone?: string | null;
  face_consent: boolean;
  face_enrolled: boolean;
  active: boolean;
  user_id?: string | null;
  created_at?: string;
}

export interface Trainee {
  id: string;
  full_name: string;
  external_id?: string | null;
  batch_id: string | null;
  active: boolean;
  created_at?: string;
}

export interface EquipmentItem {
  class: string;
  label: string;
  sanctioned_qty: number;
  declared_qty: number;
  required: boolean;
  operability: string;
  observed: number | null;
  observed_at: string | null;
  observed_status: "unknown" | "ok" | "missing" | "idle" | "repair_approved";
  repair_pending: boolean;
  repair_approved: boolean;
  repairs: Repair[];
}

export interface Repair {
  id: string;
  equipment_class: string;
  qty: number;
  reason: string;
  expected_fix_date: string;
  status: "pending" | "approved" | "rejected" | "expired";
  approved_until?: string | null;
  decision_comment?: string | null;
  created_at?: string;
}

export type FlagStatus =
  | "open"
  | "acknowledged"
  | "centre_responded"
  | "under_review"
  | "resolved"
  | "dismissed"
  | "escalated";

export interface Flag {
  id: string;
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  state: "flagged" | "uncertain";
  status: FlagStatus;
  reason: string;
  claimed_count?: number | null;
  observed_count?: number | null;
  evidence_ids?: string[];
  evidence_urls?: string[];
  created_at?: string;
  updated_at?: string;
  events?: {
    action: string;
    actor_role?: string;
    comment?: string | null;
    ts: string;
  }[];
}

export interface Notice {
  id: string;
  level: "advisory" | "notice" | "warning" | "suspension" | "termination";
  subject: string;
  body: string;
  flag_ids?: string[];
  read_at?: string | null;
  reply?: string | null;
  replied_at?: string | null;
  created_at?: string;
}

export interface ChangeRequest {
  id: string;
  kind: "equipment" | "enrolment" | "batch" | "camera" | "changerequests" | "repairdeclarations";
  payload?: Record<string, unknown>;
  reason?: string;
  status: "pending" | "approved" | "rejected";
  decision_comment?: string | null;
  decided_at?: string | null;
  equipment_class?: string;
  qty?: number;
  created_at?: string;
}

export interface EquipmentRule {
  class: string;
  label: string;
  min_units_per_trainee: number;
  operability: string;
  required: boolean;
}

export interface TradeTemplate {
  id: string;
  trade_name: string;
  presence_rule?: string;
  equipment_rules: EquipmentRule[];
}

export interface Scheme {
  id: string;
  name: string;
  code: string;
  description?: string;
  templates: TradeTemplate[];
}

export interface DemoRunResult {
  observed: number | null;
  ci_low: number | null;
  ci_high: number | null;
  state: string;
  per_frame: number[];
  frames_used: number;
  claimed: number | null;
  thumbnails: string[];
  flags: Flag[];
}

export interface EdgeStatus {
  online: boolean;
  unsynced_count: number;
  last_sync?: string | null;
  chain_ok: boolean;
}

/* ------------------------------------------------------------- live room */

export type LiveState = "live" | "idle" | "offline" | "tampered" | "provisional" | "error";

export interface LiveSession {
  id: string;
  label?: string | null;
  start_ts?: string | null;
  end_ts?: string | null;
}

export interface LiveItemCounts {
  present: number;
  in_use: number;
  idle?: number;
  off?: number;
}

/** One row of GET /my/live (LiveStatus in the page plan). */
export interface LiveStatus {
  camera_id: string;
  camera_name: string;
  source_kind?: string | null;
  state: LiveState | null;
  ts?: string | null;
  age_s?: number | null;
  interval_s?: number;
  session?: LiveSession | null;
  people?: number | null;
  people_smooth?: number | null;
  claimed?: number | null;
  items?: Record<string, LiveItemCounts>;
  labels?: Record<string, string>;
  quality?: { ok?: boolean; reasons?: string[] } | null;
  thumb_url?: string | null;
  spark?: number[];
}

export interface LiveCounts {
  live: number;
  idle: number;
  offline: number;
  tampered: number;
  provisional: number;
}

export interface MyLiveResponse {
  items: LiveStatus[];
  counts?: LiveCounts;
}

export interface FrameBox {
  cls: string;
  /** normalised 0..1 against the uploaded frame */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  conf?: number;
}

/** Response of POST /my/cameras/{id}/frame. */
export interface FrameResponse {
  accepted?: boolean;
  reason?: string;
  state?: string;
  people?: number | null;
  people_smooth?: number | null;
  items?: Record<string, LiveItemCounts>;
  boxes?: FrameBox[];
  session?: LiveSession | null;
  next_interval_s?: number;
  reasons?: string[];
}

export interface DemoSessionResponse {
  session_id: string;
  label?: string;
  start_ts?: string;
  end_ts?: string;
  reused?: boolean;
}

export interface DemoClaimResponse {
  ok: boolean;
  session_id: string;
  claimed: number;
}

export interface LiveDiagnostics {
  api_ok: boolean;
  cameras: {
    id: string;
    name: string;
    source_kind: string | null;
    setup_status: string | null;
    live: { enabled: boolean; interval_s: number; tiling: boolean } | null;
  }[];
  last_frame_at: string | null;
  last_state: string | null;
  last_reasons: string[] | null;
  frames_today: number;
  session: { id: string; label?: string; start_ts?: string; end_ts?: string } | null;
  run: { id: string; started_at: string } | null;
  detector_ready: boolean;
  advice: string[];
}

export interface MonitorRunResponse {
  id?: string;
  _id?: string;
  camera_id?: string;
  centre_id?: string;
  session_id?: string | null;
  status?: string;
  started_at?: string;
  last_frame_at?: string;
  frames_sent?: number;
  frames_ok?: number;
  frames_bad?: number;
}

/* ------------------------------------------------------------ compliance */

export interface CompliancePeople {
  enrolled: number;
  sanctioned_max: number;
  claimed: number | null;
  counted: number | null;
  ci_low: number | null;
  ci_high: number | null;
  state: "ok" | "uncertain" | "no_data";
  delta: number | null;
  margin: number | null;
  verdict: "waiting" | "match" | "inflated" | "over_capacity" | "unclaimed" | "unverifiable" | "ghost" | "unregistered";
  text: string;
}

export interface ComplianceEquipment {
  class: string;
  label: string;
  sanctioned: number;
  declared: number;
  seen: number | null;
  seen_max: number | null;
  in_use: number | null;
  idle: number | null;
  off: number | null;
  in_use_pct: number | null;
  verdict: "waiting" | "ok" | "missing" | "declaration_mismatch" | "non_operational";
  text: string;
}

export interface ComplianceFlag {
  id: string;
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  status: string;
  reason: string;
  created_at: string;
}

export interface ComplianceSummary {
  level: "waiting" | "ok" | "attention" | "critical";
  headline: string;
}

export interface ComplianceResponse {
  session: Session | null;
  as_of: string;
  snapshots: number;
  window: number;
  people: CompliancePeople;
  equipment: ComplianceEquipment[];
  flags: ComplianceFlag[];
  summary: ComplianceSummary;
}
