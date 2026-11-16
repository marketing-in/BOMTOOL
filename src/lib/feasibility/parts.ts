/**
 * The fitted parts of a board as the feasibility maths needs them, from the 3D viewer's parts and the process route
 * (which already knows what is surface-mount, through-hole or press-fit). Pure.
 */
import type { BodySpec } from "@/lib/board/bodies";
import { classifyPart, type AsmPart, type Mount } from "./joints";

type PartIn = { refDes: string; side: "TOP" | "BOTTOM"; body: BodySpec; pkg: string | null; dnp: boolean; description?: string | null; kind?: { slug: string; name: string } | null };

const textOf = (p: PartIn) => `${p.kind?.name ?? ""} ${p.description ?? ""}`;

/** A part the route never saw (do-not-populate): leaded shapes and packages are through-hole, the rest surface-mount. */
const mountOf = (p: PartIn): Mount =>
  ["relay", "terminal", "header", "dip", "to220", "to92", "hc49", "electrolytic", "axial"].includes(p.body.shape ?? "") || /^(P?DIP|TO-?(92|220|247)|Header|Radial|Axial)/i.test(p.pkg ?? "") ? "THT" : "SMT";
type StepIn = { key: string; side: "TOP" | "BOTTOM" | null; refs: string[] };

export function asmParts(parts: PartIn[], route: StepIn[]): { parts: AsmPart[]; dnp: AsmPart[]; assumed: number } {
  const mount = new Map<string, { mount: Mount; side: "TOP" | "BOTTOM" | null }>();
  for (const s of route) {
    const m: Mount | null = s.key.startsWith("place-") ? "SMT" : s.key === "insert" ? "THT" : s.key === "press-fit" ? "PRESS_FIT" : null;
    if (m) for (const r of s.refs) mount.set(r, { mount: m, side: s.side });
  }
  const byRef = new Map(parts.map((p) => [p.refDes, p]));
  const out: AsmPart[] = [];
  let assumed = 0;
  for (const [ref, m] of mount) {
    const p = byRef.get(ref);
    if (p?.dnp) continue;
    // A part the layout had no room to draw, or with no package at all: two joints until someone chooses the part.
    if (!p || (!p.pkg && p.body.kind === "generic")) assumed++;
    out.push({
      refDes: ref,
      side: p?.side ?? m.side ?? "TOP",
      mount: m.mount,
      kind: p?.body.kind ?? "generic",
      pkg: p?.pkg ?? null,
      pins: p?.body.pins ?? 2,
      pitchMm: p?.body.pitch ?? 1.27,
      lengthMm: p?.body.length ?? 2,
      widthMm: p?.body.width ?? 1.2,
      cls: classifyPart({ refDes: ref, kind: p?.body.kind ?? "generic", shape: p?.body.shape, text: p ? textOf(p) : null }),
    });
  }
  // Do-not-populate parts are not on the route; they are classified here so they can be counted on their own.
  const dnp: AsmPart[] = parts
    .filter((p) => p.dnp)
    .map((p) => ({
      refDes: p.refDes,
      side: p.side,
      mount: mountOf(p),
      kind: p.body.kind,
      pkg: p.pkg,
      pins: p.body.pins ?? 2,
      pitchMm: p.body.pitch ?? 1.27,
      lengthMm: p.body.length,
      widthMm: p.body.width,
      cls: classifyPart({ refDes: p.refDes, kind: p.body.kind, shape: p.body.shape, text: textOf(p) }),
    }));
  return { parts: out, dnp, assumed };
}

/** Parts read off Gerbers alone (a quick look): through-hole from the drills, everything else surface-mount. */
export function asmPartsFromFound(found: { ref: string; side: "TOP" | "BOTTOM"; package: string; pads: number; tht: boolean }[], bodyOf: (ref: string) => BodySpec | null): AsmPart[] {
  return found.map((f) => {
    const b = bodyOf(f.ref);
    return {
      refDes: f.ref,
      side: f.side,
      mount: f.tht ? "THT" : "SMT",
      kind: b?.kind ?? "generic",
      pkg: f.package || null,
      // The pads on the board are the truth when the files gave them.
      // (a QFN's exposed pad is one of them; jointsOf adds it back)
      pins: (f.pads && b?.kind === "leadless" && f.pads >= 7 ? f.pads - 1 : f.pads) || b?.pins || 2,
      pitchMm: b?.pitch ?? 1.27,
      lengthMm: b?.length ?? 2,
      widthMm: b?.width ?? 1.2,
      cls: classifyPart({ refDes: f.ref, kind: b?.kind ?? "generic", shape: b?.shape }),
    };
  });
}
