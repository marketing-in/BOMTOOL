import { useId } from "react";
import type { BodySpec } from "@/lib/board/bodies";
import { VIEW, bounds, corners, depth, planeMatrix, project, shade, wallPoints, walls } from "@/lib/board/iso";
import { cn } from "@/lib/utils";

/** What the picture needs of a placed part: where it sits (mm, board-centred, y up), its body and its marking. */
export type IsoPart = { refDes: string; x: number; y: number; rotation: number; side: "TOP" | "BOTTOM"; body: BodySpec; dnp: boolean; mark?: string | null };

export const MASK: Record<string, string> = { green: "#1c6b3c", blue: "#1b4f93", red: "#9a2222", black: "#1d1f22", white: "#e6e7e2", yellow: "#b9931b", purple: "#4d2a7a" };
export const FR4 = "#c9b77a";
const METAL = "#d3d6db";
const GOLD = "#d4af37";

/** A box standing on the board: the walls the viewer sees, shaded by how they face the light, and its top. */
function Box({ cx, cy, L, W, rot, z0, z1, color, top, rim = true }: { cx: number; cy: number; L: number; W: number; rot: number; z0: number; z1: number; color: string; top?: string; rim?: boolean }) {
  return (
    <>
      {walls(corners(cx, cy, L, W, rot)).map((w, i) => (
        <polygon key={i} points={wallPoints(w, z0, z1)} fill={shade(color, -0.5 + w.light * 0.34)} />
      ))}
      <g transform={planeMatrix(z1)}>
        <rect x={-L / 2} y={-W / 2} width={L} height={W} rx={Math.min(L, W) * 0.06} transform={`translate(${cx} ${-cy}) rotate(${-rot})`} fill={top ?? shade(color, 0.1)} stroke={rim ? shade(color, 0.32) : "none"} strokeWidth={0.07} />
      </g>
    </>
  );
}

/** A point of the part's own frame (along its length, across its width) in board coordinates. */
function local(p: IsoPart, lx: number, ly: number): [number, number] {
  const r = (p.rotation * Math.PI) / 180;
  return [p.x + lx * Math.cos(r) - ly * Math.sin(r), p.y + lx * Math.sin(r) + ly * Math.cos(r)];
}

/** A can standing on the board: electrolytic capacitors and the like. */
function Can({ p, r, z0, z1, id }: { p: IsoPart; r: number; z0: number; z1: number; id: string }) {
  const color = p.body.color;
  // The outline of an upright cylinder: its leftmost and rightmost points in the picture, bottom and top.
  const left: [number, number] = [p.x - r * VIEW.cy, p.y + r * VIEW.sy];
  const right: [number, number] = [p.x + r * VIEW.cy, p.y - r * VIEW.sy];
  const pts = [project(left[0], left[1], z0), project(right[0], right[1], z0), project(right[0], right[1], z1), project(left[0], left[1], z1)].map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const at = `translate(${p.x} ${-p.y}) rotate(${-p.rotation})`;
  return (
    <>
      <g transform={planeMatrix(z0)}>
        <circle r={r} transform={at} fill={shade(color, -0.45)} />
      </g>
      <polygon points={pts} fill={`url(#${id}-can)`} />
      <polygon points={pts} fill={color} opacity="0.55" style={{ mixBlendMode: "multiply" }} />
      <g transform={planeMatrix(z1)}>
        <g transform={at}>
          <circle r={r} fill={shade(color, 0.22)} stroke={shade(color, 0.45)} strokeWidth={0.08} />
          {/* The polarity mark and the vent cross pressed into the top. */}
          <path d={`M ${-r} 0 A ${r} ${r} 0 0 1 ${-r * 0.35} ${-r * 0.94} L ${-r * 0.35} ${r * 0.94} A ${r} ${r} 0 0 1 ${-r} 0 Z`} fill="#000" opacity="0.5" />
          <path d={`M ${-r * 0.1} ${-r * 0.5} L ${r * 0.55} ${r * 0.5} M ${-r * 0.1} ${r * 0.5} L ${r * 0.55} ${-r * 0.5}`} stroke="#000" strokeOpacity="0.3" strokeWidth={r * 0.06} fill="none" />
        </g>
      </g>
    </>
  );
}

/**
 * One placed part, standing at height z on the board (or floating above it in the layer view). Its shadow falls on
 * the level at `shadowZ` — the level it stands on unless told otherwise; null for no shadow.
 */
export function IsoPartShape({ p, z = 0, id, shadowZ }: { p: IsoPart; z?: number; id: string; shadowZ?: number | null }) {
  const b = p.body;
  const L = Math.max(0.6, b.length);
  const W = Math.max(0.4, b.width);
  const H = Math.max(0.3, b.height);
  const at = `translate(${p.x} ${-p.y}) rotate(${-p.rotation})`;
  const small = Math.min(L, W);
  const ic = b.kind === "gullwing" || b.kind === "quad" || b.kind === "leadless" || b.kind === "array";
  const lead = Math.min(0.9, Math.max(0.3, small * 0.14));
  const dash = Math.max(0.22, Math.min(1.2, (b.pitch || 1) * 0.5));
  // Markings read the right way up whichever way the part is turned.
  const turned = ((p.rotation % 360) + 360) % 360;
  const flip = turned > 90 && turned <= 270 ? 180 : 0;
  const text = (p.mark ?? "").replace(/[^A-Za-z0-9\-./ ]/g, "").slice(0, 11);
  const fs = text ? Math.min(W * 0.26, (L * 0.86) / (text.length * 0.6)) : 0;

  return (
    <g>
      {/* Its shadow on the board, thrown away from the light; fainter the higher the part floats above it. */}
      {shadowZ !== null ? (
        <g transform={planeMatrix((shadowZ ?? z) + 0.02)}>
          <rect x={-L / 2} y={-W / 2} width={L} height={W} rx={small * 0.1} transform={`translate(${p.x + H * 0.5} ${-(p.y + H * 0.12)}) rotate(${-p.rotation})`} fill="#000" opacity={shadowZ === undefined ? 0.26 : 0.13} />
        </g>
      ) : null}

      {b.kind === "gullwing" || b.kind === "quad" || b.kind === "leadless" ? (
        <g transform={planeMatrix(z + 0.12)}>
          <g transform={at} stroke={METAL} strokeWidth={b.kind === "leadless" ? lead * 0.45 : lead} strokeDasharray={`${dash} ${dash}`} fill="none">
            <line x1={-L / 2 + dash} x2={L / 2 - dash} y1={-W / 2 - (b.kind === "leadless" ? 0 : lead / 2)} y2={-W / 2 - (b.kind === "leadless" ? 0 : lead / 2)} />
            <line x1={-L / 2 + dash} x2={L / 2 - dash} y1={W / 2 + (b.kind === "leadless" ? 0 : lead / 2)} y2={W / 2 + (b.kind === "leadless" ? 0 : lead / 2)} />
            {b.kind !== "gullwing" ? (
              <>
                <line y1={-W / 2 + dash} y2={W / 2 - dash} x1={-L / 2 - (b.kind === "leadless" ? 0 : lead / 2)} x2={-L / 2 - (b.kind === "leadless" ? 0 : lead / 2)} />
                <line y1={-W / 2 + dash} y2={W / 2 - dash} x1={L / 2 + (b.kind === "leadless" ? 0 : lead / 2)} x2={L / 2 + (b.kind === "leadless" ? 0 : lead / 2)} />
              </>
            ) : null}
          </g>
        </g>
      ) : null}

      {b.kind === "can" ? (
        <Can p={p} r={small / 2} z0={z} z1={z + H} id={id} />
      ) : b.kind === "chip" || b.kind === "molded" ? (
        // A chip part is its body between two tin-plated ends; the far end is drawn first.
        (
          [
            [-L / 2 + L * 0.11, L * 0.22, METAL],
            [0, L * 0.56, b.color],
            [L / 2 - L * 0.11, L * 0.22, METAL],
          ] as [number, number, string][]
        )
          .map(([lx, len, color]) => ({ c: local(p, lx, 0), len, color }))
          .sort((m, n) => depth(n.c[0], n.c[1]) - depth(m.c[0], m.c[1]))
          .map((s, i) => <Box key={i} cx={s.c[0]} cy={s.c[1]} L={s.len} W={W} rot={p.rotation} z0={z} z1={z + H} color={s.color} rim={false} />)
      ) : b.kind === "module" ? (
        <>
          {/* A radio module: its own small board, a shield can over most of it, the aerial left bare. */}
          <Box cx={p.x} cy={p.y} L={L} W={W} rot={p.rotation} z0={z} z1={z + Math.min(0.8, H * 0.3)} color="#16382a" />
          {(() => {
            const c = local(p, -L * 0.1, 0);
            return <Box cx={c[0]} cy={c[1]} L={L * 0.74} W={W * 0.9} rot={p.rotation} z0={z + Math.min(0.8, H * 0.3)} z1={z + H} color={b.color} />;
          })()}
          <g transform={planeMatrix(z + Math.min(0.8, H * 0.3) + 0.01)}>
            <path transform={at} d={`M ${L * 0.31} ${-W * 0.34} h ${L * 0.13} v ${W * 0.17} h ${-L * 0.1} v ${W * 0.17} h ${L * 0.1} v ${W * 0.17} h ${-L * 0.13}`} fill="none" stroke={GOLD} strokeWidth={Math.max(0.12, small * 0.02)} />
          </g>
        </>
      ) : (
        <Box cx={p.x} cy={p.y} L={L} W={W} rot={p.rotation} z0={z + (ic ? 0.08 : 0)} z1={z + H} color={b.color} />
      )}

      <g transform={planeMatrix(z + H + 0.01)}>
        <g transform={at}>
          {ic && small > 1.4 ? <circle cx={-L / 2 + small * 0.17} cy={W / 2 - small * 0.17} r={small * 0.07} fill="#fff" opacity="0.5" /> : null}
          {ic && fs >= 0.75 ? (
            <text transform={`rotate(${flip})`} y={fs * 0.34} textAnchor="middle" fontSize={fs} fontFamily="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" fill="#e3e3df" opacity="0.72">
              {text}
            </text>
          ) : null}
          {b.kind === "power" ? <rect x={L / 2 - L * 0.28} y={-W / 2} width={L * 0.28} height={W} fill={METAL} opacity="0.9" /> : null}
          {b.kind === "connector" && (b.shape === "terminal" || b.shape === "header") && b.pins > 0 && b.pins <= 48
            ? Array.from({ length: b.pins }, (_, i) => {
                const step = L / b.pins;
                const r = Math.min(step, W) * (b.shape === "terminal" ? 0.26 : 0.16);
                return <circle key={i} cx={-L / 2 + step * (i + 0.5)} cy={b.shape === "terminal" ? -W * 0.12 : 0} r={r} fill={b.shape === "terminal" ? METAL : GOLD} stroke="#000" strokeOpacity="0.35" strokeWidth={0.06} />;
              })
            : null}
        </g>
      </g>
    </g>
  );
}

/** The gradients and blur one picture needs; `id` keeps them apart when many pictures share a page. */
export function IsoDefs({ id, blur }: { id: string; blur: number }) {
  return (
    <defs>
      <linearGradient id={`${id}-can`} x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stopColor="#6b7078" />
        <stop offset="0.28" stopColor="#f5f5f3" />
        <stop offset="0.6" stopColor="#aeb3ba" />
        <stop offset="1" stopColor="#5a5e66" />
      </linearGradient>
      <linearGradient id={`${id}-sheen`} x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity="0.2" />
        <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity="0.14" />
      </linearGradient>
      <filter id={`${id}-blur`} x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation={blur} />
      </filter>
    </defs>
  );
}

/**
 * The customer's board in 3D, as a picture (Phase 27): the board lying at an angle with its real top side from the
 * Gerbers, its thickness, and every placed part standing on it at its own height — chips with tin ends, ICs with
 * leads and their part number, cans, shields and connectors. Drawn on the server as SVG, so a list of boards costs
 * nothing on a floor tablet. Without Gerbers the top is a plain panel in the mask colour.
 */
export function BoardIso({
  revisionId,
  width,
  height,
  thickness = 1.6,
  artwork,
  maskColor,
  parts,
  label,
  className,
}: {
  revisionId: string | null;
  width: number;
  height: number;
  thickness?: number;
  /** True when the Gerber drawing of the top side is on file. */
  artwork: boolean;
  maskColor?: string;
  parts: IsoPart[];
  label: string;
  className?: string;
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const top = parts.filter((p) => p.side === "TOP" && !p.dnp).sort((a, b) => depth(b.x, b.y) - depth(a.x, a.y));
  const zMax = Math.max(1.5, ...top.map((p) => p.body.height));
  const size = Math.max(width, height);
  const bb = bounds(width, height, -thickness - size * 0.03, zMax);
  const pad = size * 0.04;
  const mask = MASK[maskColor ?? "green"] ?? MASK.green;
  const rx = Math.min(width, height) / 40;
  return (
    <svg viewBox={`${(bb.x - pad).toFixed(2)} ${(bb.y - pad).toFixed(2)} ${(bb.w + 2 * pad).toFixed(2)} ${(bb.h + 2 * pad).toFixed(2)}`} role="img" aria-label={label} className={cn("h-auto w-full", className)}>
      <IsoDefs id={id} blur={size * 0.018} />
      {/* The shadow the board throws on the bench. */}
      <g transform={planeMatrix(-thickness - size * 0.025)} filter={`url(#${id}-blur)`}>
        <rect x={-width / 2 + size * 0.02} y={-height / 2 - size * 0.01} width={width} height={height} rx={rx} fill="#000" opacity="0.24" />
      </g>
      {/* The laminate edge. */}
      {walls(corners(0, 0, width, height, 0)).map((w, i) => (
        <polygon key={i} points={wallPoints(w, -thickness, 0)} fill={shade(FR4, -0.42 + w.light * 0.34)} />
      ))}
      <g transform={planeMatrix(0)}>
        <rect x={-width / 2} y={-height / 2} width={width} height={height} rx={rx} fill={mask} />
        {artwork && revisionId ? <image href={`/boms/${revisionId}/picture`} x={-width / 2} y={-height / 2} width={width} height={height} preserveAspectRatio="none" /> : null}
        <rect x={-width / 2} y={-height / 2} width={width} height={height} rx={rx} fill={`url(#${id}-sheen)`} />
        <rect x={-width / 2} y={-height / 2} width={width} height={height} rx={rx} fill="none" stroke="#000" strokeOpacity="0.3" strokeWidth={size / 320} />
      </g>
      {top.map((p) => <IsoPartShape key={p.refDes} p={p} id={id} />)}
    </svg>
  );
}
