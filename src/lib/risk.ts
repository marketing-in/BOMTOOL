import type { Lifecycle, SupplierKind } from "@prisma/client";

export type RiskLevel = "green" | "amber" | "red" | "grey";

export const LIFECYCLE_LABEL: Record<Lifecycle, string> = {
  ACTIVE: "Active",
  NRND: "NRND",
  LAST_TIME_BUY: "Last Time Buy",
  EOL: "EOL",
  OBSOLETE: "Obsolete",
  UNKNOWN: "Unknown",
};

export const LIFECYCLE_RISK: Record<Lifecycle, RiskLevel> = {
  ACTIVE: "green",
  NRND: "amber",
  LAST_TIME_BUY: "red",
  EOL: "red",
  OBSOLETE: "red",
  UNKNOWN: "grey",
};

/** 0–100 score → traffic light. Thresholds shared by every score in the app. */
export function scoreToRisk(score: number | null | undefined): RiskLevel {
  if (score === null || score === undefined || Number.isNaN(score)) return "grey";
  if (score >= 70) return "green";
  if (score >= 40) return "amber";
  return "red";
}

/** Sourcing waterfall priority (1 = try first). */
export const SUPPLIER_TIER: Record<SupplierKind, number> = {
  INTERNAL_STOCK: 1,
  CONSIGNED: 2,
  OWN_EXCESS: 3,
  PARTNER_EXCESS: 3,
  CHANNEL_PARTNER: 3,
  AUTHORISED: 4,
  MANUFACTURER: 4,
  BROKER: 5,
};

export const SUPPLIER_KIND_LABEL: Record<SupplierKind, string> = {
  INTERNAL_STOCK: "Internal stores",
  CONSIGNED: "Customer consigned",
  OWN_EXCESS: "Own excess",
  PARTNER_EXCESS: "Partner excess",
  CHANNEL_PARTNER: "Channel partner / sourcing agent",
  AUTHORISED: "Authorised distributor",
  MANUFACTURER: "Manufacturer direct",
  BROKER: "Broker / independent",
};
