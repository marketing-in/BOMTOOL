import { describe, expect, it } from "vitest";
import { rank, readDir, readSort, share, type Figures } from "@/lib/costing/rank";

type Src = Figures & { name: string };
const s = (name: string, over: Partial<Figures>): Src => ({ name, lead: 1, price: 10, risk: 1, stock: 1000, ...over });

const stores = s("Our stores", { lead: 0, price: 12, risk: 0, stock: 300 });
const digikey = s("DigiKey", { lead: 0, price: 10, risk: 1, stock: 9000 });
const mouser = s("Mouser", { lead: 8, price: 9.5, risk: 1, stock: 120 });
const partner = s("Partner EMS", { lead: 1, price: 6, risk: 4, stock: 5000 });
const broker = s("Broker X", { lead: 2, price: 4, risk: 5, stock: 20000 });
const empty = s("Arrow (no stock)", { lead: 0, price: 1, risk: 1, stock: 0, usable: false });
const unknown = s("TME", { lead: null, price: null, risk: 1, stock: 400 });
const all = [stores, digikey, mouser, partner, broker];
const names = (list: Src[]) => list.map((x) => x.name);
const by = (key: Parameters<typeof rank>[2], dir?: Parameters<typeof rank>[3], list = all) => names(rank(list, (x) => x, key, dir));

describe("ranking the options of a line", () => {
  it("shortest lead first, our own shelf ahead of a seller's", () => {
    expect(by("lead", "asc")).toEqual(["Our stores", "DigiKey", "Partner EMS", "Broker X", "Mouser"]);
  });

  it("longest lead first turns the lead around, not the tie-break", () => {
    expect(by("lead", "desc")).toEqual(["Mouser", "Broker X", "Partner EMS", "Our stores", "DigiKey"]);
  });

  it("price low to high and high to low", () => {
    expect(by("price", "asc")).toEqual(["Broker X", "Partner EMS", "Mouser", "DigiKey", "Our stores"]);
    expect(by("price", "desc")).toEqual(["Our stores", "DigiKey", "Mouser", "Partner EMS", "Broker X"]);
  });

  it("lowest risk first, the faster of two equally safe sellers ahead", () => {
    expect(by("risk", "asc")).toEqual(["Our stores", "DigiKey", "Mouser", "Partner EMS", "Broker X"]);
  });

  it("stock reads most first unless asked otherwise", () => {
    expect(by("stock")).toEqual(["Broker X", "DigiKey", "Partner EMS", "Our stores", "Mouser"]);
    expect(by("stock", "asc")).toEqual(["Mouser", "Our stores", "Partner EMS", "DigiKey", "Broker X"]);
  });

  it("keeps what cannot be used, then what we don't know, at the bottom in both directions", () => {
    const list = [empty, unknown, mouser, digikey];
    expect(by("price", "asc", list)).toEqual(["Mouser", "DigiKey", "TME", "Arrow (no stock)"]);
    expect(by("price", "desc", list)).toEqual(["DigiKey", "Mouser", "TME", "Arrow (no stock)"]);
    expect(by("lead", "desc", list)).toEqual(["Mouser", "DigiKey", "TME", "Arrow (no stock)"]);
  });

  it("leaves equals in the order they came and does not touch the input", () => {
    const a = s("A", {});
    const b = s("B", {});
    const input = [b, a];
    expect(names(rank(input, (x) => x, "price", "asc"))).toEqual(["B", "A"]);
    expect(names(rank(input, (x) => x, "price", "desc"))).toEqual(["B", "A"]);
    expect(names(input)).toEqual(["B", "A"]);
  });
});

describe("reading the choice from the address", () => {
  it("falls back to BoM order and to the direction each figure reads best in", () => {
    expect([readSort("lead"), readSort("nonsense"), readSort(undefined), readSort(["price"])]).toEqual(["lead", "order", "order", "order"]);
    expect([readDir(undefined, "lead"), readDir(undefined, "stock"), readDir("desc", "lead"), readDir("up", "price")]).toEqual(["asc", "desc", "desc", "asc"]);
  });
});

describe("the bar beside a ranked figure", () => {
  it("is the share of the largest known figure", () => {
    expect(share(5, [10, 5, null])).toBe(0.5);
    expect(share(null, [10])).toBe(0);
    expect(share(0, [0, 0])).toBe(0);
  });
});
