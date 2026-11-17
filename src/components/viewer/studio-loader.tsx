"use client";

import dynamic from "next/dynamic";
import type { ViewerData } from "./types";

// WebGL only in the browser.
const StudioView = dynamic(() => import("./studio-view"), {
  ssr: false,
  loading: () => <div className="grid h-[440px] place-items-center rounded-xl border bg-card text-sm text-muted-foreground sm:h-[520px]">Loading the board…</div>,
});

/** The assembled board inline (circuitflow studio, 3D / 2D). */
export function StudioLoader({ data, className }: { data: ViewerData; className?: string }) {
  return <StudioView data={data} className={className} />;
}
