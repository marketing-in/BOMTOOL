/**
 * 4-layer PCB cross-section that builds up with the fabrication step index (see PROCESSES "pcb-fab").
 * Pure SVG; every layer fades/slides in via CSS transitions on opacity/transform only.
 */
const W = 640;
const H = 260;

// Colours as CSS variables with fallbacks so it reads in light and dark.
const C = {
  fr4: "oklch(0.78 0.08 95)",
  prepreg: "oklch(0.84 0.07 95)",
  copper: "oklch(0.68 0.13 55)",
  resist: "oklch(0.62 0.16 300 / 0.85)",
  tin: "oklch(0.82 0 0)",
  mask: "oklch(0.52 0.12 150 / 0.9)",
  silk: "oklch(0.98 0 0)",
  gold: "oklch(0.8 0.14 85)",
  probe: "oklch(0.45 0 0)",
};

type Props = { stage: number };

export function PcbCrossSection({ stage }: Props) {
  const show = (from: number, until = 99) => stage >= from && stage <= until;
  const vis = (on: boolean) => ({ opacity: on ? 1 : 0, transform: on ? "translateY(0)" : "translateY(-6px)", transition: "opacity 300ms ease-out, transform 300ms ease-out" });

  // Vertical layout (top to bottom)
  const x0 = 40;
  const x1 = W - 40;
  const y = { maskT: 46, l1: 54, pp1: 62, l2: 98, core: 106, l3: 150, pp2: 158, l4: 194, maskB: 202 };
  const holes = [150, 320, 490];
  const traceXs = [80, 230, 260, 380, 420, 560];
  const innerEtched = stage >= 3;
  const outerEtched = stage >= 10;

  const copperLayer = (yy: number, etched: boolean, key: string, h = 8) =>
    etched ? (
      <g key={key}>
        {traceXs.map((tx, i) => (
          <rect key={i} x={tx} y={yy} width={i % 2 ? 40 : 60} height={h} fill={C.copper} rx={1} />
        ))}
        {holes.map((hx) => (
          <rect key={`p${hx}`} x={hx - 18} y={yy} width={36} height={h} fill={C.copper} rx={1} />
        ))}
      </g>
    ) : (
      <rect key={key} x={x0} y={yy} width={x1 - x0} height={h} fill={C.copper} />
    );

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="PCB cross-section at the current fabrication step">
      {/* Core with inner copper (layers 2 and 3) */}
      <g style={vis(show(1))}>
        <rect x={x0} y={y.core} width={x1 - x0} height={44} fill={C.fr4} />
        {copperLayer(y.l2, innerEtched, "l2")}
        {copperLayer(y.l3, innerEtched, "l3")}
      </g>
      {/* Inner resist */}
      <g style={vis(show(2, 2))}>
        {traceXs.map((tx, i) => (
          <rect key={`rt${i}`} x={tx} y={y.l2 - 6} width={i % 2 ? 40 : 60} height={6} fill={C.resist} />
        ))}
        {traceXs.map((tx, i) => (
          <rect key={`rb${i}`} x={tx} y={y.l3 + 8} width={i % 2 ? 40 : 60} height={6} fill={C.resist} />
        ))}
      </g>
      {/* AOI scan line */}
      {stage === 4 ? <rect x={x0} y={y.l2 - 10} width={4} height={72} fill="oklch(0.6 0.2 25)" className="animate-[scan_1.6s_ease-in-out_infinite_alternate]" /> : null}
      {/* Lamination: prepreg + outer foil */}
      <g style={vis(show(5))}>
        <rect x={x0} y={y.pp1} width={x1 - x0} height={36} fill={C.prepreg} />
        <rect x={x0} y={y.pp2} width={x1 - x0} height={36} fill={C.prepreg} />
        {copperLayer(y.l1, outerEtched, "l1")}
        {copperLayer(y.l4, outerEtched, "l4")}
      </g>
      {/* Drilled holes (cut through everything) */}
      <g style={vis(show(6))}>
        {holes.map((hx) => (
          <rect key={hx} x={hx - 8} y={y.l1} width={16} height={y.maskB - y.l1} fill="var(--card)" />
        ))}
      </g>
      {/* Barrel copper: thin electroless, then thick plated */}
      <g style={vis(show(7))}>
        {holes.map((hx) => (
          <g key={hx}>
            <rect x={hx - 8} y={y.l1} width={stage >= 9 ? 4 : 1.5} height={y.maskB - y.l1} fill={C.copper} />
            <rect x={hx + (stage >= 9 ? 4 : 6.5)} y={y.l1} width={stage >= 9 ? 4 : 1.5} height={y.maskB - y.l1} fill={C.copper} />
          </g>
        ))}
      </g>
      {/* Outer resist (imaging) */}
      <g style={vis(show(8, 8))}>
        <rect x={x0} y={y.l1 - 6} width={x1 - x0} height={6} fill={C.resist} />
        <rect x={x0} y={y.l4 + 8} width={x1 - x0} height={6} fill={C.resist} />
      </g>
      {/* Tin etch resist on plated pattern */}
      <g style={vis(show(9, 9))}>
        {[...traceXs, ...holes.map((h) => h - 18)].map((tx, i) => (
          <rect key={i} x={tx} y={y.l1 - 3} width={i < traceXs.length ? (i % 2 ? 40 : 60) : 36} height={3} fill={C.tin} />
        ))}
      </g>
      {/* Solder mask, openings at hole pads */}
      <g style={vis(show(11))}>
        {[
          [x0, 150 - 22],
          [150 + 22, 320 - 22],
          [320 + 22, 490 - 22],
          [490 + 22, x1],
        ].map(([a, b], i) => (
          <g key={i}>
            <rect x={a} y={y.maskT - 2} width={b - a} height={10} fill={C.mask} rx={2} />
            <rect x={a} y={y.maskB} width={b - a} height={10} fill={C.mask} rx={2} />
          </g>
        ))}
      </g>
      {/* Silkscreen */}
      <g style={vis(show(12))}>
        <rect x={210} y={y.maskT - 7} width={70} height={5} fill={C.silk} stroke="var(--border)" strokeWidth={0.5} />
        <rect x={380} y={y.maskT - 7} width={36} height={5} fill={C.silk} stroke="var(--border)" strokeWidth={0.5} />
      </g>
      {/* ENIG finish on exposed pads */}
      <g style={vis(show(13))}>
        {holes.map((hx) => (
          <g key={hx}>
            <rect x={hx - 18} y={y.l1 - 3} width={10} height={3} fill={C.gold} />
            <rect x={hx + 8} y={y.l1 - 3} width={10} height={3} fill={C.gold} />
          </g>
        ))}
      </g>
      {/* E-test probes */}
      <g style={vis(show(14, 14))}>
        {[holes[0], holes[2]].map((hx) => (
          <g key={hx}>
            <line x1={hx - 13} y1={8} x2={hx - 13} y2={y.l1 - 4} stroke={C.probe} strokeWidth={2} />
            <circle cx={hx - 13} cy={y.l1 - 4} r={2.5} fill={C.probe} />
          </g>
        ))}
      </g>
      {/* Routed board edges */}
      <g style={vis(show(15))}>
        <rect x={x0 - 6} y={y.maskT - 10} width={6} height={y.maskB - y.maskT + 30} fill="var(--card)" />
        <rect x={x1} y={y.maskT - 10} width={6} height={y.maskB - y.maskT + 30} fill="var(--card)" />
      </g>
      {/* Layer labels */}
      <g fontSize={10} fill="var(--muted-foreground)" style={vis(show(1))}>
        <text x={x1 + 4} y={y.l2 + 7}>L2</text>
        <text x={x1 + 4} y={y.l3 + 7}>L3</text>
        <text x={x1 + 4} y={y.core + 26}>core</text>
      </g>
      <g fontSize={10} fill="var(--muted-foreground)" style={vis(show(5))}>
        <text x={x1 + 4} y={y.l1 + 7}>L1</text>
        <text x={x1 + 4} y={y.l4 + 7}>L4</text>
        <text x={x1 + 4} y={y.pp1 + 20}>prepreg</text>
      </g>
      {stage === 0 ? (
        <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={14} fill="var(--muted-foreground)">
          Gerber / ODB++ → CAM → panel
        </text>
      ) : null}
    </svg>
  );
}
