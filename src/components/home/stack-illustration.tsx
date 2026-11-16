/**
 * Isometric drawing of a 4-layer board pulled apart, for the knowledge card on the home page.
 * Plain SVG (no WebGL), so the dashboard stays light on a factory-floor tablet.
 */

const C30 = Math.cos(Math.PI / 6);

/** World (x right, y back, z up) → screen. */
const iso = (x: number, y: number, z: number): [number, number] => [(x - y) * C30, (x + y) * 0.5 - z];
const pts = (p: [number, number, number][]) =>
  p
    .map(([x, y, z]) => iso(x, y, z))
    .map(([u, v]) => `${(u + 120).toFixed(1)},${(v + 62).toFixed(1)}`)
    .join(" ");

type Slab = { z: number; t: number; top: string; left: string; right: string };

const W = 104;
const D = 70;

const SLABS: Slab[] = [
  { z: 0, t: 3, top: "#2a7a48", left: "#1d5a35", right: "#16492b" }, // bottom mask
  { z: 12, t: 2, top: "#d08a4e", left: "#a8682f", right: "#8f5726" }, // L4
  { z: 22, t: 9, top: "#d9cb94", left: "#bfae70", right: "#a8985e" }, // core
  { z: 39, t: 2, top: "#d08a4e", left: "#a8682f", right: "#8f5726" }, // L1
  { z: 49, t: 3, top: "#2a7a48", left: "#1d5a35", right: "#16492b" }, // top mask
];

const PADS: [number, number][] = [
  [22, 18], [30, 18], [38, 18], [46, 18],
  [22, 34], [30, 34], [38, 34], [46, 34],
  [70, 46], [78, 46], [70, 54], [78, 54],
];

export function StackIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 150" className={className} role="img" aria-label="A four-layer circuit board pulled apart into its layers">
      {/* Vias run through every layer. */}
      {[[60, 24], [86, 30]].map(([x, y]) => {
        const [u1, v1] = iso(x, y, 0);
        const [u2, v2] = iso(x, y, 52);
        return <line key={`${x}`} x1={u1 + 120} y1={v1 + 62} x2={u2 + 120} y2={v2 + 62} stroke="#c27c43" strokeWidth={2.2} strokeLinecap="round" opacity={0.9} />;
      })}
      {SLABS.map((s, i) => {
        const z1 = s.z + s.t;
        return (
          <g key={i}>
            <polygon points={pts([[0, D, s.z], [W, D, s.z], [W, D, z1], [0, D, z1]])} fill={s.left} />
            <polygon points={pts([[W, 0, s.z], [W, D, s.z], [W, D, z1], [W, 0, z1]])} fill={s.right} />
            <polygon points={pts([[0, 0, z1], [W, 0, z1], [W, D, z1], [0, D, z1]])} fill={s.top} opacity={i === 2 ? 0.92 : 1} />
          </g>
        );
      })}
      {/* Pads (ENIG gold) and a silkscreen outline on the top mask. */}
      {PADS.map(([x, y]) => (
        <polygon key={`${x}-${y}`} points={pts([[x, y, 52], [x + 5, y, 52], [x + 5, y + 4, 52], [x, y + 4, 52]])} fill="#e3be5a" />
      ))}
      <polygon points={pts([[17, 13, 52], [56, 13, 52], [56, 43, 52], [17, 43, 52]])} fill="none" stroke="#f4f4ef" strokeWidth={0.9} />
      {/* Inner-layer routing hinted on L1. */}
      {[0, 1, 2, 3].map((k) => (
        <polyline key={k} points={pts([[8, 50 + k * 4, 41], [40, 50 + k * 4, 41], [52, 62 + k * 2, 41], [96, 62 + k * 2, 41]])} fill="none" stroke="#f0b27a" strokeWidth={0.9} opacity={0.85} />
      ))}
    </svg>
  );
}
