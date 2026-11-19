"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CircuitBoard } from "lucide-react";
import type { MatchStatus, RefResult } from "@/lib/board/footprint-match";
import type { PartBody } from "@/lib/board/placement-film";
import { planFlyIn } from "@/lib/board/fly-in";
import { FilmLegend, LegendGlyph, PlacementFilm, type BoardArt } from "@/components/bom/placement-film";
import { ORDER, STATUS } from "@/components/bom/footprint-status";
import type { ViewerData } from "@/components/viewer/types";
import { cn } from "@/lib/utils";

// WebGL only in the browser.
const FootprintStudio = dynamic(() => import("./footprint-studio"), {
  ssr: false,
  loading: () => <div className="viewer-grid grid h-[420px] place-items-center rounded-lg border text-sm text-muted-foreground sm:h-[520px]">Loading the board…</div>,
});

type Mode = "3D" | "2D";

/** Whether this browser can draw WebGL at all: a throwaway context, released at once. */
function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") ?? c.getContext("webgl")) as WebGLRenderingContext | null;
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

/** The 3D / 2D switch, as on the Lines page. */
function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div role="group" aria-label="Drawing" className="inline-flex rounded-md border bg-card p-0.5 text-xs">
      {(["3D", "2D"] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={mode === v}
          title={v === "3D" ? "The board in 3D: turn it, flip it, point at a part" : "Flat drawing from above"}
          className={cn("h-7 rounded px-2.5 font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring", mode === v ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

const fmt = (n: number) => n.toLocaleString("en-IN");

/**
 * Step 3's board, part by part: in 3D (the default) the assembled board with every part flying in onto its pads and
 * showing its result, or in 2D the flat film (PlacementFilm). Falls back to 2D by itself when WebGL cannot start or the
 * board's 3D data could not be read. The tables below the board are the text alternative.
 */
export function FootprintBoard({
  refs,
  counts,
  board,
  art,
  bodies,
  mask,
  viewer,
}: {
  refs: RefResult[];
  counts: Record<MatchStatus, number>;
  board: { widthMm: number; heightMm: number } | null;
  art: BoardArt | null;
  bodies?: Record<string, PartBody>;
  mask?: string | null;
  /** The assembled board for the 3D studio (null: 2D only). */
  viewer: ViewerData | null;
}) {
  const [mode, setMode] = useState<Mode>(viewer ? "3D" : "2D");
  const [can3D, setCan3D] = useState(!!viewer);
  useEffect(() => {
    if (viewer && !hasWebGL()) {
      setCan3D(false);
      setMode("2D");
    }
  }, [viewer]);
  const fail = useCallback(() => {
    setCan3D(false);
    setMode("2D");
  }, []);
  const plan = useMemo(() => planFlyIn(refs), [refs]);
  /** Where the fly-in is: the feeder strip turns red as it ends (at once with reduced motion). */
  const [phase, setPhase] = useState<"wait" | "start" | "end">("wait");
  /** Parts drawn as not fitted (a DNP line only; a designator the check judged is drawn fitted). */
  const dnp = useMemo(() => {
    if (!viewer) return 0;
    const judged = new Set(refs.map((r) => r.ref.toUpperCase()));
    return viewer.parts.filter((p) => p.dnp && !judged.has(p.refDes.toUpperCase())).length;
  }, [viewer, refs]);
  const switcher = can3D ? <ModeSwitch mode={mode} onChange={setMode} /> : null;

  if (!viewer || !can3D) return <PlacementFilm refs={refs} board={board} art={art} bodies={bodies} mask={mask} counts={counts} tools={switcher} />;

  const bottoms = refs.filter((r) => r.x !== null && r.y !== null && (r.side ?? "").toUpperCase() === "BOTTOM").length;
  const label = `The board in 3D, part by part: ${ORDER.filter((s) => counts[s])
    .map((s) => `${counts[s]} ${STATUS[s].label.toLowerCase()}`)
    .join(", ")}`;
  // The 3D board stays mounted (hidden) while the 2D film shows: switching back keeps its scene and its board pictures.
  return (
    <div>
      {mode === "2D" ? <PlacementFilm refs={refs} board={board} art={art} bodies={bodies} mask={mask} counts={counts} tools={switcher} /> : null}
      <figure className={cn("overflow-hidden rounded-xl border bg-card", mode === "2D" && "hidden")} aria-label={label}>
        <figcaption className="flex items-center gap-2 px-5 pt-4 text-sm font-semibold">
          <CircuitBoard className="size-4 text-primary" aria-hidden /> The board, part by part
          <span className="ml-auto font-normal">{switcher}</span>
        </figcaption>
        <div className="px-2 pt-3 sm:px-5">
          <FootprintStudio data={viewer} refs={refs} plan={plan} onIntro={setPhase} onFail={fail} />
        </div>

        {plan.feeder.length ? (
          <div className="mx-3 mt-3 rounded-lg border border-dashed border-risk-red/50 px-3 py-2 sm:mx-5">
            <div className="flex items-center gap-1.5 text-xs font-medium text-risk-red">
              <LegendGlyph s="not-on-board" /> In the BoM · no place on the board
            </div>
            <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="BoM designators not on the board">
              {plan.feeder.slice(0, 40).map((t) => (
                <li
                  key={t.ref}
                  data-on={phase !== "wait"}
                  style={phase === "start" ? { transitionDelay: `${t.at}s` } : undefined}
                  className="num rounded border px-1.5 py-0.5 text-xs transition-colors duration-300 motion-reduce:transition-none data-[on=true]:border-risk-red data-[on=true]:text-risk-red"
                >
                  {t.ref}
                </li>
              ))}
              {plan.feeder.length > 40 ? <li className="px-1 py-0.5 text-xs text-muted-foreground">+{fmt(plan.feeder.length - 40)}</li> : null}
            </ul>
          </div>
        ) : null}

        <FilmLegend counts={counts} bottoms={bottoms} bottomNote={bottoms ? "flip the board to see them" : undefined} flip dnp={dnp} />
      </figure>
    </div>
  );
}
