"use client";

import { useEffect, useState } from "react";

export type SignedImageState = {
  src: string | null;
  loading: boolean;
  error: boolean;
  /** signed URL expired — parent should refetch for fresh URLs */
  expired: boolean;
  retry: () => void;
};

/**
 * Loads a relative signed URL through an authenticated fetch -> blob URL.
 * NEVER use the signed URL directly in <img src>.
 */
export function useSignedImageState(relUrl?: string | null): SignedImageState {
  const [state, setState] = useState<{ src: string | null; loading: boolean; error: boolean; expired: boolean }>({
    src: null,
    loading: !!relUrl,
    error: false,
    expired: false,
  });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!relUrl) {
      setState({ src: null, loading: false, error: false, expired: false });
      return;
    }

    let dead = false;
    let objUrl: string | null = null;
    const BASE = process.env.NEXT_PUBLIC_API_URL!;

    setState((s) => ({ ...s, loading: true, error: false, expired: false }));

    (async () => {
      try {
        const res = await fetch(`${BASE}${relUrl}`, {
          headers: { "ngrok-skip-browser-warning": "true" },
        });
        if (res.status === 403 || res.status === 401) {
          if (!dead) setState({ src: null, loading: false, error: true, expired: true });
          return;
        }
        if (!res.ok) throw new Error("failed");
        const blob = await res.blob();
        if (dead) return;
        objUrl = URL.createObjectURL(blob);
        setState({ src: objUrl, loading: false, error: false, expired: false });
      } catch {
        if (!dead) setState({ src: null, loading: false, error: true, expired: false });
      }
    })();

    return () => {
      dead = true;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
  }, [relUrl, nonce]);

  return { ...state, retry: () => setNonce((n) => n + 1) };
}

/** Back-compat: returns the blob URL (or null while loading / on error). */
export function useSignedImage(relUrl?: string | null) {
  return useSignedImageState(relUrl).src;
}

export function useSignedDocument(relUrl?: string | null) {
  const [blob, setBlob] = useState<Blob | null>(null);

  useEffect(() => {
    if (!relUrl) return;
    let dead = false;
    const BASE = process.env.NEXT_PUBLIC_API_URL!;
    (async () => {
      try {
        const res = await fetch(`${BASE}${relUrl}`, { headers: { "ngrok-skip-browser-warning": "true" } });
        if (!res.ok) throw new Error("failed");
        const b = await res.blob();
        if (!dead) setBlob(b);
      } catch {
        if (!dead) setBlob(null);
      }
    })();
    return () => {
      dead = true;
    };
  }, [relUrl]);

  if (!relUrl) return null;
  return blob;
}
