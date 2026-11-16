import "server-only";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/currency";
import { getBuild } from "@/server/build";
import { countDnp, countJoints } from "@/lib/feasibility/joints";
import { ASSEMBLY } from "@/data/assembly";
import { dnpPasteGrams, pasteByPackage, pasteForLot, solderForLot } from "@/lib/feasibility/paste";
import { panelise } from "@/lib/feasibility/panel";
import { smtLineSheet } from "@/lib/feasibility/smt-line";
import { consumablesForLot, maskedParts } from "@/lib/feasibility/consumables";
import { analyseExpenses } from "@/lib/costing/expenses";
import { planCapacity } from "@/lib/feasibility/capacity";
import { buildChecks, gateStates, readSignoffs, reviewPassed, verdict, type Facts } from "@/lib/feasibility/gates";
import { feederSetups, lineFits, type JobNeeds, type LineCapability } from "@/lib/ops/planning";
import { effectiveCapability } from "@/lib/ops/machines";

/**
 * "Can we build it?" (Phase 15) for one BoM revision at one quantity: joints, paste, shifts and cost gathered from
 * Build & quote, the process route and our lines, judged gate by gate, with the review's sign-offs.
 */

const CHIPS = ["01005", "0201", "0402", "0603", "0805", "1206", "1210", "2512"];

/** The review in force for a revision: the newest that has not been superseded. */
export function loadReview(revisionId: string) {
  return db.feasibilityReview.findFirst({ where: { revisionId, status: { not: "SUPERSEDED" } }, orderBy: { createdAt: "desc" } });
}

export async function getFeasibility(revisionId: string, wantQty?: number) {
  const [b, lines, review, superseded] = await Promise.all([
    getBuild(revisionId),
    db.line.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, include: { machines: true } }),
    loadReview(revisionId),
    db.feasibilityReview.count({ where: { revisionId, status: "SUPERSEDED" } }),
  ]);
  if (!b) return null;

  // A review is made for one quantity; once it exists the study stays on it.
  const qty = review && b.quantities.includes(review.qty) ? review.qty : wantQty && b.quantities.includes(wantQty) ? wantQty : b.refQty;
  const quote = b.quotes.find((q) => q.qty === qty) ?? b.quotes[0];
  const route = b.viewer.route;
  const step = (key: string) => route.find((s) => s.key === key) ?? null;
  const parts = b.assembly.parts;
  const joints = countJoints(parts);
  const dnp = countDnp(b.assembly.dnp);
  // The plant's pin count takes the do-not-populate parts with it; the joints we solder and inspect do not.
  const dnpPins = ASSEMBLY.dnp.inPinCount ? dnp.weighted : 0;
  const pinCount = joints.weighted + dnpPins;
  const panel = panelise(b.board.facts.widthMm, b.board.facts.heightMm);
  const smt = parts.filter((p) => p.mount === "SMT");

  // ── Lines
  const lineByCode = new Map(lines.map((l) => [l.code, l]));
  const has = (type: string) => lines.some((l) => l.machines.some((m) => m.type === type));
  const cap = (k: keyof LineCapability) => lines.some((l) => !!effectiveCapability(l)[k]);
  const chipNames = smt.filter((p) => p.kind === "chip" && p.pkg).map((p) => CHIPS.find((c) => new RegExp(`(^|[^0-9])${c}([^0-9]|$)`).test(p.pkg!))).filter((x): x is string => !!x);
  const smallestChip = [...chipNames].sort((x, y) => CHIPS.indexOf(x) - CHIPS.indexOf(y))[0] ?? null;
  const needs: JobNeeds = {
    smallestChip,
    finestPitchMm: joints.finestPitchMm,
    hasBga: smt.some((p) => p.kind === "array"),
    boardMm: [b.board.facts.widthMm, b.board.facts.heightMm],
    doubleSided: joints.smt.TOP.placements > 0 && joints.smt.BOTTOM.placements > 0,
    hasTht: joints.tht.parts > 0,
    smdLines: smt.length,
  };
  const smtLines = lines.filter((l) => l.type === "SMT" || l.type === "MIXED");
  const fits = smtLines.map((l) => ({ l, fit: lineFits(l.type, effectiveCapability(l), needs) }));
  const lineGaps = !smt.length || fits.some((x) => x.fit.ok) ? [] : smtLines.length ? fits.map((x) => `${x.l.code}: ${x.fit.reasons.join(", ")}`) : ["no SMT line on file"];
  const placeSteps = route.filter((s) => s.key.startsWith("place-"));
  const smtLine = lineByCode.get(placeSteps[0]?.where?.line ?? "") ?? fits.find((x) => x.fit.ok)?.l ?? null;
  const viewerByRef = new Map(b.viewer.parts.map((p) => [p.refDes, p]));
  const uniqueSmd = new Map<string, { wide: boolean }>();
  for (const p of smt) {
    const v = viewerByRef.get(p.refDes);
    uniqueSmd.set(v?.partId ?? v?.mpn ?? `${p.pkg}:${v?.value ?? p.refDes}`, { wide: Math.max(p.lengthMm, p.widthMm) > 8 });
  }
  const feeders = smt.length ? feederSetups([...uniqueSmd.values()], smtLine?.feederSlots ?? null) : null;

  // ── Capacity
  const thtLine = lines.find((l) => l.type === "THT" || l.type === "MIXED") ?? null;
  const boxLine = lines.find((l) => l.type === "BOX_BUILD") ?? null;
  const coat = step("coat");
  const masked = coat ? maskedParts(parts) : [];
  const capacity = planCapacity({
    qty,
    smt: placeSteps.map((s) => ({
      side: s.side ?? "TOP",
      line: s.where?.line ?? null,
      placements: s.refs.length,
      secondsPerBoard: b.process.steps.find((p) => p.key === s.key)?.seconds ?? b.rates.smtMinCycleSec,
      setupHours: b.rates.smtSetupHoursPerSide,
      shiftsPerDay: lineByCode.get(s.where?.line ?? "")?.shiftsPerDay ?? 2,
    })),
    tht: joints.tht.parts || joints.pressFit.parts ? { parts: joints.tht.parts, joints: joints.tht.joints, selective: !!step("selective"), pressFitParts: joints.pressFit.parts, line: thtLine?.code ?? null, shiftsPerDay: thtLine?.shiftsPerDay ?? 2 } : null,
    coating: !!coat,
    maskParts: masked.length,
    test: { nets: joints.inspection.probeNets, ict: !!step("ict"), program: !!step("program"), line: thtLine?.code ?? null, shiftsPerDay: thtLine?.shiftsPerDay ?? 2 },
    box: b.box.chosen ? { minutesPerUnit: b.rates.boxBuildMinutes, line: boxLine?.code ?? null, shiftsPerDay: boxLine?.shiftsPerDay ?? 1 } : null,
  });
  const smtHas = (type: string) => !!smtLine && smtLine.machines.some((m) => m.type === type);
  const smtSheet = placeSteps.length
    ? smtLineSheet({
        qty,
        parts,
        paste: b.paste.sides,
        panel,
        passes: placeSteps.map((s) => ({ side: s.side ?? "TOP", secondsPerBoard: b.process.steps.find((p) => p.key === s.key)?.seconds ?? b.rates.smtMinCycleSec, setupHours: b.rates.smtSetupHoursPerSide })),
        line: smtLine ? { code: smtLine.code, name: smtLine.name, capacityCph: smtLine.capacityCph, feederSlots: smtLine.feederSlots, hasSpi: smtHas("SPI"), hasAoi: smtHas("AOI"), hasXray: smtHas("XRAY") } : null,
        feeders,
        moistureSensitive: step("kitting")?.refs.length ?? 0,
        board: { layers: b.board.facts.layers, thicknessMm: b.board.facts.thicknessMm },
      })
    : null;
  const worstRatio = smtSheet ? smtSheet.sides.map((s) => s.areaRatio).filter((x) => !!x).sort((a, b) => a.value - b.value)[0] ?? null : null;
  const smtShifts = capacity.stages.filter((s) => s.key.startsWith("smt-")).reduce((s, x) => s + x.shifts, 0);
  const pasteLot = pasteForLot(b.paste, qty, smtShifts, b.rates.pastePerKg);
  const solderLot = solderForLot(joints.tht.joints, qty);

  // ── Facts → checks
  const counted = b.lines.filter((l) => !l.dnp && !l.excluded);
  const fab = b.board.chosen?.kind === "fab" ? [...b.board.fabs, ...b.board.online].find((f) => f.id === b.board.chosen!.id) ?? null : null;
  const boxPrice = b.box.chosen?.prices.find((p) => p.qty === qty) ?? null;
  const pastePerBoard = quote.rows.filter((r) => r.key.startsWith("p:print-")).reduce((s, r) => s + r.perBoard, 0);
  const inr = (v: number) => formatMoney(v, "INR", { unit: true });
  const bottleneck = capacity.stages.find((s) => s.key === capacity.bottleneck)?.label ?? null;
  const facts: Facts = {
    revisionId,
    qty,
    data: { boardSource: b.board.facts.source, placed: !b.viewer.approximateLayout, pasteSource: b.paste.source, lines: counted.length, unmatched: counted.filter((l) => !l.partId).length, assumedPins: b.assembly.assumed, parts: parts.length, dnp: { parts: dnp.parts, pins: dnp.pins } },
    board: {
      chosen: !!b.board.chosen,
      auto: !!b.board.chosen && b.board.chosen.auto,
      fits: b.board.chosen?.kind === "stock" ? true : (fab?.fits ?? false),
      name: b.board.chosenName,
      gaps: fab?.gaps ?? [],
      layers: b.board.facts.layers,
      sizeMm: [b.board.facts.widthMm, b.board.facts.heightMm],
      leadDays: b.board.leadDays,
    },
    parts: {
      counted: counted.length,
      unpriced: quote.unpriced,
      short: counted.filter((l) => l.partId && l.plan.reduce((s, a) => s + a.qty, 0) < l.required).length,
      redRisk: counted.filter((l) => l.risk?.level === "red").length,
      amberRisk: counted.filter((l) => l.risk?.level === "amber").length,
    },
    smt: {
      placements: joints.placements,
      sides: placeSteps.length,
      joints: joints.smt.TOP.joints + joints.smt.BOTTOM.joints,
      line: smtLine ? `${smtLine.code} (${smtLine.name})` : null,
      lineGaps,
      finestPitchMm: joints.finestPitchMm,
      smallestChip,
      hidden: joints.hidden.parts,
      xray: has("XRAY"),
      feeders,
      moistureSensitive: step("kitting")?.refs.length ?? 0,
      watch: [...new Set(route.filter((s) => s.stage === "smt" && s.watch).map((s) => s.watch!))],
      stencilUm: b.paste.sides.length ? Math.min(...b.paste.sides.map((s) => s.stencilUm)) : null,
      pasteG: b.paste.gramsPerBoard,
      areaRatio: worstRatio ? { value: worstRatio.value, ref: worstRatio.ref, min: ASSEMBLY.smt.minAreaRatio } : null,
    },
    tht: {
      parts: joints.tht.parts,
      joints: joints.tht.joints,
      selective: !!step("selective"),
      solderCapable: step("selective") ? cap("selective") || has("SELECTIVE_SOLDER") : cap("wave") || has("WAVE_SOLDER"),
      pressFit: joints.pressFit.parts,
      pressFitCapable: cap("pressFit") || has("PRESS_FIT"),
      coating: coat ? (coat.title.match(/\(([^)]+)\)/)?.[1] ?? "conformal") : null,
      coatCapable: cap("conformalCoat") || has("CONFORMAL_COATER"),
      masked: masked.length,
    },
    test: {
      inspected: { spi: joints.inspection.spiDeposits, aoi: joints.inspection.aoiJoints, xray: joints.inspection.xrayJoints, tht: joints.inspection.thtJoints },
      pins: { weighted: pinCount, doubledParts: joints.doubled.parts, dnpPins },
      nets: joints.inspection.probeNets,
      ict: !!step("ict"),
      probeCapable: has("FLYING_PROBE") || has("ICT"),
      programmable: step("program")?.refs.length ?? 0,
      fct: !!step("fct"),
    },
    box: {
      wanted: !!b.box.chosen,
      name: b.box.chosen?.spec.label ?? null,
      fits: b.box.chosen?.fits ?? true,
      fitText: b.box.chosen?.fitText ?? "",
      kitGaps: b.box.chosen ? b.box.kit.filter((k) => k.status === "missing" || k.status === "check").length : 0,
      priced: !b.box.chosen || (boxPrice?.unit ?? null) !== null,
    },
    cost: {
      unitPrice: quote.unitPrice,
      unpriced: quote.unpriced,
      boardPriced: !!b.boardAt(qty),
      marginPct: b.rates.marginPct,
      pastePerBoard,
      text: `${inr(quote.unitPrice)} a board ex-GST at ${qty.toLocaleString("en-IN")} pcs: material ${inr(quote.material)}, conversion ${inr(quote.conversion)}, one-off costs ${formatMoney(quote.nreTotal, "INR")}.`,
    },
    capacity: { shifts: capacity.totalShifts, days: capacity.days, bottleneck, materialLeadDays: Math.max(0, b.leadDays - 7), lotHours: capacity.totalHours },
  };
  const checks = buildChecks(facts);
  const signoffs = readSignoffs(review?.signoffs);

  return {
    revisionId,
    title: b.title,
    product: b.product,
    qty,
    quantities: b.quantities,
    build: b,
    quote,
    joints,
    paste: b.paste,
    pasteLot,
    pasteByPackage: pasteByPackage(ASSEMBLY.dnp.inPaste ? [...parts, ...b.assembly.dnp] : parts, b.paste),
    pinCount,
    solderLot,
    dnp: { ...dnp, pasteG: dnpPasteGrams(b.assembly.dnp), counted: ASSEMBLY.dnp.inPinCount, printed: ASSEMBLY.dnp.inPaste },
    panel,
    smtSheet,
    panels: Math.ceil(qty / panel.boards),
    masked: masked.map((p) => p.refDes),
    coating: !!coat,
    consumables: consumablesForLot({
      qty,
      boardAreaCm2: (b.board.facts.widthMm * b.board.facts.heightMm) / 100,
      paste: b.paste.sides.length ? { perBoardG: b.paste.gramsPerBoard, issueG: pasteLot.issueG, cost: pasteLot.cost, jars: pasteLot.jars } : null,
      solder: joints.tht.joints ? solderLot : null,
      wave: joints.tht.parts > 0,
      sides: b.paste.sides.length,
      boardsPerPanel: panel.boards,
      coating: !!coat,
      masked: masked.length,
      boxed: !!b.box.chosen,
    }),
    smtLine: smtLine ? { code: smtLine.code, name: smtLine.name, shiftsPerDay: smtLine.shiftsPerDay } : null,
    /** What we spend against what we charge, at every quoted quantity. */
    expenses: b.quotes.map((q) => analyseExpenses(q, { chargeMoqExcess: b.rates.chargeMoqExcess, solderLot: solderForLot(joints.tht.joints, q.qty).cost })),
    holes: b.viewer.board.fab?.holes ?? null,
    capacity,
    facts,
    checks,
    verdict: verdict(checks),
    gates: gateStates(checks, signoffs),
    review: review ? { id: review.id, qty: review.qty, status: review.status, createdAt: review.createdAt, closedAt: review.closedAt, passed: reviewPassed(signoffs) } : null,
    superseded,
  };
}

export type Feasibility = NonNullable<Awaited<ReturnType<typeof getFeasibility>>>;
