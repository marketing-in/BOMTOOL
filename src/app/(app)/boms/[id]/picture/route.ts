import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

const HEADERS = {
  "Content-Type": "image/svg+xml; charset=utf-8",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  "X-Content-Type-Options": "nosniff",
  // The picture changes only when the Gerbers are replaced; a short private cache keeps step-to-step moves quick.
  "Cache-Control": "private, max-age=120",
};

/**
 * The board's drawings as pictures (Phase 25, layers added in Phase 27), for the board pictures on the screens:
 * the finished top or bottom side (`?side=bottom`), or one layer on its own (`?layer=<key>&color=<rrggbb>`, drawn
 * in that colour). Signed-in users only; served as an image, so nothing in it can run. Only the one drawing asked
 * for is read from the database, not the whole set.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const { id } = await params;
  const q = new URL(req.url).searchParams;
  const layer = q.get("layer");

  if (layer) {
    const rows = await db.$queryRaw<{ svg: string | null }[]>`
      SELECT l->>'svg' AS svg
      FROM "BoardModel" b, jsonb_array_elements(CASE WHEN jsonb_typeof(b.artwork->'layers') = 'array' THEN b.artwork->'layers' ELSE '[]'::jsonb END) AS l
      WHERE b."revisionId" = ${id} AND l->>'key' = ${layer} LIMIT 1`;
    const svg = rows[0]?.svg;
    if (!svg) return NextResponse.json({ error: "not found" }, { status: 404 });
    // gerber-to-svg draws with currentColor: set it on the root so the layer comes in the colour asked for.
    const color = /^[0-9a-f]{6}$/i.test(q.get("color") ?? "") ? q.get("color")! : "c27c3e";
    return new NextResponse(svg.replace("<svg ", `<svg style="color:#${color}" `), { headers: HEADERS });
  }

  const side = q.get("side") === "bottom" ? "bottom" : "top";
  const rows = await db.$queryRaw<{ svg: string | null }[]>`SELECT artwork->>${side} AS svg FROM "BoardModel" WHERE "revisionId" = ${id} LIMIT 1`;
  const svg = rows[0]?.svg;
  if (!svg) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new NextResponse(svg, { headers: HEADERS });
}
