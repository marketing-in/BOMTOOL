import type { WorkOrderStatus } from "@prisma/client";
import type { RiskLevel } from "@/lib/risk";

export const WO_STATUS: Record<WorkOrderStatus, { label: string; level: RiskLevel }> = {
  PLANNED: { label: "Planned", level: "grey" },
  KITTING: { label: "Kitting", level: "amber" },
  READY: { label: "Kitted, ready", level: "green" },
  IN_PROGRESS: { label: "Running", level: "green" },
  ON_HOLD: { label: "On hold", level: "red" },
  DONE: { label: "Done", level: "grey" },
  CANCELLED: { label: "Cancelled", level: "grey" },
};

export const WO_FLOW: WorkOrderStatus[] = ["PLANNED", "KITTING", "READY", "IN_PROGRESS", "DONE"];
