/**
 * Directory classification, pure and tested: which board type a BoM looks like (circuitflow's 61 board types),
 * which PCB technology its board spec needs, which box type its enclosure is, and which fabricators can build
 * that technology.
 */

export type BoardTypeSignals = { mpnPatterns?: string[]; keywords?: string[]; connectors?: string[]; partCount?: [number, number]; sizeMm?: [number, number]; layers?: [number, number] };
export type BoardTypeLike = { id: string; name: string; category: string; signals: BoardTypeSignals };
export type BoardFacts = { mpns: string[]; text: string; partCount: number; widthMm: number; heightMm: number; layers: number };
export type BoardMatch = { id: string; name: string; category: string; score: number; reasons: string[] };

const within = (v: number, r?: [number, number]) => !!r && v >= r[0] && v <= r[1];

/** Ranks board types for a design: MPN patterns weigh most, then keywords, then size / part count / layers. */
export function recogniseBoard(facts: BoardFacts, types: BoardTypeLike[], take = 3): BoardMatch[] {
  const text = facts.text.toLowerCase();
  const mpns = facts.mpns.map((m) => m.toUpperCase());
  return types
    .map((t) => {
      const reasons: string[] = [];
      let score = 0;
      const hits = (t.signals.mpnPatterns ?? []).filter((p) => {
        try {
          const re = new RegExp(p, "i");
          return mpns.some((m) => re.test(m));
        } catch {
          return false;
        }
      });
      if (hits.length) {
        score += Math.min(9, hits.length * 3);
        reasons.push(`${hits.length} chip family match${hits.length === 1 ? "" : "es"}`);
      }
      const words = (t.signals.keywords ?? []).filter((k) => text.includes(k.toLowerCase()));
      if (words.length) {
        score += Math.min(5, words.length);
        reasons.push(`keywords: ${words.slice(0, 4).join(", ")}`);
      }
      const conns = (t.signals.connectors ?? []).filter((c) => text.includes(c.toLowerCase()));
      if (conns.length) {
        score += Math.min(2, conns.length);
        reasons.push(`connectors: ${conns.slice(0, 3).join(", ")}`);
      }
      if (within(facts.partCount, t.signals.partCount)) score += 1;
      if (within(Math.max(facts.widthMm, facts.heightMm), t.signals.sizeMm)) score += 1;
      if (within(facts.layers, t.signals.layers)) score += 1;
      return { id: t.id, name: t.name, category: t.category, score, reasons };
    })
    .filter((m) => m.score >= 4 && m.reasons.length)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, take);
}

export type PcbSpec = { layers: number; thicknessMm: number; copperOz?: number | null; material?: string | null; finish?: string | null };

/** The PCB technology a board spec calls for (primary), plus special processes it also needs. */
export function classifyPcb(spec: PcbSpec): { primary: string; also: string[] } {
  const also: string[] = [];
  const tg = Number(/Tg\s*(\d{3})/i.exec(spec.material ?? "")?.[1] ?? 0);
  if (tg >= 170) also.push("high-tg");
  if ((spec.copperOz ?? 1) >= 3) also.push("heavy-copper");
  if (/alumin|mcpcb|metal.?core/i.test(spec.material ?? "")) return { primary: "mcpcb", also };
  if (/polyimide|flex/i.test(spec.material ?? "")) return { primary: /rigid/i.test(spec.material ?? "") ? "rigid-flex" : "flex", also };
  if (/rogers|ptfe|ro4\d{3}/i.test(spec.material ?? "")) return { primary: "rf-ptfe", also };
  const primary = spec.layers <= 2 ? "fr4-2l" : spec.layers <= 4 ? "fr4-4l" : "fr4-6l-plus";
  return { primary, also };
}

/** The box type an enclosure belongs to: sealed field boxes by IP rating, else by how it is made. */
export function classifyBox(style: string | null | undefined, ipRating: string | null | undefined): string | null {
  const ip = /IP(\d)(\d)/i.exec(ipRating ?? "");
  if (ip && Number(ip[1]) >= 6 && Number(ip[2]) >= 6) return "sealed-ip67";
  if (style === "diecast") return "diecast-aluminium";
  if (style === "extruded") return "extruded-aluminium";
  if (style === "moulded") return "moulded-plastic";
  return null;
}

export type FabLike = { id: string; name: string; country: string | null; capabilities: { maxLayers: number; technologies?: string[]; leadDays: { proto: number; production: number }; finishes: string[]; ipcClass: number; certifications: string[] } };

/** Fabricators that can build a technology: enough layers and, for special processes, listed as offering it. */
export function fabsFor(need: { minLayers: number; technology: string | null }, fabs: FabLike[]) {
  return fabs
    .map((f) => {
      const gaps: string[] = [];
      if (f.capabilities.maxLayers < need.minLayers) gaps.push(`up to ${f.capabilities.maxLayers} layers`);
      if (need.technology && !(f.capabilities.technologies ?? []).includes(need.technology)) gaps.push(`doesn't list ${need.technology}`);
      return { ...f, fits: gaps.length === 0, gaps };
    })
    .sort((a, b) => Number(b.fits) - Number(a.fits) || a.capabilities.leadDays.proto - b.capabilities.leadDays.proto);
}
