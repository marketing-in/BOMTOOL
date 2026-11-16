/** Number formats shared by the "Can we build it?" screen and its folded sections. */
export const n0 = (v: number) => Math.round(v).toLocaleString("en-IN");
export const n1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const grams = (g: number) => (g >= 1000 ? `${(g / 1000).toFixed(2)} kg` : g >= 10 ? `${g.toFixed(0)} g` : `${g.toFixed(2)} g`);
/** Small weights: paste on one part is milligrams. */
export const mg = (g: number) => (g >= 1 ? `${g.toFixed(2)} g` : g >= 0.01 ? `${(g * 1000).toFixed(0)} mg` : `${(g * 1000).toFixed(1)} mg`);
export const p1 = (v: number) => `${(Math.round(v * 10) / 10).toLocaleString("en-IN", { maximumFractionDigits: 1 })} %`;
/** A consumable quantity in its own unit. */
export const amount = (v: number, unit: string) =>
  unit === "g" ? (v >= 1 ? grams(v) : mg(v)) : unit === "ml" ? (v >= 1000 ? `${(v / 1000).toFixed(2)} l` : `${v >= 10 ? v.toFixed(0) : v.toFixed(2)} ml`) : `${v >= 10 || Number.isInteger(v) ? Math.round(v).toLocaleString("en-IN") : v.toFixed(2)} ${unit}`;
export const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
