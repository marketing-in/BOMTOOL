"use client";

import dynamic from "next/dynamic";

const loading = () => <div className="grid h-[420px] place-items-center rounded-xl border bg-muted/60 text-xs text-muted-foreground sm:h-[560px]">Loading 3D…</div>;

// WebGL only in the browser.
const Pcb = dynamic(() => import("./pcb-explorer"), { ssr: false, loading });
const Package = dynamic(() => import("./package-explorer"), { ssr: false, loading });
const Die = dynamic(() => import("./die-explorer"), { ssr: false, loading });

export function Explorer({ view, preset }: { view: "pcb" | "package" | "die"; preset?: string }) {
  if (view === "package") return <Package initial={preset} />;
  if (view === "die") return <Die />;
  return <Pcb initial={preset} />;
}
