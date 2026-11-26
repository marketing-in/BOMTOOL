import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { getCache } from "@/server/sourcing/cache";
import type { BoardArtwork } from "@/server/board";

/**
 * A board's Gerber drawings, served without asking the database to unpack them over and over (Phase 48).
 *
 * The drawings live in one JSON value per board, and a large board's run to tens of megabytes. Postgres unpacks the
 * whole value for every read of any part of it, so a page that asked for the box, the copper and a layer — or a
 * browser fetching twelve drawings at once — had the database unpack 40 MB a dozen times over, and a small database
 * runs out of memory (code 53200). Here the full value is read at most once per request, and once per board
 * version it is split into the shared cache: a slim artwork (box, the small drawings, `art:` addresses for the large
 * ones) and one entry per large drawing. Everything after that reads only what it needs.
 */

/** A drawing larger than this goes to the browser by address, not inside the page. */
export const INLINE_SVG = 256 * 1024;
const TTL = 30 * 86_400;
const SLIM = new Map<string, BoardArtwork>();

/** The board's source and version (its last change), without the drawings. */
export const boardHead = cache(async (revisionId: string) => db.boardModel.findUnique({ where: { revisionId }, select: { source: true, updatedAt: true } }));

/** The whole artwork: one plain read, at most once per request, and only when nothing cached holds what is needed. */
export const fullArtwork = cache(async (revisionId: string): Promise<BoardArtwork | null> => {
  try {
    const row = await db.boardModel.findUnique({ where: { revisionId }, select: { artwork: true } });
    return (row?.artwork ?? null) as BoardArtwork | null;
  } catch (e) {
    console.error(`Reading the drawings of board ${revisionId} failed:`, e);
    return null;
  }
});

const version = (updatedAt: Date) => new Date(updatedAt).getTime();
const slimKey = (revisionId: string, v: number) => `board-slim:${revisionId}:${v}`;
const pieceKey = (revisionId: string, v: number, piece: string) => `board-art:${revisionId}:${v}:${piece}`;
const big = (svg: string | null | undefined): svg is string => !!svg && svg.length > INLINE_SVG;

function remember(key: string, art: BoardArtwork): BoardArtwork {
  if (SLIM.size > 24) SLIM.delete(SLIM.keys().next().value!);
  SLIM.set(key, art);
  return art;
}

/**
 * The artwork for pages: small drawings as they are, large ones as `art:` + the address the browser loads them from
 * (src/app/(app)/boms/[id]/art), versioned by the board. Null when the board has no artwork or it cannot be read.
 */
export async function slimArtwork(revisionId: string): Promise<BoardArtwork | null> {
  const head = await boardHead(revisionId);
  if (!head) return null;
  const v = version(head.updatedAt);
  const key = slimKey(revisionId, v);
  const mem = SLIM.get(key);
  if (mem) return mem;
  const store = await getCache(db).catch(() => null);
  const shared = await store?.get<BoardArtwork>(key).catch(() => null);
  if (shared) return remember(key, shared);

  const full = await fullArtwork(revisionId);
  if (!full) return null;
  const at = (q: string) => `art:/boms/${revisionId}/art?${q}&v=${v}`;
  // Each large drawing in an entry of its own, one after the other: a few megabytes at a time.
  const keep = async (piece: string, svg: string) => {
    await store?.set(pieceKey(revisionId, v, piece), svg, TTL).catch(() => undefined);
  };
  if (big(full.top)) await keep("top", full.top);
  if (big(full.bottom)) await keep("bottom", full.bottom);
  const layers = full.layers ?? [];
  for (let i = 0; i < layers.length; i++) if (big(layers[i].svg)) await keep(`layer:${i}`, layers[i].svg);
  const slim: BoardArtwork = {
    box: full.box ?? null,
    top: big(full.top) ? at("part=top") : (full.top ?? null),
    bottom: big(full.bottom) ? at("part=bottom") : (full.bottom ?? null),
    layers: layers.map((l, i) => ({ ...l, svg: big(l.svg) ? at(`part=layer&i=${i}`) : l.svg })),
  };
  await store?.set(key, slim, TTL).catch(() => undefined);
  return remember(key, slim);
}

export type DrawingPick = { side: "top" | "bottom" } | { layer: number } | { layerKey: string };

/** One drawing's SVG text — the top or bottom face, or a layer by position or key — or null when there is none. */
export async function boardDrawing(revisionId: string, pick: DrawingPick): Promise<string | null> {
  const slim = await slimArtwork(revisionId);
  if (!slim) return null;
  let piece: string;
  let svg: string | null | undefined;
  if ("side" in pick) {
    piece = pick.side;
    svg = slim[pick.side];
  } else {
    const i = "layer" in pick ? pick.layer : slim.layers.findIndex((l) => l.key === pick.layerKey);
    piece = `layer:${i}`;
    svg = i >= 0 ? slim.layers[i]?.svg : null;
  }
  if (!svg) return null;
  if (!svg.startsWith("art:")) return svg;
  const head = await boardHead(revisionId);
  if (!head) return null;
  const v = version(head.updatedAt);
  const store = await getCache(db).catch(() => null);
  const hit = await store?.get<string>(pieceKey(revisionId, v, piece)).catch(() => null);
  if (hit) return hit;
  // The entry has gone (expired, or the cache was cleared): one read of the whole, and the entry is kept again.
  const full = await fullArtwork(revisionId);
  const text = !full ? null : piece === "top" ? full.top : piece === "bottom" ? full.bottom : (full.layers?.[Number(piece.slice(6))]?.svg ?? null);
  if (text) await store?.set(pieceKey(revisionId, v, piece), text, TTL).catch(() => undefined);
  return text ?? null;
}
