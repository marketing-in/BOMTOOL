"use client";

import dynamic from "next/dynamic";
import type { ViewerData } from "./types";
import type { Mode } from "./board-viewer";

// WebGL only in the browser.
const BoardViewer = dynamic(() => import("./board-viewer"), {
  ssr: false,
  loading: () => <div className="grid h-[62dvh] min-h-[420px] place-items-center rounded-lg border bg-card text-sm text-muted-foreground">Loading 3D viewer…</div>,
});

export function ViewerLoader({
  data,
  initialStep,
  initialMode,
  initialLine,
  compact,
}: {
  data: ViewerData;
  initialStep?: string | null;
  initialMode?: Mode;
  initialLine?: string | null;
  compact?: boolean;
}) {
  return <BoardViewer data={data} initialStep={initialStep} initialMode={initialMode} initialLine={initialLine} compact={compact} />;
}
