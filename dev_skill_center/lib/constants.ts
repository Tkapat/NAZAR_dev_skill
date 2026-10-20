export const FLAG_TYPES: Record<string, { name: string; hint: string }> = {
  low_occupancy: { name: "Low occupancy", hint: "Fewer people than claimed" },
  no_equipment: { name: "No equipment", hint: "Required equipment missing or unused" },
  frozen_frame: { name: "Frozen frame", hint: "Video frame looks frozen" },
  low_light: { name: "Low light", hint: "Room is too dark to verify" },
  camera_covered: { name: "Camera covered", hint: "Lens is blocked" },
};

export const SEVERITY = {
  low: { label: "Low" },
  medium: { label: "Medium" },
  high: { label: "High" },
  critical: { label: "Critical" },
} as const;

export type Severity = keyof typeof SEVERITY;

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
  pending_setup: "Setup in progress",
  awaiting_camera_approval: "Awaiting approval",
  live: "Live",
  suspended: "Suspended",
  terminated: "Terminated",
};

export const WEEKDAYS = [
  { n: 1, short: "Mon", long: "Monday" },
  { n: 2, short: "Tue", long: "Tuesday" },
  { n: 3, short: "Wed", long: "Wednesday" },
  { n: 4, short: "Thu", long: "Thursday" },
  { n: 5, short: "Fri", long: "Friday" },
  { n: 6, short: "Sat", long: "Saturday" },
  { n: 7, short: "Sun", long: "Sunday" },
] as const;

/** Onboarding checklist labels (order matters). */
export const CHECKLIST_STEPS = [
  { key: "camera", label: "Camera", href: "/cameras", hint: "Add a classroom camera and draw the class area." },
  { key: "batches", label: "Batches", href: "/schedule", hint: "Create at least one batch with a timetable." },
  { key: "staff", label: "Staff", href: "/staff", hint: "Add trainers and secure each one's face." },
  { key: "equipment", label: "Equipment", href: "/equipment", hint: "Declare what your centre has." },
] as const;
