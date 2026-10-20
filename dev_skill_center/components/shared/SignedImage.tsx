"use client";

import * as React from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useSignedImageState } from "@/hooks/useSignedImage";
import { ImageLightbox } from "./ImageLightbox";

interface SignedImageProps {
  /** relative signed URL from the API (/files/evidence/<id>?exp=&sig=) */
  url?: string | null;
  alt: string;
  /** sibling images for lightbox navigation */
  gallery?: (string | null)[];
  className?: string;
}

/**
 * The ONLY way evidence / document images from /files are displayed.
 * Skeleton while loading, error tile on failure, click opens ImageLightbox.
 */
export function SignedImage({ url, alt, gallery, className }: SignedImageProps) {
  const { src, loading, error, retry } = useSignedImageState(url);
  const [open, setOpen] = React.useState(false);
  const [index, setIndex] = React.useState(0);

  const galleryUrls = React.useMemo(
    () => (gallery && gallery.length ? gallery : [url]).filter((u): u is string => !!u),
    [gallery, url]
  );
  const myIndex = Math.max(0, galleryUrls.findIndex((u) => u === url));

  if (loading) {
    return <Skeleton className={cn("h-24 w-full", className)} />;
  }

  if (error || !src) {
    return (
      <button
        type="button"
        onClick={retry}
        className={cn(
          "flex h-24 w-full flex-col items-center justify-center gap-1 rounded-lg bg-surface-2 text-muted-foreground",
          className
        )}
        aria-label={`Retry loading ${alt}`}
      >
        <ImageOff className="h-5 w-5" strokeWidth={1.5} aria-hidden />
        <span className="text-xs">{url ? "Could not load. Tap to retry." : "No image"}</span>
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setIndex(myIndex);
          setOpen(true);
        }}
        className={cn("overflow-hidden rounded-lg bg-surface-2", className)}
        aria-label={`Open ${alt}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="h-full w-full object-cover" loading="lazy" />
      </button>

      {open && (
        <ImageLightbox
          urls={galleryUrls}
          index={index}
          onIndexChange={setIndex}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
