import * as XLSX from "xlsx";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildRfqSheet } from "@/lib/rfq-sheet";

/** Per-supplier RFQ workbook: the supplier fills prices into the same sheet and sends it back. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const { id } = await params;
  const supplierId = new URL(req.url).searchParams.get("supplier");
  const rfq = await db.rfq.findUnique({
    where: { id },
    include: { createdBy: true, lines: { include: { part: { include: { manufacturer: true } } }, orderBy: { part: { mpn: "asc" } } } },
  });
  const supplier = supplierId ? await db.supplier.findUnique({ where: { id: supplierId } }) : null;
  if (!rfq || !supplier) return NextResponse.json({ error: "not found" }, { status: 404 });

  const aoa = buildRfqSheet({
    rfqNumber: rfq.number,
    supplierName: supplier.name,
    currency: supplier.currency,
    dueDate: rfq.dueDate?.toISOString().slice(0, 10) ?? null,
    incoterm: rfq.incoterm,
    buyer: `${rfq.createdBy.name} <${rfq.createdBy.email}>`,
    lines: rfq.lines.map((l) => ({
      id: l.id,
      mpn: l.part.mpn,
      manufacturer: l.part.manufacturer.name,
      description: l.part.description,
      qty: l.qty,
      target: supplier.kind === "OWN_EXCESS" || supplier.kind === "PARTNER_EXCESS" ? (l.targetPrice ? Number(l.targetPrice) : null) : null,
    })),
  });
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 28 }, { wch: 22 }, { wch: 20 }, { wch: 40 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 10 }, { wch: 18 }, { wch: 10 }, { wch: 30 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "RFQ");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const name = `${rfq.number}_${supplier.code}.xlsx`;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
