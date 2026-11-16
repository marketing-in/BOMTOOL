import { describe, expect, it } from "vitest";
import { ARTICLES } from "@/knowledge";
import { DICTIONARY } from "@/knowledge/dictionary";
import { articleDigest, boardDigest, boardPartsDigest, filterLines, findLine, lineDetail, lineRow, overviewDigest, pinLabel, refsOf, someRefs } from "@/lib/assistant/digest";
import { keywords, mockAdapter, planCalls, searchQueries } from "@/lib/assistant/mock";
import { SYSTEM_PROMPT, userTurn } from "@/lib/assistant/prompt";
import { linkAnswer, marksIn, parseInline, plainRef, refKey, toBlocks, type RefLookup } from "@/lib/assistant/refs";
import { TOOLS, isToolName, runStep, runTool, stepLabel } from "@/lib/assistant/tools";
import { TOOL_NAMES, type AssistantSources, type BuildLike, type Step, type ToolContext } from "@/lib/assistant/types";
import { checkPlant, type LineIn } from "@/lib/ops/machines";

// Two lines: L1 places everything down to 0201 / 0.4 mm; L2 stops at 0603.
const FIT_LINES: LineIn[] = [
  { id: "a", code: "L1", name: "SMT Line 1 — High-mix", type: "SMT", capability: {}, machines: [
    { type: "STENCIL_PRINTER", vendor: "ASMPT", model: "DEK TQ", position: 1, specs: { maxBoardMm: [510, 510] } },
    { type: "PICK_AND_PLACE", vendor: "ASMPT", model: "SX2", position: 2, specs: { minChip: "0201", minPitchMm: 0.4, maxBoardMm: [510, 460] } },
    { type: "REFLOW_OVEN", vendor: "Heller", model: "1913", position: 3, specs: { maxBoardMm: [560, 510] } },
  ] },
  { id: "b", code: "L2", name: "SMT Line 2 — Volume", type: "SMT", capability: {}, machines: [
    { type: "STENCIL_PRINTER", vendor: "EKRA", model: "SERIO", position: 1, specs: { maxBoardMm: [510, 510] } },
    { type: "PICK_AND_PLACE", vendor: "Fuji", model: "NXT", position: 2, specs: { minChip: "0603", minPitchMm: 0.65, maxBoardMm: [510, 460] } },
    { type: "REFLOW_OVEN", vendor: "Rehm", model: "VXP", position: 3, specs: { maxBoardMm: [650, 460] } },
  ] },
];
const PLANT = checkPlant(FIT_LINES, {
  boardMm: [80, 50], thicknessMm: 1.6,
  smt: { placements: 4, sides: 1, smallestChip: "0402", finestPitchMm: 0.5, hidden: 0, hasBga: false, tallestMm: null, largestMm: null },
  tht: { parts: 0 }, pressFit: 0, coating: false, ict: false, box: false,
});
const LINES_ON_FILE = FIT_LINES.map((l) => ({ code: l.code, name: l.name, active: true, machines: l.machines.map((m) => ({ type: m.type, make: m.vendor, model: m.model, limitsOnFile: "3 of 9" })) }));

// ── A small product: an MCU, an op-amp pinned to a distributor, a decoupling cap, an unmatched connector.

type Line = BuildLike["lines"][number];
const line = (over: Partial<Line> & Pick<Line, "id" | "lineNo" | "refDes">): Line => ({
  partId: `p-${over.id}`,
  mpn: null,
  manufacturer: null,
  description: null,
  footprint: null,
  category: null,
  qtyPerBoard: 1,
  dnp: false,
  excluded: null,
  required: 100,
  cost: { cost: 0, moqExcess: 0, unit: 1, mainTier: 4, priced: true, unpricedQty: 0 },
  perBoard: 1,
  sourceLabel: "Distributor",
  pinned: false,
  pin: null,
  plan: [],
  leadWeeks: 0,
  risk: { score: 10, level: "green", summary: "Low risk." },
  riskFactors: [],
  missing: [],
  stock: { ours: 0, partners: 0, distributors: 5000, market: 0 },
  ...over,
});

const LINES: Line[] = [
  line({ id: "l1", lineNo: 1, refDes: "U1", mpn: "STM32F103C8T6", manufacturer: "ST", description: "MCU 32-bit", perBoard: 180, leadWeeks: 14, risk: { score: 72, level: "red", summary: "Long lead and one source." }, riskFactors: [{ key: "leadTime", label: "Lead time", score: 80, level: "red", reason: "14 weeks from the factory.", action: "Order now." }], stock: { ours: 0, partners: 0, distributors: 40, market: 0 } }),
  line({
    id: "l2",
    lineNo: 2,
    refDes: "U2, U3",
    mpn: "LM358DR",
    manufacturer: "TI",
    qtyPerBoard: 2,
    required: 200,
    perBoard: 14,
    pinned: true,
    pin: { offerId: "o-9" },
    plan: [{ tier: 4, kind: "AUTHORISED", source: "Mouser", qty: 200, orderQty: 250, unit: 7, offerId: "o-9", excessListingId: null }],
    risk: { score: 35, level: "amber", summary: "Price rising." },
  }),
  line({ id: "l3", lineNo: 3, refDes: "C1 C2 C3 C4", mpn: "CL10B104KB8NNNC", qtyPerBoard: 4, required: 400, perBoard: 0.8 }),
  line({ id: "l4", lineNo: 4, refDes: "J1", partId: null, description: "USB-C receptacle", cost: { cost: 0, moqExcess: 0, unit: null, mainTier: null, priced: false, unpricedQty: 100 }, perBoard: 0, sourceLabel: null, risk: null, leadWeeks: null, stock: { ours: 0, partners: 0, distributors: 0, market: 0 } }),
];

type Placed = BuildLike["viewer"]["parts"][number];
const placed = (refDes: string, lineId: string, lineNo: number, pkg: string, pins: number, pitch: number, over: Partial<Placed> = {}): Placed =>
  ({ refDes, x: 1.234, y: -2, rotation: 90, side: "TOP", body: { kind: "ic", length: 5, width: 5, height: 1, color: "#000", pins, pitch }, lineId, lineNo, partId: `p-${lineId}`, mpn: LINES[lineNo - 1].mpn, pkg, value: null, kind: null, lifecycle: "ACTIVE", rohs: "COMPLIANT", reach: "COMPLIANT", alternates: [], dnp: false, ...over }) as unknown as Placed;

const asm = (refDes: string, pkg: string, pins: number, pitchMm: number, mount: "SMT" | "THT" = "SMT", side: "TOP" | "BOTTOM" = "TOP") => ({ refDes, side, mount, kind: (pins > 2 ? "ic" : "chip") as never, pkg, pins, pitchMm, lengthMm: 5, widthMm: 5 });

const BUILD = {
  revisionId: "rev1",
  title: "GW-200 Main Board rev A",
  product: { name: "Gateway", partNumber: "GW-200", revision: "A", customer: "Acme Secret Customer" },
  refQty: 100,
  quantities: [100, 1000],
  lines: LINES,
  sourcing: { qty: 100, lines: 3, active: "order", pinned: 1, perBoardNow: 194.8, strategies: [{ key: "order", perBoard: 194.8, leadWeeks: 14, short: 1, changes: 0 }] },
  quotes: [{ qty: 100, unitPrice: 412.345, lotPrice: 41234.5, nreTotal: 9000, byGroup: { board: 60, components: 194.8 }, unpriced: 1 }],
  leadDays: 105,
  leadDriver: "U1 STM32F103C8T6 — 14 wk",
  warnings: ["1 line has no price yet — match it or search the distributors."],
  board: { facts: { widthMm: 80, heightMm: 50, layers: 4, thicknessMm: 1.6, finish: "ENIG" }, areaCm2: 40, technology: { slug: "multilayer", name: "Multilayer FR-4", also: [] }, chosenName: "Fab One", leadDays: 12 },
  viewer: {
    parts: [placed("U1", "l1", 1, "LQFP-48", 48, 0.5), placed("U2", "l2", 2, "SOIC-8", 8, 1.27), placed("U3", "l2", 2, "SOIC-8", 8, 1.27, { side: "BOTTOM" }), placed("C1", "l3", 3, "0603", 2, 0)],
    approximateLayout: false,
    route: [{ title: "Print paste (top)", side: "TOP", refs: ["U1", "U2", "C1"], watch: "0.5 mm pitch — check the stencil." }],
    enclosure: { label: "Hammond 1455", fits: true },
    board: { source: "gerber", fab: { paste: { top: { apertures: 60, areaMm2: 30, source: "paste-layer" }, bottom: null }, holes: { plated: 20, component: 4, vias: 16, nonPlated: 2 } } },
  },
  assembly: { parts: [asm("U1", "LQFP-48", 48, 0.5), asm("U2", "SOIC-8", 8, 1.27), asm("U3", "SOIC-8", 8, 1.27, "SMT", "BOTTOM"), asm("C1", "0603", 2, 0)], dnp: [], assumed: 0 },
} as unknown as BuildLike;

const DEEP = {
  verdict: { level: "red", title: "Not ready to build", detail: "One line is short and one is unmatched." },
  counted: 4,
  matched: 3,
  distribution: { green: 1, amber: 1, red: 1, grey: 1 },
  coverage: { ours: 0, partners: 0, suppliers: 2, market: 0, none: 1, unmatched: 1 },
  longestLead: { weeks: 14, label: "STM32F103C8T6 (U1)" },
  topRisks: [{ line: { lineNo: 1, mpn: "STM32F103C8T6", refDes: "U1", risk: { score: 72 } }, factor: { label: "Lead time", reason: "14 weeks from the factory." } }],
  actions: [{ key: "short", level: "red", title: "Cover the shortage", detail: "1 line is short everywhere.", lines: [{ lineId: "l1", label: "STM32F103C8T6 (U1)", partId: "p-l1" }], value: 10800 }],
  pareto: [{ lineId: "l1", label: "STM32F103C8T6 (U1)", partId: "p-l1", value: 18000, share: 0.92, cumulative: 0.92 }],
  spendTotal: 19480,
  toBuyTotal: 19480,
  lifecycle: [{ state: "ACTIVE", count: 3 }],
  compliance: { rohsIssues: 0, rohsUnknown: 0, svhc: 0, reachUnknown: 0 },
} as never;

const fakeSources = (over: Partial<AssistantSources> = {}): AssistantSources => ({
  searchArticles: async () => [{ slug: ARTICLES[0].slug, domain: ARTICLES[0].domain, title: ARTICLES[0].title, summary: ARTICLES[0].summary }],
  article: async (slug) => ARTICLES.find((a) => a.slug === slug) ?? null,
  findBoms: async (q) => (!q || /gw/i.test(q) ? [{ revisionId: "rev1", name: "GW-200 Main Board", revision: "A", project: "GW-200 Gateway", lines: 4 }] : []),
  build: async (id) => (id === "rev1" ? BUILD : null),
  deep: async () => DEEP,
  reverse: async () => null,
  part: async () => null,
  lines: async () => LINES_ON_FILE,
  lineFit: async () => PLANT,
  ...over,
});
const ctx = (revisionId: string | null = "rev1", over: Partial<AssistantSources> = {}): ToolContext => ({ sources: fakeSources(over), revisionId });

describe("assistant digests", () => {
  it("splits designators however the BoM wrote them", () => {
    expect(refsOf("U2, U3")).toEqual(["U2", "U3"]);
    expect(refsOf("C1 C2;C3")).toEqual(["C1", "C2", "C3"]);
    expect(refsOf(null)).toEqual([]);
    expect(someRefs(["C1", "C2", "C3", "C4", "R1"], 4)).toBe("C1–C4 +1 more");
    expect(someRefs(["U1"])).toBe("U1");
  });

  it("finds a line by number, designator or part number", () => {
    expect(findLine(BUILD, "2")?.id).toBe("l2");
    expect(findLine(BUILD, "line 3")?.id).toBe("l3");
    expect(findLine(BUILD, "u3")?.id).toBe("l2");
    expect(findLine(BUILD, "lm358dr")?.id).toBe("l2");
    expect(findLine(BUILD, "STM32F103")?.id).toBe("l1");
    expect(findLine(BUILD, "R99")).toBeNull();
  });

  it("names the pinned source from the plan", () => {
    expect(pinLabel(LINES[1])).toBe("Mouser");
    expect(pinLabel(LINES[0])).toBeNull();
    expect(pinLabel({ ...LINES[0], pin: { ours: true } })).toBe("our own stores");
    expect(lineRow(LINES[1]).pinnedTo).toBe("Mouser");
    expect(lineRow(LINES[0])).not.toHaveProperty("pinnedTo");
  });

  it("filters lines the ways a buyer asks", () => {
    expect(filterLines(LINES, "pinned").map((l) => l.lineNo)).toEqual([2]);
    expect(filterLines(LINES, "risky").map((l) => l.lineNo)).toEqual([1, 2]);
    expect(filterLines(LINES, "unmatched").map((l) => l.lineNo)).toEqual([4]);
    expect(filterLines(LINES, "short").map((l) => l.lineNo)).toEqual([1]);
    expect(filterLines(LINES, "costly")[0].lineNo).toBe(1);
  });

  it("gives a line its sources, pin and where it sits with pin count and pitch", () => {
    const d = lineDetail(BUILD, LINES[1]);
    expect(d.pinnedSource).toEqual({ chosenByHand: true, source: "Mouser" });
    expect(d.sourcesInUse[0]).toMatchObject({ source: "Mouser", qty: 200, landedUnitInr: 7 });
    expect(d.onTheBoard.rows.map((p) => [p.ref, p.side, p.pins, p.pitchMm, p.mount])).toEqual([["U2", "TOP", 8, 1.27, "SMT"], ["U3", "BOTTOM", 8, 1.27, "SMT"]]);
  });

  it("summarises a BoM without the customer's name", () => {
    const o = overviewDigest(BUILD, DEEP);
    expect(o.verdict?.title).toBe("Not ready to build");
    expect(o.quote[0]).toMatchObject({ qty: 100, pricePerBoardInr: 412.35, nreInr: 9000 });
    expect(o.sourcing.linesPinnedByHand).toBe(1);
    expect(JSON.stringify(o)).not.toContain("Acme");
    expect(overviewDigest(BUILD, null)).not.toHaveProperty("verdict");
  });

  it("counts pins and joints on the board and says there is no netlist", () => {
    const d = boardDigest(BUILD, null);
    expect(d.board).toMatchObject({ widthMm: 80, heightMm: 50, layers: 4, finish: "ENIG" });
    expect(d.pinsAndJoints.placements).toBe(4);
    expect(d.pinsAndJoints.finestPitchMm).toBe(0.5);
    expect(d.pinsAndJoints.solderJoints).toBe(48 + 8 + 8 + 2);
    expect(d.pinsAndJoints.note).toMatch(/no netlist/);
    expect(d.pinsAndJoints.byPackage.find((p) => p.package === "SOIC-8")).toMatchObject({ parts: 2, pinsEach: 8 });
    expect(d.box).toEqual({ name: "Hammond 1455", fits: true });
  });

  it("lists placed parts, highest pin count first, and narrows by designator, side and pins", () => {
    expect(boardPartsDigest(BUILD, {}).parts.map((p) => p.ref)).toEqual(["U1", "U2", "U3", "C1"]);
    expect(boardPartsDigest(BUILD, { minPins: 8, side: "TOP" }).parts.map((p) => p.ref)).toEqual(["U1", "U2"]);
    expect(boardPartsDigest(BUILD, { refs: ["u2-u3"] }).parts.map((p) => p.ref)).toEqual(["U2", "U3"]);
    expect(boardPartsDigest(BUILD, { refs: ["R9"] }).note).toMatch(/None of those/);
    const limited = boardPartsDigest(BUILD, { limit: 1 });
    expect([limited.parts.length, limited.notShown]).toEqual([1, 3]);
    expect(boardPartsDigest(BUILD, {}).parts[0]).toMatchObject({ xMm: 1.23, rotationDeg: 90 });
  });

  it("flattens an article to text", () => {
    const d = articleDigest(ARTICLES[0]);
    expect(d.text).toContain(`# ${ARTICLES[0].title}`);
    expect(d.text).toContain(ARTICLES[0].sections[0].heading);
  });
});

describe("assistant tools", () => {
  it("defines every tool once, with a closed schema", () => {
    expect(TOOLS.map((t) => t.name).sort()).toEqual([...TOOL_NAMES].sort());
    for (const t of TOOLS) {
      expect(t.input_schema.additionalProperties).toBe(false);
      expect(t.description.length).toBeGreaterThan(60);
      expect(stepLabel(t.name, {})).toBeTruthy();
    }
    expect(isToolName("get_board")).toBe(true);
    expect(isToolName("delete_bom")).toBe(false);
  });

  it("uses the BoM on screen and answers with a digest", async () => {
    const r = await runTool("get_line", { line: "U3" }, ctx());
    expect(r.ok).toBe(true);
    expect((r.data as { mpn: string }).mpn).toBe("LM358DR");
    const lines = await runTool("list_bom_lines", { filter: "pinned" }, ctx());
    expect((lines.data as { lines: { line: number }[] }).lines.map((l) => l.line)).toEqual([2]);
    expect(((await runTool("get_board", {}, ctx())).data as { bom: string }).bom).toBe("GW-200 Main Board rev A");
  });

  it("finds another BoM by name, and says so when none is open or none matches", async () => {
    expect((await runTool("get_bom_overview", { bom: "gw-200" }, ctx(null))).ok).toBe(true);
    const none = await runTool("get_bom_overview", {}, ctx(null));
    expect(none.ok).toBe(false);
    expect((none.data as { error: string }).error).toMatch(/No BoM is open/);
    expect(((await runTool("get_board", { bom: "nothing-like-it" }, ctx())).data as { error: string }).error).toMatch(/No BoM matches/);
  });

  it("rejects bad input and unknown tools instead of throwing", async () => {
    expect((await runTool("get_line", {}, ctx())).ok).toBe(false);
    expect((await runTool("get_line", { line: "U1", drop: "table" }, ctx())).ok).toBe(false);
    expect((await runTool("list_bom_lines", { limit: 9999 }, ctx())).ok).toBe(false);
    expect((await runTool("delete_bom", {}, ctx())).ok).toBe(false);
    expect(((await runTool("get_line", { line: "R99" }, ctx())).data as { error: string }).error).toMatch(/No line/);
    expect(((await runTool("get_part", { mpn: "NOPE-123" }, ctx())).data as { error: string }).error).toMatch(/not in the catalogue/);
  });

  it("searches and reads the knowledge base and the dictionary", async () => {
    const s = await runTool("search_knowledge", { query: "LDO" }, ctx());
    const data = s.data as { articles: unknown[]; dictionary: { slug: string }[] };
    expect(data.articles).toHaveLength(1);
    expect(data.dictionary.length).toBeGreaterThan(0);
    const e = await runTool("read_knowledge", { kind: "dictionary", slug: data.dictionary[0].slug }, ctx());
    expect((e.data as { what: string }).what).toBeTruthy();
    expect((await runTool("read_knowledge", { kind: "article", slug: ARTICLES[0].slug }, ctx())).ok).toBe(true);
    expect((await runTool("read_knowledge", { kind: "article", slug: "no-such" }, ctx())).ok).toBe(false);
  });

  it("reports the step and survives a loader that throws", async () => {
    const steps: Step[] = [];
    const r = await runStep("get_board", {}, ctx("rev1", { build: async () => Promise.reject(new Error("db down")) }), (s) => steps.push(s));
    expect(r.ok).toBe(false);
    expect((r.data as { error: string }).error).not.toContain("db down");
    expect(steps).toEqual([{ tool: "get_board", label: "Reading the board, its pins and joints" }]);
  });
});

describe("answer references", () => {
  const lookup: RefLookup = {
    revisionId: "rev1",
    lines: LINES.map((l) => ({ id: l.id, lineNo: l.lineNo, refs: refsOf(l.refDes), partId: l.partId, mpn: l.mpn })),
    parts: { TPS54331DR: "p-cat" },
    articles: new Set([ARTICLES[0].slug]),
    articleTitles: new Map([[ARTICLES[0].slug, ARTICLES[0].title]]),
    dictionary: new Map([[DICTIONARY[0].slug, DICTIONARY[0].name]]),
  };

  it("links lines, designators, parts and knowledge that exist", () => {
    const text = `See [[line:2]], [[ref:u3]], [[part:LM358DR]], [[part:TPS54331DR]], [[part:XYZ-1]], [[kb:${ARTICLES[0].slug}]], [[dict:${DICTIONARY[0].slug}]], [[line:99]], [[kb:made-up]].`;
    const links = linkAnswer(text, lookup);
    expect(links[refKey("line", "2")]).toEqual({ href: "/boms/rev1/build/parts?line=l2", label: "Line 2" });
    expect(links[refKey("ref", "U3")]).toEqual({ href: "/boms/rev1/build/parts?line=l2", label: "U3" });
    expect(links[refKey("part", "LM358DR")].href).toBe("/parts/p-l2");
    expect(links[refKey("part", "TPS54331DR")].href).toBe("/parts/p-cat");
    expect(links[refKey("part", "XYZ-1")].href).toBe("/parts?q=XYZ-1");
    expect(links[refKey("kb", ARTICLES[0].slug)]).toEqual({ href: `/knowledge/${ARTICLES[0].slug}`, label: ARTICLES[0].title });
    expect(links[refKey("dict", DICTIONARY[0].slug)].label).toBe(DICTIONARY[0].name);
    expect(links).not.toHaveProperty(refKey("line", "99"));
    expect(links).not.toHaveProperty(refKey("kb", "made-up"));
  });

  it("has no BoM links when no BoM is open", () => {
    const links = linkAnswer("[[line:2]] [[ref:U1]] [[part:LM358DR]]", { ...lookup, revisionId: null, lines: [] });
    expect(Object.keys(links)).toEqual([refKey("part", "LM358DR")]);
  });

  it("reads marks once each and writes unlinked ones as plain words", () => {
    expect(marksIn("[[line:2]] and [[line:2]] and [[ref:U1]]")).toHaveLength(2);
    expect(plainRef("line", "12")).toBe("line 12");
    expect(plainRef("part", "LM358DR")).toBe("LM358DR");
  });

  it("turns an answer into paragraphs, lists, bold and marks", () => {
    const blocks = toBlocks("**Not ready.** One line is short:\ncontinues here\n\n- [[line:1]] waits 14 wk\n- `U1` is 0.5 mm\n\n1. Order now\n2. Find an alternate\n\n## Next");
    expect(blocks.map((b) => b.type)).toEqual(["p", "ul", "ol", "h"]);
    expect(blocks[0]).toMatchObject({ inline: [{ t: "bold", text: "Not ready." }, { t: "text", text: " One line is short: continues here" }] });
    expect(blocks[1]).toMatchObject({ items: [[{ t: "ref", kind: "line", value: "1" }, { t: "text" }], [{ t: "code", text: "U1" }, { t: "text" }]] });
    expect(parseInline("plain")).toEqual([{ t: "text", text: "plain" }]);
  });
});

describe("lines and machines in Ask AI", () => {
  it("checks the open BoM against our lines, step by step", async () => {
    const r = await runTool("get_line_fit", {}, ctx());
    expect(r.ok).toBe(true);
    const d = r.data as { verdict: string; useLines: Record<string, string>; lines: { code: string; fit: string; steps: { step: string; fit: string; why?: string[] }[] }[]; linesOnFile: unknown[] };
    // L1 fits but has no SPI or AOI: amber, with L1 still the line to use.
    expect(d.verdict).toBe("amber");
    expect(d.useLines).toEqual({ smt: "L1" });
    expect(d.lines.find((l) => l.code === "L2")).toMatchObject({ fit: "red" });
    expect(d.lines.find((l) => l.code === "L2")!.steps.find((s) => s.step === "Placement")!.why![0]).toMatch(/0402 chips are smaller than the 0603/);
    expect(d.linesOnFile).toHaveLength(2);
  });

  it("lists the lines alone when asked, or when no BoM is open", async () => {
    const only = await runTool("get_line_fit", { lines_only: true }, ctx());
    expect(only.data).toEqual({ lines: LINES_ON_FILE });
    const none = await runTool("get_line_fit", {}, ctx(null));
    expect((none.data as { note: string }).note).toMatch(/No BoM is open/);
    expect(stepLabel("get_line_fit", {})).toBe("Checking the board against our lines' machines");
  });

  it("sends line and machine questions to the line check, where L2 is a line not an inductor", () => {
    expect(planCalls("Can our machines build this board, and on which line?", true).map((c) => c.tool)).toEqual(["get_line_fit"]);
    expect(planCalls("can L2 build it?", true).map((c) => c.tool)).toEqual(["get_line_fit"]);
    expect(planCalls("What machines are on our lines?", false)).toEqual([{ tool: "get_line_fit", input: { lines_only: true } }]);
  });

  it("answers from the check, naming the line to use and why the other stops", async () => {
    const a = await mockAdapter.ask({ question: "Can our machines build this board?", history: [], revisionId: "rev1", bomTitle: null }, ctx());
    expect(a.text).toContain("Our machines can build it: L1 for the surface-mount side. To check: L1: no SPI");
    expect(a.text).toMatch(/\*\*L2\*\* — does not fit \(Placement: 0402 chips are smaller than the 0603/);
    const list = await mockAdapter.ask({ question: "What machines are on our lines?", history: [], revisionId: null, bomTitle: null }, ctx(null));
    expect(list.text).toMatch(/\*\*L1\*\* High-mix — 3 machines: ASMPT DEK TQ, ASMPT SX2, Heller 1913/);
  });

  it("tells the AI to point at missing limits rather than fill them in", () => {
    expect(SYSTEM_PROMPT).toMatch(/get_line_fit/);
    expect(SYSTEM_PROMPT).toMatch(/do not fill it in from memory/);
  });
});

describe("mock assistant", () => {
  it("chooses tools from the question", () => {
    const names = (q: string, bom = true) => planCalls(q, bom).map((c) => c.tool);
    expect(names("What is blocking this BoM?")).toEqual(["get_bom_overview", "list_bom_lines"]);
    expect(names("Which parts have the most pins, and what is the finest pitch?")).toEqual(["get_board", "get_board_parts"]);
    expect(names("Which lines have a source chosen by hand?")).toEqual(["list_bom_lines"]);
    expect(planCalls("Which lines are pinned?", true)[0].input).toEqual({ filter: "pinned" });
    expect(names("How many pins does U3 have?")).toEqual(["get_line", "get_board_parts"]);
    expect(names("tell me about line 2")).toEqual(["get_line"]);
    expect(names("Is TPS54331DR safe to buy?", false)).toEqual(["get_part"]);
    expect(names("How do I choose between ENIG and HASL?", false)).toEqual(["search_knowledge"]);
    expect(names("what is blocking my bom", false)).toEqual(["find_boms"]);
    expect(keywords("How do I choose between ENIG and HASL?")).toBe("choose between enig hasl");
    expect(searchQueries("How do I choose between ENIG and HASL?")).toEqual(["choose between enig hasl", "enig", "hasl", "between", "choose"]);
  });

  it("answers a BoM question from the tools, with marks that link", async () => {
    const steps: Step[] = [];
    const a = await mockAdapter.ask({ question: "What is blocking this BoM?", history: [], revisionId: "rev1", bomTitle: BUILD.title }, ctx(), (s) => steps.push(s));
    expect(a.mode).toBe("mock");
    expect(a.model).toBeNull();
    expect(a.text).toContain("Not ready to build");
    expect(a.text).toContain("[[line:1]]");
    expect(a.text).toContain("[[part:STM32F103C8T6]]");
    expect(a.steps.map((s) => s.tool)).toEqual(["get_bom_overview", "list_bom_lines"]);
    expect(steps).toEqual(a.steps);
  });

  it("answers pin questions both ways", async () => {
    const ask = (question: string) => mockAdapter.ask({ question, history: [], revisionId: "rev1", bomTitle: null }, ctx());
    const pins = await ask("Which parts have the most pins, and what is the finest pitch?");
    expect(pins.text).toMatch(/finest pitch 0\.5 mm/);
    expect(pins.text).toMatch(/\[\[ref:U1\]\].*48 pins/);
    expect(pins.text).toMatch(/no netlist/);
    const u3 = await ask("How many pins does U3 have?");
    expect(u3.text).toMatch(/\*\*8 pins\*\*/);
    expect(u3.text).toMatch(/pinned by hand\*\* to Mouser/);
    const pinned = await ask("Which lines have a source chosen by hand?");
    expect(pinned.text).toMatch(/\[\[line:2\]\].*pinned to Mouser/);
  });

  it("answers a knowledge question by searching, then reading the best entry", async () => {
    const a = await mockAdapter.ask({ question: "What is an LDO?", history: [], revisionId: null, bomTitle: null }, ctx(null));
    expect(a.steps.map((s) => s.tool)).toEqual(["search_knowledge", "read_knowledge"]);
    expect(a.text).toMatch(/\[\[dict:[a-z0-9-]+\]\]/);
  });

  it("falls back to single words when the phrase finds nothing", async () => {
    const asked: string[] = [];
    const sources = { searchArticles: async (q: string) => (asked.push(q), q === "voiding" ? [{ slug: ARTICLES[0].slug, domain: ARTICLES[0].domain, title: ARTICLES[0].title, summary: ARTICLES[0].summary }] : []) };
    const a = await mockAdapter.ask({ question: "zzqx voiding qqzx", history: [], revisionId: null, bomTitle: null }, ctx(null, sources));
    expect(asked[0]).toBe("zzqx voiding qqzx");
    expect(asked).toContain("voiding");
    expect(a.text).toContain(`[[kb:${ARTICLES[0].slug}]]`);
  });

  it("passes a tool's refusal on in plain words", async () => {
    const a = await mockAdapter.ask({ question: "tell me about R99", history: [], revisionId: "rev1", bomTitle: null }, ctx());
    expect(a.text).toMatch(/No line, designator or part number "R99"/);
  });
});

describe("assistant prompt", () => {
  it("is frozen text and puts what changes in the user turn", () => {
    expect(SYSTEM_PROMPT).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    for (const mark of ["[[line:", "[[ref:", "[[part:", "[[kb:", "[[dict:"]) expect(SYSTEM_PROMPT).toContain(mark);
    expect(userTurn({ question: "Is it ready?", revisionId: "rev1", bomTitle: "GW-200 rev A" })).toBe("<context>The user has this BoM open: GW-200 rev A (revision id rev1). Tools use it unless told otherwise.</context>\n\nIs it ready?");
    expect(userTurn({ question: "What is ENIG?", revisionId: null, bomTitle: null })).toMatch(/no BoM open/);
  });
});
