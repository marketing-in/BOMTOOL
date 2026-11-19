/**
 * Every place the customer's product disagrees with itself, in one list: the BoM against the board (footprints,
 * designators, values — a wrong value is a stop, like a wrong footprint), the BoM's own quantities against its designators, its part numbers against its descriptions,
 * and designators claimed twice. Each group says how serious it is and what to ask. Pure.
 */
import { expandRefDes } from "@/lib/refdes";
import { readIssue } from "./issues";
import type { FootprintMatch } from "@/lib/board/footprint-match";

export type Level = "green" | "amber" | "red";
export type MismatchKey = "board" | "footprint" | "not-on-board" | "not-in-bom" | "value" | "part" | "check" | "qty" | "mpn" | "refdes" | "duplicate";

export type MismatchItem = { ref: string | null; lineNo: number | null; mpn: string | null; detail: string };
export type MismatchGroup = { key: MismatchKey; title: string; level: Level; ask: string; items: MismatchItem[] };
export type Mismatches = { level: Level; hasBoard: boolean; total: number; groups: MismatchGroup[]; summary: string };

export type MismatchLineIn = { lineNo: number; refDes: string | null; qtyPerBoard: number; mpn: string | null; dnp: boolean; issues: string[] };

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;

const GROUPS: Record<MismatchKey, { title: string; level: Level; ask: string; count: (n: number) => string }> = {
  board: {
    title: "Not on the Gerbers",
    level: "red",
    ask: "These placements have no board, or no copper pad, under them in the Gerbers. Check that the Gerbers and the pick-and-place file are this board's — same board, same revision, same origin — before anything is bought or built.",
    count: (n) => `${plural(n, "placement")} not on the Gerbers`,
  },
  footprint: { title: "Wrong footprint on the board", level: "red", ask: "Ask the customer whether the BoM package or the board's land pattern is right before buying.", count: (n) => `${plural(n, "footprint")} ${n === 1 ? "differs" : "differ"}` },
  "not-on-board": { title: "In the BoM, not on the board", level: "red", ask: "The part has nowhere to go. Ask for the missing placement or a corrected BoM.", count: (n) => `${plural(n, "designator")} not on the board` },
  "not-in-bom": { title: "On the board, not in the BoM", level: "red", ask: "A pad with no part. Ask whether it is fitted (add a line) or do-not-populate.", count: (n) => `${plural(n, "placed part")} not in the BoM` },
  value: {
    title: "Value differs between BoM and board",
    level: "red",
    ask: "The BoM and the board files give this designator different values: a different part. Either side can be the wrong one. Ask the customer which is right before buying or placing.",
    count: (n) => `${plural(n, "value")} ${n === 1 ? "differs" : "differ"}`,
  },
  part: { title: "Part name differs from the board", level: "amber", ask: "The board files name another part under this designator. CAD libraries often carry generic names, so confirm the BoM's part is the one meant.", count: (n) => `${plural(n, "part name")} ${n === 1 ? "differs" : "differ"}` },
  check: {
    title: "Footprint to confirm by eye",
    level: "amber",
    ask: "The BoM names no package or one we cannot compare, the footprint is named for another kind of part, or a catalogue match not yet confirmed has another package. Look at the pad on the board drawing and confirm the part fits.",
    count: (n) => `${plural(n, "footprint")} to confirm by eye`,
  },
  qty: { title: "Quantity does not match designators", level: "amber", ask: "The line's quantity and its designator count disagree. Ask which is right.", count: (n) => `${plural(n, "quantity", "quantities")} ${n === 1 ? "does" : "do"} not match the designators` },
  mpn: { title: "Part number disagrees with its description", level: "red", ask: "What gets bought is not what the designer described. Settle it before the order goes out.", count: (n) => `${plural(n, "part number")} ${n === 1 ? "disagrees" : "disagree"} with the description` },
  refdes: { title: "Designator claimed twice", level: "red", ask: "One position has two parts. Ask which line it belongs to.", count: (n) => `${plural(n, "designator")} claimed twice` },
  duplicate: { title: "Same part number on several lines", level: "amber", ask: "Probably fine, but merging the lines avoids double kitting.", count: (n) => `${plural(n, "part number")} on several lines` },
};

const ORDER: MismatchKey[] = ["board", "footprint", "value", "not-on-board", "not-in-bom", "mpn", "refdes", "qty", "part", "check", "duplicate"];
const RED_MPN = new Set(["MPN_VALUE_MISMATCH", "MPN_VOLTAGE_LOW", "MPN_SIZE_MISMATCH"]);

export function findMismatches(match: FootprintMatch, lines: MismatchLineIn[]): Mismatches {
  const items = new Map<MismatchKey, MismatchItem[]>();
  const levels = new Map<MismatchKey, Level>();
  const add = (k: MismatchKey, it: MismatchItem, level?: Level) => {
    items.set(k, [...(items.get(k) ?? []), it]);
    if (level === "red" || (level && !levels.has(k))) levels.set(k, level);
  };

  // ── The BoM against the board. A designator wrong in more than one way is listed under each (footprint and value).
  for (const r of match.refs) {
    const it = { ref: r.ref, lineNo: r.lineNo, mpn: r.mpn, detail: r.why };
    if (r.notes?.length) {
      const into = new Map<MismatchKey, { details: string[]; level: Level }>();
      for (const note of r.notes) {
        // A wrong value is red; a milli/mega slip to confirm sits in the same group, amber. A catalogue package that
        // disagrees on an unconfirmed match is a footprint to confirm, not a wrong footprint.
        const k: MismatchKey =
          note.on === "board" ? "board" : note.on === "value" ? "value" : note.on === "part" ? "part" : (note.on === "footprint" || note.on === "catalogue") && note.level === "mismatch" ? "footprint" : "check";
        const level: Level = note.level === "mismatch" ? "red" : "amber";
        const got = into.get(k);
        into.set(k, { details: [...(got?.details ?? []), note.detail], level: got?.level === "red" ? "red" : level });
      }
      for (const [k, { details, level }] of into) add(k, { ...it, detail: details.join("; ") }, level);
    } else if (r.status === "mismatch") add("footprint", { ...it, detail: `BoM ${r.bomPkg ?? "—"} · board ${r.footprint ?? "—"}` });
    else if (r.status === "not-on-board") add("not-on-board", it);
    else if (r.status === "not-in-bom") add("not-in-bom", { ...it, detail: `${r.footprint ?? "no footprint"} on the ${r.side === "BOTTOM" ? "bottom" : "top"}` });
    else if (r.status === "check") add("check", { ...it, detail: `BoM ${r.bomPkg ?? "names no package"} · board ${r.footprint ?? "—"}` });
  }

  // ── The BoM against itself
  const owner = new Map<string, { lineNo: number; dnp: boolean }>();
  for (const l of lines) {
    for (const stored of l.issues) {
      const { code, detail, info } = readIssue(stored);
      const base = { ref: null, lineNo: l.lineNo, mpn: l.mpn };
      if (code === "QTY_REFDES_MISMATCH" || code === "MISSING_QTY") {
        const refs = expandRefDes(l.refDes).length;
        add("qty", { ...base, detail: code === "MISSING_QTY" ? "no quantity and no designators" : `quantity ${l.qtyPerBoard} · ${plural(refs, "designator")}` }, code === "MISSING_QTY" ? "red" : "amber");
      } else if (code.startsWith("MPN_")) add("mpn", { ...base, detail: detail ?? info?.help ?? code }, RED_MPN.has(code) ? "red" : "amber");
      else if (code === "DUPLICATE_MPN") add("duplicate", { ...base, detail: `${l.mpn ?? "this part"} is on another line too` });
    }
    for (const ref of expandRefDes(l.refDes)) {
      const prev = owner.get(ref);
      if (!prev) owner.set(ref, { lineNo: l.lineNo, dnp: l.dnp });
      else if (prev.lineNo !== l.lineNo) {
        const oneFitted = prev.dnp !== l.dnp;
        add("refdes", { ref, lineNo: l.lineNo, mpn: l.mpn, detail: oneFitted ? `fitted on one line and do-not-populate on line ${prev.lineNo}` : `also on line ${prev.lineNo}` }, oneFitted ? "amber" : "red");
      }
    }
  }

  const groups: MismatchGroup[] = ORDER.filter((k) => items.get(k)?.length).map((k) => ({
    key: k,
    title: GROUPS[k].title,
    ask: GROUPS[k].ask,
    level: k === "qty" || k === "mpn" || k === "refdes" || k === "value" ? (levels.get(k) ?? GROUPS[k].level) : GROUPS[k].level,
    items: items.get(k)!,
  }));
  const total = groups.reduce((s, g) => s + g.items.length, 0);
  const level: Level = groups.some((g) => g.level === "red") ? "red" : groups.length ? "amber" : "green";
  const summary = !total
    ? match.hasBoard
      ? "No mismatches: the BoM agrees with the board and with itself."
      : "The BoM agrees with itself. Add Gerbers or a pick-and-place file to check it against the board."
    : `${plural(total, "mismatch", "mismatches")} in ${plural(groups.length, "group")}: ${groups.map((g) => GROUPS[g.key].count(g.items.length)).join(" · ")}.`;
  return { level, hasBoard: match.hasBoard, total, groups, summary };
}

/** The strip's one-line note for the step. */
export function mismatchNote(m: Pick<Mismatches, "total" | "level" | "hasBoard">): string {
  if (!m.total) return m.hasBoard ? "No mismatches" : "BoM consistent; no board to check yet";
  return `${plural(m.total, "mismatch", "mismatches")} to settle`;
}
