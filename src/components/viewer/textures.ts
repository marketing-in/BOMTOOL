"use client";

import * as THREE from "three";
import type { ViewerData } from "./types";
import type { Artwork } from "@/lib/board/artwork";
import { code39 } from "@/lib/board/code39";

const MASK_RGB: Record<string, string> = { green: "#137a36", black: "#18191c", blue: "#0e4596", red: "#8e1c1c", white: "#ecece6", purple: "#55278a" };
export const maskColor = (name: string) => MASK_RGB[name] ?? MASK_RGB.green;

const COPPER = "#c27c3e";
const LAMINATE = "#c9b27a";
const HOLE = "#141414";

/** Linear mix of two #rrggbb colours. */
export function mix(a: string, b: string, t: number) {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
}

/** What a real board shows through its layers: mask over laminate, mask over copper, bare finish, silk. */
function palette(data: ViewerData) {
  const mask = maskColor(data.board.maskColor);
  const light = data.board.maskColor === "white";
  return {
    base: mix(mask, LAMINATE, light ? 0.05 : 0.08),
    copper: mix(mask, COPPER, light ? 0.18 : 0.34),
    finish: data.board.finish.toUpperCase().includes("HASL") ? "#cfd3d6" : "#e2b84f",
    silk: data.board.silkColor === "black" ? "#161616" : "#f4f4ee",
  };
}

function loadSvg(svg: string, color?: string): Promise<HTMLImageElement> {
  // gerber-to-svg draws with currentColor; set it on the root so a single layer can be tinted.
  const tinted = color ? svg.replace("<svg ", `<svg style="color:${color}" `) : svg;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(tinted)}`;
  });
}

// Where a layer drawing sits on the board: shared with the server-drawn layer picture.
export { layerPlace } from "@/lib/board/layer-place";
import { layerPlace } from "@/lib/board/layer-place";

const PX_PER_MM = 16;

function canvasFor(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = Math.min(4096, Math.round(w * PX_PER_MM));
  c.height = Math.min(4096, Math.round(h * PX_PER_MM));
  return c;
}

function toTexture(c: HTMLCanvasElement, color = true) {
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export type Face = { map: THREE.Texture; bump: THREE.Texture | null };

/** Composite board face (pcb-stackup render) — used when the per-layer files are missing. */
export async function compositeTexture(svg: string, w: number, h: number): Promise<Face> {
  const img = await loadSvg(svg);
  const c = canvasFor(w, h);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return { map: toTexture(c), bump: null };
}

/**
 * One face from the uploaded Gerbers, drawn the way the board is built: copper under a translucent mask (traces
 * read lighter), the finish where the mask is open, silkscreen on top — plus a relief map from the same copper.
 */
export async function gerberFace(data: ViewerData, side: "top" | "bottom"): Promise<Face | null> {
  const find = (type: string) => data.board.layers.find((l) => l.type === type && l.side === side);
  const copper = find("copper");
  if (!copper) return null;
  const mask = find("soldermask");
  const silk = find("silkscreen");
  const { width: w, height: h } = data.board;
  const pal = palette(data);
  const c = canvasFor(w, h);
  const b = canvasFor(w, h);
  const g = c.getContext("2d")!;
  const gb = b.getContext("2d")!;
  // The bottom is seen from below: mirror it so it lines up with the top.
  for (const ctx of [g, gb]) if (side === "bottom") ctx.setTransform(-1, 0, 0, 1, c.width, 0);
  const [sx, sy] = [c.width / w, c.height / h];
  // A drawing goes where its own extent says; `at` is the SVG it came from.
  const draw = (ctx: CanvasRenderingContext2D, img: CanvasImageSource, at?: string) => {
    const p = at ? layerPlace(at, data.board) : { x: 0, y: 0, w, h };
    ctx.drawImage(img, p.x * sx, p.y * sy, p.w * sx, p.h * sy);
  };

  g.fillStyle = pal.base;
  g.fillRect(0, 0, c.width, c.height);
  gb.fillStyle = "#000";
  gb.fillRect(0, 0, c.width, c.height);
  draw(g, await loadSvg(copper.svg, pal.copper), copper.svg);
  draw(gb, await loadSvg(copper.svg, "#8a8a8a"), copper.svg);
  if (mask) {
    // Exposed metal = copper ∩ mask openings, in the finish colour.
    const openings = await loadSvg(mask.svg, "#000");
    const exposed = async (tint: string) => {
      const e = canvasFor(w, h);
      const ge = e.getContext("2d")!;
      draw(ge, await loadSvg(copper.svg, tint), copper.svg);
      ge.globalCompositeOperation = "destination-in";
      draw(ge, openings, mask.svg);
      return e;
    };
    draw(g, await exposed(pal.finish));
    draw(gb, await exposed("#ffffff"));
  }
  if (silk) {
    draw(g, await loadSvg(silk.svg, pal.silk), silk.svg);
    draw(gb, await loadSvg(silk.svg, "#b0b0b0"), silk.svg);
  }
  // Drilled holes go through everything: dark on the face, and the lowest point of the relief.
  for (const drill of data.board.layers.filter((l) => l.type === "drill")) {
    draw(g, await loadSvg(drill.svg, HOLE), drill.svg);
    draw(gb, await loadSvg(drill.svg, "#000"), drill.svg);
  }
  return { map: toTexture(c), bump: toTexture(b, false) };
}

/** Paints into the colour canvas and the relief canvas at once, in board mm (x right, y up, centred). */
function painter(data: ViewerData, side: "TOP" | "BOTTOM") {
  const { width: w, height: h } = data.board;
  const c = canvasFor(w, h);
  const b = canvasFor(w, h);
  const sx = c.width / w;
  const sy = c.height / h;
  const both = [c.getContext("2d")!, b.getContext("2d")!] as const;
  for (const ctx of both) {
    // mm → px, y up; the bottom face is mirrored so it lines up with the top when seen from below.
    ctx.setTransform(side === "BOTTOM" ? -sx : sx, 0, 0, -sy, (w / 2) * sx, (h / 2) * sy);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }
  return { c, b, g: both[0], gb: both[1], w, h };
}

/** Without Gerbers: the generated artwork (src/lib/board/artwork.ts) drawn the same way as a real board. */
export function specFace(data: ViewerData, side: "TOP" | "BOTTOM", art: Artwork, label: string | null): Face {
  const { c, b, g, gb, w, h } = painter(data, side);
  const pal = palette(data);
  const s = side === "TOP" ? art.top : art.bottom;
  const fill = (ctx: CanvasRenderingContext2D, color: string, f: () => void) => {
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    f();
  };
  const rect = (ctx: CanvasRenderingContext2D, x: number, y: number, rw: number, rh: number, deg: number, grow = 0) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((deg * Math.PI) / 180);
    ctx.fillRect(-rw / 2 - grow, -rh / 2 - grow, rw + 2 * grow, rh + 2 * grow);
    ctx.restore();
  };
  const circle = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  const path = (ctx: CanvasRenderingContext2D, pts: [number, number][], width: number) => {
    ctx.lineWidth = width;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  };

  for (const [ctx, base] of [[g, pal.base], [gb, "#000"]] as const) fill(ctx, base, () => ctx.fillRect(-w / 2, -h / 2, w, h));

  // Ground pour on the bottom, with clearance around everything it doesn't connect to.
  if (s.pour) {
    for (const [ctx, cu, clear] of [[g, pal.copper, pal.base], [gb, "#555", "#000"]] as const) {
      fill(ctx, cu, () => ctx.fillRect(-w / 2 + 1, -h / 2 + 1, w - 2, h - 2));
      fill(ctx, clear, () => {
        for (const t of s.traces) path(ctx, t.pts, t.width + 0.7);
        for (const p of s.pads) rect(ctx, p.x, p.y, p.w, p.h, p.rot, 0.35);
        for (const hl of art.holes) circle(ctx, hl.x, hl.y, hl.ring + 0.6);
      });
    }
  }
  for (const [ctx, cu] of [[g, pal.copper], [gb, "#8a8a8a"]] as const) {
    fill(ctx, cu, () => {
      for (const t of s.traces) path(ctx, t.pts, t.width);
      for (const v of art.vias) circle(ctx, v.x, v.y, v.r);
    });
  }
  // Mask openings: pads, holes' rings, fiducials — bare finish.
  for (const [ctx, fin] of [[g, pal.finish], [gb, "#ffffff"]] as const) {
    fill(ctx, fin, () => {
      for (const p of s.pads) {
        if (p.round) circle(ctx, p.x, p.y, Math.min(p.w, p.h) / 2);
        else rect(ctx, p.x, p.y, p.w, p.h, p.rot);
      }
      for (const hl of art.holes) circle(ctx, hl.x, hl.y, hl.ring);
    });
  }
  if (side === "TOP") {
    for (const f of art.fiducials) {
      fill(g, LAMINATE, () => circle(g, f.x, f.y, 1.1));
      fill(g, pal.finish, () => circle(g, f.x, f.y, 0.5));
      fill(gb, "#fff", () => circle(gb, f.x, f.y, 0.5));
    }
  }
  for (const [ctx, hole] of [[g, HOLE], [gb, "#000"]] as const) {
    fill(ctx, hole, () => {
      for (const v of art.vias) circle(ctx, v.x, v.y, v.hole);
      for (const hl of art.holes) circle(ctx, hl.x, hl.y, hl.r);
    });
  }

  // Silkscreen: outlines, pin-1 dots, designators (glyphs kept readable on the mirrored bottom).
  for (const [ctx, ink] of [[g, pal.silk], [gb, "#b0b0b0"]] as const) {
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    ctx.lineWidth = 0.13;
    for (const o of s.outlines) {
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.rotate((o.rot * Math.PI) / 180);
      ctx.strokeRect(-o.w / 2, -o.h / 2, o.w, o.h);
      ctx.restore();
    }
    for (const p of s.pin1) circle(ctx, p.x, p.y, 0.22);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const l of s.labels) {
      ctx.save();
      ctx.translate(l.x, l.y);
      ctx.scale(side === "BOTTOM" ? -1 : 1, -1);
      ctx.font = `600 ${l.size}px Arial, sans-serif`;
      ctx.fillText(l.text, 0, 0);
      ctx.restore();
    }
  }

  // Barcode sticker with the board's ID, where there is room on top.
  const bars = label ? code39(label) : null;
  if (side === "TOP" && art.label && label && bars) {
    const L = art.label;
    fill(g, "#f7f7f2", () => g.fillRect(L.x - L.w / 2, L.y - L.h / 2, L.w, L.h));
    fill(gb, "#d0d0d0", () => gb.fillRect(L.x - L.w / 2, L.y - L.h / 2, L.w, L.h));
    const units = bars.reduce((a, x) => a + x, 0);
    const mod = (L.w - 2) / units;
    let x = L.x - L.w / 2 + 1;
    g.fillStyle = "#111";
    bars.forEach((u, i) => {
      if (i % 2 === 0) g.fillRect(x, L.y - L.h / 2 + 2.4, u * mod, L.h - 3.2);
      x += u * mod;
    });
    g.save();
    g.translate(L.x, L.y - L.h / 2 + 1.2);
    g.scale(1, -1);
    g.font = "600 1.3px Arial, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(label, 0, 0);
    g.restore();
  }
  return { map: toTexture(c), bump: toTexture(b, false) };
}

/**
 * One fabrication layer as a transparent texture: copper/silk/paste are drawn in colour;
 * solder mask is a coloured sheet with the openings cut out.
 */
export async function layerTexture(svg: string, type: string, w: number, h: number, mask: string, silk: string, origin?: { x: number; y: number } | null) {
  const c = canvasFor(w, h);
  const ctx = c.getContext("2d")!;
  const p = layerPlace(svg, { width: w, height: h, origin });
  const at = [(p.x * c.width) / w, (p.y * c.height) / h, (p.w * c.width) / w, (p.h * c.height) / h] as const;
  if (type === "soldermask") {
    ctx.fillStyle = maskColor(mask);
    ctx.globalAlpha = 0.92;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "destination-out";
    ctx.drawImage(await loadSvg(svg, "#000"), ...at);
  } else {
    const color = type === "copper" ? COPPER : type === "silkscreen" ? (silk === "black" ? "#111" : "#f5f5f5") : type === "solderpaste" ? "#9aa0a6" : "#888";
    ctx.drawImage(await loadSvg(svg, color), ...at);
  }
  return toTexture(c);
}
