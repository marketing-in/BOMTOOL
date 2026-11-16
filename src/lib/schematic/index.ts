/**
 * Data-driven schematics: parts are placed on a 10 px grid, wires reference pins by name ("U1.OUT")
 * or by coordinate, and routing/junctions are computed here so circuits stay short to write and
 * easy to test. Rendering lives in src/components/knowledge/schematic.tsx.
 */

export type Rot = 0 | 90 | 180 | 270;

export type SymbolKind =
  | "resistor"
  | "capacitor"
  | "cap-polar"
  | "inductor"
  | "ferrite"
  | "diode"
  | "zener"
  | "schottky"
  | "tvs"
  | "tvs-bi"
  | "led"
  | "photodiode"
  | "npn"
  | "pnp"
  | "nmos"
  | "pmos"
  | "opamp"
  | "ic"
  | "ground"
  | "vcc"
  | "net"
  | "battery"
  | "crystal"
  | "fuse"
  | "switch"
  | "relay-coil"
  | "relay-contact"
  | "transformer"
  | "connector"
  | "motor"
  | "antenna"
  | "ntc"
  | "varistor"
  | "pot"
  | "bridge"
  | "buzzer"
  | "opto"
  | "triac"
  | "cmc"
  | "gdt";

export type Part = {
  id: string;
  sym: SymbolKind;
  x: number;
  y: number;
  rot?: Rot;
  /** Mirror before rotating: "x" swaps left/right, "y" swaps top/bottom. */
  flip?: "x" | "y";
  /** Reference designator shown next to the part (defaults to id for real components). */
  label?: string;
  value?: string;
  /** The part this circuit is about — drawn in the accent colour. */
  highlight?: boolean;
  /** Where to put label/value text; defaults depend on rotation. */
  labelAt?: "top" | "bottom" | "left" | "right";
  // ic
  w?: number;
  h?: number;
  left?: string[];
  right?: string[];
  top?: string[];
  bottom?: string[];
  /** Text inside an IC box. */
  title?: string;
  // connector
  pins?: string[];
  // vcc / net label
  text?: string;
};

export type WirePoint = string | [number, number];
export type Wire = WirePoint[];

export type Note = { x: number; y: number; text: string; anchor?: "start" | "middle" | "end" };

export type Circuit = {
  id: string;
  title: string;
  caption: string;
  w: number;
  h: number;
  parts: Part[];
  wires: Wire[];
  notes?: Note[];
  /** Dashed isolation barriers (vertical lines). */
  barriers?: { x: number; y1: number; y2: number }[];
  /** Dictionary slug → part ids to highlight when this circuit illustrates that entry. */
  focus?: Record<string, string[]>;
};

/** Part ids to draw in the accent colour for a given dictionary entry (falls back to `highlight`). */
export function highlightedParts(c: Circuit, entrySlug?: string): Set<string> {
  const focus = entrySlug ? c.focus?.[entrySlug] : undefined;
  return new Set(focus ?? c.parts.filter((p) => p.highlight).map((p) => p.id));
}

type Pt = [number, number];

const TWO_PIN: Record<string, Pt> = { "1": [-20, 0], "2": [20, 0] };

/** Pin positions in the symbol's own coordinates (before flip/rotate/translate). */
export function localPins(p: Part): Record<string, Pt> {
  switch (p.sym) {
    case "diode":
    case "zener":
    case "schottky":
    case "tvs":
    case "led":
    case "photodiode":
      return { ...TWO_PIN, A: [-20, 0], K: [20, 0] };
    case "cap-polar":
    case "battery":
      return { ...TWO_PIN, "+": [-20, 0], "-": [20, 0] };
    case "pot":
      return { ...TWO_PIN, W: [0, -20] };
    case "npn":
    case "pnp":
      return { B: [-20, 0], C: [10, -20], E: [10, 20] };
    case "nmos":
    case "pmos":
      return { G: [-20, 0], D: [10, -20], S: [10, 20] };
    case "opamp":
      return { "-": [-30, -10], "+": [-30, 10], OUT: [30, 0], "V+": [0, -20], "V-": [0, 20] };
    case "ground":
    case "vcc":
    case "net":
    case "antenna":
      return { "1": [0, 0] };
    case "transformer":
      return { P1: [-20, -20], P2: [-20, 20], S1: [20, -20], S2: [20, 20] };
    case "cmc":
      return { "1": [-20, -10], "2": [20, -10], "3": [-20, 10], "4": [20, 10] };
    case "bridge":
      return { AC1: [-30, 0], AC2: [30, 0], "+": [0, -30], "-": [0, 30] };
    case "opto":
      return { A: [-30, -10], K: [-30, 10], C: [30, -10], E: [30, 10] };
    case "triac":
      return { MT2: [0, -20], MT1: [0, 20], G: [-20, 10] };
    case "ic":
      return icPins(p);
    case "connector":
      return connectorPins(p);
    default:
      return TWO_PIN;
  }
}

export function icSize(p: Part): { w: number; h: number } {
  const rows = Math.max(p.left?.length ?? 0, p.right?.length ?? 0, 1);
  const cols = Math.max(p.top?.length ?? 0, p.bottom?.length ?? 0, 1);
  return { w: p.w ?? Math.max(80, 20 * (cols + 1)), h: p.h ?? Math.max(40, 20 * (rows + 1)) };
}

const snap = (v: number) => Math.round(v / 10) * 10;

function icPins(p: Part): Record<string, Pt> {
  const { w, h } = icSize(p);
  const out: Record<string, Pt> = {};
  (p.left ?? []).forEach((n, i) => (out[n] = [-w / 2 - 10, -h / 2 + 20 * (i + 1)]));
  (p.right ?? []).forEach((n, i) => (out[n] = [w / 2 + 10, -h / 2 + 20 * (i + 1)]));
  const across = (list: string[], y: number) => list.forEach((n, i) => (out[n] = [snap(-w / 2 + (w * (i + 1)) / (list.length + 1)), y]));
  across(p.top ?? [], -h / 2 - 10);
  across(p.bottom ?? [], h / 2 + 10);
  return out;
}

function connectorPins(p: Part): Record<string, Pt> {
  const list = p.pins ?? ["1", "2"];
  const out: Record<string, Pt> = {};
  list.forEach((n, i) => {
    const pt: Pt = [-20, i * 20 - (list.length - 1) * 10];
    out[String(i + 1)] = pt;
    out[n] = pt;
  });
  return out;
}

/** Local → world: flip, then rotate (clockwise, SVG y-down), then translate. */
export function toWorld(p: Part, [lx, ly]: Pt): Pt {
  let x = p.flip === "x" ? -lx : lx;
  let y = p.flip === "y" ? -ly : ly;
  const r = p.rot ?? 0;
  if (r === 90) [x, y] = [-y, x];
  else if (r === 180) [x, y] = [-x, -y];
  else if (r === 270) [x, y] = [y, -x];
  return [p.x + x, p.y + y];
}

export function pinPosition(c: Circuit, ref: string): Pt | null {
  const dot = ref.indexOf(".");
  if (dot < 1) return null;
  const part = c.parts.find((p) => p.id === ref.slice(0, dot));
  if (!part) return null;
  const local = localPins(part)[ref.slice(dot + 1)];
  return local ? toWorld(part, local) : null;
}

export type Segment = [Pt, Pt];

/** Resolves every wire into straight orthogonal segments (horizontal first when a corner is needed). */
export function routeWires(c: Circuit): Segment[] {
  const segs: Segment[] = [];
  for (const wire of c.wires) {
    const pts = wire.map((w) => (typeof w === "string" ? pinPosition(c, w) : w)).filter((p): p is Pt => !!p);
    for (let i = 0; i + 1 < pts.length; i++) {
      const [a, b] = [pts[i], pts[i + 1]];
      if (a[0] === b[0] || a[1] === b[1]) segs.push([a, b]);
      else {
        const corner: Pt = [b[0], a[1]];
        segs.push([a, corner], [corner, b]);
      }
    }
  }
  return segs.filter(([a, b]) => a[0] !== b[0] || a[1] !== b[1]);
}

const key = (p: Pt) => `${p[0]},${p[1]}`;

function strictlyInside(p: Pt, [a, b]: Segment) {
  if (a[0] === b[0] && p[0] === a[0]) return p[1] > Math.min(a[1], b[1]) && p[1] < Math.max(a[1], b[1]);
  if (a[1] === b[1] && p[1] === a[1]) return p[0] > Math.min(a[0], b[0]) && p[0] < Math.max(a[0], b[0]);
  return false;
}

/** Junction dots: points where three or more wire/pin connections meet. */
export function junctions(c: Circuit, segs = routeWires(c)): Pt[] {
  const pinPts = new Set<string>();
  for (const part of c.parts) for (const local of Object.values(localPins(part))) pinPts.add(key(toWorld(part, local)));
  const ends = new Map<string, { p: Pt; n: number }>();
  for (const [a, b] of segs)
    for (const p of [a, b]) {
      const k = key(p);
      ends.set(k, { p, n: (ends.get(k)?.n ?? 0) + 1 });
    }
  const out: Pt[] = [];
  for (const { p, n } of ends.values()) {
    const through = segs.filter((s) => strictlyInside(p, s)).length;
    const degree = n + 2 * through + (pinPts.has(key(p)) ? 1 : 0);
    if (degree >= 3) out.push(p);
  }
  return out;
}

/** Problems that would draw a broken circuit: unknown parts/pins, duplicate ids, parts off the canvas. */
export function validateCircuit(c: Circuit): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const p of c.parts) {
    if (ids.has(p.id)) errors.push(`${c.id}: duplicate part id ${p.id}`);
    ids.add(p.id);
    if (p.x < 0 || p.y < 0 || p.x > c.w || p.y > c.h) errors.push(`${c.id}: ${p.id} is outside the ${c.w}×${c.h} canvas`);
  }
  for (const w of c.wires) {
    if (w.length < 2) errors.push(`${c.id}: wire with fewer than two points`);
    for (const pt of w) if (typeof pt === "string" && !pinPosition(c, pt)) errors.push(`${c.id}: unknown pin ${pt}`);
  }
  return errors;
}

// ── Text and framing ────────────────────────────────────────────────────────────────────────────

export const LABEL_SIZE = 9;

export type TextItem = { x: number; y: number; s: string; anchor: "start" | "middle" | "end"; size: number; weight?: number; muted?: boolean };

/** Net flag outline: from the pin point (x0 is the notch) to the far end of the label box (x1). */
export function netFlag(p: Part): { label: string; x0: number; x1: number } {
  const label = p.text ?? p.id;
  const dir = p.rot === 180 ? -1 : 1;
  const x0 = p.x + dir * 4;
  return { label, x0, x1: x0 + dir * (label.length * 5.6 + 8) };
}

const BIG = new Set<SymbolKind>(["npn", "pnp", "nmos", "pmos", "triac", "transformer", "bridge", "opto", "cmc"]);

/** Every piece of text drawn for a part, in world coordinates, so it stays upright whatever the rotation. */
export function partTexts(p: Part): TextItem[] {
  const t = (x: number, y: number, s: string, anchor: TextItem["anchor"] = "middle", o: { size?: number; weight?: number; muted?: boolean } = {}): TextItem => ({
    x,
    y,
    s,
    anchor,
    size: o.size ?? 10,
    weight: o.weight,
    muted: o.muted,
  });
  if (p.sym === "ground") return [];
  if (p.sym === "vcc") return [t(p.x, p.y - 12, p.text ?? "VCC", "middle", { size: 9.5, weight: 600 })];
  if (p.sym === "net") {
    const f = netFlag(p);
    return [t((f.x0 + f.x1) / 2, p.y + 3.3, f.label, "middle", { size: 8.5, weight: 600 })];
  }
  if (p.sym === "ic") {
    const { w, h } = icSize(p);
    const out: TextItem[] = [];
    if (p.title) out.push(t(p.x, p.y + 3.5, p.title, "middle", { weight: 600 }));
    if (p.label) out.push(t(p.x - w / 2, p.y - h / 2 - 5, p.label, "start", { size: LABEL_SIZE, muted: true }));
    if (p.value) out.push(t(p.x + w / 2, p.y - h / 2 - 5, p.value, "end", { size: LABEL_SIZE, muted: true }));
    for (const [n, [lx, ly]] of Object.entries(localPins(p))) {
      const [x, y] = [p.x + lx, p.y + ly];
      if (lx < -w / 2) out.push(t(p.x - w / 2 + 4, y + 3, n, "start", { size: 8 }));
      else if (lx > w / 2) out.push(t(p.x + w / 2 - 4, y + 3, n, "end", { size: 8 }));
      else if (ly < 0) out.push(t(x, p.y - h / 2 + 11, n, "middle", { size: 8 }));
      else out.push(t(x, p.y + h / 2 - 5, n, "middle", { size: 8 }));
    }
    return out;
  }
  if (p.sym === "connector") {
    const list = p.pins ?? [];
    const top = p.y - (list.length - 1) * 10 - 10;
    const mirrored = p.flip === "x";
    const out = list.map((n, i) => t(p.x + (mirrored ? -16 : 16), p.y + i * 20 - (list.length - 1) * 10 + 3, n, mirrored ? "end" : "start", { size: 8 }));
    if (p.label || p.value) out.push(t(p.x + 1, top - 5, [p.label, p.value].filter(Boolean).join(" "), "middle", { size: LABEL_SIZE, muted: true }));
    return out;
  }
  if (!p.label && !p.value) return [];

  const vertical = p.rot === 90 || p.rot === 270;
  // Parts whose body is taller/wider than a two-pin symbol get their text further out.
  const big = BIG.has(p.sym);
  const at = p.labelAt ?? (p.sym === "opamp" ? "bottom" : big || vertical ? "right" : "top");
  const reach = p.sym === "bridge" || p.sym === "opto" ? 34 : p.sym === "transformer" ? 28 : big ? 24 : 13;
  const pos: Record<string, [number, number, TextItem["anchor"]]> = {
    top: [p.x, p.y - reach, "middle"],
    bottom: [p.x, p.y + (p.sym === "opamp" ? 32 : reach + 10), "middle"],
    left: [p.x - (big ? reach - 4 : 14), p.y - 2, "end"],
    right: [p.x + (big ? reach - 4 : 14), p.y - 2, "start"],
  };
  // A bridge has wires on all four sides: its side labels go on the upper diagonal instead.
  if (p.sym === "bridge") {
    pos.left = [p.x - 18, p.y - 22, "end"];
    pos.right = [p.x + 18, p.y - 22, "start"];
  }
  const [x, y, anchor] = pos[at];
  // Big parts above/below: one line ("Q1 N-FET") so the text stays clear of the leads.
  if (big && (at === "top" || at === "bottom")) return [t(x, y, [p.label, p.value].filter(Boolean).join(" "), anchor, { size: LABEL_SIZE, weight: 600 })];
  // Two-pin parts drawn horizontally: designator above, value below. Otherwise value under the designator.
  const [vx, vy] = at === "top" ? [pos.bottom[0], pos.bottom[1]] : [x, y + 11];
  const out: TextItem[] = [];
  if (p.label) out.push(t(x, y, p.label, anchor, { size: LABEL_SIZE, weight: 600 }));
  if (p.value) out.push(t(vx, vy, p.value, anchor, { size: LABEL_SIZE, muted: true }));
  return out;
}

/** The symbol's drawn extent in its own coordinates (pins are added separately). */
function localBox(p: Part): [number, number, number, number] {
  switch (p.sym) {
    case "ic": {
      const { w, h } = icSize(p);
      return [-w / 2, -h / 2, w / 2, h / 2];
    }
    case "opamp":
      return [-30, -20, 30, 20];
    case "bridge":
      return [-30, -30, 30, 30];
    case "opto":
      return [-30, -18, 30, 18];
    case "transformer":
      return [-20, -20, 20, 20];
    case "npn":
    case "pnp":
      return [-20, -20, 17, 20];
    case "nmos":
    case "pmos":
    case "triac":
      return [-20, -20, 10, 20];
    case "cmc":
      return [-20, -14, 20, 14];
    case "ground":
      return [-8, 0, 8, 13];
    case "vcc":
      return [-8, -8, 8, 0];
    case "net":
      return [0, 0, 0, 0];
    case "antenna":
      return [-8, -26, 8, 0];
    case "connector": {
      const n = (p.pins ?? ["1", "2"]).length;
      const top = -(n - 1) * 10 - 10;
      return [-20, top, 12, top + n * 20];
    }
    case "led":
    case "photodiode":
      return [-20, -18, 20, 9];
    case "pot":
      return [-20, -20, 20, 9];
    case "switch":
      return [-20, -13, 20, 2];
    case "motor":
    case "gdt":
      return [-20, -12, 20, 12];
    default:
      return [-20, -10, 20, 10];
  }
}

/** Approximate extent of a line of text (sans-serif, ~0.6 em per character). */
function textExtent(t: TextItem): [number, number, number, number] {
  const w = t.s.length * t.size * ((t.weight ?? 400) >= 600 ? 0.62 : 0.58);
  const left = t.anchor === "start" ? t.x : t.anchor === "end" ? t.x - w : t.x - w / 2;
  return [left, t.y - t.size * 0.8, left + w, t.y + t.size * 0.25];
}

/**
 * The box everything is drawn in — symbols, pins, wires, text, notes and barriers — plus a margin.
 * Used as the SVG viewBox so every circuit is framed tightly whatever canvas it was laid out on.
 */
export function contentBounds(c: Circuit, pad = 10): { x: number; y: number; w: number; h: number } {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  const add = (x: number, y: number) => {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  };
  const addBox = ([a, b, cc, d]: [number, number, number, number]) => {
    add(a, b);
    add(cc, d);
  };
  for (const p of c.parts) {
    const [a, b, cc, d] = localBox(p);
    for (const corner of [[a, b], [cc, b], [a, d], [cc, d]] as Pt[]) add(...toWorld(p, corner));
    for (const pin of Object.values(localPins(p))) add(...toWorld(p, pin));
    if (p.sym === "net") {
      const f = netFlag(p);
      add(f.x1, p.y - 6);
      add(f.x1, p.y + 6);
    }
    for (const t of partTexts(p)) addBox(textExtent(t));
  }
  for (const [a, b] of routeWires(c)) {
    add(...a);
    add(...b);
  }
  for (const n of c.notes ?? []) addBox(textExtent({ x: n.x, y: n.y, s: n.text, anchor: n.anchor ?? "start", size: 9.5 }));
  for (const b of c.barriers ?? []) {
    addBox(textExtent({ x: b.x, y: b.y1 - 4, s: "isolation", anchor: "middle", size: 8.5 }));
    add(b.x, b.y2);
  }
  if (!Number.isFinite(x0)) return { x: 0, y: 0, w: c.w, h: c.h };
  return { x: Math.floor(x0 - pad), y: Math.floor(y0 - pad), w: Math.ceil(x1 - x0 + 2 * pad), h: Math.ceil(y1 - y0 + 2 * pad) };
}
