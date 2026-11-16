import type { Lifecycle, Msl, ReachStatus, RohsStatus } from "@prisma/client";

/** Maps distributor lifecycle wording to our enum. */
export function mapLifecycle(text: string | null | undefined): Lifecycle | null {
  if (!text) return null;
  const t = text.toLowerCase();
  if (/obsolete/.test(t)) return "OBSOLETE";
  if (/last time buy|ltb/.test(t)) return "LAST_TIME_BUY";
  if (/not (recommended|for new design)|nrnd/.test(t)) return "NRND";
  if (/end of life|\beol\b|discontinued by manufacturer/.test(t)) return "EOL";
  // "Discontinued at Digi-Key" means the distributor dropped it, not that the part is dead.
  if (/production|active|new product|in production/.test(t)) return "ACTIVE";
  return null;
}

export function mapRohs(text: string | null | undefined): RohsStatus | null {
  if (!text) return null;
  const t = text.toLowerCase();
  if (/non[- ]?compliant|not compliant/.test(t)) return "NON_COMPLIANT";
  if (/exempt/.test(t)) return "COMPLIANT_WITH_EXEMPTION";
  if (/compliant|rohs3|rohs 3|yes/.test(t)) return "COMPLIANT";
  return "UNKNOWN";
}

export function mapReach(text: string | null | undefined): ReachStatus | null {
  if (!text) return null;
  const t = text.toLowerCase();
  if (/svhc|affected|contains/.test(t) && !/unaffected|not affected|no svhc/.test(t)) return "CONTAINS_SVHC";
  if (/unaffected|not affected|compliant|no svhc/.test(t)) return "COMPLIANT";
  return "UNKNOWN";
}

export function mapMsl(text: string | null | undefined): Msl | null {
  const m = text?.match(/\b([1-6])(a)?\b/i);
  if (!m) return null;
  const key = `MSL_${m[1]}${m[2] ? "A" : ""}`;
  return (["MSL_1", "MSL_2", "MSL_2A", "MSL_3", "MSL_4", "MSL_5", "MSL_5A", "MSL_6"] as const).find((k) => k === key) ?? null;
}

/**
 * Parses prices/quantities as distributors print them: "$1,234.50", "₹42.30", "1.234,50 €", "0,476".
 * Returns null for empty or non-numeric text.
 */
export function parseLocaleNumber(text: string | number | null | undefined): number | null {
  if (typeof text === "number") return Number.isFinite(text) ? text : null;
  if (!text) return null;
  let s = text.replace(/[^\d.,-]/g, "");
  if (!/\d/.test(s)) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    // Whichever separator comes last is the decimal mark.
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma > -1) {
    // "1,234" / "1,234,567" are thousands; "0,476" / "42,30" are decimal commas.
    const commas = (s.match(/,/g) ?? []).length;
    const decimals = s.length - lastComma - 1;
    s = commas > 1 || (decimals === 3 && !s.startsWith("0,") && !s.startsWith("-0,")) ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if ((s.match(/\./g) ?? []).length > 1) {
    s = s.replace(/\./g, ""); // "1.234.567"
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** "8 Weeks", "35 Days", "12" → weeks. */
export function parseLeadWeeks(text: string | number | null | undefined): number | null {
  if (text === null || text === undefined || text === "") return null;
  if (typeof text === "number") return Number.isFinite(text) ? Math.round(text) : null;
  const n = parseLocaleNumber(text);
  if (n === null) return null;
  return /day/i.test(text) ? Math.ceil(n / 7) : Math.round(n);
}

/** A distributor link (photo, datasheet): absolute http(s) or protocol-relative, served over https. */
export function webUrl(raw: string | null | undefined): string | null {
  const s = raw?.trim();
  if (!s) return null;
  try {
    const url = new URL(s.startsWith("//") ? `https:${s}` : s);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    url.protocol = "https:";
    return url.toString();
  } catch {
    return null;
  }
}
