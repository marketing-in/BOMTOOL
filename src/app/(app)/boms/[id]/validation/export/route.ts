import { requireUser } from "@/lib/auth";
import { validationCsv } from "@/lib/validation/checks";
import { validationFor } from "@/server/validation";

/** The validation report as CSV: every flag with its call and reason. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const data = await validationFor(id);
  if (!data) return new Response("Not found", { status: 404 });
  const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const csv = validationCsv(data.validation).map((r) => r.map(cell).join(",")).join("\r\n");
  const name = `${data.revision.bom}-rev${data.revision.revision}-validation`.replace(/[^\w.-]+/g, "_");
  return new Response(`﻿${csv}\r\n`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"` } });
}
