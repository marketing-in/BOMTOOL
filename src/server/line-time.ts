import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { ASSEMBLY } from "@/data/assembly";
import { getFeasibility } from "@/server/feasibility";
import { lineFitFor } from "@/server/lines";
import { estimateAll, historyRow, lineNow, measuredCph, type HistoryIn, type LineIn, type QueueIn } from "@/lib/ops/line-time";

/**
 * Line fit for one BoM revision (Part 1): which lines can build it machine by machine, how long the lot takes on each,
 * what the lines took on older jobs and what they are running now — so planning sees the earliest finish.
 */
export const lineTimeFor = cache(async (revisionId: string, wantQty?: number) => {
  const [f, plant, lines, rev] = await Promise.all([
    getFeasibility(revisionId, wantQty),
    lineFitFor(revisionId),
    db.line.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }], include: { machines: { orderBy: { position: "asc" } } } }),
    db.bomRevision.findUnique({ where: { id: revisionId }, select: { bom: { select: { projectId: true } } } }),
  ]);
  if (!f || !plant || !rev) return null;

  const rates = { smtEfficiency: f.build.rates.smtEfficiency, smtMinCycleSec: f.build.rates.smtMinCycleSec, smtSetupHoursPerSide: f.build.rates.smtSetupHoursPerSide, hoursPerShift: ASSEMBLY.shift.hours * ASSEMBLY.shift.productive };
  const sides = (["TOP", "BOTTOM"] as const).map((side) => ({ side, placements: f.joints.smt[side].placements })).filter((s) => s.placements > 0);
  const otherHours = f.capacity.stages.filter((s) => !s.key.startsWith("smt-")).reduce((s, x) => s + x.hours, 0);
  const job = { qty: f.qty, sides, otherHours };

  const smtLines: LineIn[] = lines.filter((l) => l.type === "SMT" || l.type === "MIXED").map((l) => ({ id: l.id, code: l.code, name: l.name, type: l.type, shiftsPerDay: l.shiftsPerDay, capacityCph: l.capacityCph, actualCph: measuredCph(l.machines) }));
  const allLines: LineIn[] = lines.map((l) => ({ id: l.id, code: l.code, name: l.name, type: l.type, shiftsPerDay: l.shiftsPerDay, capacityCph: l.capacityCph, actualCph: measuredCph(l.machines) }));

  // ── Older jobs: finished work orders, newest first, with placements per board from their own BoM.
  const done = await db.workOrder.findMany({
    where: { status: "DONE" },
    orderBy: [{ finishedAt: "desc" }, { plannedEnd: "desc" }],
    take: 40,
    select: { id: true, number: true, buildQty: true, lineId: true, startedAt: true, finishedAt: true, plannedStart: true, plannedEnd: true, projectId: true, line: { select: { code: true, shiftsPerDay: true } }, project: { select: { name: true } }, bomRevision: { select: { id: true, revision: true } } },
  });
  const revIds = [...new Set(done.map((w) => w.bomRevision.id))];
  const sums = revIds.length ? await db.bomLine.groupBy({ by: ["revisionId"], where: { revisionId: { in: revIds }, dnp: false }, _sum: { qtyPerBoard: true } }) : [];
  const perBoard = new Map(sums.map((s) => [s.revisionId, s._sum.qtyPerBoard ?? 0]));
  const historyIn: HistoryIn[] = done.flatMap((w) => {
    const actual = w.startedAt && w.finishedAt;
    const start = actual ? w.startedAt! : w.plannedStart;
    const end = actual ? w.finishedAt! : w.plannedEnd;
    if (!start || !end || end <= start) return [];
    return [{ id: w.id, number: w.number, project: w.project.name, revision: w.bomRevision.revision, lineId: w.lineId, lineCode: w.line?.code ?? null, shiftsPerDay: w.line?.shiftsPerDay ?? 2, qty: w.buildQty, placementsPerBoard: perBoard.get(w.bomRevision.id) ?? 0, start, end, basis: actual ? ("actual" as const) : ("planned" as const), sameProject: w.projectId === rev.bom.projectId }];
  });
  const history = historyIn.map((h) => historyRow(h, rates.hoursPerShift)).sort((a, b) => Number(b.sameProject) - Number(a.sameProject) || b.end.getTime() - a.end.getTime());

  // ── Now: in progress and queued on every line.
  const open = await db.workOrder.findMany({
    where: { status: { in: ["PLANNED", "KITTING", "READY", "IN_PROGRESS", "ON_HOLD"] }, lineId: { not: null } },
    select: { id: true, number: true, status: true, lineId: true, buildQty: true, plannedStart: true, plannedEnd: true, startedAt: true, project: { select: { name: true } } },
  });
  const queue: QueueIn[] = open.map((w) => ({ id: w.id, number: w.number, project: w.project.name, lineId: w.lineId, status: w.status, qty: w.buildQty, start: w.startedAt ?? w.plannedStart, end: w.plannedEnd, startedAt: w.startedAt }));

  const estimates = estimateAll(smtLines, job, rates, history);
  const now = new Date();
  const lotHours = (lineId: string) => {
    const e = estimates.find((x) => x.lineId === lineId);
    return e ? (e.fromHistory?.totalHours ?? e.totalHours) : f.capacity.totalHours;
  };
  const nowByLine = allLines.map((l) => lineNow(l, queue, lotHours(l.id), now, rates.hoursPerShift));

  // The machines of each line, with make, model, year and the limits on file, for the machine details table.
  const machines = lines.map((l) => ({ lineId: l.id, code: l.code, name: l.name, type: l.type, machines: l.machines.map((m) => ({ id: m.id, type: m.type, vendor: m.vendor, model: m.model, position: m.position, specs: m.specs })) }));

  return { title: f.title, product: f.product, qty: f.qty, quantities: f.quantities, plant, job, rates, estimates, history, now: nowByLine, lines: allLines, machines, capacity: f.capacity, smtSheet: f.smtSheet };
});

export type LineTime = NonNullable<Awaited<ReturnType<typeof lineTimeFor>>>;
