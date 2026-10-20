const A = "ds_access", R = "ds_refresh";

export const tokens = {
  get access() {
    return typeof window === "undefined" ? null : localStorage.getItem(A);
  },
  get refresh() {
    return typeof window === "undefined" ? null : localStorage.getItem(R);
  },
  set(a: string, r: string) {
    localStorage.setItem(A, a);
    localStorage.setItem(R, r);
  },
  clear() {
    localStorage.removeItem(A);
    localStorage.removeItem(R);
  },
};

const BASE = process.env.NEXT_PUBLIC_API_URL!;
const H = {
  "Content-Type": "application/json",
  "ngrok-skip-browser-warning": "true",
};

export async function login(loginId: string, password: string) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ login_id: loginId.trim(), password }),
  });
  const j = await res.json();
  if (!res.ok) throw j.detail ?? j;
  if (j.access_token) tokens.set(j.access_token, j.refresh_token);
  return j;
}

let inflight: Promise<boolean> | null = null;

export function refreshTokens(): Promise<boolean> {
  if (!inflight) {
    inflight = (async () => {
      const rt = tokens.refresh;
      if (!rt) return false;
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: "POST",
        headers: H,
        body: JSON.stringify({ refresh_token: rt }),
      });
      if (!res.ok) {
        tokens.clear();
        return false;
      }
      const j = await res.json();
      tokens.set(j.access_token, j.refresh_token);
      return true;
    })().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

export async function logout() {
  const rt = tokens.refresh;
  if (rt) {
    await fetch(`${BASE}/auth/logout`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({ refresh_token: rt }),
    }).catch(() => {});
  }
  tokens.clear();
}
