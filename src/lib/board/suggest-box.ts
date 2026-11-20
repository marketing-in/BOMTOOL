import type { ViewerData } from "@/components/viewer/types";
import { analyseBox } from "./box";
import { boardFits, suggestEnclosure } from "./enclosures";

/**
 * The viewer's data with a box to show when the spec names none (a quick look, or a BoM without an enclosure), so
 * Box-build always opens in 3D. Only the viewer uses this: costs, supply and quotes keep reading the spec's box.
 * The kit is checked against no BoM lines, so everything the box needs shows as still to add.
 */
export function withSuggestedBox(data: ViewerData): ViewerData {
  if (data.enclosure && data.box) return data;
  const board = { w: data.board.width, h: data.board.height, thickness: data.board.thickness };
  const fitted = data.parts.filter((p) => !p.dnp);
  const { spec, stocked } = suggestEnclosure(board, fitted);
  const box = analyseBox(spec, board, fitted, []);
  // The box itself is our suggestion, not something the spec asked for.
  const why = stocked ? "Our suggestion: the smallest box we stock that the board fits. Not in the spec." : "Our suggestion, sized to the board: no box we stock is big enough. Not in the spec.";
  return {
    ...data,
    enclosure: { ...spec, fits: boardFits(spec, board.w, board.h).fits, partId: null, ipRating: null },
    box: { ...box, kit: box.kit.map((k) => (k.key === "enclosure" ? { ...k, status: "check" as const, why } : k)) },
    boxSuggested: stocked ? "stocked" : "made",
  };
}
