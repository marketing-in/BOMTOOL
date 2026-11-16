/**
 * Measures what the fabrication files say about assembly: stencil apertures (count and area per side) from the
 * paste layers — or, when a set has none, from the solder-mask openings that have no drilled hole — and the drill
 * counts. Run once at upload, because the raw files are not kept. Pure: no Next.js, no database.
 */
import { blobs, boundsOf, identifyLayer, parseExcellon, parseGerber, rasterise, type CfObject } from "@/vendor/circuitflow/gerber-entry";
import type { FabMeasure, MeasuredSide } from "@/lib/feasibility/paste";

type Hit = { x: number; y: number; d: number; plated: boolean };

/** Plated holes this size or larger take a component lead; smaller ones are vias. */
const COMPONENT_HOLE_MM = 0.6;

function measureLayer(objects: CfObject[], source: MeasuredSide["source"], holes: Hit[]): MeasuredSide | null {
  const bounds = boundsOf(objects);
  if (!bounds) return null;
  const pads = blobs(rasterise(objects, bounds, { ppm: 40, maxPixels: 8e6 }), { minArea: 0.01, maxArea: 150 });
  // Mask openings also uncover through-hole pads and vias; a pad with a hole in it gets no paste.
  const kept =
    source === "paste-layer"
      ? pads
      : pads.filter((p) => !holes.some((h) => Math.abs(h.x - p.x) <= p.w / 2 && Math.abs(h.y - p.y) <= p.h / 2));
  if (!kept.length) return null;
  return { apertures: kept.length, areaMm2: Math.round(kept.reduce((s, p) => s + p.area, 0) * 100) / 100, source };
}

/** Never throws: files that cannot be read simply measure nothing. */
export function measureFab(files: { name: string; text: string }[]): FabMeasure | null {
  const layers: Record<string, CfObject[]> = {};
  const hits: Hit[] = [];
  let drills = 0;
  for (const f of files) {
    try {
      const id = identifyLayer(f.name, f.text);
      if (id.kind === "drill") {
        const d = parseExcellon(f.text, f.name);
        const plated = id.plated === false ? false : d.plated;
        hits.push(...d.hits.map((h) => ({ ...h, plated })));
        drills++;
      } else if ((id.kind === "paste" || id.kind === "mask") && (id.side === "top" || id.side === "bottom")) {
        (layers[`${id.kind}:${id.side}`] ??= []).push(...parseGerber(f.text, f.name).objects);
      }
    } catch {
      // An unreadable file is skipped; the rest still measure.
    }
  }
  const side = (s: "top" | "bottom"): MeasuredSide | null => {
    try {
      if (layers[`paste:${s}`]?.length) return measureLayer(layers[`paste:${s}`], "paste-layer", hits);
      if (layers[`mask:${s}`]?.length) return measureLayer(layers[`mask:${s}`], "mask-openings", hits);
    } catch {
      // fall through
    }
    return null;
  };
  const paste = { top: side("top"), bottom: side("bottom") };
  const plated = hits.filter((h) => h.plated);
  const holes = drills
    ? { plated: plated.length, component: plated.filter((h) => h.d >= COMPONENT_HOLE_MM).length, vias: plated.filter((h) => h.d < COMPONENT_HOLE_MM).length, nonPlated: hits.length - plated.length }
    : null;
  return paste.top || paste.bottom || holes ? { paste, holes } : null;
}

export function readFab(raw: unknown): FabMeasure | null {
  const f = raw as FabMeasure | null;
  return f && typeof f === "object" && f.paste && typeof f.paste === "object" ? f : null;
}
