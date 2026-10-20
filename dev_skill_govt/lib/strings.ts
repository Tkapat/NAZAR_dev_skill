export const ERROR_MESSAGES: Record<string, string> = {
  ACCOUNT_LOCKED: "Too many attempts. Try again in a few minutes.",
  INVALID_CREDENTIALS: "Incorrect ID or password",
  BAD_MFA: "Incorrect code",
  WEAK_PASSWORD: "Use 10+ characters with upper, lower, digit and special.",
  SAME_PASSWORD: "Choose a different password",
  LINK_EXPIRED: "Link expired. Please refresh.",
  BAD_STATE: "This action cannot be performed in the current state.",
  FORBIDDEN: "You do not have permission to perform this action.",
  BAD_TOKEN: "Session expired. Please log in again.",
  TOKEN_EXPIRED: "Session expired. Please log in again.",
  CREDENTIALS_EXPIRED: "Ask the department to reset these credentials.",
  PASSWORD_CHANGE_REQUIRED: "Please change your password first.",
  ENROLMENT_CAP_REACHED: "Sanctioned limit reached. Request extra enrolment.",
  CLAIM_LOCKED: "Already submitted. Provide an edit reason.",
  WRONG_CENTRE: "Not your centre.",
  CENTRE_INACTIVE: "Centre is not active.",
  BAD_FILE: "PDF, JPG or PNG only.",
  FILE_TOO_LARGE: "Max 5 MB.",
  LOGIN_EXISTS: "Login already exists.",
  NOT_FOUND: "Not found.",
  INVALID_ROLE: "Invalid role.",
  INVALID_KIND: "Invalid request kind.",
  INVALID_LEVEL: "Invalid enforcement level.",
  NO_CONFIRMATION: "Confirmation required.",
  NO_REASON: "Reason required.",
  NO_COMMENT: "Comment required.",
  NO_ROI: "ROI not set.",
  BAD_ID: "Invalid ID.",
  RATE_LIMITED: "Too many requests. Please wait a moment.",
  /* schedule (v4) */
  MISSING_FIELD: "Please fill in the required field.",
  BAD_TIME: "The chosen times are not valid.",
  SESSION_OVERLAP: "This overlaps with another session on the same day.",
  /* face / staff (v4) */
  FACE_NOT_ENROLLED: "No face is enrolled for this staff member.",
  NO_FACE: "No clear face was found in the frames.",
  FACE_ENGINE_UNAVAILABLE: "Face verification is unavailable right now.",
  NO_STAFF_RECORD: "No staff record for this account.",
  OUTSIDE_WINDOW: "This scan is outside the session window.",
};

/** Optional second line shown under the message (page plans: "advice"). */
export const ERROR_ADVICE: Record<string, string> = {
  BAD_TIME: "Sessions must be 15–480 minutes and start at least 5 minutes in the future.",
  SESSION_OVERLAP: "Adjust the times or cancel the clashing session first.",
  FACE_NOT_ENROLLED: "Ask the centre to enrol a face before scanning.",
  NO_FACE: "Use the front camera in good light and hold still for the capture.",
  FACE_ENGINE_UNAVAILABLE: "Retry in a moment. If it persists, ask the department to check the centre server.",
  NO_STAFF_RECORD: "Ask the centre to register you as staff first.",
  OUTSIDE_WINDOW: "You can scan from 15 minutes before the session until it ends.",
};

export function getErrorMessage(code?: string, fallback = "Something went wrong"): string {
  if (!code) return fallback;
  return ERROR_MESSAGES[code] ?? fallback;
}

export function getErrorAdvice(code?: string): string | undefined {
  if (!code) return undefined;
  return ERROR_ADVICE[code];
}
