/**
 * How many boards go on one production panel, so paste, joints and prints can be read per panel as well as per board.
 * A plain step-and-repeat: rails on the two long edges, a routing gap between boards, the board turned 90° if that
 * fits more. Pure.
 */
import { ASSEMBLY, type AssemblyConfig } from "@/data/assembly";

export type Panel = {
  cols: number;
  rows: number;
  boards: number;
  /** The board is turned 90° on the panel. */
  rotated: boolean;
  widthMm: number;
  lengthMm: number;
  /** One board is larger than the panel: it runs on its own with rails. */
  oversize: boolean;
};

export function panelise(boardWidthMm: number, boardHeightMm: number, cfg: AssemblyConfig = ASSEMBLY): Panel {
  const { maxWidthMm, maxLengthMm, railMm, gapMm } = cfg.panel;
  const w = Math.max(1, boardWidthMm);
  const h = Math.max(1, boardHeightMm);
  // Boards along the length (x) and across the width (y); the rails take from the width.
  const fit = (bx: number, by: number) => ({
    cols: Math.max(0, Math.floor((maxLengthMm + gapMm) / (bx + gapMm))),
    rows: Math.max(0, Math.floor((maxWidthMm - 2 * railMm + gapMm) / (by + gapMm))),
  });
  const a = fit(w, h);
  const b = fit(h, w);
  const rotated = b.cols * b.rows > a.cols * a.rows;
  const best = rotated ? b : a;
  const [bx, by] = rotated ? [h, w] : [w, h];
  const oversize = best.cols * best.rows === 0;
  const cols = Math.max(1, best.cols);
  const rows = Math.max(1, best.rows);
  return {
    cols,
    rows,
    boards: cols * rows,
    rotated,
    oversize,
    lengthMm: Math.round((cols * bx + (cols - 1) * gapMm) * 10) / 10,
    widthMm: Math.round((rows * by + (rows - 1) * gapMm + 2 * railMm) * 10) / 10,
  };
}
