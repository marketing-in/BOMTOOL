/**
 * Who can supply the non-component parts of a product: the bare board (PCB fabricators) and the box (enclosure
 * makers). Pure, so the rules are unit-tested; the page reads capabilities from Supplier.capabilities.
 */

export type BoardCapabilities = {
  maxLayers: number;
  finishes: string[];
  thicknessMm: [number, number];
  minTraceMm: number;
  ipcClass: 2 | 3;
  leadDays: { proto: number; production: number };
  certifications: string[];
  technologies?: string[];
  /** Online instant-quote service: the bare-board marketplace. */
  online?: boolean;
  /** Price level for the bare-board estimate (src/lib/costing/pcb.ts). */
  pricing?: { factor: number; minLotFactor?: number; toolingFactor?: number };
};

export type BoxCapabilities = {
  styles: string[];
  ipMax: string;
  services: string[];
  leadDays: number;
  /** Styles made to fit a board (src/lib/costing/box.ts). */
  custom?: ("diecast" | "extruded" | "moulded" | "sheet-metal")[];
  pricing?: { factor: number };
};

export type BoardNeed = { layers: number; thicknessMm: number; finish: string; ipcClass: 2 | 3; production: boolean };

export type Vendor<C> = { id: string; code: string; name: string; country: string | null; capabilities: C };

export type Fit<C> = Vendor<C> & { fits: boolean; gaps: string[]; leadDays: number };

/** "LF-HASL", "hasl lead-free", "HASL (LF)" → "HASL-LF"; ENIG, ENEPIG, OSP, IMAG, IMSN unchanged. */
export function normaliseFinish(f: string): string {
  const k = f.toUpperCase().replace(/[^A-Z]/g, "");
  if (k.includes("HASL")) return k.includes("LF") || k.includes("LEADFREE") ? "HASL-LF" : "HASL";
  if (k === "IMMERSIONSILVER") return "IMAG";
  if (k === "IMMERSIONTIN") return "IMSN";
  return k;
}

export function matchFabs(need: BoardNeed, fabs: Vendor<BoardCapabilities>[]): Fit<BoardCapabilities>[] {
  const finish = normaliseFinish(need.finish);
  return fabs
    .map((v) => {
      const c = v.capabilities;
      const gaps: string[] = [];
      if (need.layers > c.maxLayers) gaps.push(`${need.layers} layers — makes up to ${c.maxLayers}`);
      if (need.thicknessMm < c.thicknessMm[0] || need.thicknessMm > c.thicknessMm[1]) gaps.push(`${need.thicknessMm} mm thick — makes ${c.thicknessMm[0]}–${c.thicknessMm[1]} mm`);
      if (!c.finishes.map(normaliseFinish).includes(finish)) gaps.push(`no ${finish} finish`);
      if (need.ipcClass > c.ipcClass) gaps.push(`IPC class ${need.ipcClass} needed — builds to class ${c.ipcClass}`);
      return { ...v, fits: gaps.length === 0, gaps, leadDays: need.production ? c.leadDays.production : c.leadDays.proto };
    })
    .sort((a, b) => Number(b.fits) - Number(a.fits) || a.gaps.length - b.gaps.length || a.leadDays - b.leadDays);
}

/** "IP65" → [6, 5]; unknown → null. */
function ip(code: string | null | undefined): [number, number] | null {
  const m = /IP(\d)(\d)/i.exec(code ?? "");
  return m ? [Number(m[1]), Number(m[2])] : null;
}

export type BoxNeed = { style: string; ipRating: string | null; cutouts: number };

export function matchBoxMakers(need: BoxNeed, makers: Vendor<BoxCapabilities>[]): Fit<BoxCapabilities>[] {
  const want = ip(need.ipRating);
  return makers
    .map((v) => {
      const c = v.capabilities;
      const gaps: string[] = [];
      if (!c.styles.includes(need.style)) gaps.push(`no ${need.style} enclosures`);
      const max = ip(c.ipMax);
      if (want && max && (max[0] < want[0] || max[1] < want[1])) gaps.push(`${need.ipRating} needed — up to ${c.ipMax}`);
      if (need.cutouts > 0 && !c.services.some((s) => /cut-?out/i.test(s))) gaps.push(`${need.cutouts} connector cut-out${need.cutouts === 1 ? "" : "s"} — machine elsewhere`);
      return { ...v, fits: gaps.length === 0, gaps, leadDays: c.leadDays };
    })
    .sort((a, b) => Number(b.fits) - Number(a.fits) || a.gaps.length - b.gaps.length || a.leadDays - b.leadDays);
}
