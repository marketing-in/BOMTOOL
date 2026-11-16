import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { customerQuoteWorkbook } from "@/server/exports";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const wb = await customerQuoteWorkbook((await params).id, new URL(req.url).searchParams.get("q"));
  if (!wb) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(wb.buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${wb.name}"`,
      "Cache-Control": "no-store",
    },
  });
}
