"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A distributor product photo (DigiKey / Mouser / Octopart CDNs). Plain <img>: the hosts vary and
 * the images are already sized thumbnails. No referrer is sent; a broken link falls back.
 */
export function PartPhoto({ src, alt, className, fallback }: { src: string | null; alt: string; className?: string; fallback?: React.ReactNode }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <>{fallback ?? null}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={cn("object-contain", className)}
    />
  );
}
