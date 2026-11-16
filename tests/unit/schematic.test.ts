import { describe, expect, it } from "vitest";
import { contentBounds, junctions, localPins, netFlag, partTexts, pinPosition, routeWires, toWorld, validateCircuit, highlightedParts, type Circuit, type Part, type TextItem } from "@/lib/schematic";
import { CIRCUITS, circuitById } from "@/knowledge/circuits";
import { DICTIONARY } from "@/knowledge/dictionary";

describe("symbol transforms", () => {
  const r = { id: "R1", sym: "resistor" as const, x: 100, y: 50 };
  it("places two-pin parts horizontally, then rotates clockwise", () => {
    expect(toWorld(r, localPins(r)["1"])).toEqual([80, 50]);
    expect(toWorld({ ...r, rot: 90 }, localPins(r)["1"])).toEqual([100, 30]);
    expect(toWorld({ ...r, rot: 180 }, localPins(r)["1"])).toEqual([120, 50]);
    expect(toWorld({ ...r, rot: 270 }, localPins(r)["1"])).toEqual([100, 70]);
  });

  it("mirrors before rotating", () => {
    const q = { id: "Q1", sym: "nmos" as const, x: 0, y: 0, rot: 270 as const, flip: "y" as const };
    const pins = localPins(q);
    expect(toWorld(q, pins.G)).toEqual([0, 20]);
    expect(toWorld(q, pins.S)).toEqual([-20, -10]);
    expect(toWorld(q, pins.D)).toEqual([20, -10]);
  });

  it("lays IC pins out on a 20 px pitch", () => {
    const u = { id: "U1", sym: "ic" as const, x: 200, y: 100, left: ["A", "B"], right: ["Y"], bottom: ["GND"] };
    const c: Circuit = { id: "t", title: "", caption: "", w: 400, h: 200, parts: [u], wires: [] };
    expect(pinPosition(c, "U1.A")).toEqual([150, 90]);
    expect(pinPosition(c, "U1.B")).toEqual([150, 110]);
    expect(pinPosition(c, "U1.Y")).toEqual([250, 90]);
    expect(pinPosition(c, "U1.GND")).toEqual([200, 140]);
    expect(pinPosition(c, "U1.NOPE")).toBeNull();
  });
});

describe("routing and junctions", () => {
  const c: Circuit = {
    id: "t",
    title: "",
    caption: "",
    w: 300,
    h: 200,
    parts: [
      { id: "R1", sym: "resistor", x: 50, y: 50 },
      { id: "R2", sym: "resistor", x: 150, y: 100, rot: 90 },
    ],
    wires: [
      ["R1.2", [200, 50]],
      ["R2.1", [150, 50]],
      [[120, 150], [200, 120]],
    ],
  };

  it("routes corners horizontally first", () => {
    const segs = routeWires(c);
    expect(segs).toContainEqual([[120, 150], [200, 150]]);
    expect(segs).toContainEqual([[200, 150], [200, 120]]);
  });

  it("puts a dot where a wire tees into another, not on simple corners", () => {
    expect(junctions(c)).toEqual([[150, 50]]);
  });
});

describe("circuit library", () => {
  it("every circuit is valid", () => {
    expect(CIRCUITS.flatMap(validateCircuit)).toEqual([]);
  });

  it("has unique ids and every dictionary reference resolves", () => {
    expect(new Set(CIRCUITS.map((c) => c.id)).size).toBe(CIRCUITS.length);
    const missing = DICTIONARY.filter((e) => e.circuit && !circuitById(e.circuit)).map((e) => `${e.slug} → ${e.circuit}`);
    expect(missing).toEqual([]);
  });

  it("focus maps point at real entries and real parts", () => {
    const slugs = new Set(DICTIONARY.map((e) => e.slug));
    const bad: string[] = [];
    for (const c of CIRCUITS) {
      const ids = new Set(c.parts.map((p) => p.id));
      for (const [slug, partIds] of Object.entries(c.focus ?? {})) {
        if (!slugs.has(slug)) bad.push(`${c.id}: unknown entry ${slug}`);
        for (const id of partIds) if (!ids.has(id)) bad.push(`${c.id}: ${slug} → unknown part ${id}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("highlights the entry's own part when a circuit is shared", () => {
    const emi = circuitById("emi-filter-ac")!;
    expect([...highlightedParts(emi, "varistor")]).toEqual(["RV1"]);
    expect(highlightedParts(circuitById("ldo")!).has("U1")).toBe(true);
  });

  it("every circuit is used by at least one entry", () => {
    const used = new Set(DICTIONARY.map((e) => e.circuit).filter(Boolean));
    expect(CIRCUITS.filter((c) => !used.has(c.id)).map((c) => c.id)).toEqual([]);
  });
});

type Box = [number, number, number, number];
const overlaps = (a: Box, b: Box, m = 0) => a[0] < b[2] - m && b[0] < a[2] - m && a[1] < b[3] - m && b[1] < a[3] - m;
const textBox = (t: TextItem): Box => {
  const w = t.s.length * t.size * ((t.weight ?? 400) >= 600 ? 0.6 : 0.55);
  const left = t.anchor === "start" ? t.x : t.anchor === "end" ? t.x - w : t.x - w / 2;
  return [left, t.y - t.size * 0.72, left + w, t.y + t.size * 0.18];
};
/** The solid part of each symbol (leads excluded) in world space; null where text belongs inside. */
function bodyBox(p: Part): Box | null {
  const local: Partial<Record<Part["sym"], Box>> = {
    opamp: [-20, -20, 20, 20],
    bridge: [-20, -20, 20, 20],
    opto: [-22, -18, 22, 18],
    transformer: [-12, -20, 12, 20],
    npn: [-13, -15, 17, 15],
    pnp: [-13, -15, 17, 15],
    nmos: [-8, -11, 10, 11],
    pmos: [-8, -11, 10, 11],
    triac: [-10, -8, 10, 8],
    cmc: [-16, -14, 16, 14],
    ground: [-8, 0, 8, 13],
    vcc: [-8, -8, 8, 0],
    led: [-6, -16, 12, 7],
    photodiode: [-6, -16, 12, 7],
  };
  if (p.sym === "ic" || p.sym === "net" || p.sym === "connector") return null;
  const [a, b, c, d] = local[p.sym] ?? [-10, -7, 10, 7];
  const pts = ([[a, b], [c, b], [a, d], [c, d]] as [number, number][]).map((q) => toWorld(p, q));
  return [Math.min(...pts.map((q) => q[0])), Math.min(...pts.map((q) => q[1])), Math.max(...pts.map((q) => q[0])), Math.max(...pts.map((q) => q[1]))];
}

function layoutIssues(c: Circuit): string[] {
  const out: string[] = [];
  const texts = c.parts.flatMap((p) => partTexts(p).map((t) => ({ owner: p.id, t, b: textBox(t) })));
  for (const n of c.notes ?? []) texts.push({ owner: "note", t: { x: n.x, y: n.y, s: n.text, anchor: n.anchor ?? "start", size: 9.5 }, b: [0, 0, 0, 0] });
  for (const x of texts) if (x.owner === "note") x.b = textBox(x.t);
  const segs = routeWires(c);
  texts.forEach((a, i) => {
    for (const b of texts.slice(i + 1)) if ((a.owner !== b.owner || a.owner === "note") && overlaps(a.b, b.b, 0.5)) out.push(`"${a.t.s}" overlaps "${b.t.s}"`);
    for (const p of c.parts) {
      const body = p.id === a.owner ? null : bodyBox(p);
      if (body && overlaps(a.b, body, 0.5)) out.push(`"${a.t.s}" overlaps ${p.id}`);
    }
    for (const [p, q] of segs) {
      const wire: Box = [Math.min(p[0], q[0]) - 0.7, Math.min(p[1], q[1]) - 0.7, Math.max(p[0], q[0]) + 0.7, Math.max(p[1], q[1]) + 0.7];
      if (overlaps(a.b, wire, 0.3)) out.push(`"${a.t.s}" crosses a wire at ${p} → ${q}`);
    }
  });
  for (const p of c.parts.filter((x) => x.sym === "net")) {
    const f = netFlag(p);
    const flag: Box = [Math.min(f.x0, f.x1), p.y - 6, Math.max(f.x0, f.x1), p.y + 6];
    for (const [a, b] of segs) if (overlaps(flag, [Math.min(a[0], b[0]) - 0.5, Math.min(a[1], b[1]) - 0.5, Math.max(a[0], b[0]) + 0.5, Math.max(a[1], b[1]) + 0.5], 1)) out.push(`flag ${p.id} crosses a wire`);
  }
  return out.map((m) => `${c.id}: ${m}`);
}

describe("circuit layout", () => {
  it("no label overlaps another label, a symbol or a wire", () => {
    expect(CIRCUITS.flatMap(layoutIssues)).toEqual([]);
  });

  it("frames each drawing around its content, not the canvas it was laid out on", () => {
    const ldo = circuitById("ldo")!;
    const b = contentBounds(ldo);
    expect(b.w).toBeLessThanOrEqual(ldo.w + 20);
    // Every pin and every piece of text sits inside the frame.
    for (const p of ldo.parts) {
      for (const pin of Object.values(localPins(p))) {
        const [x, y] = toWorld(p, pin);
        expect(x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h).toBe(true);
      }
      for (const t of partTexts(p)) {
        const [l, top, r, bottom] = textBox(t);
        expect(l >= b.x && r <= b.x + b.w && top >= b.y && bottom <= b.y + b.h).toBe(true);
      }
    }
  });
});
