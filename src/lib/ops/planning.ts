/** Pure planning maths: clear-to-build, line capability matching, feeder setups, FIFO reservation. */

export type CtbLine = { lineId: string; partId: string | null; required: number; dnp: boolean; available: number; onOrder?: number };

export type CtbResult = {
  /** % of placeable lines fully covered by stock we hold. */
  pct: number;
  /** Same, counting stock on open PO drafts too. */
  pctWithOrders: number;
  blocking: { lineId: string; partId: string | null; short: number; reason: "UNMATCHED" | "SHORT" }[];
};

export function clearToBuild(lines: CtbLine[]): CtbResult {
  const counted = lines.filter((l) => !l.dnp && l.required > 0);
  if (!counted.length) return { pct: 100, pctWithOrders: 100, blocking: [] };
  const blocking: CtbResult["blocking"] = [];
  let ok = 0;
  let okWithOrders = 0;
  for (const l of counted) {
    if (!l.partId) {
      blocking.push({ lineId: l.lineId, partId: null, short: l.required, reason: "UNMATCHED" });
      continue;
    }
    const short = Math.max(0, l.required - l.available);
    if (short === 0) ok++;
    else blocking.push({ lineId: l.lineId, partId: l.partId, short, reason: "SHORT" });
    if (Math.max(0, l.required - l.available - (l.onOrder ?? 0)) === 0) okWithOrders++;
  }
  return {
    pct: Math.round((ok / counted.length) * 100),
    pctWithOrders: Math.round((okWithOrders / counted.length) * 100),
    blocking: blocking.sort((a, b) => b.short - a.short),
  };
}

export type LineCapability = {
  minChip?: string; // "0201"
  minPitchMm?: number;
  bga?: boolean;
  maxBoardMm?: [number, number];
  minBoardMm?: [number, number];
  doubleSided?: boolean;
  wave?: boolean;
  selective?: boolean;
  pressFit?: boolean;
  conformalCoat?: boolean;
  harness?: boolean;
  /** Tallest part the line can place and pass through its machines (src/lib/ops/machines.ts). */
  maxComponentHeightMm?: number;
};

export type JobNeeds = {
  smallestChip: string | null; // imperial code
  finestPitchMm: number | null;
  hasBga: boolean;
  boardMm: [number, number] | null;
  doubleSided: boolean;
  hasTht: boolean;
  smdLines: number;
};

const CHIP_ORDER = ["01005", "0201", "0402", "0603", "0805", "1206", "1210", "2512"];

export type LineFit = { ok: boolean; reasons: string[] };

/** Can this line build this job? Reasons explain every blocker. SMT lines only judge SMT needs. */
export function lineFits(type: string, cap: LineCapability, job: JobNeeds): LineFit {
  const reasons: string[] = [];
  if (type === "SMT" || type === "MIXED") {
    if (job.smallestChip && cap.minChip && CHIP_ORDER.indexOf(job.smallestChip) < CHIP_ORDER.indexOf(cap.minChip)) reasons.push(`smallest chip ${job.smallestChip} < line minimum ${cap.minChip}`);
    if (job.finestPitchMm && cap.minPitchMm && job.finestPitchMm < cap.minPitchMm) reasons.push(`pitch ${job.finestPitchMm} mm < line minimum ${cap.minPitchMm} mm`);
    if (job.hasBga && !cap.bga) reasons.push("BGA needs X-ray-capable line");
    if (job.doubleSided && cap.doubleSided === false) reasons.push("double-sided reflow not supported");
    if (job.boardMm && cap.maxBoardMm) {
      const [w, h] = [...job.boardMm].sort((a, b) => b - a);
      const [mw, mh] = [...cap.maxBoardMm].sort((a, b) => b - a);
      if (w > mw || h > mh) reasons.push(`board ${job.boardMm.join("×")} mm exceeds ${cap.maxBoardMm.join("×")} mm`);
    }
  } else if (type === "THT") {
    if (!job.hasTht) reasons.push("job has no through-hole parts");
  } else if (type === "BOX_BUILD") {
    // Box-build follows assembly; always eligible as a downstream step.
  }
  return { ok: reasons.length === 0, reasons };
}

/** Feeder setups: unique SMD part numbers vs available slots (8 mm tape ≈ 1 slot; bigger parts ≈ 2). */
export function feederSetups(uniqueSmdParts: { wide: boolean }[], slots: number | null) {
  const needed = uniqueSmdParts.reduce((s, p) => s + (p.wide ? 2 : 1), 0);
  if (!slots) return { needed, slots: null, setups: needed ? 1 : 0, fits: true };
  const setups = Math.max(1, Math.ceil(needed / slots));
  return { needed, slots, setups, fits: needed <= slots };
}

export type Lot = { id: string; free: number; dateCode: string | null; receivedAt: Date; mslHoursLeft: number | null; consignedFor: string | null };

/**
 * Picks lots for a reservation: customer's consigned stock first, then FIFO by date code / receipt,
 * preferring moisture-sensitive lots with the least floor life left (use them before they expire).
 */
export function pickLots(lots: Lot[], qty: number, customerId: string): { lotId: string; qty: number }[] {
  const usable = lots.filter((l) => l.free > 0 && (!l.consignedFor || l.consignedFor === customerId));
  usable.sort((a, b) => {
    if (!!a.consignedFor !== !!b.consignedFor) return a.consignedFor ? -1 : 1;
    const am = a.mslHoursLeft ?? Infinity;
    const bm = b.mslHoursLeft ?? Infinity;
    if (am !== bm) return am - bm;
    const dc = (a.dateCode ?? "9999").localeCompare(b.dateCode ?? "9999");
    return dc || a.receivedAt.getTime() - b.receivedAt.getTime();
  });
  const out: { lotId: string; qty: number }[] = [];
  let left = qty;
  for (const l of usable) {
    if (left <= 0) break;
    const take = Math.min(l.free, left);
    out.push({ lotId: l.id, qty: take });
    left -= take;
  }
  return out;
}
