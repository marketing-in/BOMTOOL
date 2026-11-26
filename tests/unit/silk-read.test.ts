import { describe, expect, it } from "vitest";
import { GLYPH_CHARS, spellByStyle, designatorStyles, readSilk, strokesFromSvg, type SilkLabel } from "@/lib/board/silk-read";
import { SILK_GLYPHS } from "@/lib/board/silk-font";

// ── A synthetic silkscreen: lettering drawn from the reader's own letter shapes, in gerber-to-svg's format ──

type Draw = {
  text: string;
  /** Centre of the word, mm. */
  x: number;
  y: number;
  height?: number;
  /** The way the characters run, seen from the top side. */
  rotation?: 0 | 90 | 180 | 270;
  /** Bottom-side lettering: drawn mirrored. */
  mirrored?: boolean;
  /** Which of a character's shapes to draw (one per font that draws it differently). */
  shape?: number;
};

const shapesOf = (ch: string) => SILK_GLYPHS.filter((g) => g.ch === ch).map((g) => g.d.split("|").map((line) => line.split(" ").map((p) => p.split(",").map(Number) as [number, number])));

/** The strokes of one word as path data (drawing units: 1/1000 mm). */
function word({ text, x, y, height = 1, rotation = 0, mirrored = false, shape = 0 }: Draw): string {
  const lines: [number, number][][] = [];
  let at = 0;
  for (const ch of text) {
    // A blank widens the letter space by a quarter of the height: less than a word space.
    if (ch === " ") {
      at += 0.25 * height;
      continue;
    }
    const shapes = shapesOf(ch);
    const glyph = shapes[shape % shapes.length];
    const xs = glyph.flat().map((p) => p[0]);
    const left = Math.min(...xs), wide = Math.max(...xs) - left;
    for (const line of glyph) lines.push(line.map(([gx, gy]) => [at + ((gx - left) * height) / 100, (gy * height) / 100]));
    at += (wide * height) / 100 + 0.3 * height;
  }
  const length = at - 0.3 * height;
  const turn = ((mirrored ? rotation - 180 : rotation) * Math.PI) / 180;
  const place = ([lx, ly]: [number, number]) => {
    const px = (mirrored ? -1 : 1) * (lx - length / 2), py = ly - height / 2;
    return `${((x + px * Math.cos(turn) - py * Math.sin(turn)) * 1000).toFixed(1)} ${((y + px * Math.sin(turn) + py * Math.cos(turn)) * 1000).toFixed(1)}`;
  };
  return lines.map((line) => `M ${line.map(place).join(" ")}`).join(" ");
}

const stroked = (d: string, pen = 0.15) => `<path d="${d}" fill="none" stroke-width="${pen * 1000}"/>`;
const mm = (n: number) => (n * 1000).toFixed(1);

/** A layer drawing as the app stores it: millimetre units, the artwork inside the flipped group. */
const drawing = (body: string, defs = "") =>
  `<svg version="1.1" xmlns="http://www.w3.org/2000/svg" stroke-linecap="round" stroke-width="0" width="80mm" height="60mm" viewBox="0 0 80000 60000"><defs>${defs}</defs><g transform="translate(0,60000) scale(1,-1)" fill="currentColor" stroke="currentColor">${body}</g></svg>`;

const box = (x0: number, y0: number, x1: number, y1: number) => `M ${mm(x0)} ${mm(y0)} ${mm(x1)} ${mm(y0)} ${mm(x1)} ${mm(y1)} ${mm(x0)} ${mm(y1)} ${mm(x0)} ${mm(y0)}`;
const circle = (cx: number, cy: number, r: number) => `M ${mm(cx + r)} ${mm(cy)} A ${mm(r)} ${mm(r)} 0 0 1 ${mm(cx - r)} ${mm(cy)} ${mm(r)} ${mm(r)} 0 0 1 ${mm(cx + r)} ${mm(cy)}`;
/** Four corner marks round a part: little angles, arms along the part's sides. */
const corners = (x0: number, y0: number, x1: number, y1: number, arm = 0.6) =>
  [
    `M ${mm(x0 + arm)} ${mm(y0)} ${mm(x0)} ${mm(y0)} ${mm(x0)} ${mm(y0 + arm)}`,
    `M ${mm(x1 - arm)} ${mm(y0)} ${mm(x1)} ${mm(y0)} ${mm(x1)} ${mm(y0 + arm)}`,
    `M ${mm(x0 + arm)} ${mm(y1)} ${mm(x0)} ${mm(y1)} ${mm(x0)} ${mm(y1 - arm)}`,
    `M ${mm(x1 - arm)} ${mm(y1)} ${mm(x1)} ${mm(y1)} ${mm(x1)} ${mm(y1 - arm)}`,
  ].join(" ");
/** A chip's two brackets: [ ] with the pads between them. */
const brackets = (x0: number, y0: number, x1: number, y1: number) =>
  `M ${mm(x0 + 0.4)} ${mm(y0)} ${mm(x0)} ${mm(y0)} ${mm(x0)} ${mm(y1)} ${mm(x0 + 0.4)} ${mm(y1)} M ${mm(x1 - 0.4)} ${mm(y0)} ${mm(x1)} ${mm(y0)} ${mm(x1)} ${mm(y1)} ${mm(x1 - 0.4)} ${mm(y1)}`;
/** A logo: a filled shape and a tangle of fine lines over it. */
const logo = (x: number, y: number) => {
  const tangle = Array.from({ length: 40 }, (_, i) => `${mm(x + ((i * 7) % 11) * 0.5)} ${mm(y + ((i * 5) % 9) * 0.45)}`).join(" ");
  return `<path d="M ${mm(x)} ${mm(y)} ${mm(x + 5)} ${mm(y)} ${mm(x + 4)} ${mm(y + 4)} ${mm(x + 1)} ${mm(y + 3)} Z"/>` + stroked(`M ${tangle}`, 0.08);
};

const noise =
  stroked([box(30, 30, 38, 36), circle(50, 33, 3), corners(60, 30, 66, 36), brackets(30, 44, 32.4, 45.4), brackets(36, 44, 38.4, 45.4)].join(" "), 0.2) + logo(60, 44);

const find = (labels: SilkLabel[], text: string) => labels.filter((l) => l.text === text);
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

describe("strokes of a layer drawing", () => {
  it("reads millimetre and inch drawings into Gerber mm, one stroke per pen-down", () => {
    const svg = drawing(stroked("M 1000 2000 3000 2000 3000 5000 M 10000 10000 12000 10000", 0.2));
    expect(strokesFromSvg(svg)).toEqual([
      { pts: [[1, 2], [3, 2], [3, 5]], width: 0.2 },
      { pts: [[10, 10], [12, 10]], width: 0.2 },
    ]);
    const inches = `<svg width="2in" height="1in" viewBox="0 0 2000 1000"><defs></defs><g><path d="M 1000 500 2000 500" fill="none" stroke-width="10"/></g></svg>`;
    const [s] = strokesFromSvg(inches);
    expect(s.pts[0][0]).toBeCloseTo(25.4, 6);
    expect(s.pts[1][0]).toBeCloseTo(50.8, 6);
    expect(s.width).toBeCloseTo(0.254, 6);
  });

  it("follows arcs round, and leaves out filled shapes and the mask's knock-outs", () => {
    const svg = drawing(stroked(circle(20, 20, 2), 0.2) + `<path d="M 0 0 5000 0 5000 5000 Z"/>`, `<mask id="clear">${stroked("M 0 0 9000 9000")}</mask>`);
    const strokes = strokesFromSvg(svg);
    expect(strokes).toHaveLength(1);
    expect(strokes[0].pts.length).toBeGreaterThan(12);
    for (const [x, y] of strokes[0].pts) expect(Math.hypot(x - 20, y - 20)).toBeCloseTo(2, 3);
    // Both halves of the circle are there: the line reaches the far side and comes back.
    expect(Math.min(...strokes[0].pts.map((p) => p[0]))).toBeCloseTo(18, 3);
    expect(Math.max(...strokes[0].pts.map((p) => p[1]))).toBeCloseTo(22, 3);
    expect(Math.min(...strokes[0].pts.map((p) => p[1]))).toBeCloseTo(18, 3);
  });

  it("takes nothing from nothing", () => {
    expect(strokesFromSvg(null)).toEqual([]);
    expect(strokesFromSvg("")).toEqual([]);
    expect(readSilk(undefined)).toEqual({ labels: [], outlines: [] });
  });
});

describe("lettering", () => {
  const placed: Draw[] = [
    { text: "C21", x: 8, y: 50, rotation: 0, height: 0.8 },
    { text: "U3", x: 16, y: 50, rotation: 90, height: 0.8 },
    { text: "R105", x: 24, y: 50, rotation: 180, height: 0.8 },
    { text: "Q7", x: 32, y: 50, rotation: 270, height: 0.8 },
    { text: "D14", x: 8, y: 40, rotation: 0, height: 1.5 },
    { text: "J2", x: 16, y: 40, rotation: 90, height: 1.5 },
    { text: "L9", x: 24, y: 40, rotation: 180, height: 1.5 },
    { text: "TP68", x: 32, y: 40, rotation: 270, height: 1.5 },
    { text: "GND", x: 8, y: 20, rotation: 0, height: 1 },
    { text: "+24V", x: 16, y: 20, rotation: 0, height: 1 },
    { text: "3.3V", x: 8, y: 12, rotation: 90, height: 1 },
    { text: "VDD_EN", x: 20, y: 12, rotation: 0, height: 1 },
    { text: "22-07", x: 34, y: 12, rotation: 0, height: 1 },
  ];

  it("reads designators at four rotations and two sizes, among outlines and a logo", () => {
    const { labels } = readSilk(drawing(placed.map((p) => stroked(word(p))).join("") + noise), { mirrored: false });
    expect(labels.map((l) => l.text).sort()).toEqual(placed.map((p) => p.text).sort());
    for (const p of placed) {
      const [l] = find(labels, p.text);
      expect(l.rotation, p.text).toBe(p.rotation);
      expect(near(l.x, p.x, 0.15) && near(l.y, p.y, 0.15), `${p.text} at ${l.x}, ${l.y}`).toBe(true);
      expect(near(l.height, p.height ?? 1, 0.02), p.text).toBe(true);
      expect(l.mirrored).toBe(false);
      expect(l.confidence, p.text).toBeGreaterThan(0.85);
      expect(l.designator, p.text).toBe(/^[A-Z]+[0-9]+$/.test(p.text));
    }
  });

  it("reads bottom-side lettering mirrored, told or not", () => {
    const svg = drawing(placed.map((p) => stroked(word({ ...p, mirrored: true }))).join("") + noise);
    for (const opts of [{ mirrored: true }, {}]) {
      const { labels } = readSilk(svg, opts);
      expect(labels.map((l) => l.text).sort()).toEqual(placed.map((p) => p.text).sort());
      for (const p of placed) {
        const [l] = find(labels, p.text);
        expect(l.mirrored).toBe(true);
        expect(l.rotation, p.text).toBe(p.rotation);
        expect(near(l.x, p.x, 0.15) && near(l.y, p.y, 0.15), p.text).toBe(true);
      }
    }
    // The same drawing read as a top side is not lettering that makes sense: no designator comes out of it.
    expect(readSilk(svg, { mirrored: false }).labels.filter((l) => placed.some((p) => p.text === l.text && l.designator))).toEqual([]);
    // And a top side is not taken for a bottom side.
    expect(readSilk(drawing(placed.map((p) => stroked(word(p))).join(""))).labels.every((l) => !l.mirrored)).toBe(true);
  });

  it("reads a small designator beside a large one, and drops a stray line beside a designator", () => {
    // "L3" sits a little above the baseline of the larger "E1" next to it: two labels, not small letters.
    const pair = stroked(word({ text: "L3", x: 10, y: 10, height: 0.8 })) + stroked(word({ text: "E1", x: 11.6, y: 10.35, height: 1.3 }));
    // A polarity bar after "TP21" is not a dash in its name; the plus of "+5V" is part of the net's name.
    const { labels, outlines } = readSilk(drawing(pair + stroked(word({ text: "TP21-", x: 30, y: 10 })) + stroked(word({ text: "+5V", x: 40, y: 10 }))), { mirrored: false });
    expect(labels.map((l) => l.text).sort()).toEqual(["+5V", "E1", "L3", "TP21"]);
    expect(find(labels, "TP21")[0].designator).toBe(true);
    expect(near(find(labels, "TP21")[0].x, 30 - (0.5 + 0.3) / 2, 0.15)).toBe(true);
    expect(outlines).toEqual([]);
  });

  it("knows every shape of every letter and digit of its fonts", () => {
    const chars = [...new Set(SILK_GLYPHS.map((g) => g.ch))].filter((ch) => /[A-Z0-9]/.test(ch));
    expect(chars).toHaveLength(36);
    const draws: Draw[] = [];
    for (const ch of chars)
      shapesOf(ch).forEach((_, shape) => {
        // A letter leads a designator, a digit ends one: the place settles O against 0 where a font draws them alike.
        const k = draws.length;
        draws.push({ text: /[0-9]/.test(ch) ? `C${ch}` : `${ch}7`, x: 4 + (k % 16) * 4.5, y: 4 + Math.floor(k / 16) * 3, shape, rotation: k % 2 ? 90 : 0 });
      });
    const { labels } = readSilk(drawing(draws.map((d) => stroked(word(d))).join("")), { mirrored: false });
    for (const d of draws) {
      const here = labels.filter((l) => near(l.x, d.x, 0.2) && near(l.y, d.y, 0.2));
      expect(here.map((l) => l.text), `${d.text} shape ${d.shape}`).toEqual([d.text]);
    }
  });
});

describe("the lexicon", () => {
  // The default stroke font draws O and 0 the same: the strokes cannot say which.
  const svg = drawing(stroked(word({ text: "DO", x: 10, y: 10 })) + stroked(word({ text: "C1O", x: 20, y: 10 })) + stroked(word({ text: "BOARD", x: 32, y: 10 })) + stroked(word({ text: "R25", x: 10, y: 20 })));

  it("settles look-alikes the way designators are written when there is none", () => {
    const { labels } = readSilk(svg, { mirrored: false });
    expect(labels.map((l) => l.text).sort()).toEqual(["BOARD", "C10", "D0", "R25"]);
    expect(find(labels, "C10")[0].designator).toBe(true);
    expect(find(labels, "BOARD")[0].designator).toBe(false);
  });

  it("corrects a look-alike to the lexicon's spelling", () => {
    const { labels } = readSilk(svg, { lexicon: ["do", "C10", "R25"], mirrored: false });
    expect(labels.map((l) => l.text).sort()).toEqual(["BOARD", "C10", "DO", "R25"]);
    expect(find(labels, "DO")[0].designator).toBe(true);
    expect(find(labels, "DO")[0].confidence).toBeGreaterThan(0.8);
  });

  it("does not bend clear strokes into a lexicon word", () => {
    // The BoM has R26, R35 and B0; the board prints R25, BOARD and DO.
    const { labels } = readSilk(svg, { lexicon: ["R26", "R35", "B0", "C11", "D8", "Q0"], mirrored: false });
    expect(labels.map((l) => l.text).sort()).toEqual(["BOARD", "C10", "D0", "R25"]);
  });

  it("gives a designator to one place, unless the board prints it twice", () => {
    const twice = drawing(stroked(word({ text: "R6", x: 10, y: 10 })) + stroked(word({ text: "R6", x: 20, y: 10, rotation: 90 })) + stroked(word({ text: "DO", x: 30, y: 10 })) + stroked(word({ text: "DO", x: 40, y: 10 })));
    const { labels } = readSilk(twice, { lexicon: ["R6", "D0", "DO"], mirrored: false });
    expect(find(labels, "R6")).toHaveLength(2);
    // Two rows the strokes cannot tell apart, two lexicon words for them: one each.
    expect(labels.map((l) => l.text).sort()).toEqual(["D0", "DO", "R6", "R6"]);
  });

  it("splits two designators printed end to end", () => {
    const joined = drawing(stroked(word({ text: "R29FB14", x: 20, y: 10 })));
    expect(readSilk(joined, { lexicon: ["R29", "FB14"], mirrored: false }).labels.map((l) => l.text)).toEqual(["R29", "FB14"]);
    const [r29, fb14] = readSilk(joined, { lexicon: ["R29", "FB14"], mirrored: false }).labels;
    expect(r29.x).toBeLessThan(fb14.x);
    expect(readSilk(joined, { lexicon: ["R29FB14"], mirrored: false }).labels.map((l) => l.text)).toEqual(["R29FB14"]);
    // Without a lexicon the letter spacing says it: a wider space where one designator ends, none in a net name.
    const spaced = drawing(stroked(word({ text: "R29 FB14", x: 10, y: 20 })) + stroked(word({ text: "I2C4", x: 30, y: 20 })));
    expect(readSilk(spaced, { mirrored: false }).labels.map((l) => l.text).sort()).toEqual(["FB14", "I2C4", "R29"]);
  });
});

describe("lettering this reader has no shapes for", () => {
  /** Glyphs of a made-up boxy font, on the same 100-high grid as the templates. */
  const boxy: Record<string, string> = {
    R: "0,0 0,100 55,100 55,50 0,50|20,50 55,0",
    C: "55,100 0,100 0,0 55,0",
    "8": "0,0 55,0 55,100 0,100 0,0|0,50 55,50",
    "6": "55,100 0,100 0,0 55,0 55,50 0,50",
    P: "0,0 0,100 55,100 55,50 0,50",
    i: "0,0 0,62",
    n: "0,0 0,62|0,50 12,62 36,62 48,50 48,0",
  };
  const custom = (text: string, x: number, y: number, height = 1) => {
    let at = x;
    const out: string[] = [];
    for (const ch of text) {
      const lines = boxy[ch].split("|").map((l) => l.split(" ").map((q) => q.split(",").map(Number)));
      const wide = Math.max(...lines.flat().map((q) => q[0]));
      for (const l of lines) out.push(`M ${l.map(([gx, gy]) => `${mm(at + (gx * height) / 100)} ${mm(y + (gy * height) / 100)}`).join(" ")}`);
      at += ((wide + 30) * height) / 100;
    }
    return stroked(out.join(" "));
  };

  it("reads an unknown font with less confidence, and takes the lexicon's word where the strokes allow it", () => {
    const svg = drawing(custom("R8", 10, 10) + custom("C6", 20, 10));
    const alone = readSilk(svg, { mirrored: false }).labels;
    expect(alone).toHaveLength(2);
    for (const l of alone) expect(l.confidence).toBeLessThan(0.9);
    const helped = readSilk(svg, { lexicon: ["R8", "C6", "R3", "C2"], mirrored: false }).labels;
    expect(helped.map((l) => l.text).sort()).toEqual(["C6", "R8"]);
    // A lexicon without them does not turn them into something else it has.
    const others = readSilk(svg, { lexicon: ["R3", "R7", "C2", "C4", "L8"], mirrored: false }).labels;
    expect(others.filter((l) => ["R3", "R7", "C2", "C4", "L8"].includes(l.text))).toEqual([]);
  });

  it("leaves small letters after a capital alone", () => {
    // "Pin 12": the "in" would read as "UI" upside down.
    const svg = drawing(custom("Pin", 10, 10) + stroked(word({ text: "12", x: 14, y: 10.5 })));
    expect(readSilk(svg, { mirrored: false }).labels.map((l) => l.text)).toEqual(["12"]);
  });
});

describe("outlines", () => {
  it("lists boxes, circles, corner marks and brackets, and reads no lettering into them", () => {
    const { labels, outlines } = readSilk(drawing(noise), { lexicon: ["II", "O1", "C1", "L7", "U1", "D0", "I1", "T1", "X1"], mirrored: false });
    expect(labels).toEqual([]);
    const at = (x0: number, y0: number, x1: number, y1: number) => outlines.filter((o) => near(o.x0, x0, 0.01) && near(o.y0, y0, 0.01) && near(o.x1, x1, 0.01) && near(o.y1, y1, 0.01));
    expect(at(30, 30, 38, 36)).toEqual([{ x0: 30, y0: 30, x1: 38, y1: 36, closed: true, round: false, strokes: 1 }]);
    expect(at(47, 30, 53, 36)).toEqual([{ x0: 47, y0: 30, x1: 53, y1: 36, closed: true, round: true, strokes: 1 }]);
    // Four corner marks are one outline.
    expect(at(60, 30, 66, 36)).toEqual([{ x0: 60, y0: 30, x1: 66, y1: 36, closed: false, round: false, strokes: 4 }]);
    expect(outlines.filter((o) => o.x0 >= 60 && o.x1 <= 66 && o.y0 >= 30 && o.y1 <= 36)).toHaveLength(1);
    // Brackets stand in a row like letters do; they are outlines all the same.
    expect(outlines.filter((o) => o.y0 >= 43.9 && o.y1 <= 45.5 && !o.closed)).toHaveLength(4);
  });

  it("keeps the shape of an outline that is no plain box, and only then", () => {
    const l = `M ${mm(10)} ${mm(10)} ${mm(30)} ${mm(10)} ${mm(30)} ${mm(18)} ${mm(22)} ${mm(18)} ${mm(22)} ${mm(26)} ${mm(10)} ${mm(26)} ${mm(10)} ${mm(10)}`;
    const { outlines } = readSilk(drawing(stroked(l) + stroked(box(40, 10, 50, 20))), { mirrored: false });
    const bent = outlines.find((o) => near(o.x0, 10, 0.01))!;
    expect(bent).toMatchObject({ closed: true, round: false, x1: 30, y1: 26 });
    expect(bent.edges).toHaveLength(6 * 4);
    expect(outlines.find((o) => near(o.x0, 40, 0.01))!.edges).toBeUndefined();
  });

  it("keeps lettering out of the outlines", () => {
    const { labels, outlines } = readSilk(drawing(stroked(word({ text: "U12", x: 34, y: 33, height: 1.5 })) + noise), { mirrored: false });
    expect(labels.map((l) => l.text)).toEqual(["U12"]);
    expect(outlines.some((o) => o.x0 > 30.5 && o.x1 < 37.5 && o.y0 > 30.5 && o.y1 < 35.5)).toBe(false);
  });
});

describe("the board's own way of writing designators", () => {
  /** Glyph costs for a row: each glyph matches `best` exactly, and the characters in `also` nearly as well. */
  const row = (glyphs: { best: string; also?: Record<string, number> }[]) =>
    glyphs.map(({ best, also = {} }) => {
      const c = new Float32Array(GLYPH_CHARS.length).fill(0.5);
      c[GLYPH_CHARS.indexOf(best)] = 0.02;
      for (const [ch, v] of Object.entries(also)) c[GLYPH_CHARS.indexOf(ch)] = v;
      return c;
    });
  const styles = designatorStyles(["R016", "R051", "R066", "C1", "U3"]);

  it("learns prefixes and digit counts that three or more designators share", () => {
    expect(styles.get("R 3")).toBe(3);
    expect(styles.get("C 1")).toBe(1);
  });

  it("reads look-alikes as the board's digits when every glyph allows it", () => {
    const roos = row([{ best: "R" }, { best: "O", also: { "0": 0.03 } }, { best: "O", also: { "0": 0.03 } }, { best: "S", also: { "5": 0.03 } }]);
    expect(spellByStyle(roos, styles, new Set(["R016", "R051", "R066"]))?.text).toBe("R005");
    // A glyph further from the digit than the lexicon allows keeps the word as it is.
    const far = roos.map((c, i) => (i === 3 ? c.map((v, k) => (GLYPH_CHARS[k] === "5" ? 0.06 : v)) : c));
    expect(spellByStyle(far, styles, new Set())).toBeNull();
    // Not when the board already has that designator, nor when a glyph is clearly a letter.
    expect(spellByStyle(roos, styles, new Set(["R005"]))).toBeNull();
    const rose = row([{ best: "R" }, { best: "O", also: { "0": 0.03 } }, { best: "S", also: { "5": 0.03 } }, { best: "E" }]);
    expect(spellByStyle(rose, styles, new Set())).toBeNull();
  });

  it("leaves words alone on a board with no shared style, or of another length", () => {
    const roos = row([{ best: "R" }, { best: "O", also: { "0": 0.03 } }, { best: "O", also: { "0": 0.03 } }, { best: "S", also: { "5": 0.03 } }]);
    expect(spellByStyle(roos, designatorStyles(["R016", "C1"]), new Set())).toBeNull();
    expect(spellByStyle(roos.slice(0, 3), styles, new Set())).toBeNull();
  });
});
