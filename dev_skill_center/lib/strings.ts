export const ERROR_MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: "Incorrect ID or password",
  ACCOUNT_LOCKED: "Too many attempts. Try again in a few minutes.",
  WEAK_PASSWORD: "Use 10+ characters with upper, lower, digit and special.",
  SAME_PASSWORD: "Choose a different password",
  ENROLMENT_CAP_REACHED: "Sanctioned limit reached. Request extra enrolment.",
  CLAIM_LOCKED: "Already submitted. Provide an edit reason.",
  WRONG_CENTRE: "You do not have access to this.",
  FORBIDDEN: "You do not have access to this.",
  CENTRE_INACTIVE: "Your centre is not active right now. You can review information, but changes are paused.",
  LINK_EXPIRED: "This link expired. The page has been refreshed.",
  BAD_FILE: "PDF, JPG or PNG only.",
  FILE_TOO_LARGE: "Max 5 MB per file.",
  LOGIN_EXISTS: "This login ID already exists.",
  BAD_STATE: "This action cannot be performed in the current state.",
  NOT_FOUND: "Not found.",
  NO_ROI: "Draw the classroom area first.",
  BAD_POLYGON: "The area needs at least 3 points.",
  BAD_COORD: "Points must be inside the frame.",
  NO_REASON: "A reason is required.",
  NO_COMMENT: "A comment is required.",
  NO_CONSENT: "Consent is required to enrol a face.",
  BAD_FACE: "We could not find one clear face. Try again in better light.",
  FACE_NOT_ENROLLED: "Your face is not enrolled yet.",
  STAFF_NOT_FOUND: "Staff record not found.",
  NO_TOKEN: "Please sign in again.",
  BAD_TOKEN: "Please sign in again.",
  TOKEN_EXPIRED: "Session expired. Please sign in again.",
  BAD_MFA: "Please sign in again.",
  CREDENTIALS_EXPIRED: "These credentials expired. Ask the department to reset them.",
  PASSWORD_CHANGE_REQUIRED: "Please change your password first.",
  DATE_TOO_FAR: "Pick a date within the next 30 days.",
  INVALID_KIND: "Choose a valid request type.",
  NEEDS_APPROVAL: "Changes to your timetable need government approval. We will send a request for you.",
  RATE_LIMITED: "Too many requests. Please wait a moment.",
};

export function getErrorMessage(code?: string, fallback = "Something went wrong"): string {
  if (!code) return fallback;
  return ERROR_MESSAGES[code] ?? fallback;
}

/** Map a thrown {code,message} (or Error) to a friendly sentence. */
export function messageFrom(e: unknown): string {
  if (e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") {
    const err = e as { code?: string; message: string };
    return getErrorMessage(err.code, err.message);
  }
  return getErrorMessage(undefined, "Something went wrong");
}
