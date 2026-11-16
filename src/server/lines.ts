import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { getBuild } from "@/server/build";
import { buildNeeds, checkPlant, effectiveCapability, readSpecs, specCoverage, type LineIn, type PlantCheck } from "@/lib/ops/machines";
import { checkProcess, type ProcessCheck } from "@/lib/ops/process-check";
import type { RouteStep } from "@/lib/ops/route";

/** Every line with its machines in flow order — active and retired — for the setup page and the assistant. */
export const loadLines = cache(async () => {
  const lines = await db.line.findMany({
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    include: {
      machines: { orderBy: { position: "asc" } },
      workOrders: { where: { status: { notIn: ["DONE", "CANCELLED"] } }, orderBy: { plannedStart: "asc" }, take: 6, select: { id: true, number: true, buildQty: true, clearToBuildPct: true, project: { select: { name: true } } } },
      _count: { select: { workOrders: true } },
    },
  });
  return lines.map((l) => ({ ...l, effective: effectiveCapability(l) }));
});

export type LoadedLine = Awaited<ReturnType<typeof loadLines>>[number];

const asLineIn = (l: LoadedLine): LineIn => ({ id: l.id, code: l.code, name: l.name, type: l.type, active: l.active, capability: l.capability, machines: l.machines });

/**
 * Can our machines build this BoM revision? Its parts (with heights from the 3D bodies), the board from the Gerbers
 * or the project spec, and the steps the process route asks for, judged line by line and machine by machine.
 */
export const lineFitFor = cache(async (revisionId: string): Promise<PlantCheck | null> => {
  const [b, lines] = await Promise.all([getBuild(revisionId), loadLines()]);
  if (!b) return null;
  const height = new Map(b.viewer.parts.map((p) => [p.refDes, p.body.height]));
  const route = new Set(b.viewer.route.map((s) => s.key));
  const needs = buildNeeds(
    b.assembly.parts.map((p) => ({ ...p, heightMm: height.get(p.refDes) ?? null })),
    { widthMm: b.board.facts.widthMm, heightMm: b.board.facts.heightMm, thicknessMm: b.board.facts.thicknessMm },
    { coating: route.has("coat"), ict: route.has("ict"), box: !!b.box.chosen },
  );
  // The line the route planned for each job wins a tie, so this check and the route name the same line.
  const planned = (stages: string[]) => b.viewer.route.find((s) => stages.includes(s.stage) && s.where)?.where?.line;
  return checkPlant(lines.map(asLineIn), needs, { smt: planned(["smt"]), tht: planned(["tht", "post"]), box: planned(["box"]) });
});

/**
 * The whole process for this BoM revision against our plant: every route step — masking, coating, test, final
 * inspection, packing, dispatch included — with the machine or bench that does it, and the order checked.
 */
export const processCheckFor = cache(async (revisionId: string): Promise<{ check: ProcessCheck; route: RouteStep[]; needs: PlantCheck["needs"] } | null> => {
  const [b, lines, plant] = await Promise.all([getBuild(revisionId), loadLines(), lineFitFor(revisionId)]);
  if (!b || !plant) return null;
  const route = b.viewer.route as RouteStep[];
  const boardMm: [number, number] | null = b.board.facts.widthMm && b.board.facts.heightMm ? [b.board.facts.widthMm, b.board.facts.heightMm] : null;
  return { check: checkProcess(route, lines.map(asLineIn), boardMm), route, needs: plant.needs };
});

/** The lines as the assistant reads them: machines, their limits and where those came from. */
export async function linesForAssistant() {
  const lines = await loadLines();
  return lines.map((l) => ({
    code: l.code,
    name: l.name,
    type: l.type,
    active: l.active,
    shiftsPerDay: l.shiftsPerDay,
    capability: Object.fromEntries(Object.entries(l.effective).filter(([k]) => k !== "fromMachines")),
    capabilityFromMachines: l.effective.fromMachines,
    machines: l.machines.map((m) => {
      const { specs, source } = readSpecs(m.specs);
      const cover = specCoverage(m.type, specs);
      return { position: m.position, type: m.type, make: m.vendor, model: m.model, limits: specs, limitsOnFile: `${cover.have} of ${cover.of}`, limitsFrom: source?.by ?? null };
    }),
  }));
}
