/**
 * Every place the customer's product disagrees with itself, in one list: the BoM against the board (footprints,
 * designators, values), the BoM's own quantities against its designators, its part numbers against its descriptions,
 * and designators claimed twice. Each group says how serious it is and what to ask. Pure.
 */
import { expandRefDes } from "@/lib/refdes";
import { readIssue } from "./issues";
import type { FootprintMatch } from "@/lib/board/footprint-match";

export type Level = "green" | "amber" | "red";
export type MismatchKey = "footprint" | "not-on-board" | "not-in-bom" | "value" | "check" | "qty" | "mpn" | "refdes" | "duplicate";

export type MismatchItem = { ref: string | null; lineNo: number | null; mpn: string | null; detail: string };
export type MismatchGroup = { key: MismatchKey; title: string; level: Level; ask: string; items: MismatchItem[] };
export type Mismatches = { level: Level; hasBoard: boolean; total: number; groups: MismatchGroup[]; summary: string };

export type MismatchLineIn = { lineNo: number; refDes: string | null; qtyPerBoard: number; mpn: string | null; dnp: boolean; issues: string[] };

const GROUPS: Record<MismatchKey, { title: string; level: Level; ask: string }> = {
  footprint: { title: "Wrong footprint on the board", level: "red", ask: "Ask the customer whether the BoM package or the board's land pattern is right before buying." },
  "not-on-board": { title: "In the BoM, not on the board", level: "red", ask: "The part has nowhere to go. Ask for the missing placement or a corrected BoM." },
  "not-in-bom": { title: "On the board, not in the BoM", level: "red", ask: "A pad with no part. Ask whether it is fitted (add a line) or do-not-populate." },
  value: { title: "Value differs from the design file", level: "amber", ask: "The footprint matches but the value does not. Confirm which value to fit." },
  check: { title: "Footprint to confirm by eye", level: "amber", ask: "The BoM names no package, or one we cannot compare. Look at the pad on the board drawing and confirm the part fits." },
  qty: { title: "Quantity does not match designators", level: "amber", ask: "The line's quantity and its designator count disagree. Ask which is right." },
  mpn: { title: "Part number disagrees with its description", level: "red", ask: "What gets bought is not what the designer described. Settle it before the order goes out." },
  refdes: { title: "Designator claimed twice", level: "red", ask: "One position has two parts. Ask which line it belongs to." },
  duplicate: { title: "Same part number on several lines", level: "amber", ask: "Probably fine, but merging the lines avoids double kitting." },
};

const ORDER: MismatchKey[] = ["footprint", "not-on-board", "not-in-bom", "mpn", "refdes", "qty", "value", "check", "duplicate"];
const RED_MPN = new Set(["MPN_VALUE_MISMATCH", "MPN_VOLTAGE_LOW", "MPN_SIZE_MISMATCH"]);
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;

export function findMismatches(match: FootprintMatch, lines: MismatchLineIn[]): Mismatches {
  const items = new Map<MismatchKey, MismatchItem[]>();
  const levels = new Map<MismatchKey, Level>();
  const add = (k: MismatchKey, it: MismatchItem, level?: Level) => {
    items.set(k, [...(items.get(k) ?? []), it]);
    if (level === "red" || (level && !levels.has(k))) levels.set(k, level);
  };

  // ── The BoM against the board
  for (const r of match.refs) {
    const it = { ref: r.ref, lineNo: r.lineNo, mpn: r.mpn, detail: r.why };
    if (r.status === "mismatch") add("footprint", { ...it, detail: `BoM ${r.bomPkg ?? "—"} · board ${r.footprint ?? "—"}` });
    else if (r.status === "not-on-board") add("not-on-board", it);
    else if (r.status === "not-in-bom") add("not-in-bom", { ...it, detail: `${r.footprint ?? "no footprint"} on the ${r.side === "BOTTOM" ? "bottom" : "top"}` });
    // A "check" is either a value that differs (the why carries " · ") or a package we cannot compare.
    else if (r.status === "check") {
      const at = r.why.indexOf(" · ");
      if (at >= 0) add("value", { ...it, detail: r.why.slice(at + 3) });
      else add("check", { ...it, detail: `BoM ${r.bomPkg ?? "names no package"} · board ${r.footprint ?? "—"}` });
    }
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
    ...GROUPS[k],
    level: k === "qty" || k === "mpn" || k === "refdes" ? (levels.get(k) ?? GROUPS[k].level) : GROUPS[k].level,
    items: items.get(k)!,
  }));
  const total = groups.reduce((s, g) => s + g.items.length, 0);
  const level: Level = groups.some((g) => g.level === "red") ? "red" : groups.length ? "amber" : "green";
  const summary = !total
    ? match.hasBoard
      ? "No mismatches: the BoM agrees with the board and with itself."
      : "The BoM agrees with itself. Add Gerbers or a pick-and-place file to check it against the board."
    : `${plural(total, "mismatch", "mismatches")} in ${plural(groups.length, "group")}: ${groups.map((g) => `${g.items.length} ${g.title.toLowerCase()}`).join(" · ")}.`;
  return { level, hasBoard: match.hasBoard, total, groups, summary };
}

/** The strip's one-line note for the step. */
export function mismatchNote(m: Pick<Mismatches, "total" | "level" | "hasBoard">): string {
  if (!m.total) return m.hasBoard ? "No mismatches" : "BoM consistent; no board to check yet";
  return `${plural(m.total, "mismatch", "mismatches")} to settle`;
}
