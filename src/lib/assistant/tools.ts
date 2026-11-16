import { z } from "zod";
import { dictEntry, searchDictionary } from "@/knowledge/dictionary";
import { LINE_FILTERS, articleDigest, boardDigest, boardPartsDigest, dictDigest, findLine, lineDetail, lineFitDigest, linesDigest, overviewDigest, partDigest } from "./digest";
import type { BuildLike, Step, ToolContext, ToolName } from "./types";

/**
 * The read-only tools the AI answers with. Each returns a small JSON digest (./digest.ts) of what the platform
 * already holds; none writes, calls a distributor or changes a chosen source.
 */

type JsonSchema = { type: "object"; properties: Record<string, unknown>; required?: string[]; additionalProperties: false };

export type ToolDef = { name: ToolName; description: string; input_schema: JsonSchema };

const BOM_ARG = {
  bom: { type: "string", description: "Which BoM: a revision id from find_boms, or part of a BoM / project name. Leave out to use the BoM the user has open." },
};

export const TOOLS: ToolDef[] = [
  {
    name: "search_knowledge",
    description:
      "Search the factory's knowledge base: long-form articles (PCB fabrication, SMT/THT assembly, box build, component families, packages, supply risk, IPC/J-STD standards) and the component & machine dictionary (one entry per component type or machine: what it does, key specs, how to choose, substitution rules, assembly notes, pitfalls). Use it for any 'what is / how / why / which' question before answering from memory. Returns titles and summaries; call read_knowledge for the full text.",
    input_schema: { type: "object", properties: { query: { type: "string", description: "A few keywords, e.g. 'QFN voiding', 'LDO dropout', 'MSL baking', 'ENIG vs HASL'." } }, required: ["query"], additionalProperties: false },
  },
  {
    name: "read_knowledge",
    description: "Read one knowledge article or dictionary entry in full, by the slug search_knowledge returned.",
    input_schema: { type: "object", properties: { kind: { type: "string", enum: ["article", "dictionary"] }, slug: { type: "string" } }, required: ["kind", "slug"], additionalProperties: false },
  },
  {
    name: "find_boms",
    description: "List BoMs on the platform whose name or project matches, newest first. Use it when the user names a BoM that is not the one they have open, or has none open. An empty query lists the most recent BoMs.",
    input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false },
  },
  {
    name: "get_bom_overview",
    description:
      "The whole-BoM picture for one build: readiness verdict, what to do first, risk mix, which sourcing tier covers the lines (our stock → partners → distributors → marketplace), riskiest lines, where the money goes, the quote per quantity (INR, by cost group), delivery lead and what sets it, the sourcing strategy in use and how many lines have a source chosen by hand. Start here for 'is it ready', 'what blocks it', cost and lead-time questions.",
    input_schema: { type: "object", properties: { ...BOM_ARG }, additionalProperties: false },
  },
  {
    name: "list_bom_lines",
    description:
      "BoM lines with designators, part number, quantity, unit and per-board cost (INR), the source the quote uses, lead weeks, risk score and stock by tier. Filters: all (BoM order), risky (amber/red, worst first), short (not enough stock anywhere), unmatched (no catalogue part), pinned (a source was chosen by hand in Build & quote), long-lead (slowest first), costly (most expensive per board first).",
    input_schema: { type: "object", properties: { ...BOM_ARG, filter: { type: "string", enum: [...LINE_FILTERS] }, limit: { type: "integer", description: "Rows to return, 1–60. Default 25." } }, additionalProperties: false },
  },
  {
    name: "get_line",
    description:
      "Everything about one BoM line: the part, every source the quote draws on with quantities and landed unit price, whether a source is pinned (chosen by hand) and which, each risk factor with its reason and suggested action, alternates, missing details, and where its designators sit on the board with package, pin count, pitch and mount.",
    input_schema: { type: "object", properties: { ...BOM_ARG, line: { type: "string", description: "A line number ('12'), a designator ('U3') or a part number ('LM358DR')." } }, required: ["line"], additionalProperties: false },
  },
  {
    name: "get_board",
    description:
      "The board of a BoM: size, layers, finish, technology, whether outline and placements come from real Gerber/centroid files, drill and paste counts; pins and solder joints (total, per side, through-hole, hidden joints, finest pitch, by package with pin count each); the box and whether it fits; the process route; and the reverse-engineering read — what the product is, functional blocks, power rails and findings. Start here for board, PCB, pin, pitch, joint and assembly questions.",
    input_schema: { type: "object", properties: { ...BOM_ARG }, additionalProperties: false },
  },
  {
    name: "get_board_parts",
    description:
      "Placed parts on the board, highest pin count first: designator, side, x/y position (mm from the board centre), rotation, package, pin count, pitch, mount (SMT/THT/press-fit), part number, value and kind. Narrow it with designators ('U3', 'C1-C4'), a side or a minimum pin count.",
    input_schema: {
      type: "object",
      properties: { ...BOM_ARG, refs: { type: "array", items: { type: "string" }, description: "Designators or runs, e.g. ['U3', 'C1-C4']." }, side: { type: "string", enum: ["TOP", "BOTTOM"] }, min_pins: { type: "integer" }, limit: { type: "integer", description: "Rows to return, 1–80. Default 40." } },
      additionalProperties: false,
    },
  },
  {
    name: "get_part",
    description:
      "One part from the catalogue by manufacturer part number, independent of any BoM: package and pin count, lifecycle, RoHS/REACH, availability in sourcing order (our stock, distributors with stock, MOQ, lead and INR price at 1,000 pcs, excess listings, brokers), 90-day price trend, risk factors at a 1,000-piece need, and approved alternates.",
    input_schema: { type: "object", properties: { mpn: { type: "string" } }, required: ["mpn"], additionalProperties: false },
  },
  {
    name: "get_line_fit",
    description:
      "Our assembly lines and their machines, and whether they can build a BoM's board. For the BoM: which lines to use, and for every line each process step the board needs (paste printing, SPI, placement, reflow, AOI, X-ray, wave/selective, press-fit, coating, test) with the machine that does it, green/amber/red, and why — e.g. a pitch finer than the placers take, a board larger than the printer, no X-ray for BGAs. Also lists every line with its machines and their limits (smallest chip, finest pitch, board size, CPH…) and where those limits came from. Use for 'can we build it on our lines', 'which line', 'which machine stops it', 'what can L2 do'.",
    input_schema: { type: "object", properties: { ...BOM_ARG, lines_only: { type: "boolean", description: "True to list the lines and machines without checking a BoM." } }, additionalProperties: false },
  },
];

const bom = z.string().trim().min(1).max(120).optional();
const INPUT = {
  search_knowledge: z.strictObject({ query: z.string().trim().min(1).max(200) }),
  read_knowledge: z.strictObject({ kind: z.enum(["article", "dictionary"]), slug: z.string().trim().min(1).max(120) }),
  find_boms: z.strictObject({ query: z.string().trim().max(120) }),
  get_bom_overview: z.strictObject({ bom }),
  list_bom_lines: z.strictObject({ bom, filter: z.enum(LINE_FILTERS).optional(), limit: z.number().int().min(1).max(60).optional() }),
  get_line: z.strictObject({ bom, line: z.string().trim().min(1).max(80) }),
  get_board: z.strictObject({ bom }),
  get_board_parts: z.strictObject({ bom, refs: z.array(z.string().trim().min(1).max(24)).max(60).optional(), side: z.enum(["TOP", "BOTTOM"]).optional(), min_pins: z.number().int().min(1).max(5000).optional(), limit: z.number().int().min(1).max(80).optional() }),
  get_part: z.strictObject({ mpn: z.string().trim().min(2).max(80) }),
  get_line_fit: z.strictObject({ bom, lines_only: z.boolean().optional() }),
} satisfies Record<ToolName, z.ZodType>;

type In<N extends ToolName> = z.infer<(typeof INPUT)[N]>;

export const isToolName = (name: string): name is ToolName => name in INPUT;

/** What the user sees while a tool runs. */
export function stepLabel(tool: ToolName, input: unknown): string {
  const i = (input ?? {}) as Record<string, unknown>;
  const s = (k: string) => (typeof i[k] === "string" ? String(i[k]).slice(0, 60) : "");
  switch (tool) {
    case "search_knowledge":
      return `Searching the knowledge base for “${s("query")}”`;
    case "read_knowledge":
      return `Reading ${s("kind") === "dictionary" ? "the dictionary entry" : "the article"} ${s("slug")}`;
    case "find_boms":
      return s("query") ? `Looking for a BoM named “${s("query")}”` : "Listing recent BoMs";
    case "get_bom_overview":
      return "Reading the BoM analysis and quote";
    case "list_bom_lines":
      return `Reading the BoM lines${s("filter") && s("filter") !== "all" ? ` (${s("filter")})` : ""}`;
    case "get_line":
      return `Reading line ${s("line")} and its sources`;
    case "get_board":
      return "Reading the board, its pins and joints";
    case "get_board_parts":
      return "Reading the parts placed on the board";
    case "get_part":
      return `Looking up ${s("mpn")} in the catalogue`;
    case "get_line_fit":
      return i.lines_only ? "Reading our lines and machines" : "Checking the board against our lines' machines";
  }
}

export type ToolResult = { ok: boolean; data: unknown };

const fail = (message: string): ToolResult => ({ ok: false, data: { error: message } });

async function resolveBuild(ctx: ToolContext, which: string | undefined): Promise<BuildLike | ToolResult> {
  let id = ctx.revisionId;
  if (which) {
    const direct = await ctx.sources.build(which);
    if (direct) return direct;
    const [hit] = await ctx.sources.findBoms(which, 1);
    if (!hit) return fail(`No BoM matches "${which}". Call find_boms to see what is on the platform.`);
    id = hit.revisionId;
  }
  if (!id) return fail("No BoM is open. Ask the user which BoM they mean, or call find_boms and pass its revision id as `bom`.");
  return (await ctx.sources.build(id)) ?? fail("That BoM no longer exists.");
}

const isResult = (v: BuildLike | ToolResult): v is ToolResult => "ok" in v && "data" in v;

/** Runs one tool. Bad input and missing records come back as `ok: false` with a message the AI can act on. */
export async function runTool(name: string, rawInput: unknown, ctx: ToolContext): Promise<ToolResult> {
  if (!isToolName(name)) return fail(`Unknown tool ${name}.`);
  const parsed = INPUT[name].safeParse(rawInput ?? {});
  if (!parsed.success) return fail(`Invalid input for ${name}: ${parsed.error.issues.map((i) => `${i.path.join(".") || "input"} ${i.message}`).join("; ")}`);
  const { sources } = ctx;

  switch (name) {
    case "search_knowledge": {
      const { query } = parsed.data as In<"search_knowledge">;
      const [articles, dict] = [await sources.searchArticles(query, 6), searchDictionary(query, 6)];
      return { ok: true, data: { query, articles, dictionary: dict.map((h) => ({ slug: h.entry.slug, name: h.entry.name, group: h.entry.group, oneLiner: h.entry.oneLiner })), ...(articles.length || dict.length ? {} : { note: "Nothing in the knowledge base matches. Try fewer or different words." }) } };
    }
    case "read_knowledge": {
      const { kind, slug } = parsed.data as In<"read_knowledge">;
      if (kind === "dictionary") {
        const e = dictEntry(slug);
        return e ? { ok: true, data: dictDigest(e) } : fail(`No dictionary entry "${slug}".`);
      }
      const a = await sources.article(slug);
      return a ? { ok: true, data: articleDigest(a) } : fail(`No article "${slug}".`);
    }
    case "find_boms": {
      const { query } = parsed.data as In<"find_boms">;
      const boms = await sources.findBoms(query, 12);
      return { ok: true, data: { query, boms, ...(boms.length ? {} : { note: "No BoM matches." }) } };
    }
    case "get_part": {
      const { mpn } = parsed.data as In<"get_part">;
      const r = await sources.part(mpn);
      return r ? { ok: true, data: partDigest(r) } : fail(`${mpn} is not in the catalogue. It can be added by searching the market from the Parts directory.`);
    }
    case "get_line_fit": {
      const i = parsed.data as In<"get_line_fit">;
      const lines = await sources.lines();
      if (i.lines_only || (!i.bom && !ctx.revisionId)) return { ok: true, data: { lines, ...(i.lines_only ? {} : { note: "No BoM is open, so only the lines are listed. Pass `bom` to check one." }) } };
      const b = await resolveBuild(ctx, i.bom);
      if (isResult(b)) return b;
      const plant = await sources.lineFit(b.revisionId);
      return plant ? { ok: true, data: { ...lineFitDigest(b, plant), linesOnFile: lines } } : fail("The line check could not be worked out for this BoM.");
    }
    default:
      break;
  }

  const input = parsed.data as In<"get_bom_overview" | "list_bom_lines" | "get_line" | "get_board" | "get_board_parts">;
  const b = await resolveBuild(ctx, input.bom);
  if (isResult(b)) return b;

  switch (name) {
    case "get_bom_overview":
      return { ok: true, data: overviewDigest(b, await sources.deep(b.revisionId)) };
    case "list_bom_lines": {
      const i = input as In<"list_bom_lines">;
      return { ok: true, data: linesDigest(b, i.filter ?? "all", i.limit ?? 25) };
    }
    case "get_line": {
      const i = input as In<"get_line">;
      const l = findLine(b, i.line);
      return l ? { ok: true, data: lineDetail(b, l) } : fail(`No line, designator or part number "${i.line}" on ${b.title}.`);
    }
    case "get_board":
      return { ok: true, data: boardDigest(b, await sources.reverse(b.revisionId)) };
    case "get_board_parts": {
      const i = input as In<"get_board_parts">;
      return { ok: true, data: boardPartsDigest(b, { refs: i.refs, side: i.side, minPins: i.min_pins, limit: i.limit }) };
    }
    default:
      return fail(`Unknown tool ${name}.`);
  }
}

/** Runs a tool and reports it as a step, the way both adapters do. */
export async function runStep(name: string, input: unknown, ctx: ToolContext, onStep?: (s: Step) => void): Promise<ToolResult> {
  if (isToolName(name)) onStep?.({ tool: name, label: stepLabel(name, input) });
  try {
    return await runTool(name, input, ctx);
  } catch {
    // A loader failed (database down, a record half-written): tell the AI, not the user's console.
    return fail(`${name} could not read the platform's data just now.`);
  }
}
