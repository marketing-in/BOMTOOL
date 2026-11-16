import { Fragment } from "react";
import { contentBounds, highlightedParts, icSize, junctions, localPins, netFlag, partTexts, routeWires, type Circuit, type Part } from "@/lib/schematic";
import { cn } from "@/lib/utils";

/**
 * Renders a data-defined circuit as crisp SVG. Strokes use currentColor so it follows light/dark
 * mode; the part an entry is about is drawn in the accent colour. Text is placed in world
 * coordinates so it never rotates with its symbol.
 */
export function Schematic({
  circuit,
  focus,
  className,
  minScale,
  maxScale,
}: {
  circuit: Circuit;
  focus?: string;
  className?: string;
  /** Size limits relative to the drawing's own units, so text stays readable but never huge. */
  minScale?: number;
  maxScale?: number;
}) {
  const segs = routeWires(circuit);
  const dots = junctions(circuit, segs);
  const used = new Set(circuit.wires.flat().filter((w): w is string => typeof w === "string"));
  const lit = highlightedParts(circuit, focus);
  const titleId = `sch-${circuit.id}`;
  const vb = contentBounds(circuit);
  return (
    <svg
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      role="img"
      aria-labelledby={titleId}
      className={cn("h-auto w-full text-foreground/85", className)}
      style={{ minWidth: minScale ? Math.round(vb.w * minScale) : undefined, maxWidth: maxScale ? Math.round(vb.w * maxScale) : undefined }}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <title id={titleId}>{`${circuit.title}. ${circuit.caption}`}</title>
      {circuit.barriers?.map((b, i) => (
        <g key={i} className="text-risk-amber">
          <line x1={b.x} y1={b.y1} x2={b.x} y2={b.y2} strokeDasharray="5 4" strokeWidth={1.2} />
          <text x={b.x} y={b.y1 - 4} textAnchor="middle" fontSize={8.5} stroke="none" fill="currentColor">
            isolation
          </text>
        </g>
      ))}
      <g>
        {segs.map(([a, b], i) => (
          <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />
        ))}
      </g>
      {circuit.parts.map((p) => (
        <g key={p.id} className={lit.has(p.id) ? "text-primary" : undefined}>
          <g transform={transformOf(p)}>
            <Symbol part={p} used={used} />
          </g>
          <PartText part={p} />
        </g>
      ))}
      {dots.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={2.4} fill="currentColor" stroke="none" />
      ))}
      {circuit.notes?.map((n, i) => (
        <text key={i} x={n.x} y={n.y} textAnchor={n.anchor ?? "start"} className="fill-muted-foreground" stroke="none" fontSize={9.5}>
          {n.text}
        </text>
      ))}
    </svg>
  );
}

function transformOf(p: Part) {
  const flip = p.flip === "x" ? " scale(-1 1)" : p.flip === "y" ? " scale(1 -1)" : "";
  return `translate(${p.x} ${p.y}) rotate(${p.rot ?? 0})${flip}`;
}

const T = { stroke: "none", fill: "currentColor" } as const;

/** Small filled arrowhead with its tip at (x, y) pointing along (dx, dy). */
function Arrow({ x, y, dx, dy, s = 4 }: { x: number; y: number; dx: number; dy: number; s?: number }) {
  const len = Math.hypot(dx, dy) || 1;
  const [ux, uy] = [dx / len, dy / len];
  const [bx, by] = [x - ux * s, y - uy * s];
  const [px, py] = [-uy * s * 0.55, ux * s * 0.55];
  return <polygon points={`${x},${y} ${bx + px},${by + py} ${bx - px},${by - py}`} {...T} />;
}

function Symbol({ part: p, used }: { part: Part; used: Set<string> }) {
  switch (p.sym) {
    case "resistor":
      return <polyline points="-20,0 -12,0 -10,-5 -6,5 -2,-5 2,5 6,-5 10,5 12,0 20,0" />;
    case "pot":
      return (
        <>
          <polyline points="-20,0 -12,0 -10,-5 -6,5 -2,-5 2,5 6,-5 10,5 12,0 20,0" />
          <line x1={0} y1={-20} x2={0} y2={-9} />
          <Arrow x={0} y={-6} dx={0} dy={1} />
        </>
      );
    case "capacitor":
      return (
        <>
          <path d="M-20 0H-3M3 0H20" />
          <path d="M-3 -9V9M3 -9V9" strokeWidth={1.8} />
        </>
      );
    case "cap-polar":
      return (
        <>
          <path d="M-20 0H-3M4 0H20" />
          <path d="M-3 -9V9" strokeWidth={1.8} />
          <path d="M6 -9Q1 0 6 9" strokeWidth={1.8} />
          <path d="M-12 -10H-7M-9.5 -12.5V-7.5" strokeWidth={1.1} />
        </>
      );
    case "inductor":
      return <path d="M-20 0H-16a4 4 0 0 1 8 0a4 4 0 0 1 8 0a4 4 0 0 1 8 0a4 4 0 0 1 8 0H20" />;
    case "ferrite":
      return (
        <>
          <path d="M-20 0H-10M10 0H20" />
          <rect x={-10} y={-4.5} width={20} height={9} rx={1} fill="currentColor" fillOpacity={0.85} />
        </>
      );
    case "diode":
    case "led":
    case "photodiode":
    case "zener":
    case "schottky":
    case "tvs":
      return (
        <>
          <path d="M-20 0H-6M6 0H20" />
          <polygon points="-6,-7 -6,7 6,0" fill="currentColor" fillOpacity={0.14} />
          {p.sym === "zener" || p.sym === "tvs" ? (
            <polyline points="3,-9 6,-7 6,7 9,9" />
          ) : p.sym === "schottky" ? (
            <polyline points="9,-4 9,-7 6,-7 6,7 3,7 3,4" />
          ) : (
            <line x1={6} y1={-7} x2={6} y2={7} />
          )}
          {p.sym === "led" ? (
            <>
              <path d="M1 -9L7 -15M5 -6L11 -12" strokeWidth={1.1} />
              <Arrow x={8.5} y={-16.5} dx={1} dy={-1} s={3.6} />
              <Arrow x={12.5} y={-13.5} dx={1} dy={-1} s={3.6} />
            </>
          ) : null}
          {p.sym === "photodiode" ? (
            <>
              <path d="M12 -17L6 -11M16 -14L10 -8" strokeWidth={1.1} />
              <Arrow x={4.5} y={-9.5} dx={-1} dy={1} s={3.6} />
              <Arrow x={8.5} y={-6.5} dx={-1} dy={1} s={3.6} />
            </>
          ) : null}
        </>
      );
    case "tvs-bi":
      return (
        <>
          <path d="M-20 0H-12M12 0H20" />
          <polygon points="-12,-7 -12,7 0,0" fill="currentColor" fillOpacity={0.14} />
          <polygon points="12,-7 12,7 0,0" fill="currentColor" fillOpacity={0.14} />
          <polyline points="-3,-9 0,-7 0,7 3,9" />
        </>
      );
    case "npn":
    case "pnp":
      return (
        <>
          <circle cx={2} cy={0} r={15} strokeWidth={1.1} />
          <path d="M-20 0H-5" />
          <path d="M-5 -8V8" strokeWidth={2} />
          <path d="M-5 -4L10 -12V-20M-5 4L10 12V20" />
          {p.sym === "npn" ? <Arrow x={9} y={11.5} dx={15} dy={8} /> : <Arrow x={-3} y={5} dx={-15} dy={-8} />}
        </>
      );
    case "nmos":
    case "pmos":
      return (
        <>
          <path d="M-20 0H-8M-8 -9V9" />
          <path d="M-4 -11V-5M-4 -3V3M-4 5V11" strokeWidth={2} />
          <path d="M-4 -8H10V-20M-4 8H10V20M-4 0H10V8" />
          {p.sym === "nmos" ? <Arrow x={-3} y={0} dx={-1} dy={0} /> : <Arrow x={9} y={0} dx={1} dy={0} />}
        </>
      );
    case "opamp":
      return (
        <>
          <polygon points="-20,-20 -20,20 20,0" fill="currentColor" fillOpacity={0.04} />
          <path d="M-30 -10H-20M-30 10H-20M20 0H30" />
          <path d="M-17 -10H-12" strokeWidth={1.2} />
          <path d="M-17 10H-12M-14.5 7.5V12.5" strokeWidth={1.2} />
          {used.has(`${p.id}.V+`) ? <path d="M0 -10V-20" /> : null}
          {used.has(`${p.id}.V-`) ? <path d="M0 10V20" /> : null}
        </>
      );
    case "ic": {
      const { w, h } = icSize(p);
      const pins = localPins(p);
      return (
        <>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={3} fill="currentColor" fillOpacity={0.04} />
          {Object.entries(pins).map(([n, [x, y]]) => {
            const [ex, ey] = x < -w / 2 ? [-w / 2, y] : x > w / 2 ? [w / 2, y] : y < 0 ? [x, -h / 2] : [x, h / 2];
            return <line key={n} x1={x} y1={y} x2={ex} y2={ey} />;
          })}
        </>
      );
    }
    case "ground":
      return <path d="M0 0V6M-8 6H8M-5 9.5H5M-2 13H2" />;
    case "vcc":
      return <path d="M0 0V-8M-8 -8H8" strokeWidth={1.6} />;
    case "net":
    case "antenna":
      return p.sym === "antenna" ? <path d="M0 0V-14M0 -14L-8 -26M0 -14L8 -26M0 -14V-26" /> : null;
    case "battery":
      return (
        <>
          <path d="M-20 0H-3M3 0H20" />
          <path d="M-3 -10V10" strokeWidth={1.5} />
          <path d="M3 -5V5" strokeWidth={3} />
          <path d="M-12 -10H-7M-9.5 -12.5V-7.5" strokeWidth={1.1} />
        </>
      );
    case "crystal":
      return (
        <>
          <path d="M-20 0H-8M8 0H20M-8 -8V8M8 -8V8" />
          <rect x={-5} y={-7} width={10} height={14} rx={1} />
        </>
      );
    case "fuse":
      return (
        <>
          <path d="M-20 0H20" />
          <rect x={-10} y={-4.5} width={20} height={9} rx={1} fill="var(--card)" />
          <path d="M-10 0H10" strokeWidth={1.1} />
        </>
      );
    case "switch":
      return (
        <>
          <path d="M-20 0H-10M10 0H20M-11 -7H11M0 -7V-13" />
          <circle cx={-8} cy={0} r={2} />
          <circle cx={8} cy={0} r={2} />
        </>
      );
    case "relay-coil":
      return (
        <>
          <path d="M-20 0H-10M10 0H20" />
          <rect x={-10} y={-6} width={20} height={12} rx={1} />
          <path d="M-10 6L10 -6" strokeWidth={1.1} />
        </>
      );
    case "relay-contact":
      return (
        <>
          <path d="M-20 0H-8M8 0H20M-8 0L9 -7" />
          <circle cx={-8} cy={0} r={1.8} fill="currentColor" />
          <circle cx={8} cy={0} r={1.8} />
        </>
      );
    case "transformer":
      return (
        <>
          <path d="M-20 -20H-8V-16a4 4 0 0 0 0 8a4 4 0 0 0 0 8a4 4 0 0 0 0 8a4 4 0 0 0 0 8V20H-20" />
          <path d="M20 -20H8V-16a4 4 0 0 1 0 8a4 4 0 0 1 0 8a4 4 0 0 1 0 8a4 4 0 0 1 0 8V20H20" />
          <path d="M-2 -18V18M2 -18V18" strokeWidth={1.1} />
          <circle cx={-14} cy={-12} r={1.6} fill="currentColor" stroke="none" />
          <circle cx={14} cy={-12} r={1.6} fill="currentColor" stroke="none" />
        </>
      );
    case "cmc":
      return (
        <>
          <path d="M-20 -10H-16a4 4 0 0 1 8 0a4 4 0 0 1 8 0a4 4 0 0 1 8 0a4 4 0 0 1 8 0H20" />
          <path d="M-20 10H-16a4 4 0 0 0 8 0a4 4 0 0 0 8 0a4 4 0 0 0 8 0a4 4 0 0 0 8 0H20" />
          <path d="M-16 -2H16M-16 2H16" strokeWidth={1.1} />
        </>
      );
    case "connector": {
      const list = p.pins ?? ["1", "2"];
      const top = -(list.length - 1) * 10 - 10;
      return (
        <>
          <rect x={-10} y={top} width={22} height={list.length * 20} rx={2} fill="currentColor" fillOpacity={0.04} />
          {list.map((n, i) => {
            const y = i * 20 - (list.length - 1) * 10;
            return (
              <Fragment key={n + i}>
                <line x1={-20} y1={y} x2={-10} y2={y} />
                <circle cx={-6} cy={y} r={2} />
              </Fragment>
            );
          })}
        </>
      );
    }
    case "motor":
      return (
        <>
          <path d="M-20 0H-12M12 0H20" />
          <circle cx={0} cy={0} r={12} fill="currentColor" fillOpacity={0.04} />
        </>
      );
    case "ntc":
    case "varistor":
      return (
        <>
          <path d="M-20 0H-10M10 0H20" />
          <rect x={-10} y={-5} width={20} height={10} rx={1} />
          <polyline points={p.sym === "ntc" ? "-15,9 -10,9 10,-10" : "-14,8 -9,8 9,-8"} strokeWidth={1.1} />
        </>
      );
    case "bridge":
      return (
        <>
          <path d="M-30 0H-20M30 0H20M0 -30V-20M0 30V20" />
          <polygon points="-20,0 0,-20 20,0 0,20" strokeWidth={1.1} />
          {[
            [-10, -10, 1, -1],
            [10, -10, -1, -1],
            [-10, 10, 1, -1],
            [10, 10, -1, -1],
          ].map(([cx, cy, dx, dy], i) => (
            <g key={i} transform={`translate(${cx} ${cy}) rotate(${(Math.atan2(dy, dx) * 180) / Math.PI})`}>
              <polygon points="-4,-4 -4,4 4,0" fill="currentColor" fillOpacity={0.6} stroke="none" />
              <path d="M4 -4V4" />
            </g>
          ))}
        </>
      );
    case "buzzer":
      return (
        <>
          <path d="M-20 0H-10M10 0H20" />
          <path d="M-10 0A10 10 0 0 1 10 0Z" fill="currentColor" fillOpacity={0.06} />
        </>
      );
    case "opto":
      return (
        <>
          <rect x={-22} y={-18} width={44} height={36} rx={2} strokeDasharray="3 2" strokeWidth={1} />
          <path d="M-30 -10H-12V-6M-12 3V10H-30" />
          <polygon points="-17,-6 -7,-6 -12,3" fill="currentColor" fillOpacity={0.14} />
          <path d="M-17 3H-7" />
          <path d="M-3 -4L3 -4M-3 3L3 3" strokeWidth={1.1} />
          <Arrow x={5} y={-4} dx={1} dy={0} s={3.4} />
          <Arrow x={5} y={3} dx={1} dy={0} s={3.4} />
          <path d="M9 -8V8" strokeWidth={2} />
          <path d="M9 -4L18 -10H30M9 4L18 10H30" />
          <Arrow x={17} y={9.3} dx={9} dy={6} s={3.6} />
        </>
      );
    case "triac":
      return (
        <>
          <path d="M0 -20V-8M0 8V20M-10 -8H10M-10 8H10" />
          <polygon points="-10,-8 -2,-8 -6,8" fill="currentColor" fillOpacity={0.14} />
          <polygon points="2,8 10,8 6,-8" fill="currentColor" fillOpacity={0.14} />
          <path d="M-20 10H-12L-7 8" />
        </>
      );
    case "gdt":
      return (
        <>
          <path d="M-20 0H-5M5 0H20M-5 -5V5M5 -5V5" />
          <circle cx={0} cy={0} r={10} />
          <circle cx={0} cy={4} r={1.2} fill="currentColor" stroke="none" />
        </>
      );
    default:
      return null;
  }
}

/** Labels, values, IC pin names and rail/net text, all upright (layout in partTexts). */
function PartText({ part: p }: { part: Part }) {
  const items = partTexts(p);
  if (!items.length) return null;
  const flag = p.sym === "net" ? netFlag(p) : null;
  return (
    <g>
      {flag ? (
        <path d={`M${p.x} ${p.y}L${flag.x0} ${p.y - 6}H${flag.x1}V${p.y + 6}H${flag.x0}Z`} strokeWidth={1.1} fill="currentColor" fillOpacity={0.05} />
      ) : null}
      {items.map((t, i) => (
        <text
          key={i}
          x={t.x}
          y={t.y}
          textAnchor={t.anchor}
          fontSize={t.size}
          fontWeight={t.weight}
          stroke="none"
          className={t.muted ? "fill-muted-foreground" : undefined}
          fill={t.muted ? undefined : "currentColor"}
        >
          {t.s}
        </text>
      ))}
    </g>
  );
}
