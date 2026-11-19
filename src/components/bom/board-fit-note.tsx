import { CircleAlert, TriangleAlert } from "lucide-react";
import type { BoardFit } from "@/lib/board/placement-fit";
import { cn } from "@/lib/utils";

/**
 * Whether the placements sit on the Gerbers (src/lib/board/placement-fit.ts), said where the board is shown: nothing
 * when they do; amber naming the few that miss; red when the files are not the same board.
 */
export function BoardFitNote({ fit, className }: { fit: BoardFit | null; className?: string }) {
  if (!fit || fit.level === "green") return null;
  const red = fit.foreign;
  const Icon = red ? CircleAlert : TriangleAlert;
  const misses = [...fit.outside, ...fit.offPad];
  return (
    <div role={red ? "alert" : "status"} className={cn("flex items-start gap-3 rounded-xl border px-4 py-3 text-sm", red ? "border-risk-red/30 bg-risk-red-soft" : "border-risk-amber/30 bg-risk-amber-soft", className)}>
      <Icon className={cn("mt-0.5 size-4 shrink-0", red ? "text-risk-red" : "text-risk-amber")} aria-hidden />
      <div className="min-w-0">
        <p className={cn("font-semibold", red ? "text-risk-red" : "text-risk-amber")}>{red ? "The Gerbers do not fit the placements" : "Some placements are not on the Gerbers"}</p>
        <p className="mt-0.5">{fit.note}</p>
        {!red && misses.length ? <p className="mt-1 text-xs text-muted-foreground">Each is marked “Do not match” in step 3.</p> : null}
        {red ? <p className="mt-1 text-xs text-muted-foreground">Upload this board&apos;s own Gerbers (or its pick-and-place file) before going on.</p> : null}
      </div>
    </div>
  );
}
