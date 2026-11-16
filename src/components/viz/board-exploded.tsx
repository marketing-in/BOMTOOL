import { useId } from "react";
import type { BoardStack, StackSheet } from "@/server/board-thumb";
import { bounds, corners, depth, planeMatrix, project, shade, wallPoints, walls } from "@/lib/board/iso";
import { cn } from "@/lib/utils";
import { FR4, IsoDefs, IsoPartShape, MASK } from "./board-iso";

const LAMINATE = "#e6d9a8";
const COPPER = "#b87333";

/** One sheet of the stack: its edge, its face, and the layer drawings laid on it. */
function SheetShape({ s, z, w, h, mask, revisionId, faces, id }: { s: StackSheet; z: number; w: number; h: number; mask: string; revisionId: string; faces: BoardStack["faces"]; id: string }) {
  const edge = s.kind === "copper" ? COPPER : s.kind === "mask" ? mask : FR4;
  const face = s.kind === "mask" ? mask : s.kind === "copper" ? LAMINATE : shade(FR4, 0.12);
  const rx = Math.min(w, h) / 40;
  const hasFace = s.face === "top" ? faces.top : s.face === "bottom" ? faces.bottom : false;
  return (
    <g>
      {walls(corners(0, 0, w, h, 0)).map((wl, i) => (
        <polygon key={i} points={wallPoints(wl, z - s.thick, z)} fill={shade(edge, -0.4 + wl.light * 0.32)} />
      ))}
      <g transform={planeMatrix(z)}>
        <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={rx} fill={face} />
        {s.kind === "dielectric" ? <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={rx} fill={`url(#${id}-weave)`} /> : null}
        {hasFace ? (
          // The finished face as the fab delivers it. The bottom side is drawn as seen from below: turn it over.
          <image href={`/boms/${revisionId}/picture${s.face === "bottom" ? "?side=bottom" : ""}`} x={-w / 2} y={-h / 2} width={w} height={h} preserveAspectRatio="none" transform={s.face === "bottom" ? "scale(-1 1)" : undefined} />
        ) : (
          s.images.map((im) => <image key={im.href} href={im.href} x={-w / 2 + im.x} y={-h / 2 + im.y} width={im.w} height={im.h} preserveAspectRatio="none" />)
        )}
        <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={rx} fill={`url(#${id}-sheen)`} />
        <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={rx} fill="none" stroke="#000" strokeOpacity="0.28" strokeWidth={Math.max(w, h) / 380} />
      </g>
    </g>
  );
}

/**
 * The board pulled apart, layer by layer, with its components (Phase 27): the parts floating above the solder mask,
 * then every copper layer with the laminate between them, down to the bottom mask — each sheet carrying the
 * customer's own layer drawing, named beside it. The same tilted view as the board picture, drawn on the server.
 */
export function BoardExploded({ revisionId, stack, label, className }: { revisionId: string; stack: BoardStack; label: string; className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const { width: w, height: h, sheets } = stack;
  const size = Math.max(w, h);
  const gap = size * 0.17;
  const n = sheets.length;
  const zOf = (i: number) => (n - 1 - i) * gap;
  const top = stack.parts.filter((p) => p.side === "TOP" && !p.dnp).sort((a, b) => depth(b.x, b.y) - depth(a.x, a.y));
  const bottom = stack.parts.filter((p) => p.side === "BOTTOM" && !p.dnp).sort((a, b) => depth(b.x, b.y) - depth(a.x, a.y));
  const partsZ = zOf(0) + gap;
  const tallest = Math.max(0, ...top.map((p) => p.body.height));
  const deepest = Math.max(0, ...bottom.map((p) => p.body.height));
  const bottomZ = -sheets[n - 1].thick - gap * 0.9 - deepest;
  const zMin = bottom.length ? bottomZ : -sheets[n - 1].thick - size * 0.03;
  const zMax = top.length ? partsZ + tallest : zOf(0);
  const bb = bounds(w, h, zMin, zMax);
  const pad = size * 0.04;
  const fs = size * 0.056;
  const labelX = bb.x + bb.w + size * 0.07;
  const labelW = size * 0.98;
  const mask = MASK[stack.maskColor] ?? MASK.green;
  // Every level gets a name beside it, joined to the level's right-hand corner.
  const levels: { key: string; z: number; title: string; note: string | null }[] = [
    ...(top.length ? [{ key: "parts-top", z: partsZ, title: "Components", note: `${top.length.toLocaleString("en-IN")} placed on top` }] : []),
    ...sheets.map((s, i) => ({ key: s.key, z: zOf(i) - s.thick / 2, title: s.label, note: s.note })),
    ...(bottom.length ? [{ key: "parts-bottom", z: bottomZ + deepest, title: "Components", note: `${bottom.length.toLocaleString("en-IN")} placed underneath` }] : []),
  ];
  return (
    <svg
      viewBox={`${(bb.x - pad).toFixed(2)} ${(bb.y - pad).toFixed(2)} ${(labelX + labelW - bb.x + pad).toFixed(2)} ${(bb.h + 2 * pad).toFixed(2)}`}
      role="img"
      aria-label={`${label}: ${levels.map((l) => l.title).join(", ")}`}
      className={cn("h-auto w-full text-foreground", className)}
    >
      <IsoDefs id={id} blur={size * 0.02} />
      <defs>
        <pattern id={`${id}-weave`} width={size * 0.02} height={size * 0.02} patternUnits="userSpaceOnUse">
          <path d={`M 0 0 H ${size * 0.02} M 0 0 V ${size * 0.02}`} stroke="#000" strokeOpacity="0.07" strokeWidth={size * 0.003} fill="none" />
        </pattern>
      </defs>
      <g transform={planeMatrix(zMin - size * 0.02)} filter={`url(#${id}-blur)`}>
        <rect x={-w / 2 + size * 0.02} y={-h / 2 - size * 0.01} width={w} height={h} fill="#000" opacity="0.2" />
      </g>
      {bottom.map((p) => <IsoPartShape key={p.refDes} p={p} z={bottomZ} id={id} shadowZ={null} />)}
      {/* Lowest sheet first: each one hides part of the one beneath it. */}
      {sheets
        .map((s, i) => ({ s, i }))
        .reverse()
        .map(({ s, i }) => <SheetShape key={s.key} s={s} z={zOf(i)} w={w} h={h} mask={mask} revisionId={revisionId} faces={stack.faces} id={id} />)}
      {top.map((p) => <IsoPartShape key={p.refDes} p={p} z={partsZ} id={id} shadowZ={zOf(0)} />)}

      <g fontFamily="inherit">
        {levels.map((l) => {
          const [ax, ay] = project(w / 2, h / 2, l.z);
          return (
            <g key={l.key}>
              <line x1={ax} y1={ay} x2={labelX - fs * 0.5} y2={ay} stroke="currentColor" strokeOpacity="0.35" strokeWidth={size * 0.0035} strokeDasharray={`${size * 0.012} ${size * 0.01}`} />
              <circle cx={ax} cy={ay} r={size * 0.008} fill="currentColor" opacity="0.6" />
              <text x={labelX} y={ay + fs * 0.05} fontSize={fs} fontWeight="600" fill="currentColor">{l.title}</text>
              {l.note ? <text x={labelX} y={ay + fs * 0.98} fontSize={fs * 0.76} fill="currentColor" opacity="0.62">{l.note}</text> : null}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
