/**
 * Generates a plausible 4-layer GW-200 board as real fabrication data:
 *   samples/board/GW-200/GW200.{GKO,GTL,GBL,G2,G3,GTS,GBS,GTO,GBO,GTP,XLN} (RS-274X + Excellon)
 *   samples/board/GW-200/GW200_PickPlace.csv (Altium-style centroid, mm)
 * Parts and RefDes come from the seed BoM; footprints from the seeded package sizes.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { BOMS } from "../prisma/seed-data/boms";
import { PARTS } from "../prisma/seed-data/parts";
import { PACKAGES } from "../prisma/seed-data/packages";
import { expandRefDes } from "../src/lib/refdes";
import { normaliseMpn } from "../src/lib/normalise";
import { route45 } from "../src/lib/board/artwork";

const BOARD = { w: 100, h: 80 };
const OUT = path.resolve(process.cwd(), "samples/board/GW-200");

type Pad = { x: number; y: number; w: number; h: number; round?: boolean; drill?: number };
type Placed = { ref: string; x: number; y: number; rot: number; side: "Top" | "Bottom"; footprint: string; pads: Pad[]; body: { w: number; h: number } };

// ── Footprints (pads relative to part centre, unrotated, mm) ─────────────────
/** Chip land patterns, IPC-7351 nominal as KiCad draws them: [pad length, pad width, pad pitch]. */
const CHIP_LAND: Record<string, [number, number, number]> = {
  "0201": [0.32, 0.36, 0.66],
  "0402": [0.54, 0.64, 1.02],
  "0603": [0.8, 0.95, 1.65],
  "0805": [1.025, 1.4, 1.825],
  "1206": [1.125, 1.75, 2.975],
  "1210": [1.125, 2.65, 2.975],
  "2512": [1.525, 3.35, 5.9],
};

function footprint(pkgName: string | null, kind: string): { pads: Pad[]; body: { w: number; h: number } } {
  const pkg = PACKAGES.find((p) => p.name === pkgName);
  const [L, W] = pkg?.size ?? [3, 3];
  const fam = pkg?.family ?? kind;
  const pins = pkg?.pins ?? 2;
  const pitch = pkg?.pitch ?? 1.27;
  const pads: Pad[] = [];
  const land = pkgName ? CHIP_LAND[pkgName] : undefined;
  if (land) {
    // IPC-7351 nominal land: pads reach past the terminations (toe fillets), as a CAD library draws them.
    const [len, wid, pitch] = land;
    pads.push({ x: -pitch / 2, y: 0, w: len, h: wid }, { x: pitch / 2, y: 0, w: len, h: wid });
  } else if (["CHIP", "MOLDED", "SOD", "SMx", "VCHIP", "LED"].includes(fam)) {
    const pw = Math.max(0.5, L * 0.3);
    const pitch = L * 0.85 + pw * 0.4;
    pads.push({ x: -pitch / 2, y: 0, w: pw, h: W * 1.05 }, { x: pitch / 2, y: 0, w: pw, h: W * 1.05 });
  } else if (["SOIC", "SSOP", "TSSOP", "TSOP", "SOT"].includes(fam)) {
    const per = Math.ceil(pins / 2);
    for (let i = 0; i < per; i++) {
      const x = (i - (per - 1) / 2) * pitch;
      pads.push({ x, y: -(W / 2 + 0.9), w: pitch * 0.55, h: 1.4 });
      // SOT-23: one pad opposite two; SOT-23-5: two opposite three (the middle one left out).
      if (fam !== "SOT" || pins % 2 === 0 || (pins === 3 ? i === 1 : i !== (per - 1) / 2)) pads.push({ x, y: W / 2 + 0.9, w: pitch * 0.55, h: 1.4 });
    }
  } else if (["QFN", "SON", "QFP", "LGA"].includes(fam)) {
    const per = Math.ceil(pins / 4);
    // Leadless pads run from just inside the body edge to just past it, clear of the corner pads.
    const out = fam === "QFP" ? L / 2 + 0.75 : L / 2 - 0.025;
    for (let i = 0; i < per; i++) {
      const o = (i - (per - 1) / 2) * pitch;
      const len = fam === "QFP" ? 1.5 : 0.75;
      pads.push({ x: o, y: -out, w: pitch * 0.55, h: len }, { x: o, y: out, w: pitch * 0.55, h: len });
      pads.push({ x: -out, y: o, w: len, h: pitch * 0.55 }, { x: out, y: o, w: len, h: pitch * 0.55 });
    }
    if (fam !== "QFP") pads.push({ x: 0, y: 0, w: L * 0.55, h: W * 0.55 });
  } else if (fam === "MODULE") {
    for (let i = 0; i < 14; i++) pads.push({ x: -L / 2, y: -W / 2 + 2 + i * 1.27, w: 1.5, h: 0.9 }, { x: L / 2, y: -W / 2 + 2 + i * 1.27, w: 1.5, h: 0.9 });
    for (let i = 0; i < 10; i++) pads.push({ x: -L / 2 + 3 + i * 1.27, y: W / 2, w: 0.9, h: 1.5 });
  } else if (fam === "XTAL") {
    pads.push({ x: -L / 2 + 0.5, y: -W / 2 + 0.45, w: 0.9, h: 0.8 }, { x: L / 2 - 0.5, y: W / 2 - 0.45, w: 0.9, h: 0.8 }, { x: L / 2 - 0.5, y: -W / 2 + 0.45, w: 0.9, h: 0.8 }, { x: -L / 2 + 0.5, y: W / 2 - 0.45, w: 0.9, h: 0.8 });
  } else {
    // Connectors / THT: one row of round pads with drills
    const n = Math.max(2, pins);
    for (let i = 0; i < n; i++) pads.push({ x: (i - (n - 1) / 2) * 2.54, y: 0, w: 1.7, h: 1.7, round: true, drill: 1.0 });
  }
  return { pads, body: { w: L, h: W } };
}

// Connector-ish parts without a package in the seed get a sensible size.
const SPECIAL: Record<string, { w: number; h: number; pins: number; pitch: number }> = {
  "USB4105-GF-A": { w: 8.9, h: 7.3, pins: 6, pitch: 1.5 },
  "7499010211A": { w: 15.9, h: 21.3, pins: 8, pitch: 1.27 },
  "1935161": { w: 10.2, h: 8, pins: 2, pitch: 5.08 },
  "FTSH-105-01-F-DV-K": { w: 6.35, h: 3.4, pins: 10, pitch: 1.27 },
  "744043100": { w: 4.8, h: 4.8, pins: 2, pitch: 3.6 },
};

function main() {
  const bom = BOMS.find((b) => b.project.code === "GW-200")!;
  const placed: Placed[] = [];
  // Layout: big parts at fixed spots, passives flow in rows across the free area.
  const fixed: Record<string, [number, number, number]> = {
    U1: [78, 58, 0], U2: [50, 40, 0], U3: [25, 40, 0], U4: [30, 18, 0], U5: [46, 18, 0], U6: [70, 20, 0], U7: [82, 32, 90],
    U8: [60, 54, 0], U9: [40, 60, 0], U10: [52, 64, 0], J1: [50, 4.5, 0], J2: [10, 58, 90], J3: [20, 74, 0], J4: [34, 74, 0], J5: [48, 74, 0], J6: [64, 40, 0],
    L1: [76, 10, 0], Y1: [60, 32, 0], D1: [86, 12, 0],
  };
  // Every part's footprint first, then the fixed parts, then the rest flowed into the free area without overlaps.
  const all = bom.lines.flatMap((line) => {
    const part = line.mpn ? PARTS.find((p) => normaliseMpn(p.mpn) === normaliseMpn(line.mpn!)) : undefined;
    const sp = line.mpn ? SPECIAL[line.mpn] : undefined;
    // Connector pins: round pads that never touch their neighbours at fine pitch.
    const pin = sp ? Math.min(1.6, sp.pitch * 0.72) : 0;
    const fp = sp
      ? { pads: Array.from({ length: sp.pins }, (_, i) => ({ x: (i - (sp.pins - 1) / 2) * sp.pitch, y: 0, w: pin, h: pin, round: true, drill: Math.min(0.9, Math.max(0.6, pin * 0.6)) })), body: { w: sp.w, h: sp.h } }
      : footprint(part?.pkg ?? line.package ?? null, "CONN");
    return expandRefDes(line.refDes).map((ref) => ({ ref, fp, footprint: part?.pkg ?? line.package ?? "CONN" }));
  });
  /** Half extents of a part's pads and body, rotated, plus a clearance. */
  const extent = (fp: { pads: Pad[]; body: { w: number; h: number } }, r: number, margin: number) => {
    const turned = r % 180 !== 0;
    let ex = fp.body.w / 2;
    let ey = fp.body.h / 2;
    for (const p of fp.pads) {
      ex = Math.max(ex, Math.abs(p.x) + p.w / 2);
      ey = Math.max(ey, Math.abs(p.y) + p.h / 2);
    }
    return turned ? { ex: ey + margin, ey: ex + margin } : { ex: ex + margin, ey: ey + margin };
  };
  const taken: { x: number; y: number; ex: number; ey: number }[] = [];
  const free = (x: number, y: number, ex: number, ey: number) => taken.every((t) => Math.abs(t.x - x) >= t.ex + ex || Math.abs(t.y - y) >= t.ey + ey);
  for (const a of all) {
    const f = fixed[a.ref];
    if (!f) continue;
    placed.push({ ref: a.ref, x: f[0], y: f[1], rot: f[2], side: "Top", footprint: a.footprint, pads: a.fp.pads, body: a.fp.body });
    taken.push({ x: f[0], y: f[1], ...extent(a.fp, f[2], 0.6) });
  }
  let cursor = { x: 20, y: 27 };
  for (const a of all) {
    if (fixed[a.ref]) continue;
    const { ex, ey } = extent(a.fp, 0, 0.8);
    for (;;) {
      const x = cursor.x + ex;
      if (x + ex > 94) {
        cursor = { x: 20, y: cursor.y + 3.4 };
        if (cursor.y > 36 && cursor.y < 46) cursor.y = 46.5; // skip the MCU row
        if (cursor.y > 76) throw new Error(`No room left on the board for ${a.ref}`);
        continue;
      }
      cursor.x += 0.5;
      if (!free(x, cursor.y, ex, ey)) continue;
      placed.push({ ref: a.ref, x: Math.round(x * 100) / 100, y: cursor.y, rot: 0, side: "Top", footprint: a.footprint, pads: a.fp.pads, body: a.fp.body });
      taken.push({ x, y: cursor.y, ex, ey });
      cursor.x = x + ex;
      break;
    }
  }

  // ── Gerber helpers ─────────────────────────────────────────────────────────
  const n6 = (v: number) => Math.round(v * 1e6).toString();
  const rot = (p: Pad, r: number) => {
    const a = (r * Math.PI) / 180;
    return { ...p, x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a), w: r % 180 ? p.h : p.w, h: r % 180 ? p.w : p.h };
  };
  const header = (fn: string) => [`%TF.FileFunction,${fn}*%`, "%FSLAX46Y46*%", "%MOMM*%", "%LPD*%"];

  function padLayer(fn: string, expand = 0, onlyTht = false) {
    const lines = header(fn);
    const aps = new Map<string, number>();
    let code = 10;
    const body: string[] = [];
    for (const pl of placed) {
      for (const raw of pl.pads) {
        if (onlyTht && !raw.drill) continue;
        const p = rot(raw, pl.rot);
        const key = p.round ? `C,${(p.w + expand).toFixed(3)}` : `R,${(p.w + expand).toFixed(3)}X${(p.h + expand).toFixed(3)}`;
        if (!aps.has(key)) aps.set(key, code++);
        body.push(`D${aps.get(key)}*`, `X${n6(pl.x + p.x)}Y${n6(pl.y + p.y)}D03*`);
      }
    }
    for (const [k, c] of aps) lines.push(`%ADD${c}${k}*%`);
    return [...lines, ...body];
  }

  // ── Routing: every pad routes at 45° to a pad on a neighbouring part, or escapes to a via ──────
  let seed = 20261027;
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const abs = placed.map((pl) => ({
    pl,
    pads: pl.pads.map((raw) => {
      const p = rot(raw, pl.rot);
      const [ox, oy] = Math.abs(p.x) >= Math.abs(p.y) ? [Math.sign(p.x) || 1, 0] : [0, Math.sign(p.y) || 1];
      const x = pl.x + p.x;
      const y = pl.y + p.y;
      return { x, y, esc: [x + ox * 1.2, y + oy * 1.2] as [number, number], thermal: !raw.drill && raw.w > 1.6 && raw.h > 1.6 && Math.hypot(p.x, p.y) < 0.5 };
    }),
  }));
  const topTraces: [number, number][][] = [];
  const bottomTraces: [number, number][][] = [];
  const vias: [number, number][] = [];
  const onBoard = (x: number, y: number) => x > 2 && x < BOARD.w - 2 && y > 2 && y < BOARD.h - 2;
  // Vias keep clear of every pad but the thermal pad they sit in.
  const padRects = placed.flatMap((pl) => pl.pads.map((raw) => ({ ...rot(raw, pl.rot), cx: pl.x + rot(raw, pl.rot).x, cy: pl.y + rot(raw, pl.rot).y })));
  const onPad = (x: number, y: number) => padRects.some((p) => Math.abs(p.cx - x) < p.w / 2 + 0.45 && Math.abs(p.cy - y) < p.h / 2 + 0.45);
  const addVia = (x: number, y: number, inPad = false) => {
    if (onBoard(x, y) && (inPad || !onPad(x, y)) && !vias.some(([vx, vy]) => Math.hypot(vx - x, vy - y) < 0.9)) vias.push([x, y]);
  };
  for (const a of abs) {
    const near = abs.filter((o) => o !== a).map((o) => ({ o, d: Math.hypot(o.pl.x - a.pl.x, o.pl.y - a.pl.y) })).filter((x) => x.d < 25).sort((p, q) => p.d - q.d).slice(0, 4);
    for (const pad of a.pads) {
      if (pad.thermal) {
        for (const dx of [-0.8, 0, 0.8]) for (const dy of [-0.8, 0, 0.8]) addVia(pad.x + dx, pad.y + dy, true);
        continue;
      }
      const roll = rand();
      if (roll < 0.5 && near.length) {
        const t = near[Math.floor(rand() * near.length)].o;
        const tp = t.pads[Math.floor(rand() * t.pads.length)];
        if (tp && !tp.thermal) topTraces.push([[pad.x, pad.y], pad.esc, ...route45(pad.esc, tp.esc).slice(1), [tp.x, tp.y]]);
      } else if (roll < 0.85) {
        const len = 0.5 + rand();
        const v: [number, number] = [pad.esc[0] + (pad.esc[0] - pad.x) * len, pad.esc[1] + (pad.esc[1] - pad.y) * len];
        topTraces.push([[pad.x, pad.y], v]);
        addVia(v[0], v[1]);
      }
    }
  }
  for (const [x, y] of vias.slice()) {
    if (rand() > 0.45) continue;
    const o = vias.filter(([vx, vy]) => vx !== x || vy !== y).sort((p, q) => Math.hypot(p[0] - x, p[1] - y) - Math.hypot(q[0] - x, q[1] - y))[0];
    if (o && Math.hypot(o[0] - x, o[1] - y) < 14) bottomTraces.push(route45([x, y], o));
  }
  const stroke = (pts: [number, number][]) => pts.map(([x, y], i) => `X${n6(x)}Y${n6(y)}${i ? "D01" : "D02"}*`);

  function copperLayer(fn: string, traces: [number, number][][], onlyTht = false) {
    const lines = padLayer(fn, 0, onlyTht);
    lines.splice(4, 0, "%ADD99C,0.25*%", "%ADD97C,0.6*%");
    const out: string[] = ["D99*", ...traces.flatMap(stroke), "D97*", ...vias.map(([x, y]) => `X${n6(x)}Y${n6(y)}D03*`)];
    return [...lines, ...out];
  }

  function planeLayer(fn: string) {
    // Solid plane with clearances around through-holes.
    const lines = [...header(fn), "%ADD10C,2.4*%", "G36*", `X${n6(0.5)}Y${n6(0.5)}D02*`, `X${n6(BOARD.w - 0.5)}Y${n6(0.5)}D01*`, `X${n6(BOARD.w - 0.5)}Y${n6(BOARD.h - 0.5)}D01*`, `X${n6(0.5)}Y${n6(BOARD.h - 0.5)}D01*`, `X${n6(0.5)}Y${n6(0.5)}D01*`, "G37*", "%LPC*%", "D10*"];
    for (const pl of placed) for (const raw of pl.pads.filter((p) => p.drill)) {
      const p = rot(raw, pl.rot);
      lines.push(`X${n6(pl.x + p.x)}Y${n6(pl.y + p.y)}D03*`);
    }
    return lines;
  }

  function silkLayer(fn: string) {
    const lines = [...header(fn), "%ADD10C,0.15*%", "D10*"];
    // An Altium-style box round every part: its pads and body plus a quarter millimetre.
    for (const pl of placed) {
      const { ex: w, ey: h } = extent(pl, pl.rot, 0.25);
      lines.push(`X${n6(pl.x - w)}Y${n6(pl.y - h)}D02*`, `X${n6(pl.x + w)}Y${n6(pl.y - h)}D01*`, `X${n6(pl.x + w)}Y${n6(pl.y + h)}D01*`, `X${n6(pl.x - w)}Y${n6(pl.y + h)}D01*`, `X${n6(pl.x - w)}Y${n6(pl.y - h)}D01*`);
    }
    return lines;
  }

  const outline = [...header("Profile,NP"), "%ADD10C,0.1*%", "D10*", `X0Y0D02*`, `X${n6(BOARD.w)}Y0D01*`, `X${n6(BOARD.w)}Y${n6(BOARD.h)}D01*`, `X0Y${n6(BOARD.h)}D01*`, `X0Y0D01*`];
  // Mounting holes
  const holes = [[4, 4], [96, 4], [96, 76], [4, 76]];

  const end = (l: string[]) => [...l, "M02*", ""].join("\n");
  mkdirSync(OUT, { recursive: true });
  const files: Record<string, string[]> = {
    "GW200.GKO": outline,
    "GW200.GTL": copperLayer("Copper,L1,Top", topTraces),
    "GW200.G2": planeLayer("Copper,L2,Inr"),
    "GW200.G3": planeLayer("Copper,L3,Inr"),
    "GW200.GBL": copperLayer("Copper,L4,Bot", bottomTraces, true),
    "GW200.GTS": padLayer("Soldermask,Top", 0.05),
    "GW200.GBS": padLayer("Soldermask,Bot", 0.05, true),
    "GW200.GTO": silkLayer("Legend,Top"),
    "GW200.GBO": [...header("Legend,Bot")],
    "GW200.GTP": padLayer("Paste,Top", -0.05), // paste = pads, slightly reduced (THT included, fine for a sample)
  };
  for (const [name, lines] of Object.entries(files)) writeFileSync(path.join(OUT, name), end(lines));

  // Excellon drill
  const drills = new Map<string, [number, number][]>();
  for (const pl of placed) for (const raw of pl.pads.filter((p) => p.drill)) {
    const p = rot(raw, pl.rot);
    const k = raw.drill!.toFixed(2);
    drills.set(k, [...(drills.get(k) ?? []), [pl.x + p.x, pl.y + p.y]]);
  }
  drills.set("0.30", vias);
  drills.set("3.20", holes as [number, number][]);
  const xln = ["M48", "METRIC,TZ", ...[...drills.keys()].map((d, i) => `T${i + 1}C${d}`), "%", "G90", "G05"];
  [...drills.entries()].forEach(([, pts], i) => {
    xln.push(`T${i + 1}`);
    for (const [x, y] of pts) xln.push(`X${x.toFixed(3)}Y${y.toFixed(3)}`);
  });
  xln.push("T0", "M30", "");
  writeFileSync(path.join(OUT, "GW200.XLN"), xln.join("\n"));

  // Centroid (Altium "Pick Place" style)
  const csv = ["Designator,Footprint,Mid X,Mid Y,Layer,Rotation", ...placed.map((p) => `${p.ref},${p.footprint},${p.x.toFixed(2)}mm,${p.y.toFixed(2)}mm,${p.side}Layer,${p.rot}`)];
  writeFileSync(path.join(OUT, "GW200_PickPlace.csv"), csv.join("\r\n") + "\r\n");
  console.log(`wrote ${Object.keys(files).length + 1} layer files and ${placed.length} placements to ${path.relative(process.cwd(), OUT)}`);
}

main();
