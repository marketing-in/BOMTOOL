import { Check, CircleAlert, Eye, FileSpreadsheet, Unplug } from "lucide-react";
import type { MatchStatus } from "@/lib/board/footprint-match";

/** How each footprint-match result is named and coloured, shared by the summary, the board film and the tables. */
export const STATUS: Record<MatchStatus, { label: string; short: string; color: string; text: string; icon: typeof Check }> = {
  match: { label: "Match", short: "Same footprint in the BoM and on the board", color: "var(--risk-green)", text: "text-risk-green", icon: Check },
  mismatch: { label: "Do not match", short: "The BoM names one footprint, the board has another", color: "var(--risk-red)", text: "text-risk-red", icon: CircleAlert },
  check: { label: "Check by eye", short: "One side names no footprint we can read", color: "var(--risk-amber)", text: "text-risk-amber", icon: Eye },
  "not-on-board": { label: "Not on the board", short: "In the BoM, but not placed on the board", color: "var(--risk-red)", text: "text-risk-red", icon: Unplug },
  "not-in-bom": { label: "Not in the BoM", short: "Placed on the board, but no BoM line", color: "var(--risk-red)", text: "text-risk-red", icon: FileSpreadsheet },
};
export const ORDER: MatchStatus[] = ["match", "check", "mismatch", "not-on-board", "not-in-bom"];
