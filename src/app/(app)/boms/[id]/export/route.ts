import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDisplayCurrency } from "@/lib/prefs";
import { bomWorkbook } from "@/server/exports";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const wb = await bomWorkbook((await params).id, await getDisplayCurrency());
  if (!wb) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(wb.buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${wb.name}"`,
      "Cache-Control": "no-store",
    },
  });
}
