import type { Station } from "@/knowledge/dictionary";
import { cn } from "@/lib/utils";

const LABEL: Record<Station, string> = {
  loader: "Loader",
  printer: "Printer",
  spi: "SPI",
  mounter: "Pick & place",
  reflow: "Reflow",
  aoi: "AOI",
  axi: "X-ray",
  insertion: "THT insert",
  wave: "Wave",
  selective: "Selective",
  "press-fit": "Press-fit",
  depanel: "Depanel",
  clean: "Clean",
  coat: "Coat",
  ict: "ICT",
  "flying-probe": "Flying probe",
  fct: "FCT",
  "burn-in": "Burn-in",
  stores: "Stores / MSL",
  rework: "Rework",
  harness: "Harness",
  marking: "Marking",
  dispense: "Dispense",
};

const ROWS: { title: string; flow: boolean; stations: Station[] }[] = [
  { title: "SMT line", flow: true, stations: ["loader", "printer", "spi", "mounter", "reflow", "aoi", "axi"] },
  { title: "THT & back end", flow: true, stations: ["insertion", "wave", "selective", "press-fit", "depanel", "clean", "coat"] },
  { title: "Test", flow: true, stations: ["ict", "flying-probe", "fct", "burn-in"] },
  { title: "Support", flow: false, stations: ["stores", "marking", "dispense", "rework", "harness"] },
];

const BOX = 92;
const GAP = 18;
const ROW_H = 46;

/** The factory flow with one station highlighted — "where this machine sits". */
export function LineStrip({ station, className }: { station: Station; className?: string }) {
  const width = 7 * BOX + 6 * GAP + 120;
  const height = ROWS.length * ROW_H + 8;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Factory flow, ${LABEL[station]} highlighted`} className={cn("h-auto w-full", className)}>
      {ROWS.map((row, r) => {
        const y = 6 + r * ROW_H;
        return (
          <g key={row.title}>
            <text x={0} y={y + 20} fontSize={10.5} className="fill-muted-foreground">
              {row.title}
            </text>
            {row.stations.map((s, i) => {
              const x = 120 + i * (BOX + GAP);
              const on = s === station;
              return (
                <g key={s}>
                  {row.flow && i > 0 ? (
                    <g className="text-muted-foreground/60" stroke="currentColor" fill="none" strokeWidth={1.2}>
                      <line x1={x - GAP + 3} y1={y + 16} x2={x - 4} y2={y + 16} />
                      <polyline points={`${x - 8},${y + 12.5} ${x - 4},${y + 16} ${x - 8},${y + 19.5}`} />
                    </g>
                  ) : null}
                  <rect
                    x={x}
                    y={y + 2}
                    width={BOX}
                    height={28}
                    rx={5}
                    className={on ? "fill-primary/12 stroke-primary" : "fill-muted/60 stroke-border"}
                    strokeWidth={on ? 1.6 : 1}
                  />
                  <text x={x + BOX / 2} y={y + 20} textAnchor="middle" fontSize={11} fontWeight={on ? 600 : 400} className={on ? "fill-primary" : "fill-foreground/75"}>
                    {LABEL[s]}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}
