/**
 * One of our SMT lines as the line simulation's stations (src/vendor/circuitflow): its machines in flow order, the
 * placers merged into one placement station, each with the rates our machine sheets give — printer cycle, SPI area
 * rate, measured placement rate, oven heated length, AOI field of view. Conveyors and anything the simulation has no
 * model for are left out. Pure.
 */
import { machineName, readSpecs } from "./machines";

export type SimKind = "marker" | "loader" | "printer" | "spi" | "pnp" | "reflow" | "aoi" | "xray";

export type SimRates = {
  /** Seconds per board the machine sheet gives (printer, marker); a [min, max] range is averaged. */
  cycleSec?: number;
  /** SPI inspection rate, cm² a second. */
  cm2PerSec?: number;
  /** Placements an hour, all placers of the station together, as measured on our floor. */
  actualCph?: number;
  /** Placements an hour, rated, all placers together. */
  ratedCph?: number;
  /** Reflow: length of the heated tunnel and how many heating zones it has. */
  heatedLengthMm?: number;
  zones?: number;
  /** AOI: field of view and time per field. */
  fovMm?: [number, number];
  msPerFov?: number;
};

/** `short` names the process (Printer), `label` the machine (GD450) on the 3D model, `machine` the full make and model. */
export type SimStation = { id: SimKind; name: string; short: string; label: string; machine: string; count: number; facts: { label: string; value: string }[]; rates: SimRates };
export type SimLine = { code: string; name: string; stations: SimStation[] };

type MachineIn = { type: string; vendor: string; model: string; position: number; specs: unknown };

const KIND: Record<string, { id: SimKind; name: string; short: string }> = {
  LASER_MARKER: { id: "marker", name: "Laser marking", short: "Marker" },
  BOARD_LOADER: { id: "loader", name: "PCB loader", short: "Loader" },
  STENCIL_PRINTER: { id: "printer", name: "Solder paste printer", short: "Printer" },
  SPI: { id: "spi", name: "Solder paste inspection", short: "SPI" },
  PICK_AND_PLACE: { id: "pnp", name: "Pick-and-place", short: "Pick & place" },
  REFLOW_OVEN: { id: "reflow", name: "Reflow oven", short: "Reflow" },
  AOI: { id: "aoi", name: "Automated optical inspection", short: "AOI" },
  XRAY: { id: "xray", name: "X-ray inspection", short: "X-ray" },
};

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined);
/** A number, or the middle of a [min, max] range. */
const mid = (v: unknown): number | undefined => {
  if (Array.isArray(v) && v.length === 2 && num(v[0]) && num(v[1])) return (Number(v[0]) + Number(v[1])) / 2;
  return num(v);
};
const pair = (v: unknown): [number, number] | undefined => (Array.isArray(v) && v.length === 2 && num(v[0]) && num(v[1]) ? [Number(v[0]), Number(v[1])] : undefined);
const fmt = (v: unknown) => (Array.isArray(v) ? v.join("–") : String(v));
/** The model without a "#1"/"#2" suffix, so two identical placers read as one model. */
const baseModel = (model: string) => model.replace(/\s*#\d+$/, "").trim();

/** The short label on the machine in 3D and in the station list. */
function shortName(_vendor: string, model: string) {
  const m = baseModel(model).replace(/\(.*?\)/g, "").trim();
  return m.length <= 16 ? m : m.slice(0, 15) + "…";
}

function factsOf(type: string, specs: unknown): { label: string; value: string }[] {
  const { specs: s, extra } = readSpecs(specs);
  const out: { label: string; value: string }[] = [];
  const add = (label: string, v: unknown, unit = "") => {
    if (v === undefined || v === null || v === "") return;
    out.push({ label, value: `${fmt(v)}${unit}` });
  };
  if (s.maxBoardMm) add("Board", `${s.minBoardMm ? `${s.minBoardMm.join("×")} to ` : "up to "}${s.maxBoardMm.join("×")}`, " mm");
  if (s.minThicknessMm || s.maxThicknessMm) add("Thickness", `${s.minThicknessMm ?? "?"}–${s.maxThicknessMm ?? "?"}`, " mm");
  if (type === "PICK_AND_PLACE") {
    add("Rated", s.cph?.toLocaleString("en-IN"), " CPH");
    add("Measured", num(extra.actualCph)?.toLocaleString("en-IN"), " CPH");
    add("Smallest chip", s.minChip);
    if (s.maxComponentMm) add("Largest part", s.maxComponentMm.join("×"), " mm");
    add("Tallest part", s.maxComponentHeightMm, " mm");
    add("Feeders", s.feederSlots);
    add("Heads", extra.heads);
    add("Accuracy", extra.accuracyMm, " mm");
  }
  if (type === "STENCIL_PRINTER") {
    add("Cycle", extra.cycleSec, " s");
    add("Loading", extra.loading);
    add("Clamping", extra.clamping);
  }
  if (type === "SPI" || type === "AOI") {
    add("Technology", s.technology);
    add("Camera", extra.cameraMp, " MP");
    add("Speed", extra.inspectCm2PerSec, " cm²/s");
  }
  if (type === "REFLOW_OVEN") {
    add("Heating zones", s.zones, " top + bottom");
    add("Cooling zones", extra.coolingZones);
    add("Heated length", extra.heatedLengthMm, " mm");
    add("Max temperature", extra.maxTempC, " °C");
  }
  if (type === "LASER_MARKER") {
    add("Laser", extra.laserW, " W");
    add("Marks", extra.marks);
  }
  return out;
}

function ratesOf(type: string, specs: unknown): SimRates {
  const { specs: s, extra } = readSpecs(specs);
  switch (type) {
    case "LASER_MARKER":
    case "STENCIL_PRINTER":
      return { cycleSec: mid(extra.cycleSec) };
    case "SPI":
      return { cm2PerSec: mid(extra.inspectCm2PerSec) };
    case "PICK_AND_PLACE":
      return { actualCph: num(extra.actualCph), ratedCph: s.cph };
    case "REFLOW_OVEN":
      return { heatedLengthMm: num(extra.heatedLengthMm), zones: s.zones };
    case "AOI":
      return { fovMm: pair(extra.fovMm), msPerFov: num(extra.msPerFov) };
    default:
      return {};
  }
}

/** The stations of one line, in flow order; consecutive placers become one station. */
export function simStations(machines: MachineIn[]): SimStation[] {
  const out: SimStation[] = [];
  for (const m of [...machines].sort((a, b) => a.position - b.position)) {
    const k = KIND[m.type];
    if (!k) continue;
    const prev = out[out.length - 1];
    if (k.id === "pnp" && prev?.id === "pnp") {
      const r = ratesOf(m.type, m.specs);
      const sum = (a?: number, b?: number) => (a !== undefined && b !== undefined ? a + b : undefined);
      prev.count += 1;
      prev.rates = { actualCph: sum(prev.rates.actualCph, r.actualCph), ratedCph: sum(prev.rates.ratedCph, r.ratedCph) };
      const same = baseModel(prev.machine.replace(/^\d+ × /, "")) === baseModel(machineName(m));
      prev.machine = same ? `${prev.count} × ${baseModel(machineName(m))}` : `${prev.machine} + ${machineName(m)}`;
      prev.label = same ? `${prev.count} × ${shortName(m.vendor, m.model)}` : "Placers";
      continue;
    }
    // Two machines of one other kind in a row: the simulation runs one of each, so keep the first.
    if (out.some((s) => s.id === k.id)) continue;
    out.push({ id: k.id, name: k.name, short: k.short, label: shortName(m.vendor, m.model), machine: baseModel(machineName(m)), count: 1, facts: factsOf(m.type, m.specs), rates: ratesOf(m.type, m.specs) });
  }
  return out;
}

/** The simulation's line for one of our SMT lines, or null when it cannot run (no printer, placer or oven). */
export function simLine(line: { code: string; name: string; machines: MachineIn[] }): SimLine | null {
  const stations = simStations(line.machines);
  const has = (id: SimKind) => stations.some((s) => s.id === id);
  if (!has("printer") || !has("pnp") || !has("reflow")) return null;
  return { code: line.code, name: line.name, stations };
}
