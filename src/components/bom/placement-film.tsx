"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CircuitBoard } from "lucide-react";
import type { MatchStatus, RefResult } from "@/lib/board/footprint-match";
import { BEFORE, FINAL, LIFT_SCALE, buildFilm, extent, filmFrame, fxAt, padsPath, type Film, type FilmPart, type Geo, type PartBody } from "@/lib/board/placement-film";
import { MASK } from "@/components/viz/board-iso";
import { OCHRE, STATUS } from "@/components/bom/footprint-status";
import { cn } from "@/lib/utils";

/** The Gerber drawing of the top side and where it sits in the placements' own frame (mm). */
export type BoardArt = { href: string; box: { x: number; y: number; w: number; h: number } };

const PAD = "#c9a54c";
const METAL = "#d4d6da";
const SILK = "#f1efe6";

/**
 * Mismatches blink at a calm 1 Hz for as long as the page is open; with reduced motion they are steady red.
 * Kept here, next to the only thing that uses it.
 */
const BLINK_CSS = `@keyframes pf-blink{0%,100%{opacity:1}50%{opacity:.18}}@media (prefers-reduced-motion:no-preference){.pf-blink{animation:pf-blink 1s ease-in-out infinite}}`;

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

const lineW = (f: Film) => Math.max(0.03, Math.min(f.w, f.h) / 420);

/** The outline a result leaves round its part, sized to cover both the pads and the body that landed. */
function Mark({ p, f }: { p: FilmPart; f: Film }) {
  const sw = lineW(f);
  const e = extent(p.pads);
  const hx = p.status === "not-in-bom" ? e.hx : Math.max(e.hx, p.chip.l / 2);
  const hy = p.status === "not-in-bom" ? e.hy : Math.max(e.hy, p.chip.w / 2);
  // Never so small it cannot be seen.
  const o = Math.max(sw * 2.5, f.mark - Math.min(hx, hy));
  const box = { x: -hx - o, y: -hy - o, width: (hx + o) * 2, height: (hy + o) * 2, rx: Math.min(hx, hy) * 0.4 + o };
  if (p.status === "match") return <rect data-k="mark" {...box} fill="none" stroke="var(--risk-green)" strokeWidth={sw * 1.2} opacity="0" />;
  if (p.status === "check")
    return (
      <g data-k="mark" opacity="0">
        <rect {...box} fill="none" stroke={OCHRE} strokeOpacity="0.3" strokeWidth={sw * 7} />
        <rect {...box} fill="none" stroke="#000" strokeOpacity="0.45" strokeWidth={sw * 4.5} />
        <rect {...box} fill="none" stroke={OCHRE} strokeWidth={sw * 2.8} />
      </g>
    );
  if (p.status === "mismatch")
    return (
      <g data-k="mark" opacity="0">
        <rect {...box} fill="none" stroke="#000" strokeOpacity="0.45" strokeWidth={sw * 4.5} />
        <g className="pf-blink">
          <rect {...box} fill="var(--risk-red)" fillOpacity="0.38" stroke="var(--risk-red)" strokeWidth={sw * 2.8} />
        </g>
      </g>
    );
  return <rect data-k="mark" {...box} fill="var(--risk-red)" fillOpacity="0.12" stroke="var(--risk-red)" strokeWidth={sw * 2} strokeDasharray={`${sw * 0.1} ${sw * 3.2}`} strokeLinecap="round" opacity="0" />;
}

const PartG = memo(function PartG({ p, f, uid, art }: { p: FilmPart; f: Film; uid: string; art: boolean }) {
  const e = extent(p.pads);
  const R = Math.max(Math.hypot(e.hx, e.hy), f.mark);
  const hit = Math.max(e.hx, e.hy, f.mark * 1.2);
  return (
    <g data-i={p.i} transform={`translate(${p.x} ${p.y})`}>
      <g transform={`rotate(${p.rot})`}>
        {!art && !p.bottom ? <path d={padsPath(p.pads)} fill={PAD} /> : null}
        {p.bottom || p.status === "not-in-bom" ? null : <rect data-k="shadow" x={-p.chip.l / 2} y={-p.chip.w / 2} width={p.chip.l} height={p.chip.w} rx={Math.min(p.chip.l, p.chip.w) * 0.15} fill="#000" opacity="0" />}
      </g>
      {p.status === "not-in-bom" ? null : (
        <g data-k="fly" opacity="0">
          <use href={`#${uid}-b${p.i}`} transform={`rotate(${p.rot})`} />
        </g>
      )}
      <g transform={`rotate(${p.rot})`}>
        <Mark p={p} f={f} />
      </g>
      {p.status === "match" ? <circle data-k="glow" r={R * 1.3} fill={`url(#${uid}-glow)`} opacity="0" /> : null}
      <rect x={-hit} y={-hit} width={hit * 2} height={hit * 2} fill="transparent" pointerEvents="all" />
    </g>
  );
});

/** The board, its drawing, pads, silkscreen, and every part (hidden until it flies in). */
const Stage = memo(function Stage({ f, uid, art, mask }: { f: Film; uid: string; art: string | null; mask: string }) {
  const rx = Math.min(f.w, f.h) / 40;
  const sw = lineW(f);
  const s = Math.min(f.w, f.h);
  return (
    <>
      {[0.05, 0.035, 0.02].map((k, n) => (
        <rect key={n} x={f.w * 0.008 - s * k * 0.5} y={f.h * 0.016 - s * k * 0.5} width={f.w + s * k} height={f.h + s * k} rx={rx + s * k * 0.5} fill="#000" opacity="0.07" />
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
  const sw = lineW(f);
  return (
    <defs>
      <linearGradient id={`${uid}-sheen`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity="0.1" />
        <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity="0.18" />
      </linearGradient>
      <radialGradient id={`${uid}-glow`}>
        <stop offset="0.3" stopColor="var(--risk-green)" stopOpacity="0.7" />
        <stop offset="1" stopColor="var(--risk-green)" stopOpacity="0" />
      </radialGradient>
      {f.parts.map((p) => (
        <g key={p.ref} id={`${uid}-b${p.i}`}>
          <Body g={p.chip} color={p.color} bottom={p.bottom} sw={sw} />
        </g>
      ))}
    </defs>
  );
}

type Handles = { el: Record<string, SVGElement | undefined>; state: number };

const LEGEND: MatchStatus[] = ["match", "check", "mismatch", "not-in-bom", "not-on-board"];

function LegendGlyph({ s }: { s: MatchStatus }) {
  const c = STATUS[s].color;
  return (
    <svg viewBox="0 0 16 16" className="size-4 shrink-0" aria-hidden>
      {s === "match" || s === "check" || s === "mismatch" ? (
        <>
          <rect x="3" y="5" width="10" height="6" rx="1" fill="#2a2a2a" />
          <rect x="3" y="5" width="2" height="6" fill={METAL} />
          <rect x="11" y="5" width="2" height="6" fill={METAL} />
          <rect x="1.5" y="3.5" width="13" height="9" rx="2" fill={s === "mismatch" ? c : "none"} fillOpacity="0.3" stroke={c} strokeWidth={s === "match" ? 1.1 : 1.6} />
        </>
      ) : s === "not-in-bom" ? (
        <>
          <rect x="2" y="3" width="12" height="10" rx="1.5" fill={c} fillOpacity="0.12" stroke={c} strokeWidth="1.3" strokeDasharray="0.1 2.2" strokeLinecap="round" />
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
 * Step 4's board coming alive (Phase 24): when it scrolls into view, every part flies onto its pads in a quick sweep
 * (2–4 s), then stays. Matching parts settle with a green glow; a part whose footprint does not match blinks red;
 * "check by eye" is outlined ochre; parts with no BoM line leave bare pads in a dotted outline. Reduced motion: the
 * parts are simply there. The tables below the board are the text alternative.
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
  const trayRef = useRef<HTMLUListElement>(null);
  const rafRef = useRef(0);
  const handles = useRef<Handles[]>([]);
  const tray = useRef<HTMLElement[]>([]);
  /** Once the parts have flown in they stay: a refresh of the page data does not fly them again. */
  const played = useRef(false);
  const [tip, setTip] = useState<{ i: number; x: number; y: number; sw: number; sh: number; pinned: boolean } | null>(null);

  const draw = useCallback(
    (t: number) => {
      const f = film;
      if (!f) return;
      for (const p of f.parts) {
        const h = handles.current[p.i];
        if (!h) continue;
        const fx = fxAt(p, t);
        const st = fx === "before" ? 0 : fx === "after" ? 2 : 1;
        if (st !== 1 && h.state === st) continue;
        h.state = st;
        const v = fx === "before" ? BEFORE : fx === "after" ? FINAL[p.status] : fx;
        const { el } = h;
        const s = v.scale * (1 + LIFT_SCALE * v.lift);
        el.fly?.setAttribute("opacity", v.chip.toFixed(3));
        el.fly?.setAttribute("transform", `translate(${v.dx.toFixed(3)} ${v.dy.toFixed(3)}) rotate(${v.spin.toFixed(2)}) scale(${s.toFixed(4)})`);
        if (el.shadow) {
          // The shadow waits on the pads: wide and faint while the part is high, tight and dark as it lands.
          const off = Math.min(p.chip.l, p.chip.w) * 0.12;
          const a = (-p.rot * Math.PI) / 180;
          el.shadow.setAttribute("opacity", (v.chip * (0.34 - 0.24 * v.lift)).toFixed(3));
          el.shadow.setAttribute("transform", `translate(${(off * Math.cos(a) - off * Math.sin(a)).toFixed(3)} ${(off * Math.sin(a) + off * Math.cos(a)).toFixed(3)}) scale(${(1 + 0.5 * v.lift).toFixed(4)})`);
        }
        el.mark?.setAttribute("opacity", (v.mark * (p.status === "match" ? 0.7 : 1)).toFixed(3));
        el.glow?.setAttribute("opacity", v.glow.toFixed(3));
      }
      for (const li of tray.current) {
        const on = String(t >= Number(li.dataset.at));
        if (li.dataset.on !== on) li.dataset.on = on;
      }
    },
    [film],
  );

  const run = useCallback(() => {
    if (!film) return;
    cancelAnimationFrame(rafRef.current);
    played.current = true;
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(film.duration, (now - t0) / 1000);
      draw(t);
      if (t < film.duration) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }, [film, draw]);

  // Find every part's moving pieces once; reduced motion (or a board already shown) goes straight to the settled board.
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg || !film) return;
    handles.current = [];
    svg.querySelectorAll<SVGGElement>("[data-i]").forEach((root) => {
      const el: Handles["el"] = {};
      root.querySelectorAll<SVGElement>("[data-k]").forEach((n) => (el[n.dataset.k as string] = n));
      handles.current[Number(root.dataset.i)] = { el, state: -1 };
    });
    tray.current = [...(trayRef.current?.querySelectorAll<HTMLElement>("[data-at]") ?? [])];
    const still = played.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    draw(still ? film.duration : 0);
  }, [film, draw]);

  // Flies in once, the first time the board is well in view.
  useEffect(() => {
    const node = stageRef.current;
    if (!node || !film || played.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !played.current) {
          io.disconnect();
          run();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [film, run]);

  // Leaving the page mid-flight: stop, and the next visit shows the settled board.
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  if (!film) return null;
  const vb = `${-film.m} ${-film.m} ${film.w + film.m * 2} ${film.h + film.m * 2}`;
  const bottoms = film.parts.filter((p) => p.bottom).length;
  const label = `The board, part by part: ${LEGEND.filter((s) => counts[s]).map((s) => `${counts[s]} ${STATUS[s].label.toLowerCase()}`).join(", ")}`;

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

  return (
    <figure className="overflow-hidden rounded-xl border bg-card">
      <style>{BLINK_CSS}</style>
      <figcaption className="flex items-center gap-2 px-5 pt-4 text-sm font-semibold">
        <CircuitBoard className="size-4 text-primary" aria-hidden /> The board, part by part
      </figcaption>
      <div ref={stageRef} className="relative px-2 pt-3 sm:px-5">
        {/* The marks on the board use the bright (dark-theme) risk colours: the light ones vanish on green solder mask. */}
        <svg
          ref={svgRef}
          viewBox={vb}
          className="dark mx-auto block h-auto max-h-[min(62vh,520px)] w-full touch-manipulation select-none"
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
          <Stage f={film} uid={uid} art={frame?.real && art ? art.href : null} mask={MASK[mask ?? "green"] ?? MASK.green} />
        </svg>
        {tipPart && tipRef && tip ? (
          <div
            role="status"
            className="pointer-events-none absolute z-10 w-60 rounded-lg border bg-popover p-3 text-xs text-popover-foreground shadow-lg"
            style={{ left: Math.max(8, Math.min(tip.x + 14, tip.sw - 248)), top: tip.y + 14 + 140 > tip.sh ? Math.max(8, tip.y - 150) : tip.y + 14 }}
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
            {tipRef.mpn ? (
              <div className="num mt-1 truncate">
                {tipRef.lineNo ? <span className="text-muted-foreground">L{tipRef.lineNo} </span> : null}
                {tipRef.mpn}
              </div>
            ) : null}
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

      {film.tray.length ? (
        <div className="mx-3 mt-3 rounded-lg border border-dashed border-risk-red/50 px-3 py-2 sm:mx-5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-risk-red">
            <LegendGlyph s="not-on-board" /> In the BoM · no place on the board
          </div>
          <ul ref={trayRef} className="mt-1.5 flex flex-wrap gap-1.5" aria-label="BoM designators not on the board">
            {film.tray.slice(0, 40).map((t) => (
              <li key={t.ref} data-at={t.at} data-on="false" className="num rounded border px-1.5 py-0.5 text-xs transition-colors duration-300 data-[on=true]:border-risk-red data-[on=true]:text-risk-red">
                {t.ref}
              </li>
            ))}
            {film.tray.length > 40 ? <li className="px-1 py-0.5 text-xs text-muted-foreground">+{fmt(film.tray.length - 40)}</li> : null}
          </ul>
        </div>
      ) : null}

      <ul className="flex flex-wrap gap-x-4 gap-y-2 px-5 pt-3 pb-4 text-xs" aria-label="Legend">
        {LEGEND.map((s) => (
          <li key={s} className={cn("inline-flex items-center gap-1.5", !counts[s] && "opacity-45")}>
            <LegendGlyph s={s} />
            <span>{STATUS[s].label}</span>
            <span className="num font-semibold tabular-nums">{fmt(counts[s])}</span>
          </li>
        ))}
        {bottoms ? (
          <li className="inline-flex items-center gap-1.5 text-muted-foreground">
            <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
              <rect x="3" y="5" width="10" height="6" rx="1" fill="none" stroke="currentColor" strokeWidth="1.1" strokeDasharray="2 1.3" />
            </svg>
            Bottom side <span className="num tabular-nums">{fmt(bottoms)}</span>
          </li>
        ) : null}
      </ul>
    </figure>
  );
}
