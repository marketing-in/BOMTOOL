"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { BoardStudio, type StudioIntro, type StudioMark, type StudioPart } from "@/vendor/circuitflow/studio/entry";
import type { RefResult } from "@/lib/board/footprint-match";
import { BLINK_STEADY, blinkAt, deepen, fittedForCheck, flyAt, markFor, type FlyPlan, type MarkColors } from "@/lib/board/fly-in";
import { OCHRE } from "@/components/bom/footprint-status";
import { RefCard } from "@/components/bom/ref-card";
import { useBoardTextures, useStudioBoard } from "@/components/viewer/board-textures";
import type { ViewerData } from "@/components/viewer/types";

/**
 * The marks lie on the solder mask, so they take the bright (dark-theme) risk colours whatever the page theme, as the
 * 2D film does: the light ones vanish on green. Read from the tokens once, in the browser.
 */
function markColors(): MarkColors {
  const el = document.createElement("span");
  el.className = "dark";
  el.hidden = true;
  document.body.appendChild(el);
  const css = getComputedStyle(el);
  const read = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const colors = { green: read("--risk-green", "#6fcf8e"), red: read("--risk-red", "#f07a70"), tint: deepen(read("--risk-red", "#f07a70")), ochre: OCHRE };
  el.remove();
  return colors;
}

const CARD = "w-60 rounded-lg border bg-popover p-3 text-xs text-popover-foreground shadow-lg";

/**
 * Step 3's board in 3D: the circuitflow studio with the footprint check laid over it. When a third of the board is in
 * view the parts fly in from above the picture and land on their pads (src/lib/board/fly-in.ts plans it); then a match
 * glows green for a moment, "check by eye" keeps an ochre outline, a mismatch blinks red, and a placed part with no
 * BoM line is bare pads in a dotted red outline. Hover a part (or tap it) for what was found.
 */
export default function FootprintStudio({
  data,
  refs,
  plan,
  onIntro,
  onFail,
}: {
  data: ViewerData;
  refs: RefResult[];
  plan: FlyPlan;
  onIntro?: (phase: "start" | "end") => void;
  onFail?: () => void;
}) {
  const tex = useBoardTextures(data);
  const studio = useStudioBoard(data, tex);
  const byRef = useMemo(() => new Map(refs.map((r) => [r.ref.toUpperCase(), r])), [refs]);
  // A designator on a fitted line and on a DNP line is judged against the fitted one: drawn fitted, as the check counts it.
  const parts = useMemo(() => (studio ? fittedForCheck(studio.parts, new Set(byRef.keys())) : null), [studio, byRef]);
  const colors = useMemo(markColors, []);
  const marks = useMemo(() => {
    if (!parts) return null;
    const out: Record<string, StudioMark> = {};
    for (const p of parts) {
      const r = p.dnp ? null : byRef.get(p.ref.toUpperCase());
      const m = r ? markFor(r.status, colors) : null;
      if (m) out[p.ref] = m;
    }
    return out;
  }, [parts, byRef, colors]);
  const intro = useMemo<StudioIntro>(
    () => ({
      duration: plan.duration,
      at: (ref, t) => {
        const p = plan.byRef[ref.toUpperCase()];
        return p ? flyAt(p, t) : null;
      },
      blink: blinkAt,
      steady: BLINK_STEADY,
    }),
    [plan],
  );

  const [selected, setSelected] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const on = () => setFull(document.fullscreenElement === stage.current);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const toggleFull = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void stage.current?.requestFullscreen?.().catch(() => {});
  }, []);

  // What was found for a part: the hover card beside it, and the card a tap pins.
  const found = useCallback(
    (p: StudioPart) => {
      const r = byRef.get(p.ref.toUpperCase());
      return r ? (
        <RefCard r={r} bottom={p.side === "bottom"} />
      ) : (
        <>
          <span className="num text-sm font-semibold">{p.ref}</span>
          <p className="mt-1 text-muted-foreground">{p.dnp ? "Not fitted (DNP): not checked" : "Not in the footprint check"}</p>
        </>
      );
    },
    [byRef],
  );
  // The picked part's card is pinned top left: no second card beside the pointer.
  const tip = useCallback((p: StudioPart) => (p.ref === selected ? null : <div className={CARD}>{found(p)}</div>), [found, selected]);
  const picked = selected ? (parts?.find((p) => p.ref === selected) ?? null) : null;

  return (
    <div ref={stage} className="viewer-grid relative h-[420px] overflow-hidden rounded-lg border sm:h-[520px] [&:fullscreen]:h-dvh [&:fullscreen]:rounded-none [&:fullscreen]:border-0">
      {studio && parts && marks ? (
        <BoardStudio
          board={studio.board}
          parts={parts}
          mode="3D"
          selected={selected}
          onSelect={(p) => setSelected(p?.ref ?? null)}
          renderTip={tip}
          intro={intro}
          marks={marks}
          onIntro={onIntro}
          onFail={onFail}
          onToggleFull={toggleFull}
          full={full}
          clearTools
        />
      ) : (
        <div className="grid h-full place-items-center text-sm text-muted-foreground">Rendering board…</div>
      )}
      {picked ? (
        // A tapped part keeps its card (touch screens have no hover).
        <div className="absolute top-3 left-3 z-20 max-w-[calc(100%-4.5rem)]" aria-live="polite">
          <div className={`relative ${CARD} pr-8`}>
            {found(picked)}
            <button
              type="button"
              onClick={() => setSelected(null)}
              aria-label="Close"
              className="absolute top-1.5 right-1.5 grid size-7 place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
