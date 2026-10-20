import { refreshTokens, tokens } from "./auth";

async function request<T>(
  path: string,
  init: RequestInit,
  json: boolean,
  retry: boolean,
  timeoutMs?: number,
): Promise<T> {
  const controller = timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined;
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
    ...init,
    signal: controller,
    headers: {
      ...(json ? { "Content-Type": "application/json" } : {}),
      "ngrok-skip-browser-warning": "true",
      ...(tokens.access ? { Authorization: `Bearer ${tokens.access}` } : {}),
      ...init.headers,
    },
  });

  if (res.status === 401 && retry && (await refreshTokens())) {
    return request<T>(path, init, json, false);
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
    throw { status: res.status, code: d.code, message: d.detail ?? "Something went wrong" };
  }

  return body as T;
}

export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  return request<T>(path, init, true, retry);
}

/** Multipart upload: same as api() but Content-Type is left to the browser (boundary). */
export async function apiUpload<T>(path: string, body: FormData, retry = true, timeoutMs?: number): Promise<T> {
  return request<T>(path, { method: "POST", body }, false, retry, timeoutMs);
}

/** Fetch a relative signed image URL as a blob object URL (never <img src> direct). */
export async function fetchSignedBlob(url: string, onExpire: () => void): Promise<string | null> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${url}`, {
    headers: {
      "ngrok-skip-browser-warning": "true",
      ...(tokens.access ? { Authorization: `Bearer ${tokens.access}` } : {}),
    },
  });
  if (res.status === 403) {
    onExpire();
    return null;
  }
  if (!res.ok) return null;
  return URL.createObjectURL(await res.blob());
}
