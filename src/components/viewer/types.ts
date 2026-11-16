import type { Lifecycle, ReachStatus, RohsStatus } from "@prisma/client";
import type { BodySpec } from "@/lib/board/bodies";
import type { Scores } from "@/lib/bom/scores";
import type { EnclosureSpec } from "@/lib/board/enclosures";
import type { BoxAnalysis } from "@/lib/board/box";
import type { RouteStep } from "@/lib/ops/route";
import type { FabMeasure } from "@/lib/feasibility/paste";

/** A route step with its dictionary machine and knowledge article named for display. */
export type ViewerRouteStep = RouteStep & { machineName: string | null; articleTitle: string | null };

export type ViewerLayer = { key: string; type: string; side: string; index?: number; svg: string };

export type ViewerPart = {
  refDes: string;
  x: number; // mm, board-centred
  y: number;
  rotation: number;
  side: "TOP" | "BOTTOM";
  body: BodySpec;
  lineId: string | null;
  lineNo: number | null;
  partId: string | null;
  mpn: string | null;
  /** Package name (e.g. "SOIC-8", "0603"), when known. */
  pkg: string | null;
  /** BoM value column (e.g. "10k", "100nF"). */
  value: string | null;
  /** What is printed on the body: the EIA value code on chip resistors, else the MPN. */
  marking: string | null;
  manufacturer: string | null;
  description: string | null;
  lifecycle: Lifecycle | null;
  rohs: RohsStatus | null;
  reach: ReachStatus | null;
  scores: Scores | null;
  worst: number | null;
  required: number;
  available: number;
  shortfall: number;
  bestUnit: number | null;
  landedUnit: number | null;
  dnp: boolean;
  alternates: { partId: string; mpn: string; type: string }[];
  imageUrl: string | null;
  datasheetUrl: string | null;
  /** The dictionary entry for this kind of part. */
  kind: { slug: string; name: string } | null;
  /** Free quantities by sourcing tier. */
  supply: { ours: number; partners: number; suppliers: number; market: number; sources: number; leadWeeks: number | null } | null;
  /** Risk at this BoM's need (src/lib/part-risk.ts). */
  risk: { score: number; level: "green" | "amber" | "red" | "grey"; summary: string; actions: string[] } | null;
  /** Process-route steps that handle this part (src/lib/ops/route.ts). */
  steps?: string[];
};

export type ViewerData = {
  /** Null for a quick-look board (Gerbers without a BoM). */
  revisionId: string | null;
  title: string;
  currency: string;
  board: {
    source: "gerber" | "spec";
    width: number;
    height: number;
    thickness: number;
    layerCount: number;
    maskColor: string;
    silkColor: string;
    finish: string;
    /** Lower-left corner of the board in the Gerber drawings' own frame (mm, y up), so each layer lands where it was drawn. */
    origin?: { x: number; y: number } | null;
    top: string | null;
    bottom: string | null;
    layers: ViewerLayer[];
    /** Paste apertures and drills measured off the Gerbers at upload (null: no Gerbers, or uploaded before Phase 15). */
    fab?: FabMeasure | null;
  };
  parts: ViewerPart[];
  approximateLayout: boolean;
  /** The finished product this board goes into (null for a quick-look board). */
  product: { name: string; partNumber: string | null; revision: string; customer: string } | null;
  enclosure: (EnclosureSpec & { fits: boolean; partId: string | null; ipRating: string | null }) | null;
  /** How the board goes into the box: mount height, fit, wall openings, box-build kit. */
  box: BoxAnalysis | null;
  /** Manufacturing route from bare board to packed product (src/lib/ops/route.ts). */
  route: ViewerRouteStep[];
};
