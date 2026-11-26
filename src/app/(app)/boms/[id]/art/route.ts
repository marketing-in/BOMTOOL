import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * One drawing of a board's Gerber artwork (the top or bottom face, or one layer) as SVG, for a board whose drawings
 * are too large to send inside the page (src/server/board-view.ts marks them `art:` + this address). The address
 * carries the board's version, so the browser keeps the drawing until the board changes; the text compresses well on
 * the way. Signed-in users only.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const { id } = await params;
  const q = new URL(req.url).searchParams;
  const part = q.get("part");
  const i = Number(q.get("i"));
  let rows: { svg: string | null }[];
  if (part === "top" || part === "bottom") {
    rows = await db.$queryRaw<{ svg: string | null }[]>`SELECT artwork->>${part} AS svg FROM "BoardModel" WHERE "revisionId" = ${id} LIMIT 1`;
  } else if (part === "layer" && Number.isInteger(i) && i >= 0 && i < 200) {
    rows = await db.$queryRaw<{ svg: string | null }[]>`SELECT artwork->'layers'->(${i}::int)->>'svg' AS svg FROM "BoardModel" WHERE "revisionId" = ${id} LIMIT 1`;
  } else return NextResponse.json({ error: "unknown drawing" }, { status: 400 });
  const svg = rows[0]?.svg;
  if (!svg) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      // Versioned by the address (?v=): kept by this browser only, for as long as the board stays the same.
      "Cache-Control": q.get("v") ? "private, max-age=31536000, immutable" : "private, no-cache",
    },
  });
}
