"use client";

import dynamic from "next/dynamic";
import type { BodySpec } from "@/lib/board/bodies";

// WebGL only in the browser.
const EntryModel = dynamic(() => import("./entry-model"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-xs text-muted-foreground">Loading 3D…</div>,
});

export function EntryModelLoader({ body }: { body: BodySpec }) {
  return <EntryModel body={body} />;
}
