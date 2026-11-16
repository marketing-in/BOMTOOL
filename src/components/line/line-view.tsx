"use client";

import { useMemo } from "react";
import type { ViewerData } from "@/components/viewer/types";
import { FactoryLine, makePart } from "@/vendor/circuitflow/entry";
import "@/vendor/circuitflow/line.css";

/**
 * The BoM's board on circuitflow's SMT line (src/vendor/circuitflow): its placed parts become circuitflow
 * blueprint parts (mm, rotation, side, package, value, MPN, body size), so each machine plans this board.
 */
export function toCircuitflowBoard(data: ViewerData) {
  const parts = data.parts
    .filter((p) => !p.dnp)
    .map((p) =>
      makePart({
        ref: p.refDes,
        x: p.x,
        y: p.y,
        rot: p.rotation,
        side: p.side === "BOTTOM" ? "bottom" : "top",
        package: p.pkg ?? "",
        value: p.value ?? "",
        mpn: p.mpn ?? "",
        w: p.body.length,
        d: p.body.width,
        h: p.body.height,
      }),
    );
  const board = { id: data.revisionId ?? "board", name: data.title, source: "blueprint", width: data.board.width, height: data.board.height, layers: data.board.layerCount, parts };
  return { board, parts };
}

export default function LineView({ data }: { data: ViewerData }) {
  const { board, parts } = useMemo(() => toCircuitflowBoard(data), [data]);
  return (
    <div className="cf-scope">
      <FactoryLine board={board} parts={parts} />
    </div>
  );
}
