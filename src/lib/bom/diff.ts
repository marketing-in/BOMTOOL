import { expandRefDes } from "@/lib/refdes";
import { normaliseMpn } from "@/lib/normalise";

export type DiffLine = { id: string; refDes: string | null; mpn: string | null; description: string | null; qtyPerBoard: number; dnp: boolean };

export type DiffChange =
  | { kind: "ADDED"; refs: string[]; to: DiffLine }
  | { kind: "REMOVED"; refs: string[]; from: DiffLine }
  | { kind: "MPN_CHANGED"; refs: string[]; from: DiffLine; to: DiffLine }
  | { kind: "DNP_CHANGED"; refs: string[]; from: DiffLine; to: DiffLine };

const key = (l: DiffLine) => (l.mpn ? normaliseMpn(l.mpn) : `desc:${(l.description ?? "").toLowerCase().trim()}`);

/**
 * Compares two revisions designator by designator (the stable identity on a board), then groups
 * designators that changed the same way so "C1–C18 changed MPN" shows as one change.
 */
export function diffRevisions(from: DiffLine[], to: DiffLine[]) {
  const byRef = (lines: DiffLine[]) => {
    const m = new Map<string, DiffLine>();
    for (const l of lines) for (const r of expandRefDes(l.refDes)) m.set(r, l);
    return m;
  };
  const a = byRef(from);
  const b = byRef(to);
  const groups = new Map<string, DiffChange>();
  const add = (gk: string, make: () => DiffChange, ref: string) => {
    const g = groups.get(gk) ?? make();
    g.refs.push(ref);
    groups.set(gk, g);
  };
  for (const [ref, la] of a) {
    const lb = b.get(ref);
    if (!lb) add(`R|${la.id}`, () => ({ kind: "REMOVED", refs: [], from: la }), ref);
    else if (key(la) !== key(lb)) add(`M|${la.id}|${lb.id}`, () => ({ kind: "MPN_CHANGED", refs: [], from: la, to: lb }), ref);
    else if (la.dnp !== lb.dnp) add(`D|${la.id}|${lb.id}`, () => ({ kind: "DNP_CHANGED", refs: [], from: la, to: lb }), ref);
  }
  for (const [ref, lb] of b) if (!a.has(ref)) add(`A|${lb.id}`, () => ({ kind: "ADDED", refs: [], to: lb }), ref);

  // Lines without designators can only be compared by part.
  const noRefA = from.filter((l) => !expandRefDes(l.refDes).length);
  const noRefB = to.filter((l) => !expandRefDes(l.refDes).length);
  for (const l of noRefA) if (!noRefB.some((x) => key(x) === key(l))) groups.set(`R|${l.id}`, { kind: "REMOVED", refs: [], from: l });
  for (const l of noRefB) if (!noRefA.some((x) => key(x) === key(l))) groups.set(`A|${l.id}`, { kind: "ADDED", refs: [], to: l });

  const changes = [...groups.values()];
  const placements = (lines: DiffLine[]) => lines.filter((l) => !l.dnp).reduce((s, l) => s + l.qtyPerBoard, 0);
  return {
    changes,
    summary: {
      added: changes.filter((c) => c.kind === "ADDED").reduce((s, c) => s + Math.max(1, c.refs.length), 0),
      removed: changes.filter((c) => c.kind === "REMOVED").reduce((s, c) => s + Math.max(1, c.refs.length), 0),
      changed: changes.filter((c) => c.kind === "MPN_CHANGED" || c.kind === "DNP_CHANGED").reduce((s, c) => s + c.refs.length, 0),
      placementsFrom: placements(from),
      placementsTo: placements(to),
    },
  };
}
