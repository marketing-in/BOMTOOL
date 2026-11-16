import type { AlternateType, Condition, Lifecycle, MatchMethod, ReachStatus, RohsStatus, SupplierKind } from "@prisma/client";
import type { Scores } from "@/lib/bom/scores";

/** Serializable row handed from the server page to the client grid. */
export type GridRow = {
  id: string;
  lineNo: number;
  rawMpn: string | null;
  partId: string | null;
  partMpn: string | null;
  manufacturer: string | null;
  rawManufacturer: string | null;
  description: string | null;
  refDes: string | null;
  qtyPerBoard: number;
  required: number;
  attritionPct: number;
  dnp: boolean;
  needsReview: boolean;
  issues: string[];
  condition: Condition | null;
  moq: number | null;
  spq: number | null;
  priceBreaks: { qty: number; price: number }[];
  lastUpdated: string | null;
  totalStock: number;
  internalQty: number;
  partnerQty: number;
  excessQty: number;
  distributors: number;
  mfrLeadWeeks: number | null;
  factoryLeadWeeks: number | null;
  bestUnit: number | null;
  bestSupplier: string | null;
  /** Landed per unit (freight + duty, net of GST credit) for the main external source, display currency. */
  landedUnit: number | null;
  plan: { tier: number; kind: SupplierKind; source: string; qty: number; orderQty: number; unit: number | null; landedUnit: number | null }[];
  shortfall: number;
  toBuyCost: number;
  toBuyLanded: number;
  /** Any price on this line comes from the simulated market. */
  mock: boolean;
  /** Pre-filled cart line (null when nothing needs buying). */
  cart: { partId: string; qty: number; supplierId: string | null; offerId: string | null; excessListingId: string | null; bomLineId: string } | null;
  /** Excess-pool listing that can be bid on. */
  excess: { excessListingId: string; supplierId: string; qty: number; askPrice: number | null; currency: string } | null;
  lifecycle: Lifecycle | null;
  rohs: RohsStatus | null;
  reach: ReachStatus | null;
  hsn: string | null;
  coc: boolean | null;
  scores: Scores | null;
  candidates: { partId: string; mpn: string; manufacturer: string; method: MatchMethod; confidence: number; reason: string | null; selected: boolean }[];
  /** Recorded alternates of the matched part that are still buyable, best first. */
  alternates: { partId: string; mpn: string; manufacturer: string; type: AlternateType; confidence: number; approved: boolean; stock: number; bestUnit: number | null }[];
};
