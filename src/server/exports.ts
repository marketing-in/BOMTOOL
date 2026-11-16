import "server-only";
import * as XLSX from "xlsx";
import { getActiveFx, type Currency } from "@/lib/currency";
import { SCORE_KEYS, SCORE_LABEL } from "@/lib/bom/scores";
import { LIFECYCLE_LABEL, SUPPLIER_KIND_LABEL } from "@/lib/risk";
import { db } from "@/lib/db";
import { analyseRevision } from "@/server/bom-pipeline";
import { complianceReport } from "@/server/compliance";

const r2 = (n: number | null | undefined, dp = 4) => (n === null || n === undefined ? "" : Math.round(n * 10 ** dp) / 10 ** dp);

function sheet(aoa: (string | number | boolean | null)[][], widths: number[]) {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = widths.map((wch) => ({ wch }));
  return ws;
}

/** Quote workbook for a BoM revision: Summary, Lines (SoW columns + landed), Sourcing plan, Compliance. */
export async function bomWorkbook(revisionId: string, currency: Currency) {
  const a = await analyseRevision(db, revisionId, currency);
  if (!a) return null;
  const rev = a.revision;
  const fx = getActiveFx();
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    wb,
    sheet(
      [
        ["BoM quote", `${rev.bom.name} rev ${rev.revision}`],
        ["Customer", rev.bom.project.customer.name],
        ["Project", rev.bom.project.name],
        ["Build quantity", rev.buildQty],
        ["Currency", currency],
        ["FX (INR per unit)", `USD ${r2(fx.rates.USD, 2)} · EUR ${r2(fx.rates.EUR, 2)} (${fx.source}, ${fx.asOf})`],
        ["Generated", new Date().toISOString().slice(0, 16).replace("T", " ")],
        [],
        ["Material to buy (goods)", r2(a.totals.toBuy, 2)],
        ["Material to buy (landed, net of GST credit)", r2(a.totals.toBuyLanded, 2)],
        ["Covered from our stock (book cost)", r2(a.totals.fromStock, 2)],
        ["Short lines", a.totals.shortLines],
        ["Unmatched lines", a.totals.unmatched],
        [],
        ["Score", "Value (0–100)"],
        ...SCORE_KEYS.map((k) => [SCORE_LABEL[k], a.scores?.[k] ?? ""]),
      ],
      [44, 60],
    ),
    "Summary",
  );

  // One row per part number, in the columns the purchasing team asked for (meeting of 11 Nov 2026).
  const merged = new Map<string, { mpn: string; manufacturer: string; description: string; condition: string; qty: number; unit: number | null; lead: number | null; dc: Set<string>; remarks: Set<string> }>();
  for (const l of a.lines) {
    const p = l.part;
    const mpn = p?.mpn ?? l.rawMpn ?? "";
    const key = mpn ? mpn.toUpperCase() : `line-${l.lineNo}`;
    const row = merged.get(key) ?? { mpn, manufacturer: p?.manufacturer.name ?? l.rawManufacturer ?? "", description: p?.description ?? l.rawDescription ?? "", condition: "", qty: 0, unit: null, lead: null, dc: new Set<string>(), remarks: new Set<string>() };
    if (l.dnp) row.remarks.add(`DNP: ${l.refDes ?? `line ${l.lineNo}`}`);
    else row.qty += l.required;
    row.condition ||= (l.chosen?.condition ?? "").replace(/_/g, " ").toLowerCase();
    row.unit ??= l.bestAuthorised?.unit ?? l.chosen?.unit ?? null;
    row.lead = Math.max(row.lead ?? 0, l.factoryLeadWeeks ?? p?.mfrLeadTimeWeeks ?? 0) || row.lead;
    for (const x of l.allocations) if (x.dateCode) row.dc.add(x.dateCode);
    if (!p) row.remarks.add("Not matched to a part");
    if (p && p.lifecycle !== "ACTIVE") row.remarks.add(LIFECYCLE_LABEL[p.lifecycle]);
    if (!l.dnp && l.shortfall > 0) row.remarks.add(`Short ${l.shortfall.toLocaleString("en-IN")}`);
    for (const i of l.issues) row.remarks.add(i.includes(": ") ? i.slice(i.indexOf(": ") + 2) : i);
    merged.set(key, row);
  }
  XLSX.utils.book_append_sheet(
    wb,
    sheet(
      [
        ["S.No", "MPN", "Manufacturer", "Description", "Condition", "Qty", `Price (${currency})`, "Lead time (wk)", "DC", "Remarks"],
        ...[...merged.values()].map((r, i) => [i + 1, r.mpn, r.manufacturer, r.description, r.condition, r.qty, r2(r.unit), r.lead ?? "", [...r.dc].join(", "), [...r.remarks].join("; ")]),
      ],
      [6, 26, 22, 44, 20, 9, 12, 13, 12, 44],
    ),
    "Consolidated BoM",
  );

  const header = [
    "#", "RefDes", "Qty/board", "Need (incl. attrition)", "MPN", "Manufacturer", "Description", "Lifecycle", "Condition", "MOQ",
    "Total stock", "# distributors", "Mfr lead (wk)", "Factory lead (wk)", "Best unit", "Landed unit", "To buy (landed)", "Short",
    "RoHS", "REACH", "HSN", "CoC", ...SCORE_KEYS.map((k) => SCORE_LABEL[k]), "Issues", "DNP",
  ];
  XLSX.utils.book_append_sheet(
    wb,
    sheet(
      [
        header,
        ...a.lines.map((l) => {
          const p = l.part;
          return [
            l.lineNo, l.refDes, l.qtyPerBoard, l.required, p?.mpn ?? l.rawMpn, p?.manufacturer.name ?? l.rawManufacturer, p?.description ?? l.rawDescription,
            p ? LIFECYCLE_LABEL[p.lifecycle] : "", l.chosen?.condition ?? "", l.bestAuthorised?.moq ?? "", l.totalStock, l.authorisedSources,
            p?.mfrLeadTimeWeeks ?? "", l.factoryLeadWeeks ?? "", r2(l.bestAuthorised?.unit), r2(l.bestAuthorised?.landedUnit), r2(l.toBuyLanded, 2), l.shortfall,
            p?.rohs ?? "", p?.reach ?? "", p?.hsnCode ?? "", l.chosen ? (l.chosen.coc ? "Y" : "N") : "",
            ...SCORE_KEYS.map((k) => l.scores?.[k] ?? ""), l.issues.join(", "), l.dnp ? "DNP" : "",
          ];
        }),
      ],
      [4, 18, 9, 12, 24, 22, 40, 12, 18, 7, 11, 8, 8, 8, 11, 11, 13, 8, 12, 12, 10, 5, 9, 9, 9, 9, 9, 24, 5],
    ),
    "Lines",
  );

  XLSX.utils.book_append_sheet(
    wb,
    sheet(
      [
        ["#", "MPN", "Tier", "Source type", "Source", "Qty from source", "Order qty", "Unit", "Landed unit", "Date code", "CoC", "Lead (wk)"],
        ...a.lines.flatMap((l) =>
          l.allocations.map((x) => [l.lineNo, l.part?.mpn ?? "", x.tier, SUPPLIER_KIND_LABEL[x.kind], x.source, x.qty, x.orderQty, r2(x.unit), r2(x.landedUnit), x.dateCode ?? "", x.coc ? "Y" : "N", x.leadWeeks ?? ""]),
        ),
      ],
      [4, 24, 5, 22, 30, 12, 10, 11, 11, 9, 5, 8],
    ),
    "Sourcing plan",
  );

  const c = await complianceReport(revisionId, currency);
  if (c) XLSX.utils.book_append_sheet(wb, complianceSheet(c.rows), "Compliance");

  return { buffer: XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer, name: `${(rev.bom.assemblyPartNumber ?? rev.bom.name).replace(/[^\w.-]+/g, "_")}_rev${rev.revision}_quote.xlsx` };
}

function complianceSheet(rows: NonNullable<Awaited<ReturnType<typeof complianceReport>>>["rows"]) {
  return sheet(
    [
      ["#", "RefDes", "MPN", "Manufacturer", "RoHS", "REACH", "Conflict minerals declared", "ECCN", "Country of origin", "HSN", "BCD %", "Duty assumed", "Est. duty", "CoC missing"],
      ...rows.map((r) => [r.lineNo, r.refDes, r.mpn, r.manufacturer, r.rohs, r.reach, r.conflictMinerals ? "Y" : "N", r.eccn ?? "", r.coo ?? "", r.hsn ?? "", r.bcdPct, r.dutyAssumed ? "Y" : "", Math.round(r.dutyEstimate * 100) / 100, r.cocMissing ? "Y" : ""]),
    ],
    [4, 18, 24, 22, 26, 14, 10, 10, 8, 10, 7, 7, 10, 7],
  );
}

export async function complianceWorkbook(revisionId: string, currency: Currency) {
  const c = await complianceReport(revisionId, currency);
  if (!c) return null;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, complianceSheet(c.rows), "Compliance");
  const rev = c.analysis.revision;
  return { buffer: XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer, name: `${rev.bom.name.replace(/[^\w.-]+/g, "_")}_rev${rev.revision}_compliance.xlsx` };
}

type QuoteSnapshot = {
  quotes: import("@/lib/costing/quote").QtyQuote[];
  refQty?: number;
  title: string;
  product: { name: string; partNumber: string | null; revision: string; customer: string } | null;
  leadDays: number;
  lineRows?: { lineNo: number; mpn: string | null; manufacturer: string | null; refDes: string; qtyPerBoard: number; required: number; source: string | null; unit: number | null; perBoard: number; pinned: boolean; dnp: boolean; excluded: string | null }[];
  process?: { title: string; stage: string; perBoard: number; perLot: number; note: string }[];
};

/** A customer quote (issued: as frozen; else the live draft): the client's prices, the internal costing and the lines. INR. */
export async function customerQuoteWorkbook(revisionId: string, quoteId: string | null) {
  const row = quoteId ? await db.customerQuote.findUnique({ where: { id: quoteId } }) : null;
  if (quoteId && (!row || row.revisionId !== revisionId)) return null;
  let snap: QuoteSnapshot;
  if (row?.status === "ISSUED" && row.snapshot) snap = row.snapshot as unknown as QuoteSnapshot;
  else {
    const { getBuild } = await import("@/server/build");
    const b = await getBuild(revisionId);
    if (!b) return null;
    snap = {
      quotes: b.quotes,
      refQty: b.refQty,
      title: b.title,
      product: b.product,
      leadDays: b.leadDays,
      lineRows: b.lines.map((l) => ({ lineNo: l.lineNo, mpn: l.mpn, manufacturer: l.manufacturer, refDes: l.refDes, qtyPerBoard: l.qtyPerBoard, required: l.required, source: l.sourceLabel, unit: l.cost.unit, perBoard: l.perBoard, pinned: l.pinned, dnp: l.dnp, excluded: l.excluded })),
      process: b.process.steps.map((s) => ({ title: s.title, stage: s.stage, perBoard: s.perBoard, perLot: s.perLot, note: s.note })),
    };
  }
  const number = row?.status === "ISSUED" ? (row.number ?? "") : "DRAFT";
  const wb = XLSX.utils.book_new();
  const q = snap.quotes;
  XLSX.utils.book_append_sheet(
    wb,
    sheet(
      [
        ["Quotation", number],
        ["Customer", snap.product?.customer ?? ""],
        ["Product", `${snap.product?.name ?? snap.title}${snap.product?.partNumber ? ` (${snap.product.partNumber})` : ""} rev ${snap.product?.revision ?? ""}`],
        ["Date", (row?.issuedAt ?? new Date()).toISOString().slice(0, 10)],
        ["Valid for (days)", row?.validDays ?? 30],
        ["Delivery (weeks after PO)", Math.ceil(snap.leadDays / 7)],
        [],
        ["Quantity", "Unit price ex-GST (INR)", "Lot price (INR)", "One-off costs (INR)", "GST (INR)", "Total (INR)"],
        ...q.map((x) => [x.qty, r2(x.unitPrice, 2), r2(x.lotPrice, 2), r2(x.nreTotal, 2), r2(x.gst, 2), r2(x.total, 2)]),
        [],
        ["One-off costs", "INR"],
        ...(q[0]?.nre ?? []).map((n) => [n.label, n.amount]),
      ],
      [26, 22, 18, 18, 14, 16],
    ),
    "Quote",
  );
  const keys = [...new Set(q.flatMap((x) => x.rows.map((r) => r.key)))];
  XLSX.utils.book_append_sheet(
    wb,
    sheet(
      [
        ["Cost per board (INR) — internal", ...q.map((x) => `${x.qty} pcs`)],
        ...keys.map((k) => [q.flatMap((x) => x.rows).find((r) => r.key === k)?.label ?? k, ...q.map((x) => r2(x.rows.find((r) => r.key === k)?.perBoard ?? 0, 2))]),
        ["Material", ...q.map((x) => r2(x.material, 2))],
        ["Conversion", ...q.map((x) => r2(x.conversion, 2))],
        ["Price per board", ...q.map((x) => r2(x.unitPrice, 2))],
        [],
        ["Process step", "Stage", "Per board (INR)", "Per lot (INR)", "How"],
        ...(snap.process ?? []).map((s) => [s.title, s.stage, r2(s.perBoard, 2), r2(s.perLot, 2), s.note]),
      ],
      [34, 14, 14, 14, 60],
    ),
    "Costing",
  );
  if (snap.lineRows?.length)
    XLSX.utils.book_append_sheet(
      wb,
      sheet(
        [
          ["#", "MPN", "Manufacturer", "RefDes", "Qty/board", `Need at ${snap.refQty ?? q[0]?.qty ?? ""}`, "Source", "Unit (INR)", "Per board (INR)", "Chosen source", "Note"],
          ...snap.lineRows.map((l) => [l.lineNo, l.mpn ?? "", l.manufacturer ?? "", l.refDes, l.qtyPerBoard, l.required, l.source ?? "", r2(l.unit), r2(l.perBoard, 2), l.pinned ? "Y" : "", l.dnp ? "DNP" : l.excluded ? `priced in the ${l.excluded} step` : ""]),
        ],
        [4, 24, 22, 22, 8, 10, 26, 11, 12, 8, 24],
      ),
      "Lines",
    );
  const base = (snap.product?.partNumber ?? snap.title).replace(/[^\w.-]+/g, "_");
  return { buffer: XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer, name: `${base}_${number || "DRAFT"}.xlsx` };
}
