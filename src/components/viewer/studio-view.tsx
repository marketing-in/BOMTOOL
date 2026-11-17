"use client";

import { useEffect, useRef, useState } from "react";
import { BoardStudio, type StudioMode } from "@/vendor/circuitflow/studio/entry";
import { cn } from "@/lib/utils";
import { useBoardTextures, useStudioBoard } from "./board-textures";
import type { ViewerData } from "./types";

/**
 * The assembled board on its own, the circuitflow way, with a 3D / 2D switch: for pages that show the board inline
 * and link to the full viewer for the BoM, availability and route beside it.
 */
export default function StudioView({ data, className }: { data: ViewerData; className?: string }) {
  const tex = useBoardTextures(data);
  const studio = useStudioBoard(data, tex);
  const [mode, setMode] = useState<StudioMode>("3D");
  const [selected, setSelected] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const on = () => setFull(document.fullscreenElement === stage.current);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void stage.current?.requestFullscreen?.().catch(() => {});
  };
  const sel = selected ? data.parts.find((p) => p.refDes === selected) : undefined;

  return (
    <div ref={stage} className={cn("viewer-grid relative h-[440px] overflow-hidden rounded-xl border sm:h-[520px] [&:fullscreen]:h-dvh [&:fullscreen]:rounded-none [&:fullscreen]:border-0", className)}>
      {studio ? (
        <BoardStudio
          board={studio.board}
          parts={studio.parts}
          mode={mode}
          selected={selected}
          onSelect={(p) => setSelected(p?.ref ?? null)}
          onToggleFull={toggleFull}
          full={full}
        />
      ) : (
        <div className="grid h-full place-items-center text-sm text-muted-foreground">Rendering board…</div>
      )}
      <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-wrap items-start gap-2">
        <div role="group" aria-label="Drawing" className="pointer-events-auto inline-flex rounded-md border bg-card p-0.5 text-xs">
          {(["3D", "2D"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setMode(v)}
              aria-pressed={mode === v}
              title={v === "3D" ? "Turn the board in 3D" : "Flat drawing from above"}
              className={cn("h-7 rounded px-2.5 font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring", mode === v ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
            >
              {v}
            </button>
          ))}
        </div>
        {sel ? (
          <span className="inline-flex h-8 max-w-[60%] items-center gap-1.5 truncate rounded-md border bg-card px-2.5 text-xs" aria-live="polite">
            <b className="num">{sel.refDes}</b>
            <span className="truncate text-muted-foreground">{sel.mpn ?? sel.value ?? sel.pkg ?? ""}</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}
