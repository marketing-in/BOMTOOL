/**
 * Process consumables for one build against what our stores hold (Phase 46): a stencil for every printed side, the
 * solder paste the lot uses up, flux for the wave and for rework. What a lot needs comes from the feasibility study
 * (src/lib/feasibility/consumables.ts, paste.ts); what we have from the consumables register. Pure. Looking only —
 * nothing is ordered from here.
 */
import type { Consumable as LotNeed } from "@/lib/feasibility/consumables";

export type RegisterKind = "SOLDER_PASTE" | "FLUX" | "STENCIL" | "OTHER";

export type RegisterSpec = { alloy?: string; powderType?: string; fluxType?: string; thicknessMm?: number; side?: "TOP" | "BOTTOM" | "BOTH"; frame?: string };

export type RegisterItem = {
  id: string;
  kind: RegisterKind;
  name: string;
  spec: RegisterSpec | null;
  quantity: number;
  unit: string;
  minQty: number | null;
  location: string | null;
  lot: string | null;
  expiresAt: Date | string | null;
  /** A stencil cut for one board: that BoM revision. */
  revisionId: string | null;
};

export type NeedStatus = "ok" | "short" | "missing" | "check";

export type ConsumableNeed = {
  key: string;
  label: string;
  /** What the build needs, in `unit`; null when the need is "one" (a stencil) or cannot be put in numbers. */
  need: number | null;
  unit: string;
  /** What the register holds that can serve, in `unit` (expired stock left out). */
  have: number;
  items: RegisterItem[];
  status: NeedStatus;
  note: string;
};

const DAY = 86_400_000;
const time = (d: Date | string | null) => (d ? new Date(d).getTime() : null);
const expired = (i: RegisterItem, now: number) => {
  const t = time(i.expiresAt);
  return t !== null && t < now;
};
const round = (v: number) => (v >= 100 ? Math.round(v) : v >= 1 ? Math.round(v * 10) / 10 : Math.round(v * 1000) / 1000);

/** Grams in a register quantity: paste is kept in g, kg or 500 g jars. */
export function gramsOf(i: Pick<RegisterItem, "quantity" | "unit">, jarG = 500): number | null {
  const u = i.unit.trim().toLowerCase();
  if (u === "g" || u === "gram" || u === "grams") return i.quantity;
  if (u === "kg") return i.quantity * 1000;
  if (/^jars?$/.test(u)) return i.quantity * jarG;
  return null;
}

/** Millilitres in a register quantity: flux is kept in ml or litres. */
export function mlOf(i: Pick<RegisterItem, "quantity" | "unit">): number | null {
  const u = i.unit.trim().toLowerCase();
  if (u === "ml") return i.quantity;
  if (u === "l" || u === "litre" || u === "liter" || u === "litres" || u === "liters") return i.quantity * 1000;
  return null;
}

/** The paste powder a foil calls for: type 5 under 100 µm, type 4 otherwise (the plant's standard). */
export const powderFor = (stencilUm: number) => (stencilUm <= 100 ? "Type 5" : "Type 4");

export type NeedsInput = {
  revisionId: string;
  /** Printed sides and the foil each needs (feasibility's paste sides). */
  sides: { side: "TOP" | "BOTTOM"; stencilUm: number }[];
  /** The lot's consumables from the feasibility study. */
  lot: LotNeed[];
  now?: number;
  jarG?: number;
};

/** What the build needs against the register, paste, flux and stencils first. */
export function consumableNeeds(input: NeedsInput, register: RegisterItem[]): ConsumableNeed[] {
  const now = input.now ?? Date.now();
  const jarG = input.jarG ?? 500;
  const out: ConsumableNeed[] = [];

  // A stencil for every printed side, cut for this board.
  for (const s of input.sides) {
    const mine = register.filter((i) => i.kind === "STENCIL" && i.revisionId === input.revisionId && (!i.spec?.side || i.spec.side === s.side || i.spec.side === "BOTH"));
    const usable = mine.filter((i) => i.quantity > 0);
    const want = s.stencilUm / 1000;
    const off = usable.filter((i) => i.spec?.thicknessMm && Math.abs(i.spec.thicknessMm - want) > 0.015);
    out.push({
      key: `stencil-${s.side.toLowerCase()}`,
      label: `Stencil, ${s.side === "TOP" ? "top" : "bottom"}`,
      need: 1,
      unit: "pcs",
      have: usable.length,
      items: mine,
      status: !usable.length ? "missing" : off.length === usable.length ? "check" : "ok",
      note: !usable.length
        ? `none on file for this board: a ${s.stencilUm} µm foil for the ${s.side === "TOP" ? "top" : "bottom"} side`
        : off.length === usable.length
          ? `on file at ${off.map((i) => i.spec!.thicknessMm).join(", ")} mm; the finest pads call for ${want.toFixed(2)} mm`
          : `${s.stencilUm} µm foil`,
    });
  }

  // Paste: grams for the lot, from jars that are still in date.
  const paste = input.lot.find((l) => l.key === "paste");
  if (paste) {
    const jars = register.filter((i) => i.kind === "SOLDER_PASTE");
    const fresh = jars.filter((i) => !expired(i, now));
    const have = fresh.reduce((s, i) => s + (gramsOf(i, jarG) ?? 0), 0);
    const finest = Math.min(...input.sides.map((s) => s.stencilUm));
    const powder = Number.isFinite(finest) ? powderFor(finest) : null;
    const wrongPowder = powder ? fresh.filter((i) => i.spec?.powderType && i.spec.powderType.replace(/\s+/g, "").toLowerCase() !== powder.replace(/\s+/g, "").toLowerCase()) : [];
    const soon = fresh.filter((i) => {
      const t = time(i.expiresAt);
      return t !== null && t - now < 30 * DAY;
    });
    const notes = [`${round(paste.perBoard)} g a board, ${round(paste.lot)} g for the lot with wipes and stencil bead`];
    if (powder) notes.push(`${powder} powder for the ${finest} µm foil`);
    if (jars.length > fresh.length) notes.push(`${jars.length - fresh.length} expired jar${jars.length - fresh.length === 1 ? "" : "s"} left out`);
    if (soon.length) notes.push(`${soon.length} expire${soon.length === 1 ? "s" : ""} within 30 days`);
    if (wrongPowder.length && wrongPowder.length === fresh.length) notes.push(`stock is ${wrongPowder[0].spec!.powderType}`);
    out.push({
      key: "paste",
      label: "Solder paste",
      need: round(paste.lot),
      unit: "g",
      have: round(have),
      items: jars,
      status: !fresh.length ? "missing" : have < paste.lot ? "short" : wrongPowder.length === fresh.length ? "check" : "ok",
      note: notes.join(" · "),
    });
  }

  // Flux: what the wave sprays (when the board has through-hole parts) and gel flux for rework, always.
  const flux = register.filter((i) => i.kind === "FLUX" && !expired(i, now));
  const wave = input.lot.find((l) => l.key === "flux");
  const liquid = flux.filter((i) => mlOf(i) !== null && !/gel|paste|tacky/i.test(`${i.name} ${i.spec?.fluxType ?? ""}`));
  const gel = flux.filter((i) => /gel|paste|tacky/i.test(`${i.name} ${i.spec?.fluxType ?? ""}`));
  if (wave) {
    const have = liquid.reduce((s, i) => s + (mlOf(i) ?? 0), 0);
    out.push({ key: "flux", label: "Flux for the wave", need: round(wave.lot), unit: "ml", have: round(have), items: liquid, status: !liquid.length ? "missing" : have < wave.lot ? "short" : "ok", note: wave.note });
  }
  out.push({ key: "rework-flux", label: "Rework flux (gel)", need: null, unit: "pcs", have: gel.reduce((s, i) => s + i.quantity, 0), items: gel, status: gel.some((i) => i.quantity > 0) ? "ok" : "missing", note: "for touch-up and rework after AOI" });
  return out;
}

/** Register items at or below their minimum, or expired: what the stores should see first. */
export function registerAlerts(register: RegisterItem[], now = Date.now()): { item: RegisterItem; why: string }[] {
  const out: { item: RegisterItem; why: string }[] = [];
  for (const i of register) {
    if (expired(i, now)) out.push({ item: i, why: "expired" });
    else if (i.minQty !== null && i.quantity <= i.minQty) out.push({ item: i, why: `at or below the minimum (${i.minQty} ${i.unit})` });
    else {
      const t = time(i.expiresAt);
      if (t !== null && t - now < 30 * DAY) out.push({ item: i, why: `expires ${new Date(t).toISOString().slice(0, 10)}` });
    }
  }
  return out;
}
