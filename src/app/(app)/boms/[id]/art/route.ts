import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { boardDrawing } from "@/server/board-art";

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
  if (part !== "top" && part !== "bottom" && !(part === "layer" && Number.isInteger(i) && i >= 0 && i < 200)) return NextResponse.json({ error: "unknown drawing" }, { status: 400 });
  // From its own cached entry (src/server/board-art.ts), not by unpacking the board's whole artwork again.
  const svg = await boardDrawing(id, part === "layer" ? { layer: i } : { side: part });
  if (!svg) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      // Versioned by the address (?v=): kept by this browser only, for as long as the board stays the same.
      "Cache-Control": q.get("v") ? "private, max-age=31536000, immutable" : "private, no-cache",
    },
  });
}
