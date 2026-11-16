import type { Part, SymbolKind } from "@/lib/schematic";

/** Small builders that keep circuit definitions readable. */
export const part = (id: string, sym: SymbolKind, x: number, y: number, o: Partial<Part> = {}): Part => ({ id, sym, x, y, label: id, ...o });
export const gnd = (id: string, x: number, y: number): Part => ({ id, sym: "ground", x, y });
export const vcc = (id: string, x: number, y: number, text: string): Part => ({ id, sym: "vcc", x, y, text });
export const net = (id: string, x: number, y: number, text: string, left = false): Part => ({ id, sym: "net", x, y, text, rot: left ? 180 : 0 });
