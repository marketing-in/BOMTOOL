/**
 * Conversion cost from the product's own process route (src/lib/ops/route.ts): every step it goes through on our
 * lines, priced with the plant rates. SMT time per side = placements ÷ (line cph × efficiency), never faster than
 * the line's shortest cycle, at the line-hour rate; set-up per side per lot; the rest per part, board or unit.
 */
import type { Rates } from "@/data/costing";
import type { RouteStage } from "@/lib/ops/route";
import { pasteCostForSide } from "@/lib/feasibility/paste";

export type ProcessStepIn = { key: string; stage: RouteStage; title: string; side: "TOP" | "BOTTOM" | null; refs: number; line: string | null; /** Printing steps: grams of paste on one board (src/lib/feasibility/paste.ts). */ pasteGrams?: number };

export type ProcessCost = {
  key: string;
  stage: RouteStage;
  title: string;
  /** INR per board. */
  perBoard: number;
  /** INR once per lot (set-up, kitting). */
  perLot: number;
  /** Seconds per board where the step is machine-timed. */
  seconds: number | null;
  note: string;
};

export type NreItem = { key: string; label: string; amount: number };

const IN_LINE = /^(print|spi|reflow|aoi)-/;

export function processCosts(steps: ProcessStepIn[], lines: { code: string; capacityCph: number | null }[], r: Rates): { steps: ProcessCost[]; nre: NreItem[] } {
  const cph = (code: string | null) => lines.find((l) => l.code === code)?.capacityCph ?? lines.find((l) => l.capacityCph)?.capacityCph ?? 30_000;
  const out: ProcessCost[] = steps.map((s) => {
    const base = { key: s.key, stage: s.stage, title: s.title, perBoard: 0, perLot: 0, seconds: null as number | null };
    if (s.key.startsWith("place-")) {
      const rate = cph(s.line) * r.smtEfficiency;
      const seconds = Math.max(r.smtMinCycleSec, (s.refs / Math.max(1, rate)) * 3600);
      return {
        ...base,
        seconds: Math.round(seconds * 10) / 10,
        perBoard: (seconds / 3600) * r.smtLinePerHour,
        perLot: r.smtSetupHoursPerSide * r.smtLinePerHour,
        note: `${s.refs} placements on ${s.line ?? "the SMT line"} — ${seconds.toFixed(0)} s a board at ${Math.round(r.smtEfficiency * 100)} % of ${cph(s.line).toLocaleString("en-IN")} cph; set-up ${r.smtSetupHoursPerSide} h a lot`,
      };
    }
    if (s.key.startsWith("print-") && s.pasteGrams) {
      const c = pasteCostForSide(s.pasteGrams, r.pastePerKg);
      return { ...base, perBoard: c.perBoard, perLot: c.perLot, note: `${s.pasteGrams.toFixed(2)} g of paste a board at ₹${r.pastePerKg.toLocaleString("en-IN")}/kg, plus one stencil load a lot; printing time is in the SMT line rate` };
    }
    if (IN_LINE.test(s.key)) return { ...base, note: "Included in the SMT line rate" };
    switch (s.key.replace(/-(top|bottom)$/, "")) {
      case "fab":
        return { ...base, note: "Bare board — priced in step 1" };
      case "kitting":
        return { ...base, perLot: r.kittingPerLot, note: "Picking, counting and verifying the kit, once a lot" };
      case "insert":
        return { ...base, perBoard: s.refs * r.thtPerPart, note: `${s.refs} through-hole parts × ₹${r.thtPerPart}` };
      case "press-fit":
        return { ...base, perBoard: s.refs * r.pressFitPerPart, note: `${s.refs} press-fit parts × ₹${r.pressFitPerPart}` };
      case "xray":
        return { ...base, perBoard: r.xrayPerBoard, note: "Hidden joints (BGA, QFN) on every board" };
      case "clean":
        return { ...base, perBoard: r.cleanPerBoard, note: "Flux removal before coating" };
      case "coat":
        return { ...base, perBoard: r.coatingPerBoard, note: "Conformal coat with masking" };
      case "depanel":
        return { ...base, perBoard: r.depanelPerBoard, note: "Router or v-score break-out" };
      case "program":
        return { ...base, perBoard: r.programPerBoard, note: "Firmware load and serial number" };
      case "fct":
        return { ...base, perBoard: r.testPerBoard, note: "Functional test" };
      case "assemble":
        return { ...base, perBoard: r.boxBuildMinutes * r.labourPerMinute, note: `${r.boxBuildMinutes} min × ₹${r.labourPerMinute}/min` };
      case "system-test":
        return { ...base, perBoard: r.systemTestPerUnit, note: "Finished-product test" };
      case "pack":
        return { ...base, perBoard: r.packingPerUnit, note: "ESD bag, carton and label" };
      default:
        return { ...base, note: "" };
    }
  });
  const sides = steps.filter((s) => s.key.startsWith("place-")).length;
  const nre: NreItem[] = [
    ...(sides ? [{ key: "stencil", label: `Stencil${sides > 1 ? "s" : ""} (${sides} side${sides > 1 ? "s" : ""})`, amount: r.nre.stencilPerSide * sides }] : []),
    ...(sides ? [{ key: "programming", label: "Placement and AOI programmes", amount: r.nre.programming }] : []),
    { key: "first-article", label: "First-article inspection", amount: r.nre.firstArticle },
    ...(steps.some((s) => s.key === "fct") && r.nre.testFixture > 0 ? [{ key: "fixture", label: "Functional test fixture", amount: r.nre.testFixture }] : []),
  ];
  return { steps: out, nre };
}
