"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CircuitBoard, Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import type { MatchStatus, RefResult } from "@/lib/board/footprint-match";
import { FINAL, LIFT_SCALE, buildFilm, cameraAt, doneBy, extent, filmFrame, fxAt, headAt, padsPath, type Film, type FilmPart, type Geo, type PartBody, type PartFx } from "@/lib/board/placement-film";
import { MASK } from "@/components/viz/board-iso";
import { STATUS } from "@/components/bom/footprint-status";
import { cn } from "@/lib/utils";

/** The Gerber drawing of the top side and where it sits in the placements' own frame (mm). */
export type BoardArt = { href: string; box: { x: number; y: number; w: number; h: number } };

const PAD = "#c9a54c";
const METAL = "#d4d6da";
const SILK = "#f1efe6";

const BEFORE: PartFx = { chip: 0, lift: 1, scale: 1, wobble: 0, glow: 0, tick: 0, ring: 0, ringS: 1, burst: -1, mark: 0 };
/** How strongly each result's final mark is drawn. */
const MARK: Record<MatchStatus, number> = { match: 0.7, check: 0, mismatch: 1, "not-in-bom": 0.85, "not-on-board": 0 };

/** Six shards of the body and six sparks, where each flies when the part bursts. */
function shards(g: Geo) {
  const out: { x: number; y: number; w: number; h: number; dx: number; dy: number; r: number }[] = [];
  for (let a = 0; a < 3; a++)
    for (let b = 0; b < 2; b++) {
      const x = -g.l / 2 + (a * g.l) / 3;
      const y = -g.w / 2 + (b * g.w) / 2;
      const cx = x + g.l / 6;
      const cy = y + g.w / 4;
      const d = Math.hypot(cx, cy) || 1;
      const k = 1.4 + ((a * 7 + b * 3) % 5) * 0.25;
      out.push({ x, y, w: g.l / 3, h: g.w / 2, dx: (cx / d) * Math.max(g.l, g.w) * k, dy: (cy / d) * Math.max(g.l, g.w) * k, r: (a - 1) * 140 + (b ? 80 : -110) });
    }
  return out;
}
const SPARKS = Array.from({ length: 7 }, (_, k) => {
  const a = (k / 7) * Math.PI * 2 + 0.4;
  return { dx: Math.cos(a), dy: Math.sin(a), d: 2.2 + (k % 3) * 0.5 };
});

/** A part's body from above, in its own frame. */
function Body({ g, color, bottom, sw }: { g: Geo; color: string; bottom: boolean; sw: number }) {
  const { l, w, kind } = g;
  const r = Math.min(l, w) * 0.1;
  if (bottom) return <rect x={-l / 2} y={-w / 2} width={l} height={w} rx={r} fill={color} fillOpacity="0.3" stroke={SILK} strokeOpacity="0.75" strokeWidth={sw} strokeDasharray={`${sw * 3} ${sw * 2}`} />;
  if (kind === "chip") {
    const cap = l * 0.2;
    return (
      <>
        <rect x={-l / 2} y={-w / 2} width={l} height={w} rx={r * 0.6} fill={color} />
        <rect x={-l / 2} y={-w / 2} width={cap} height={w} rx={r * 0.6} fill={METAL} />
        <rect x={l / 2 - cap} y={-w / 2} width={cap} height={w} rx={r * 0.6} fill={METAL} />
        <rect x={-l / 2} y={-w / 2} width={l} height={w * 0.32} fill="#fff" opacity="0.1" />
      </>
    );
  }
  const leads = kind === "ic" || kind === "tht" || kind === "module";
  const shrink = { ...g, pads: g.pads.map(([cx, cy, pw, ph, round]) => [cx, cy, pw * 0.72, ph * 0.72, round] as Geo["pads"][number]) };
  const silver = kind === "module" || kind === "can";
  return (
    <>
      {leads ? <path d={padsPath(shrink)} fill={METAL} /> : null}
      <rect x={-l / 2} y={-w / 2} width={l} height={w} rx={silver ? r * 1.4 : r * 0.5} fill={color} stroke="#fff" strokeOpacity="0.14" strokeWidth={sw} />
      {silver ? <rect x={-l / 2 + l * 0.08} y={-w / 2 + w * 0.1} width={l * 0.84} height={w * 0.8} rx={r} fill="none" stroke="#000" strokeOpacity="0.18" strokeWidth={sw} /> : null}
      <rect x={-l / 2} y={-w / 2} width={l} height={w * 0.3} rx={r * 0.5} fill="#fff" opacity={silver ? 0.18 : 0.06} />
      {kind === "ic" || kind === "leadless" || kind === "array" ? <circle cx={-l / 2 + Math.min(l, w) * 0.17} cy={-w / 2 + Math.min(l, w) * 0.17} r={Math.min(l, w) * 0.07} fill="#fff" opacity="0.4" /> : null}
    </>
  );
}

/** Size of a part's effects (glow, ring, tick, ✕): from its pads, never smaller than a readable mark. */
const reach = (p: FilmPart, f: Film) => {
  const e = extent(p.pads);
  return Math.max(Math.hypot(e.hx, e.hy), f.head * 0.18);
};
/** Half size of a mismatch's ✕: as big as the pads, and big enough to read on a tiny chip. */
const cross = (p: FilmPart, f: Film) => {
  const e = extent(p.pads);
  return Math.max(Math.min(e.hx, e.hy) * 0.8, f.head * 0.2);
};

const PartG = memo(function PartG({ p, f, uid, art }: { p: FilmPart; f: Film; uid: string; art: boolean }) {
  const e = extent(p.pads);
  const R = reach(p, f);
  const sw = Math.max(0.03, Math.min(f.w, f.h) / 420);
  const o = sw * 2.5;
  const S = STATUS[p.status];
  const tick = R * 0.42;
  const X = cross(p, f);
  const hit = Math.max(e.hx, e.hy, f.head * 0.22);
  return (
    <g data-i={p.i} transform={`translate(${p.x} ${p.y})`}>
      <g transform={`rotate(${p.rot})`}>
        {!art && !p.bottom ? <path d={padsPath(p.pads)} fill={PAD} /> : null}
        {p.status === "match" || p.status === "mismatch" || p.status === "not-in-bom" ? (
          <rect
            data-k="mark"
            x={-(p.status === "match" ? p.chip.l / 2 : e.hx) - o}
            y={-(p.status === "match" ? p.chip.w / 2 : e.hy) - o}
            width={(p.status === "match" ? p.chip.l : e.hx * 2) + o * 2}
            height={(p.status === "match" ? p.chip.w : e.hy * 2) + o * 2}
            rx={o}
            fill={p.status === "match" ? "none" : S.color}
            fillOpacity={p.status === "match" ? undefined : 0.12}
            stroke={S.color}
            strokeWidth={p.status === "match" ? sw * 1.2 : sw * 2}
            strokeDasharray={p.status === "match" ? undefined : p.status === "mismatch" ? `${sw * 5} ${sw * 3}` : `${sw * 1.5} ${sw * 3}`}
            strokeLinecap="round"
            opacity="0"
          />
        ) : null}
        {p.status === "check" ? (
          <rect data-k="ring" x={-e.hx - o * 2} y={-e.hy - o * 2} width={(e.hx + o * 2) * 2} height={(e.hy + o * 2) * 2} rx={Math.min(e.hx, e.hy) * 0.5 + o * 2} fill="none" stroke="var(--risk-amber)" strokeWidth={sw * 3} opacity="0" style={{ transformBox: "fill-box", transformOrigin: "center" }} />
        ) : null}
        {p.bottom ? null : <rect data-k="shadow" x={-p.chip.l / 2} y={-p.chip.w / 2} width={p.chip.l} height={p.chip.w} rx={Math.min(p.chip.l, p.chip.w) * 0.15} fill="#000" opacity="0" />}
        <use data-k="chip" href={`#${uid}-b${p.i}`} opacity="0" />
        {p.status === "mismatch" ? (
          <g data-k="burst" opacity="0">
            {shards(p.chip).map((s, k) => (
              <rect key={k} data-frag={`${s.dx} ${s.dy} ${s.r}`} x={s.x} y={s.y} width={s.w} height={s.h} fill={k % 2 ? p.color : "var(--risk-red)"} stroke={METAL} strokeWidth={sw * 0.6} style={{ transformBox: "fill-box", transformOrigin: "center" }} />
            ))}
            {SPARKS.map((s, k) => (
              <circle key={k} data-spark={`${s.dx * s.d * R} ${s.dy * s.d * R}`} r={R * 0.07} fill={k % 2 ? "var(--risk-amber)" : "var(--risk-red)"} />
            ))}
          </g>
        ) : null}
      </g>
      {p.status === "match" ? (
        <>
          <circle data-k="glow" r={R} fill={`url(#${uid}-glow)`} opacity="0" />
          <path data-k="tick" d={`M${-tick} ${-R - tick * 0.2}l${tick * 0.65} ${tick * 0.65}l${tick * 1.35} ${-tick * 1.35}`} fill="none" stroke="var(--risk-green)" strokeWidth={tick * 0.42} strokeLinecap="round" strokeLinejoin="round" opacity="0" />
        </>
      ) : null}
      {p.status === "mismatch" ? (
        <>
          <circle data-k="flash" r={R} fill={`url(#${uid}-flash)`} opacity="0" />
          <path data-k="x" d={`M${-X} ${-X}L${X} ${X}M${X} ${-X}L${-X} ${X}`} stroke="var(--risk-red)" strokeWidth={Math.max(sw * 3, X * 0.32)} strokeLinecap="round" opacity="0" />
        </>
      ) : null}
      <rect x={-hit} y={-hit} width={hit * 2} height={hit * 2} fill="transparent" pointerEvents="all" />
    </g>
  );
});

/** Everything that does not move: the board, its drawing, pads, silkscreen, and every part waiting in its place. */
const Stage = memo(function Stage({ f, uid, art, mask }: { f: Film; uid: string; art: string | null; mask: string }) {
  const rx = Math.min(f.w, f.h) / 40;
  const sw = Math.max(0.03, Math.min(f.w, f.h) / 420);
  return (
    <>
      {/* A soft shadow on the bench, from stacked rectangles: a blur filter would be redrawn on every camera move. */}
      {[0.06, 0.045, 0.03, 0.015].map((k, n) => (
        <rect key={n} x={f.w * 0.01 - Math.min(f.w, f.h) * k * 0.5} y={f.h * 0.02 - Math.min(f.w, f.h) * k * 0.5} width={f.w + Math.min(f.w, f.h) * k} height={f.h + Math.min(f.w, f.h) * k} rx={rx + Math.min(f.w, f.h) * k * 0.5} fill="#000" opacity="0.14" />
      ))}
      <rect width={f.w} height={f.h} rx={rx} fill={mask} />
      {art ? <image href={art} width={f.w} height={f.h} preserveAspectRatio="none" /> : null}
      <rect width={f.w} height={f.h} rx={rx} fill={`url(#${uid}-sheen)`} />
      <rect width={f.w} height={f.h} rx={rx} fill="none" stroke="#000" strokeOpacity="0.45" strokeWidth={sw * 2} />
      <rect x={sw * 2} y={sw * 2} width={f.w - sw * 4} height={f.h - sw * 4} rx={rx} fill="none" stroke="#fff" strokeOpacity="0.1" strokeWidth={sw} />
      {art ? null : (
        <g fill={SILK} fontSize={f.font} fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fontWeight="600" textAnchor="middle" dominantBaseline="central" opacity="0.82" aria-hidden>
          {f.parts.map((p) => (p.label ? <text key={p.ref} x={p.label.x} y={p.label.y}>{p.ref}</text> : null))}
        </g>
      )}
      {f.parts.map((p) => (
        <PartG key={p.ref} p={p} f={f} uid={uid} art={!!art} />
      ))}
    </>
  );
});

function Defs({ f, uid }: { f: Film; uid: string }) {
  const sw = Math.max(0.03, Math.min(f.w, f.h) / 420);
  return (
    <defs>
      <linearGradient id={`${uid}-sheen`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity="0.1" />
        <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity="0.18" />
      </linearGradient>
      <radialGradient id={`${uid}-glow`}>
        <stop offset="0.35" stopColor="var(--risk-green)" stopOpacity="0.75" />
        <stop offset="1" stopColor="var(--risk-green)" stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`${uid}-flash`}>
        <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
        <stop offset="0.25" stopColor="var(--risk-red)" stopOpacity="0.85" />
        <stop offset="1" stopColor="var(--risk-red)" stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`${uid}-vignette`} r="0.75">
        <stop offset="0.55" stopColor="var(--risk-red)" stopOpacity="0" />
        <stop offset="1" stopColor="var(--risk-red)" stopOpacity="0.4" />
      </radialGradient>
      <radialGradient id={`${uid}-hshadow`}>
        <stop offset="0" stopColor="#000" stopOpacity="0.5" />
        <stop offset="1" stopColor="#000" stopOpacity="0" />
      </radialGradient>
      <linearGradient id={`${uid}-metal`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#5d5f63" />
        <stop offset="0.5" stopColor="#3a3b3e" />
        <stop offset="1" stopColor="#26272a" />
      </linearGradient>
      {f.parts.map((p) => (
        <g key={p.ref} id={`${uid}-b${p.i}`}>
          <Body g={p.chip} color={p.color} bottom={p.bottom} sw={sw} />
        </g>
      ))}
    </defs>
  );
}

/** The placement head from above: a carriage on the gantry, the nozzle, and the part it carries. */
function HeadG({ f, uid }: { f: Film; uid: string }) {
  const S = f.head;
  return (
    <>
      <g data-k="beam" opacity="0">
        <rect x={-f.m * 4} y={-S * 1.22} width={f.w + f.m * 8} height={S * 0.5} fill={`url(#${uid}-metal)`} opacity="0.55" />
        <rect x={-f.m * 4} y={-S * 1.22} width={f.w + f.m * 8} height={S * 0.05} fill="#fff" opacity="0.25" />
      </g>
      <g data-k="head" opacity="0" transform={`translate(${f.park.x} ${f.park.y})`}>
        <ellipse cx={S * 0.3} cy={-S * 0.55} rx={S * 1.05} ry={S * 1.05} fill={`url(#${uid}-hshadow)`} />
        <g data-k="pshadow" opacity="0">
          <rect data-k="pshape" fill="#000" opacity="0.4" />
        </g>
        <g data-k="carriage">
          <rect x={-S * 0.17} y={-S * 0.62} width={S * 0.34} height={S * 0.5} fill="#2a2b2e" />
          <rect x={-S * 0.8} y={-S * 1.7} width={S * 1.6} height={S * 1.15} rx={S * 0.2} fill={`url(#${uid}-metal)`} stroke="#8d9096" strokeWidth={S * 0.03} />
          <rect x={-S * 0.62} y={-S * 1.55} width={S * 0.8} height={S * 0.12} rx={S * 0.06} fill="#fff" opacity="0.18" />
          <circle data-k="led" cx={S * 0.52} cy={-S * 1.47} r={S * 0.09} fill="var(--muted-foreground)" />
        </g>
        <use data-k="payload" href={`#${uid}-b0`} opacity="0" />
        <circle r={S * 0.17} fill="#fff" fillOpacity="0.08" stroke="#e9eaec" strokeOpacity="0.9" strokeWidth={S * 0.045} />
        <path d={`M${-S * 0.32} 0h${S * 0.12}M${S * 0.2} 0h${S * 0.12}M0 ${-S * 0.32}v${S * 0.12}M0 ${S * 0.2}v${S * 0.12}`} stroke="#e9eaec" strokeOpacity="0.7" strokeWidth={S * 0.03} />
      </g>
    </>
  );
}

type Handles = { root: SVGGElement; el: Record<string, SVGElement | undefined>; frags: { el: SVGElement; dx: number; dy: number; r: number }[]; sparks: { el: SVGElement; dx: number; dy: number }[]; state: number };

const STATUS_ORDER: MatchStatus[] = ["match", "check", "mismatch", "not-in-bom", "not-on-board"];

function LegendGlyph({ s }: { s: MatchStatus }) {
  const c = STATUS[s].color;
  return (
    <svg viewBox="0 0 16 16" className="size-4 shrink-0" aria-hidden>
      {s === "match" ? (
        <>
          <rect x="3" y="5" width="10" height="6" rx="1" fill="#2a2a2a" stroke={c} strokeWidth="1.2" />
          <rect x="3" y="5" width="2" height="6" fill={METAL} />
          <rect x="11" y="5" width="2" height="6" fill={METAL} />
        </>
      ) : s === "check" ? (
        <>
          <circle cx="8" cy="8" r="6.2" fill="none" stroke={c} strokeWidth="1.6" />
          <rect x="4.5" y="6" width="7" height="4" rx="0.8" fill="#b89466" />
        </>
      ) : s === "mismatch" ? (
        <>
          <rect x="2" y="3" width="12" height="10" rx="1.5" fill={c} fillOpacity="0.15" stroke={c} strokeWidth="1.2" strokeDasharray="2.4 1.4" />
          <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke={c} strokeWidth="1.6" strokeLinecap="round" />
        </>
      ) : s === "not-in-bom" ? (
        <>
          <rect x="2" y="3" width="12" height="10" rx="1.5" fill={c} fillOpacity="0.12" stroke={c} strokeWidth="1.2" strokeDasharray="0.8 1.6" strokeLinecap="round" />
          <rect x="3.5" y="6" width="3" height="4" fill={PAD} />
          <rect x="9.5" y="6" width="3" height="4" fill={PAD} />
        </>
      ) : (
        <>
          <rect x="3" y="5" width="10" height="6" rx="1" fill="#2a2a2a" opacity="0.6" />
          <rect x="1.5" y="3.5" width="13" height="9" rx="1.5" fill="none" stroke={c} strokeWidth="1.2" strokeDasharray="2.4 1.4" />
        </>
      )}
    </svg>
  );
}

const fmt = (n: number) => n.toLocaleString("en-IN");

/**
 * Step 4's board as a short film (Phase 24): the head places every designator in turn; parts whose footprint matches
 * settle with a green tick, a mismatch bursts above its pads, parts nobody can place are left as dashed outlines.
 * Plays once when scrolled into view (about 6–12 s whatever the part count); reduced motion shows the end at once.
 * The tables below the board are the text alternative.
 */
export function PlacementFilm({ refs, board, art, bodies, mask, counts }: { refs: RefResult[]; board: { widthMm: number; heightMm: number } | null; art: BoardArt | null; bodies?: Record<string, PartBody>; mask?: string | null; counts: Record<MatchStatus, number> }) {
  const frame = useMemo(() => filmFrame(refs, board, art?.box ?? null), [refs, board, art]);
  // SVG ids from the data, not useId: the same on server and client even if the tree above differs.
  const uid = useMemo(() => {
    let h = 5381;
    for (const r of refs) for (let k = 0; k < r.ref.length; k++) h = ((h * 33) ^ r.ref.charCodeAt(k)) >>> 0;
    return `pf${h.toString(36)}`;
  }, [refs]);
  const film = useMemo(() => (frame ? buildFilm({ refs, frame, bodies, art: frame.real }) : null), [refs, frame, bodies]);
  const byRef = useMemo(() => new Map(refs.map((r) => [r.ref, r])), [refs]);
  const svgRef = useRef<SVGSVGElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);
  const trayRef = useRef<HTMLUListElement>(null);
  const tRef = useRef(0);
  const rafRef = useRef(0);
  const handles = useRef<Handles[]>([]);
  const statics = useRef<{ tray: HTMLElement[]; el: Record<string, Element | undefined> }>({ tray: [], el: {} });
  const bursts = useMemo(() => film?.parts.filter((p) => p.status === "mismatch") ?? [], [film]);
  const carried = useRef(-2);
  const [mode, setModeState] = useState<"ready" | "playing" | "paused" | "done">("ready");
  // The observer and the frame loop read the mode outside React's render.
  const modeRef = useRef(mode);
  const setMode = useCallback((m: typeof mode) => {
    modeRef.current = m;
    setModeState(m);
  }, []);
  const [tip, setTip] = useState<{ i: number; x: number; y: number; sw: number; sh: number; pinned: boolean } | null>(null);

  const draw = useCallback(
    (t: number) => {
      const f = film;
      const svg = svgRef.current;
      if (!f || !svg) return;
      const S = f.head;
      for (const p of f.parts) {
        const h = handles.current[p.i];
        if (!h) continue;
        const fx = fxAt(f, p, t);
        const st = fx === "before" ? 0 : fx === "after" ? 2 : 1;
        if (st !== 1 && h.state === st) continue;
        h.state = st;
        const v = fx === "before" ? BEFORE : fx === "after" ? FINAL[p.status] : fx;
        const { el } = h;
        const s = v.scale * (1 + LIFT_SCALE * v.lift);
        el.chip?.setAttribute("opacity", String(v.chip));
        el.chip?.setAttribute("transform", `rotate(${v.wobble.toFixed(2)}) scale(${s.toFixed(4)})`);
        if (el.shadow) {
          // The shadow falls down-right in the board's frame, whatever way the part is turned.
          const off = Math.min(p.chip.l, p.chip.w) * 0.12 + v.lift * S * 0.28;
          const a = (-p.rot * Math.PI) / 180;
          const ox = off * Math.cos(a) - off * Math.sin(a);
          const oy = off * Math.sin(a) + off * Math.cos(a);
          el.shadow.setAttribute("opacity", String(v.chip * (0.32 - 0.1 * v.lift)));
          el.shadow.setAttribute("transform", `translate(${ox.toFixed(3)} ${oy.toFixed(3)}) scale(${s.toFixed(4)})`);
        }
        el.mark?.setAttribute("opacity", String(v.mark * MARK[p.status]));
        el.x?.setAttribute("opacity", String(v.mark));
        const R = reach(p, f);
        if (el.glow) {
          el.glow.setAttribute("opacity", String(v.glow));
          el.glow.setAttribute("r", String(R * (1.1 + (1 - v.glow) * 0.9)));
        }
        el.tick?.setAttribute("opacity", String(v.tick));
        if (el.ring) {
          // Small parts pulse wide enough to see; big ones only a little.
          const e = extent(p.pads);
          const k = Math.min(1, (S * 0.45) / Math.max(e.hx, e.hy));
          el.ring.setAttribute("opacity", String(v.ring));
          el.ring.setAttribute("transform", `scale(${(1 + (v.ringS - 1) * k).toFixed(4)})`);
        }
        if (el.burst) {
          const b = v.burst;
          if (b < 0) {
            el.burst.setAttribute("opacity", "0");
            el.flash?.setAttribute("opacity", "0");
          } else {
            const e = 1 - (1 - b) * (1 - b);
            el.burst.setAttribute("opacity", String(Math.pow(1 - b, 0.8)));
            for (const fr of h.frags) fr.el.setAttribute("transform", `translate(${(fr.dx * e).toFixed(3)} ${(fr.dy * e).toFixed(3)}) rotate(${(fr.r * e).toFixed(1)}) scale(${(1 - 0.45 * e).toFixed(3)})`);
            for (const sp of h.sparks) sp.el.setAttribute("transform", `translate(${(sp.dx * e).toFixed(3)} ${(sp.dy * e).toFixed(3)})`);
            el.flash?.setAttribute("opacity", String(Math.max(0, 1 - b * 1.6)));
            el.flash?.setAttribute("r", String(R * (0.6 + 2.6 * e)));
          }
        }
      }

      // The head, the gantry it rides on, and what it carries.
      const hd = headAt(f, t);
      const { el: q, tray } = statics.current;
      const { head, beam } = q;
      head?.setAttribute("transform", `translate(${hd.x.toFixed(3)} ${hd.y.toFixed(3)})`);
      head?.setAttribute("opacity", String(hd.opacity));
      beam?.setAttribute("transform", `translate(0 ${hd.y.toFixed(3)})`);
      beam?.setAttribute("opacity", String(hd.opacity));
      q.carriage?.setAttribute("transform", `scale(${(1 - 0.05 * hd.press).toFixed(3)})`);
      q.led?.setAttribute("fill", hd.part >= 0 ? STATUS[f.parts[hd.part].status].color : "var(--muted-foreground)");
      if (carried.current !== hd.carrying) {
        carried.current = hd.carrying;
        const { payload, pshadow: ps, pshape: shape } = q;
        if (hd.carrying >= 0) {
          const p = f.parts[hd.carrying];
          payload?.setAttribute("href", `#${uid}-b${p.i}`);
          payload?.setAttribute("transform", `rotate(${p.rot}) scale(${1 + LIFT_SCALE})`);
          payload?.setAttribute("opacity", "1");
          ps?.setAttribute("opacity", "1");
          ps?.setAttribute("transform", `translate(${S * 0.28} ${S * 0.28}) rotate(${p.rot}) scale(${1 + LIFT_SCALE})`);
          shape?.setAttribute("x", String(-p.chip.l / 2));
          shape?.setAttribute("y", String(-p.chip.w / 2));
          shape?.setAttribute("width", String(p.chip.l));
          shape?.setAttribute("height", String(p.chip.w));
        } else {
          payload?.setAttribute("opacity", "0");
          ps?.setAttribute("opacity", "0");
        }
      }

      // Camera, and a red pulse round the frame when a part bursts.
      const cam = cameraAt(f, t);
      const world = `translate(${f.w / 2} ${f.h / 2}) scale(${cam.z.toFixed(4)}) translate(${(-cam.cx).toFixed(3)} ${(-cam.cy).toFixed(3)})`;
      if (q.world && q.world.getAttribute("transform") !== world) q.world.setAttribute("transform", world);
      let flash = 0;
      for (const p of bursts) {
        const d = t - (p.arrive + p.hover);
        if (d >= 0 && d < 0.6) flash = Math.max(flash, 1 - d / 0.6);
      }
      q.vignette?.setAttribute("opacity", flash.toFixed(3));

      if (barRef.current) barRef.current.style.transform = `scaleX(${Math.min(1, t / f.duration).toFixed(4)})`;
      if (countRef.current) countRef.current.textContent = `${fmt(doneBy(f, t))} / ${fmt(f.parts.length)}`;
      for (const li of tray) {
        const on = String(t >= Number(li.dataset.at));
        if (li.dataset.on !== on) li.dataset.on = on;
      }
    },
    [film, uid, bursts],
  );

  // Find every part's moving pieces once.
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg || !film) return;
    handles.current = [];
    const one = (k: string) => svg.querySelector(`[data-k=${k}]`) ?? undefined;
    statics.current = {
      tray: [...(trayRef.current?.querySelectorAll<HTMLElement>("[data-at]") ?? [])],
      el: Object.fromEntries(["head", "beam", "carriage", "led", "payload", "pshadow", "pshape", "world", "vignette"].map((k) => [k, one(k)])),
    };
    svg.querySelectorAll<SVGGElement>("[data-i]").forEach((root) => {
      const el: Handles["el"] = {};
      root.querySelectorAll<SVGElement>("[data-k]").forEach((n) => (el[n.dataset.k as string] = n));
      const frags = [...root.querySelectorAll<SVGElement>("[data-frag]")].map((n) => {
        const [dx, dy, r] = (n.dataset.frag ?? "0 0 0").split(" ").map(Number);
        return { el: n, dx, dy, r };
      });
      const sparks = [...root.querySelectorAll<SVGElement>("[data-spark]")].map((n) => {
        const [dx, dy] = (n.dataset.spark ?? "0 0").split(" ").map(Number);
        return { el: n, dx, dy };
      });
      handles.current[Number(root.dataset.i)] = { root, el, frags, sparks, state: -1 };
    });
    carried.current = -2;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    tRef.current = reduced ? film.duration : 0;
    draw(tRef.current);
    setMode(reduced ? "done" : "ready");
  }, [film, draw, setMode]);

  const stop = () => cancelAnimationFrame(rafRef.current);

  const play = useCallback(() => {
    if (!film) return;
    stop();
    if (tRef.current >= film.duration) tRef.current = 0;
    setMode("playing");
    let last = performance.now();
    const step = (now: number) => {
      // A hidden tab pauses frames: carry on where it stopped rather than jumping ahead.
      tRef.current = Math.min(film.duration, tRef.current + Math.min(0.1, (now - last) / 1000));
      last = now;
      draw(tRef.current);
      if (tRef.current >= film.duration) {
        setMode("done");
        return;
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }, [film, draw, setMode]);

  const pause = () => {
    stop();
    setMode("paused");
  };
  const skip = () => {
    if (!film) return;
    stop();
    tRef.current = film.duration;
    draw(film.duration);
    setMode("done");
  };
  const replay = () => {
    tRef.current = 0;
    play();
  };

  // Plays once, the first time the board is well in view.
  useEffect(() => {
    const node = stageRef.current;
    if (!node || !film) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && modeRef.current === "ready") {
          io.disconnect();
          play();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(node);
    return () => {
      io.disconnect();
      stop();
    };
  }, [film, play]);

  if (!film) return null;
  const vb = `${-film.m} ${-film.m} ${film.w + film.m * 2} ${film.h + film.m * 2}`;
  const bottoms = film.parts.filter((p) => p.bottom).length;
  const tray = film.tray;
  const label = `The board, part by part: ${STATUS_ORDER.filter((s) => counts[s]).map((s) => `${counts[s]} ${STATUS[s].label.toLowerCase()}`).join(", ")}`;

  const partAt = (target: EventTarget | null) => {
    const g = (target as Element | null)?.closest?.("[data-i]");
    return g ? Number(g.getAttribute("data-i")) : -1;
  };
  const place = (e: React.PointerEvent | React.MouseEvent) => {
    const r = stageRef.current?.getBoundingClientRect();
    return r ? { x: e.clientX - r.left, y: e.clientY - r.top, sw: r.width, sh: r.height } : { x: 0, y: 0, sw: 0, sh: 0 };
  };
  const tipPart = tip ? film.parts[tip.i] : null;
  const tipRef = tipPart ? byRef.get(tipPart.ref) : null;

  const btn = "inline-flex size-10 items-center justify-center rounded-full text-foreground outline-none transition-colors duration-150 hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40";

  return (
    <figure className="dark overflow-hidden rounded-xl border border-border text-foreground" style={{ background: "radial-gradient(120% 90% at 50% 35%, var(--muted), var(--background))" }}>
      <figcaption className="flex items-center gap-2 px-5 pt-4 text-sm font-semibold">
        <CircuitBoard className="size-4 text-risk-green" aria-hidden /> The board, part by part
      </figcaption>
      <div ref={stageRef} className="relative px-2 pt-2 sm:px-5">
        <svg
          ref={svgRef}
          viewBox={vb}
          className="mx-auto block h-auto max-h-[min(62vh,520px)] w-full touch-manipulation select-none"
          role="img"
          aria-label={label}
          onPointerMove={(e) => {
            if (tip?.pinned) return;
            const i = partAt(e.target);
            if (i < 0) return setTip(null);
            if (tip?.i !== i) setTip({ i, ...place(e), pinned: false });
          }}
          onPointerLeave={() => {
            if (!tip?.pinned) setTip(null);
          }}
          onClick={(e) => {
            const i = partAt(e.target);
            setTip(i < 0 || (tip?.pinned && tip.i === i) ? null : { i, ...place(e), pinned: true });
          }}
        >
          <Defs f={film} uid={uid} />
          <clipPath id={`${uid}-clip`}>
            <rect x={-film.m} y={-film.m} width={film.w + film.m * 2} height={film.h + film.m * 2} />
          </clipPath>
          <g clipPath={`url(#${uid}-clip)`}>
            <g data-k="world">
              <Stage f={film} uid={uid} art={frame?.real && art ? art.href : null} mask={MASK[mask ?? "green"] ?? MASK.green} />
              <HeadG f={film} uid={uid} />
            </g>
          </g>
          <rect data-k="vignette" x={-film.m} y={-film.m} width={film.w + film.m * 2} height={film.h + film.m * 2} fill={`url(#${uid}-vignette)`} opacity="0" pointerEvents="none" />
        </svg>
        {tipPart && tipRef ? (
          <div
            role="status"
            className="pointer-events-none absolute z-10 w-60 rounded-lg border border-border bg-card/95 p-3 text-xs shadow-lg backdrop-blur-sm"
            style={{ left: Math.max(8, Math.min(tip!.x + 14, tip!.sw - 248)), top: tip!.y + 14 + 140 > tip!.sh ? Math.max(8, tip!.y - 150) : tip!.y + 14 }}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="num text-sm font-semibold">{tipRef.ref}</span>
              <span className={cn("inline-flex items-center gap-1 font-medium", STATUS[tipRef.status].text)}>
                {(() => {
                  const I = STATUS[tipRef.status].icon;
                  return <I className="size-3.5" aria-hidden />;
                })()}
                {STATUS[tipRef.status].label}
              </span>
            </div>
            {tipRef.mpn ? <div className="num mt-1 truncate">{tipRef.lineNo ? <span className="text-muted-foreground">L{tipRef.lineNo} </span> : null}{tipRef.mpn}</div> : null}
            <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
              <dt className="text-muted-foreground">BoM</dt>
              <dd className="num truncate">{tipRef.bomPkg ?? "—"}</dd>
              <dt className="text-muted-foreground">Board</dt>
              <dd className="num truncate">{tipRef.footprint ?? "—"}</dd>
            </dl>
            {tipRef.status !== "match" ? <p className="mt-1.5 text-muted-foreground">{tipRef.why}</p> : null}
            {tipPart.bottom ? <p className="mt-1 text-muted-foreground">Bottom side</p> : null}
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-1 px-3 pt-1 sm:px-5">
        {mode === "playing" ? (
          <button type="button" className={btn} onClick={pause} aria-label="Pause" title="Pause">
            <Pause className="size-4" aria-hidden />
          </button>
        ) : (
          <button type="button" className={btn} onClick={mode === "done" ? replay : play} aria-label={mode === "done" ? "Play again" : "Play"} title={mode === "done" ? "Play again" : "Play"}>
            <Play className="size-4" aria-hidden />
          </button>
        )}
        <button type="button" className={btn} onClick={replay} aria-label="Replay from the start" title="Replay">
          <RotateCcw className="size-4" aria-hidden />
        </button>
        <button type="button" className={btn} onClick={skip} disabled={mode === "done"} aria-label="Skip to the end" title="Skip to the end">
          <SkipForward className="size-4" aria-hidden />
        </button>
        <div className="mx-2 h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-foreground/15" aria-hidden>
          <div ref={barRef} className="h-full origin-left rounded-full bg-risk-green" style={{ transform: "scaleX(0)" }} />
        </div>
        <span ref={countRef} className="num shrink-0 text-xs text-muted-foreground tabular-nums" aria-hidden>
          0 / {fmt(film.parts.length)}
        </span>
      </div>

      {tray.length ? (
        <div className="mx-3 mt-3 rounded-lg border border-dashed border-risk-red/50 px-3 py-2 sm:mx-5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-risk-red">
            <LegendGlyph s="not-on-board" /> Left in the feeder · no place on the board
          </div>
          <ul ref={trayRef} className="mt-1.5 flex flex-wrap gap-1.5" aria-label="BoM designators not on the board">
            {tray.slice(0, 40).map((t) => (
              <li key={t.ref} data-at={t.at} data-on="false" className="num rounded border border-border px-1.5 py-0.5 text-xs transition-colors duration-300 data-[on=true]:border-risk-red data-[on=true]:text-risk-red">
                {t.ref}
              </li>
            ))}
            {tray.length > 40 ? <li className="px-1 py-0.5 text-xs text-muted-foreground">+{fmt(tray.length - 40)}</li> : null}
          </ul>
        </div>
      ) : null}

      <ul className="flex flex-wrap gap-x-4 gap-y-2 px-5 pt-3 pb-4 text-xs" aria-label="Legend">
        {STATUS_ORDER.map((s) => (
          <li key={s} className={cn("inline-flex items-center gap-1.5", !counts[s] && "opacity-45")}>
            <LegendGlyph s={s} />
            <span>{STATUS[s].label}</span>
            <span className="num font-semibold tabular-nums">{fmt(counts[s])}</span>
          </li>
        ))}
        {bottoms ? (
          <li className="inline-flex items-center gap-1.5 text-muted-foreground">
            <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
              <rect x="3" y="5" width="10" height="6" rx="1" fill="none" stroke={SILK} strokeWidth="1.1" strokeDasharray="2 1.3" />
            </svg>
            Bottom side <span className="num tabular-nums">{fmt(bottoms)}</span>
          </li>
        ) : null}
      </ul>
    </figure>
  );
}
