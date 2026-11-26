import { describe, expect, it } from "vitest";
import { autoMap } from "@/lib/bom/columns";
import { checkSupplierPn, distributorFromHeader, distributorFromPn } from "@/knowledge/distributor-pns";

// Synthetic lines in the shape of a Digi-Key style customer BoM (no customer data).
describe("a BoM's distributor part number column", () => {
  it("is read as the distributor's number, not the maker's, whatever the header calls it", () => {
    const headers = ["RE", "Manufacturer Part No.", "Description", "Manufacturer", "Package", "Ref Des", "Quantity", "Part Number (Digikey)"];
    const m = autoMap(headers).mapping;
    expect(m).toEqual([null, "mpn", "description", "manufacturer", "package", "refDes", "qty", "supplierPn"]);
    expect(autoMap(["MPN", "Qty", "Mouser #"]).mapping[2]).toBe("supplierPn");
    expect(autoMap(["MPN", "Qty", "LCSC Part"]).mapping[2]).toBe("supplierPn");
  });

  it("knows whose number it is from the header or the number's shape", () => {
    expect(distributorFromHeader("Part Number (Digikey)")).toBe("Digi-Key");
    expect(distributorFromHeader("Mouser P/N")).toBe("Mouser");
    expect(distributorFromPn("445-7547-1-ND")).toBe("Digi-Key");
    expect(distributorFromPn("C25804")).toBe("LCSC");
    expect(distributorFromPn("595-TPS54331DR")).toBe("Mouser");
    expect(distributorFromPn("12345")).toBeNull();
  });
});

describe("checking a distributor part number against the line", () => {
  const same = (a: string, b: string) => a.toLowerCase().split(/\s+/)[0] === b.toLowerCase().split(/\s+/)[0];
  const dk = (pn: string | null, mpn: string, maker: string) => checkSupplierPn({ pn, distributor: "Digi-Key", mpn, maker }, same);

  it("passes a number of the line's maker, or one that carries the part number", () => {
    expect(dk("445-7547-1-ND", "C2012X7R1H105K", "TDK Corporation")).toBeNull();
    expect(dk("P15455CT-ND", "EEH-ZA1V680XP", "Panasonic")).toBeNull();
    expect(dk("FDP036N10A-ND", "FDP036N10A", "onsemi")).toBeNull();
    expect(dk("HS346-ND", "513102B02500G", "Boyd")).toBeNull();
  });

  it("flags a missing number, a word in its place, another maker's prefix, and an ordering ending the MPN lacks", () => {
    expect(dk(null, "X-1", "Acme")).toMatchObject({ level: "amber", text: "no Digi-Key part number on this line" });
    expect(dk("TRANSFORMER", "TRANSFORMER", "Acme")?.text).toMatch(/not a Digi-Key part number/);
    expect(dk("490-5523-1-ND", "C2012X5R1E106K", "TDK")?.text).toBe("Digi-Key 490-5523-1-ND is a Murata Manufacturing number; the line's maker is TDK");
    expect(dk("LM2675MX-3.3/NOPBCT-ND", "LM2675MX-3.3", "Texas Instruments")?.text).toMatch(/ordering ending \/NOPB/);
    expect(checkSupplierPn({ pn: "X25804", distributor: "LCSC", mpn: "ABC123", maker: null }, same)?.text).toMatch(/not an LCSC part number/);
  });
});
