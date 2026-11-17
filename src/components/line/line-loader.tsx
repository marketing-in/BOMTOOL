"use client";

import dynamic from "next/dynamic";
import type { ViewerData } from "@/components/viewer/types";
import type { SimLine } from "@/lib/ops/sim-stations";

// WebGL only in the browser.
const LineView = dynamic(() => import("./line-view"), {
  ssr: false,
  loading: () => <div className="grid h-[62dvh] min-h-[420px] place-items-center rounded-lg border bg-card text-sm text-muted-foreground">Starting the line…</div>,
});

export function LineLoader({ data, line }: { data: ViewerData; line?: SimLine | null }) {
  return <LineView data={data} line={line} />;
}
