import type { boardDigest, boardPartsDigest, lineDetail, lineFitDigest, linesDigest, overviewDigest, partDigest } from "./digest";
import { runStep, type ToolResult } from "./tools";
import type { AskInput, AskResult, AssistantAdapter, Step, ToolContext, ToolName } from "./types";

/**
 * The assistant with no API key: it picks tools from the words of the question, runs the very same tools the live AI
 * would, and writes a plain answer from what they return. No language model is involved, so it cannot reason —
 * it exists so the panel, the tools and the links work (and can be tested) before a key is set.
 */

type Call = { tool: ToolName; input: Record<string, unknown> };

const BOARD = /\b(pins?|pin-?out|pin count|pitch|joints?|footprints?|packages?|placements?|placed|board|pcb|gerbers?|layers?|solder|assembly|stencil|reverse)\b/i;
const PINNED = /\b(pinned|chosen (source|by hand)|by hand|hand-?picked|locked)\b/i;
const BOM = /\b(bom|ready|block(s|ed|ing)?|risk(s|y|iest)?|quote|cost|price|lead|short(age|fall)?|stock|buy|sourc(e|es|ing)|lines?|money|deliver(y|ed)?|obsolete|eol|lifecycle)\b/i;
const RISK = /\b(risk(s|y|iest)?|obsolete|eol|lifecycle|block(s|ed|ing)?)\b/i;
const REFDES = /\b([A-Z]{1,3}\d{1,4})\b/g;
const MPN = /\b(?=[A-Z0-9-]*\d)(?=[A-Z0-9-]*[A-Z])[A-Z0-9][A-Z0-9-]{4,24}\b/g;
const LINE_NO = /\bline\s*#?(\d{1,4})\b/i;
/** Questions about our lines and machines ("can our lines build it?", "which machine stops it?", "what can L2 do?"). */
// "Which lines have…" is about BoM lines, so only the singular "which line" counts here.
const MACHINES = /\b(machines?|our lines|which (smt |production |assembly )?line(?!s)|smt lines?|production lines?|assembly lines?|capabilit(y|ies)|capable|placers?|stencil printers?|reflow ovens?|L\d{1,2} (can|could)?\s*(build|do|make|run|take|place)|can L\d{1,2})\b/i;

/** Which tools the question calls for. Exported for the tests. */
export function planCalls(question: string, hasBom: boolean): Call[] {
  const calls: Call[] = [];
  const add = (tool: ToolName, input: Record<string, unknown> = {}) => {
    if (!calls.some((c) => c.tool === tool && JSON.stringify(c.input) === JSON.stringify(input))) calls.push({ tool, input });
  };
  const refs = [...new Set([...question.matchAll(REFDES)].map((m) => m[1]))].slice(0, 6);
  const mpns = [...new Set([...question.matchAll(MPN)].map((m) => m[0]))].filter((m) => !refs.includes(m)).slice(0, 2);
  const lineNo = LINE_NO.exec(question)?.[1];

  // Line and machine questions first: "L2" there is a line, not an inductor.
  if (MACHINES.test(question)) {
    add("get_line_fit", hasBom ? {} : { lines_only: true });
    for (const mpn of mpns.filter((m) => !/^L\d+$/i.test(m))) add("get_part", { mpn });
    return calls;
  }

  if (hasBom) {
    if (lineNo) add("get_line", { line: lineNo });
    if (refs.length) {
      add("get_line", { line: refs[0] });
      add("get_board_parts", { refs });
    }
    if (PINNED.test(question)) add("list_bom_lines", { filter: "pinned" });
    else if (BOARD.test(question) && !refs.length) {
      add("get_board");
      if (/\bpins?|pitch|pin count\b/i.test(question)) add("get_board_parts", { limit: 8 });
    }
    if (BOM.test(question) && !lineNo && !refs.length && !PINNED.test(question)) {
      add("get_bom_overview");
      if (RISK.test(question)) add("list_bom_lines", { filter: "risky", limit: 6 });
    }
  }
  for (const mpn of mpns) add("get_part", { mpn });
  if (!calls.length) {
    if (!hasBom && (BOM.test(question) || BOARD.test(question)) && /\b(my|this|the|our)\s+(bom|board|pcb|build|quote)\b/i.test(question)) add("find_boms", { query: "" });
    else add("search_knowledge", { query: keywords(question) });
  }
  return calls;
}

const STOP = new Set("a an and are as at be by can do does for from how i in is it its me my of on or our should tell that the this to us was we what when where which who why will with you your about explain please show give".split(" "));

/** What to search for, best first: the whole phrase, then its acronyms and part-like words, then its longest words. */
export function searchQueries(question: string): string[] {
  const all = keywords(question);
  const words = all.split(" ");
  const loud = new Set((question.match(/(?<![A-Za-z0-9])[A-Z][A-Z0-9-]+(?![a-z])/g) ?? []).map((w) => w.toLowerCase()));
  const rest = words.filter((w) => !loud.has(w)).sort((a, b) => b.length - a.length);
  return [...new Set([all, ...words.filter((w) => loud.has(w)), ...rest])].slice(0, 5);
}

/** The words worth searching for. */
export function keywords(question: string): string {
  const words = question.toLowerCase().replace(/[^a-z0-9.+/ -]/g, " ").split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w));
  return (words.length ? words : question.trim().split(/\s+/)).slice(0, 6).join(" ");
}

const inr = (v: number | null | undefined) => (v === null || v === undefined ? "no price" : `₹${v.toLocaleString("en-IN", { maximumFractionDigits: v < 100 ? 2 : 0 })}`);
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;
const err = (r: ToolResult) => (r.data as { error?: string }).error ?? "That could not be read.";

type Wrote = (r: ToolResult, input: Record<string, unknown>) => string[];

const WRITE: Record<ToolName, Wrote> = {
  get_bom_overview: (r) => {
    const o = r.data as ReturnType<typeof overviewDigest>;
    const out: string[] = [];
    if (o.verdict) out.push(`**${o.verdict.title}.** ${o.verdict.detail}`);
    const q = o.quote.find((x) => x.qty === o.buildQty) ?? o.quote[0];
    if (q) out.push(`At ${plural(q.qty, "board")} the quote is ${inr(q.pricePerBoardInr)} per board, delivered in about ${o.delivery.leadDays} days${o.delivery.setBy ? ` — set by ${o.delivery.setBy}` : ""}.`);
    if (o.riskMix) out.push(`Risk mix: ${o.riskMix.green} low, ${o.riskMix.amber} to watch, ${o.riskMix.red} high${o.riskMix.grey ? `, ${o.riskMix.grey} not assessed` : ""}. ${plural(o.sourcing.linesPinnedByHand, "line has", "lines have")} a source chosen by hand.`);
    if (o.warnings.length) out.push(o.warnings.slice(0, 3).join(" "));
    if (o.toDoFirst?.length) out.push("What to do first:", ...o.toDoFirst.slice(0, 4).map((a) => `- **${a.title}** — ${a.detail}`));
    if (o.riskiestLines?.length) out.push("Riskiest lines:", ...o.riskiestLines.slice(0, 4).map((t) => `- [[line:${t.line}]] ${t.mpn ? `[[part:${t.mpn}]]` : "unmatched"} — ${t.factor}: ${t.reason}`));
    return out;
  },
  list_bom_lines: (r) => {
    const d = r.data as ReturnType<typeof linesDigest>;
    const what: Record<string, string> = { all: "BoM lines", risky: "lines carry risk", short: "lines are short everywhere", unmatched: "lines have no catalogue part", pinned: "lines have a source chosen by hand", "long-lead": "lines wait on a lead time", costly: "lines, most expensive first" };
    const total = d.lines.length + (d.notShown ?? 0);
    if (!total && d.filter === "risky") return [];
    if (!total) return [d.filter === "pinned" ? "No line on this BoM has a source chosen by hand — every line follows the sourcing strategy. Choose one with **Use** in Build & quote → Components." : `No ${what[d.filter] ?? "lines"} on ${d.bom}.`];
    return [
      `${total} ${what[d.filter] ?? "lines"} on ${d.bom}:`,
      ...d.lines.slice(0, 8).map((l) => `- [[line:${l.line}]] ${l.mpn ? `[[part:${l.mpn}]]` : "unmatched"}${l.refs ? ` (${l.refs})` : ""} — ${l.pinnedTo ? `pinned to ${l.pinnedTo}, ` : ""}${l.source ?? "no source"}${l.risk ? `, risk ${l.risk.score} (${l.risk.level})` : ""}${l.leadWeeks ? `, ${l.leadWeeks} wk` : ""}`),
      ...(total > 8 ? [`…and ${total - 8} more.`] : []),
    ];
  },
  get_line: (r) => {
    const l = r.data as ReturnType<typeof lineDetail>;
    const placed = l.onTheBoard.rows[0];
    return [
      `[[line:${l.line}]] is ${l.mpn ? `[[part:${l.mpn}]]` : "not matched to a catalogue part"}${l.manufacturer ? ` (${l.manufacturer})` : ""}${l.description ? ` — ${l.description}` : ""}. ${l.qtyPerBoard} per board, ${l.required.toLocaleString("en-IN")} needed for the build.`,
      placed ? `On the board: ${placed.package ?? "package not known"}, **${plural(placed.pins, "pin")}**${placed.pitchMm ? ` at ${placed.pitchMm} mm pitch` : ""}${placed.mount ? `, ${placed.mount}` : ""}, ${l.onTheBoard.rows.length + l.onTheBoard.more} placed (${[...new Set(l.onTheBoard.rows.map((p) => p.side.toLowerCase()))].join(" and ")} side). The platform holds no netlist, so pin functions come from the datasheet.` : "It is not placed on the board.",
      l.pinnedSource.chosenByHand ? `Its source is **pinned by hand** to ${l.pinnedSource.source}.` : "No source is pinned; it follows the sourcing strategy.",
      ...(l.sourcesInUse.length ? ["Sources in the quote:", ...l.sourcesInUse.map((s) => `- ${s.source} (${s.kind.toLowerCase()}) — ${s.qty.toLocaleString("en-IN")} pcs at ${inr(s.landedUnitInr)} landed`)] : []),
      ...(l.riskSummary ? [`Risk ${l.risk?.score ?? "—"} (${l.risk?.level ?? "not assessed"}): ${l.riskSummary}`] : []),
    ];
  },
  get_board: (r) => {
    const d = r.data as ReturnType<typeof boardDigest>;
    const p = d.pinsAndJoints;
    return [
      `${d.whatItIs ? `**${d.whatItIs.title}.** ` : ""}The board is ${d.board.widthMm} × ${d.board.heightMm} mm, ${plural(d.board.layers, "layer")}, ${d.board.finish} finish (${d.board.technology}). Outline from ${d.board.outlineFrom}; placements from ${d.board.placementsFrom}.`,
      `**${plural(p.placements, "placement")} and ${plural(p.solderJoints, "solder joint")}** — ${p.smtTop.placements} SMT on top, ${p.smtBottom.placements} on the bottom, ${plural(p.throughHole.parts, "through-hole part")}${p.finestPitchMm ? `; finest pitch ${p.finestPitchMm} mm` : ""}${p.hiddenJoints.parts ? `; ${plural(p.hiddenJoints.parts, "part")} with hidden joints need X-ray` : ""}.`,
      "Pins by package:",
      ...p.byPackage.slice(0, 6).map((k) => `- ${k.package} — ${plural(k.parts, "part")} × ${plural(k.pinsEach, "pin")} (${k.refs})`),
      p.note,
      ...(d.box ? [`Box: ${d.box.name} — ${d.box.fits ? "the board fits" : "the board does not fit"}.`] : []),
      ...(d.findings?.filter((f) => f.level !== "green").slice(0, 3).map((f) => `- **${f.title}** — ${f.detail}`) ?? []),
    ];
  },
  get_board_parts: (r) => {
    const d = r.data as ReturnType<typeof boardPartsDigest>;
    if (!d.parts.length) return [d.note ?? "No placed part matches."];
    return [
      `${d.matching === d.partsOnBoard ? "Highest pin counts on the board" : `${plural(d.matching, "matching part")}`}${d.layoutIsApproximate ? " (positions are approximate — no centroid file)" : ""}:`,
      ...d.parts.slice(0, 8).map((p) => `- [[ref:${p.ref}]] ${p.mpn ? `[[part:${p.mpn}]]` : (p.value ?? "")} — ${p.package ?? "package not known"}, ${plural(p.pins, "pin")}${p.pitchMm ? `, ${p.pitchMm} mm pitch` : ""}, ${p.side.toLowerCase()} side at (${p.xMm}, ${p.yMm}) mm`),
    ];
  },
  get_part: (r) => {
    const p = r.data as ReturnType<typeof partDigest>;
    const best = p.availability.distributors.filter((s) => s.stock > 0).sort((a, b) => (a.unitAt1kInr ?? Infinity) - (b.unitAt1kInr ?? Infinity))[0];
    return [
      `[[part:${p.mpn}]] — ${p.manufacturer}, ${p.category}${p.package ? `, ${p.package}` : ""}${p.pins ? ` (${plural(p.pins, "pin")})` : ""}. Lifecycle ${p.lifecycle}, RoHS ${p.rohs}.`,
      `Our stock: ${p.availability.ourStock.free.toLocaleString("en-IN")} free. ${best ? `Best distributor with stock: ${best.seller}, ${best.stock.toLocaleString("en-IN")} pcs at ${inr(best.unitAt1kInr)} for 1,000${best.simulated ? " (simulated price)" : ""}.` : "No distributor has stock."}`,
      `Risk ${p.risk.score} (${p.risk.level}) at ${p.risk.atNeedOf.toLocaleString("en-IN")} pcs: ${p.risk.summary}`,
      p.alternates.length ? `Alternates: ${p.alternates.slice(0, 5).map((a) => `[[part:${a.mpn}]]`).join(", ")}.` : "No approved alternates.",
    ];
  },
  get_line_fit: (r) => {
    const d = r.data as Partial<ReturnType<typeof lineFitDigest>> & { lines?: unknown; linesOnFile?: { code: string; name: string; machines: { type: string; make: string; model: string }[] }[] };
    const onFile = (d.linesOnFile ?? (Array.isArray(d.lines) && !d.verdict ? d.lines : [])) as { code: string; name: string; active: boolean; machines: { type: string; make: string; model: string; limitsOnFile: string }[] }[];
    if (!d.verdict) {
      if (!onFile.length) return ["No lines are on file yet. Add them on Operations → Lines."];
      return ["Our lines:", ...onFile.map((l) => `- **${l.code}** ${l.name.replace(/^.*—\s*/, "")}${l.active === false ? " (retired)" : ""} — ${plural(l.machines.length, "machine")}: ${l.machines.map((m) => `${m.make} ${m.model}`).slice(0, 4).join(", ")}${l.machines.length > 4 ? "…" : ""}`)];
    }
    const lines = d.lines as ReturnType<typeof lineFitDigest>["lines"];
    return [
      `**${d.summary}**`,
      ...lines.map((l) => {
        // What stops the line first, then what only needs checking.
        const why = l.steps
          .filter((s) => s.fit !== "green")
          .sort((a, b) => (a.fit === "red" ? 0 : 1) - (b.fit === "red" ? 0 : 1))
          .flatMap((s) => (s.why ?? []).map((w) => `${s.step}: ${w}`));
        return `- **${l.code}** — ${l.fit === "green" ? "every step fits" : l.fit === "amber" ? "fits, with checks" : "does not fit"}${why.length ? ` (${why.slice(0, 2).join("; ")})` : ""}`;
      }),
      ...(d.notNeeded?.length ? [`Not needed for this board: ${d.notNeeded.join(", ")}.`] : []),
    ];
  },
  find_boms: (r) => {
    const d = r.data as { boms: { name: string; revision: string; project: string | null; lines: number }[] };
    return d.boms.length ? ["Open a BoM first, then ask again — the answer is read from the BoM on screen. Recent BoMs:", ...d.boms.slice(0, 6).map((b) => `- ${b.name} rev ${b.revision}${b.project ? ` (${b.project})` : ""} — ${plural(b.lines, "line")}`)] : ["There is no BoM on the platform yet. Upload one from BoMs → New."];
  },
  search_knowledge: (r) => {
    const d = r.data as { query: string; articles: { slug: string; title: string; summary: string }[]; dictionary: { slug: string; name: string; oneLiner: string }[] };
    if (!d.articles.length && !d.dictionary.length) return [`Nothing in the knowledge base matches “${d.query}”. Try the part type or process name.`];
    return ["From the knowledge base:", ...d.dictionary.slice(0, 3).map((e) => `- [[dict:${e.slug}]] — ${e.oneLiner}`), ...d.articles.slice(0, 3).map((a) => `- [[kb:${a.slug}]] — ${a.summary}`)];
  },
  read_knowledge: (r) => {
    const d = r.data as { kind: string; what?: string; how?: string; pitfalls?: string[]; text?: string };
    return d.kind === "dictionary" ? [d.what ?? "", d.how ?? "", ...(d.pitfalls?.length ? ["Watch out for:", ...d.pitfalls.slice(0, 3).map((p) => `- ${p}`)] : [])] : [(d.text ?? "").split("\n").filter((l) => l && !l.startsWith("#")).slice(0, 3).join("\n\n")];
  },
};

export const mockAdapter: AssistantAdapter = {
  key: "mock",
  label: "Simulated assistant",
  envVars: [],
  configured: () => true,
  async ask(input: AskInput, ctx: ToolContext, onStep?: (s: Step) => void): Promise<AskResult> {
    const steps: Step[] = [];
    const note = (s: Step) => {
      steps.push(s);
      onStep?.(s);
    };
    const parts: string[] = [];
    for (const call of planCalls(input.question, Boolean(ctx.revisionId))) {
      let r = await runStep(call.tool, call.input, ctx, note);
      // No language model to pick better words: fall back from the phrase to its strongest single words.
      if (call.tool === "search_knowledge") {
        const empty = (x: ToolResult) => x.ok && !(x.data as { articles: unknown[] }).articles.length && !(x.data as { dictionary: unknown[] }).dictionary.length;
        for (const query of searchQueries(input.question).slice(1)) {
          if (!empty(r)) break;
          r = await runStep(call.tool, { query }, ctx, note);
        }
      }
      parts.push((r.ok ? WRITE[call.tool](r, call.input) : [err(r)]).filter(Boolean).join("\n"));
      // A search is only useful read: open the best hit, the way the live AI would.
      if (call.tool === "search_knowledge" && r.ok) {
        const d = r.data as { articles: { slug: string }[]; dictionary: { slug: string }[] };
        const top = d.dictionary[0] ? { kind: "dictionary", slug: d.dictionary[0].slug } : d.articles[0] ? { kind: "article", slug: d.articles[0].slug } : null;
        if (top) {
          const read = await runStep("read_knowledge", top, ctx, note);
          if (read.ok) parts.push(WRITE.read_knowledge(read, top).filter(Boolean).join("\n"));
        }
      }
    }
    return { text: parts.filter(Boolean).join("\n\n"), mode: "mock", model: null, steps };
  },
};
