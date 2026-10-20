import { tokens, refreshTokens } from "./auth";

export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "true",
      ...(tokens.access ? { Authorization: `Bearer ${tokens.access}` } : {}),
      ...init.headers,
    },
  });

  if (res.status === 401 && retry && (await refreshTokens())) {
    return api<T>(path, init, false);
  }

  if (res.status === 401) {
    tokens.clear();
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload on auth loss, outside React
    window.location.href = "/login";
    throw new Error("Signed out");
  }

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const d = body.detail ?? {};
    if (d.code === "PASSWORD_CHANGE_REQUIRED") {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload outside React
      window.location.href = "/change-password";
    }
    throw { status: res.status, code: d.code, message: d.detail ?? "Something went wrong" };
  }

  return body as T;
}