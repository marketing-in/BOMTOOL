import { Check, CircleAlert, Eye, FileSpreadsheet, Unplug } from "lucide-react";
import type { MatchStatus } from "@/lib/board/footprint-match";

/**
 * "Check by eye" is dark yellow (ochre), not the app's amber: it has to read on a green board and stay apart from the
 * red of a mismatch. One value for marks, legend, ring and tiles; text in light mode is mixed darker for contrast on
 * white (#b8860b alone is 3.3:1 there).
 */
export const OCHRE = "#b8860b";

/** How each footprint-match result is named and coloured, shared by the summary, the board and the tables. */
export const STATUS: Record<MatchStatus, { label: string; short: string; color: string; text: string; icon: typeof Check }> = {
  match: { label: "Match", short: "Same footprint in the BoM and on the board", color: "var(--risk-green)", text: "text-risk-green", icon: Check },
  mismatch: { label: "Do not match", short: "The BoM names one footprint, the board has another", color: "var(--risk-red)", text: "text-risk-red", icon: CircleAlert },
  check: { label: "Check by eye", short: "One side names no footprint we can read", color: OCHRE, text: "text-[color-mix(in_srgb,#b8860b_72%,#000)] dark:text-[#b8860b]", icon: Eye },
  "not-on-board": { label: "Not on the board", short: "In the BoM, but not placed on the board", color: "var(--risk-red)", text: "text-risk-red", icon: Unplug },
  "not-in-bom": { label: "Not in the BoM", short: "Placed on the board, but no BoM line", color: "var(--risk-red)", text: "text-risk-red", icon: FileSpreadsheet },
};
export const ORDER: MatchStatus[] = ["match", "check", "mismatch", "not-on-board", "not-in-bom"];
