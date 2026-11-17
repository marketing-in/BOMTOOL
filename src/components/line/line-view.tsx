"use client";

import { useMemo } from "react";
import type { ViewerData } from "@/components/viewer/types";
import type { SimLine } from "@/lib/ops/sim-stations";
import { FactoryLine, type CircuitflowBoard, type CircuitflowPart } from "@/vendor/circuitflow/entry";
import { toCircuitflowBoard } from "@/components/viewer/to-circuitflow";
import "@/vendor/circuitflow/line.css";

export default function LineView({ data, line }: { data: ViewerData; line?: SimLine | null }) {
  // The BoM's board on circuitflow's SMT line: its placed parts as circuitflow parts, so each machine plans this board.
  const { board, parts } = useMemo(() => toCircuitflowBoard(data) as { board: CircuitflowBoard; parts: CircuitflowPart[] }, [data]);
  return (
    <div className="cf-scope">
      <FactoryLine board={board} parts={parts} line={line ?? null} />
    </div>
  );
}
