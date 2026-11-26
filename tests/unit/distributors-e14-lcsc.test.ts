import { describe, expect, it } from "vitest";
import { e14Url, parseE14Response } from "@/server/sourcing/adapters/element14";
import { lcscSigned, parseLcscResponse } from "@/server/sourcing/adapters/lcsc";
import { createHash } from "node:crypto";

const store = { sellerCode: "NEWARK", sellerName: "Newark", country: "US", currency: "USD" };

describe("element14 / Newark", () => {
  it("asks for one part by its manufacturer number in the chosen store", () => {
    const u = new URL(e14Url("www.newark.com", "manuPartNum:LM339ADT", "k123"));
    expect(u.origin + u.pathname).toBe("https://api.element14.com/catalog/products");
    expect(u.searchParams.get("term")).toBe("manuPartNum:LM339ADT");
    expect(u.searchParams.get("storeInfo.id")).toBe("www.newark.com");
    expect(u.searchParams.get("callInfo.responseDataFormat")).toBe("JSON");
    expect(u.searchParams.get("callInfo.apiKey")).toBe("k123");
  });

  it("reads products in the documented shape, whatever the wrapper is called", () => {
    const json = {
      manufacturerPartNumberSearchReturn: {
        numberOfResults: 1,
        products: [
          {
            sku: "1360825",
            displayName: "FUSE, CARTRIDGE, 1A",
            brandName: "SCHURTER",
            translatedManufacturerPartNumber: "0001.1001",
            productStatus: "STOCKED",
            rohsStatusCode: "YES",
            packSize: 1,
            translatedMinimumOrderQuality: 10,
            stock: { level: 4521, leastLeadTime: 5, status: 1 },
            prices: [{ from: 100, to: 1000000000, cost: 0.61 }, { from: 10, to: 90, cost: 0.78 }],
            datasheets: [{ type: "T", description: "Technical Data Sheet", url: "https://www.farnell.com/datasheets/1.pdf" }],
          },
          { sku: "999", displayName: "no part number" },
        ],
      },
    };
    const parts = parseE14Response("newark", json, store);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({ mpn: "0001.1001", manufacturer: "SCHURTER", rohs: "COMPLIANT", datasheetUrl: "https://www.farnell.com/datasheets/1.pdf" });
    expect(parts[0].offers[0]).toMatchObject({ sellerCode: "NEWARK", sku: "1360825", stock: 4521, moq: 10, currency: "USD", factoryLeadTimeWeeks: 1, priceBreaks: [{ qty: 10, price: 0.78 }, { qty: 100, price: 0.61 }] });
    expect(parseE14Response("newark", { keywordSearchReturn: { numberOfResults: 0 } }, store)).toEqual([]);
    expect(() => parseE14Response("newark", { Fault: { faultcode: "x" } }, store)).toThrow(/fault/);
    expect(parseE14Response("newark", { r: { products: [{ sku: "1", translatedManufacturerPartNumber: "A", productStatus: "NO_LONGER_MANUFACTURED" }] } }, store)[0].lifecycle).toBe("OBSOLETE");
  });
});

describe("LCSC", () => {
  it("signs every call with key, nonce, timestamp and the secret", () => {
    const q = lcscSigned({ keyword: "RC0603FR-0710KL" }, "key1", "sec1", 1_700_000_000_000, "abcdef0123456789");
    expect(q.get("timestamp")).toBe("1700000000");
    expect(q.get("nonce")).toBe("abcdef0123456789");
    expect(q.get("signature")).toBe(createHash("sha1").update("key=key1&nonce=abcdef0123456789&secret=sec1&timestamp=1700000000").digest("hex"));
    expect(q.get("keyword")).toBe("RC0603FR-0710KL");
    expect([...q.keys()]).not.toContain("secret");
  });

  it("reads products wherever the answer keeps them, and reports a refused call", () => {
    const product = { productCode: "C98220", productModel: "RC0603FR-0710KL", brandNameEn: "YAGEO", encapStandard: "0603", stockNumber: 1200000, productPriceList: [{ ladder: 100, productPrice: 0.0011 }, { ladder: 10, productPrice: "0.0021" }] };
    for (const json of [{ code: 200, result: { productList: [product] } }, { success: true, data: [product] }, { code: 200, result: product }]) {
      const [p] = parseLcscResponse(json, "USD");
      expect(p).toMatchObject({ mpn: "RC0603FR-0710KL", manufacturer: "YAGEO", params: { Package: "0603" } });
      expect(p.offers[0]).toMatchObject({ sellerCode: "LCSC", sku: "C98220", stock: 1200000, priceBreaks: [{ qty: 10, price: 0.0021 }, { qty: 100, price: 0.0011 }], url: "https://www.lcsc.com/product-detail/C98220.html" });
    }
    expect(() => parseLcscResponse({ code: 401, msg: "invalid signature" }, "USD")).toThrow(/invalid signature/);
  });
});
