import type { RiskLevel } from "@/lib/risk";

export const RFQ_STATUS: Record<string, { label: string; level: RiskLevel }> = {
  DRAFT: { label: "Draft — not sent", level: "grey" },
  SENT: { label: "Sent, awaiting quotes", level: "amber" },
  PARTIALLY_QUOTED: { label: "Partly quoted", level: "amber" },
  QUOTED: { label: "All quoted", level: "green" },
  CLOSED: { label: "Closed", level: "grey" },
  CANCELLED: { label: "Cancelled", level: "red" },
};

export const PO_STATUS: Record<string, { label: string; level: RiskLevel }> = {
  DRAFT: { label: "Draft", level: "grey" },
  PENDING_APPROVAL: { label: "Awaiting approval", level: "amber" },
  APPROVED: { label: "Approved", level: "green" },
  SENT: { label: "Sent to supplier", level: "green" },
  CANCELLED: { label: "Cancelled", level: "red" },
};
