"use client";

import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import type { StudioBoard, StudioImage } from "@/vendor/circuitflow/studio/entry";
import { boardArtwork, type Artwork } from "@/lib/board/artwork";
import { compositeTexture, gerberFace, layerTexture, specFace, withArt, type Face } from "./textures";
import { toCircuitflowBoard } from "./to-circuitflow";
import type { ViewerData } from "./types";

/** Code 39 carries A-Z, 0-9 and - . space: the board's ID for its barcode sticker. */
const labelText = (data: ViewerData) => (data.product?.partNumber ?? data.title).toUpperCase().replace(/[^A-Z0-9 .\-]/g, "-").slice(0, 18);

/** The board faces and per-layer pictures: from the Gerbers when we have them, else drawn from the placed parts. */
export function useBoardTextures(data: ViewerData) {
  const [tex, setTex] = useState<{ top: Face; bottom: Face; art: Artwork | null; layers: { key: string; type: string; side: string; index?: number; t: THREE.Texture }[] } | null>(null);
  useEffect(() => {
    let alive = true;
    const { width: w, height: h, maskColor: mask, silkColor: silk } = data.board;
    // Without Gerbers the board's copper, vias and silkscreen are generated from the placed parts.
    const art = data.board.source === "gerber" ? null : boardArtwork(data.parts.map((p) => ({ refDes: p.refDes, x: p.x, y: p.y, rotation: p.rotation, side: p.side, body: p.body })), { width: w, height: h }, data.title);
    const spec = (side: "TOP" | "BOTTOM") => specFace(data, side, art ?? boardArtwork([], { width: w, height: h }, data.title), side === "TOP" ? labelText(data) : null);
    (async () => {
      // A large board's drawings come by address: fetch them (once, in parallel) before drawing.
      const full = await withArt(data);
      const { top, bottom, layers } = full.board;
      const face = async (side: "top" | "bottom", svg: string | null) =>
        art ? spec(side === "top" ? "TOP" : "BOTTOM") : ((await gerberFace(full, side)) ?? (svg ? await compositeTexture(svg, w, h) : spec(side === "top" ? "TOP" : "BOTTOM")));
      const [t, b, ls] = await Promise.all([
        face("top", top),
        face("bottom", bottom),
        Promise.all(layers.filter((l) => l.type !== "outline" && l.type !== "drill").map(async (l) => ({ key: l.key, type: l.type, side: l.side, index: l.index, t: await layerTexture(l.svg, l.type, w, h, mask, silk, data.board.origin) }))),
      ]);
      if (alive) setTex({ top: t, bottom: b, art, layers: ls });
    })().catch(() => alive && setTex({ top: spec("TOP"), bottom: spec("BOTTOM"), art, layers: [] }));
    return () => {
      alive = false;
    };
  }, [data]);
  return tex;
}

const canvasOf = (t: THREE.Texture | undefined): HTMLCanvasElement | null => (t && typeof HTMLCanvasElement !== "undefined" && t.image instanceof HTMLCanvasElement ? t.image : null);

/** Our bottom face is drawn as seen from below; the studio wants it as seen through the board from above. */
function unmirror(c: HTMLCanvasElement | null): HTMLCanvasElement | null {
  if (!c) return null;
  const out = document.createElement("canvas");
  out.width = c.width;
  out.height = c.height;
  const g = out.getContext("2d");
  if (!g) return null;
  g.setTransform(-1, 0, 0, 1, out.width, 0);
  g.drawImage(c, 0, 0);
  return out;
}

const STUDIO_LAYER: Record<string, string> = { copper: "copper", soldermask: "mask", silkscreen: "silk" };

/**
 * The assembled board the circuitflow way (src/vendor/circuitflow/studio): package models, copper tracks with vias,
 * pads, leads and solder — and on Gerber boards the customer's own artwork on the faces and in the layer split.
 */
export function useStudioBoard(data: ViewerData, tex: ReturnType<typeof useBoardTextures>) {
  return useMemo(() => {
    if (!tex) return null;
    const { board, parts } = toCircuitflowBoard(data, { dnp: true });
    const gerber = data.board.source === "gerber" && !tex.art;
    const top = gerber ? canvasOf(tex.top.map) : null;
    const studio: StudioBoard = {
      ...board,
      surface: top ? { top, bottom: unmirror(canvasOf(tex.bottom.map)) } : null,
      layerImages: top
        ? () => {
            const out: Record<string, StudioImage> = {};
            for (const l of tex.layers) {
              const kind = STUDIO_LAYER[l.type];
              const c = canvasOf(l.t);
              if (kind && c && (l.side === "top" || l.side === "bottom")) out[`${kind}-${l.side}`] = c;
            }
            return out;
          }
        : null,
    };
    return { board: studio, parts };
  }, [data, tex]);
}

