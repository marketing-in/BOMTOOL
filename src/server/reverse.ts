import "server-only";
import { getBuild } from "@/server/build";
import { countJoints } from "@/lib/feasibility/joints";
import { reverseEngineer, type RePart } from "@/lib/reverse";

/** The reverse-engineering report for one BoM revision: what the product is and how it is put together. */
export async function getReverse(revisionId: string) {
  const b = await getBuild(revisionId);
  if (!b) return null;
  const joints = countJoints(b.assembly.parts);
  // A line made from the Gerbers alone carries a placeholder description until someone chooses its part.
  const isGuess = (p: (typeof b.viewer.parts)[number]) => !p.partId && !p.mpn && (!p.description || /guessed from the gerber|not in the files/i.test(p.description));
  const parts: RePart[] = b.viewer.parts.map((p) => ({
    refDes: p.refDes,
    mpn: p.mpn,
    manufacturer: p.manufacturer,
    description: isGuess(p) ? null : p.description,
    guessed: isGuess(p) && !p.value,
    value: p.value,
    kind: p.kind?.name ?? null,
    pkg: p.pkg,
    pins: p.body.pins ?? 2,
    dnp: p.dnp,
    unit: p.landedUnit ?? p.bestUnit,
    lifecycle: p.lifecycle,
    alternates: p.alternates.length,
  }));
  const counted = b.lines.filter((l) => !l.dnp && !l.excluded);
  const report = reverseEngineer({
    parts,
    board: { widthMm: b.board.facts.widthMm, heightMm: b.board.facts.heightMm, layers: b.board.facts.layers, source: b.board.facts.source, placed: !b.viewer.approximateLayout },
    joints: joints.total,
    sides: (joints.smt.TOP.placements ? 1 : 0) + (joints.smt.BOTTOM.placements ? 1 : 0),
    finestPitchMm: joints.finestPitchMm,
    unmatched: counted.filter((l) => !l.partId).length,
    box: b.box.chosen?.spec.label ?? null,
    route: b.viewer.route.map((s) => s.title),
  });
  return { revisionId, title: b.title, product: b.product, report };
}
