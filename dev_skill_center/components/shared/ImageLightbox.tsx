"use client";

import { useEffect } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useSignedImageState } from "@/hooks/useSignedImage";

interface ImageLightboxProps {
  /** relative signed URLs; loaded one at a time through the signed-image hook */
  urls: (string | null)[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}

/** Lazy sibling of SignedImage: Esc closes, arrow keys navigate. */
export function ImageLightbox({ urls, index, onIndexChange, onClose }: ImageLightboxProps) {
  const { src, loading, error } = useSignedImageState(urls[index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onIndexChange(Math.min(urls.length - 1, index + 1));
      if (e.key === "ArrowLeft") onIndexChange(Math.max(0, index - 1));
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [index, urls.length, onIndexChange, onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/85 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Evidence image"
      onClick={onClose}
    >
      <div className="absolute right-4 top-4 flex gap-2" onClick={(e) => e.stopPropagation()}>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onIndexChange(Math.max(0, index - 1))}
          disabled={index === 0}
          aria-label="Previous image"
          className="text-white hover:bg-white/10 hover:text-white"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onIndexChange(Math.min(urls.length - 1, index + 1))}
          disabled={index >= urls.length - 1}
          aria-label="Next image"
          className="text-white hover:bg-white/10 hover:text-white"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close"
          className="text-white hover:bg-white/10 hover:text-white"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      <div className="max-h-[85vh] max-w-5xl" onClick={(e) => e.stopPropagation()}>
        {loading && <Skeleton className="h-[60vh] w-[80vw]" />}
        {!loading && error && <p className="rounded-lg bg-surface-2 p-6 text-sm text-muted-foreground">Image unavailable. It may have expired.</p>}
        {!loading && !error && src && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={`Evidence ${index + 1} of ${urls.length}`} className="max-h-[85vh] rounded-lg object-contain" />
        )}
      </div>

      <p className="mt-3 text-xs text-white/70">
        {index + 1} / {urls.length} · blurred for privacy
      </p>
    </div>
  );
}
