import { describe, expect, it } from "vitest";
import { buildRfqSheet, parseQuoteSheet, RFQ_SHEET_HEADER } from "@/lib/rfq-sheet";
import { autoMapPriceList, breakQtyFromHeader, parsePriceList } from "@/lib/price-list";

describe("RFQ sheet round trip", () => {
  const sheet = buildRfqSheet({
    rfqNumber: "RFQ-2026-0001",
    supplierName: "Mouser Electronics",
    currency: "USD",
    dueDate: "2026-10-27",
    incoterm: "DAP",
    buyer: "Priya",
    lines: [
      { id: "line-a", mpn: "LM358DR", manufacturer: "TI", description: "Dual op-amp", qty: 500, target: null },
      { id: "line-b", mpn: "GRM188R71H104KA93D", manufacturer: "Murata", description: "100nF", qty: 10000, target: 0.002 },
    ],
  });

  it("puts the header row after the title block", () => {
    expect(sheet.find((r) => r[0] === "Ref")).toEqual([...RFQ_SHEET_HEADER]);
    expect(sheet[2]).toEqual(["Currency", "USD"]);
  });

  it("reads back what the supplier filled in, skipping unquoted lines", () => {
    // Supplier fills line-b only, re-sorts nothing, writes prices as text.
    const rows = sheet.map((r) => r.map(String));
    const b = rows.findIndex((r) => r[0] === "line-b");
    rows[b][6] = "0.0019";
    rows[b][7] = "10,000";
    rows[b][8] = "12";
    rows[b][9] = "2541";
    rows[b][10] = "New";
    rows[b][11] = "N";
    const q = parseQuoteSheet(rows);
    expect(q.currency).toBe("USD");
    expect(q.lines).toEqual([
      { ref: "line-b", mpn: "GRM188R71H104KA93D", unitPrice: 0.0019, qtyOffered: 10000, leadTimeWeeks: 12, dateCode: "2541", condition: "NEW_FACTORY_SEALED", cocAvailable: false, notes: null },
    ]);
  });

  it("rejects files that aren't our sheet", () => {
    expect(() => parseQuoteSheet([["foo", "bar"]])).toThrow(/RFQ sheet/);
  });
});

describe("price lists", () => {
  it.each([
    ["1+", 1],
    ["Price 100+", 100],
    ["@1000", 1000],
    ["10-99", 10],
    ["Unit price (1k)", 1000],
    ["Unit Price (INR)", 1],
    ["Stock", null],
  ])("break qty from %s", (h, q) => expect(breakQtyFromHeader(h)).toBe(q));

  it("maps a typical Indian distributor sheet and parses offers", () => {
    const rows = [
      ["Part No", "Brand", "Description", "Stock", "MOQ", "Price 1+", "Price 10+", "Price 100+", "Currency"],
      ["LM358DR", "TI", "Op-amp", "1,250", "1", "₹18.50", "₹15.20", "₹11.90", "INR"],
      ["", "", "Section: passives", "", "", "", "", "", ""],
      ["RC0603FR-0710KL", "Yageo", "10k", "50000", "100", "", "0.45", "0.30", ""],
      ["NOPRICE", "X", "", "5", "", "", "", "", ""],
    ];
    const m = autoMapPriceList(rows[0]);
    expect(m.fields).toMatchObject({ mpn: 0, manufacturer: 1, description: 2, stock: 3, moq: 4, currency: 8 });
    expect(m.breaks).toEqual([{ col: 5, qty: 1 }, { col: 6, qty: 10 }, { col: 7, qty: 100 }]);
    const { entries, skipped } = parsePriceList(rows, 0, m, "INR");
    expect(skipped).toBe(2);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ mpn: "LM358DR", stock: 1250, currency: "INR", priceBreaks: [{ qty: 1, price: 18.5 }, { qty: 10, price: 15.2 }, { qty: 100, price: 11.9 }] });
    expect(entries[1]).toMatchObject({ mpn: "RC0603FR-0710KL", moq: 100, currency: "INR", priceBreaks: [{ qty: 10, price: 0.45 }, { qty: 100, price: 0.3 }] });
  });
});
