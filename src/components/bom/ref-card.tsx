import type { RefResult } from "@/lib/board/footprint-match";
import { STATUS } from "@/components/bom/footprint-status";
import { cn } from "@/lib/utils";

/**
 * What the footprint check found for one designator: its result, the BoM line and MPN, the BoM's package (and value) against the
 * board's footprint (and value), and why. The inside of the card on the board (2D film and 3D); the caller gives the box.
 */
export function RefCard({ r, bottom }: { r: RefResult; bottom?: boolean }) {
  const S = STATUS[r.status];
  return (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className="num text-sm font-semibold">{r.ref}</span>
        <span className={cn("inline-flex items-center gap-1 font-medium", S.text)}>
          <S.icon className="size-3.5" aria-hidden />
          {S.label}
        </span>
      </div>
      {r.mpn ? (
        <div className="num mt-1 truncate">
          {r.lineNo ? <span className="text-muted-foreground">L{r.lineNo} </span> : null}
          {r.mpn}
        </div>
      ) : null}
      <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
        <dt className="text-muted-foreground">BoM</dt>
        <dd className="num truncate">{r.bomPkg ?? "—"}{r.values ? ` · ${r.values.bom}` : ""}</dd>
        <dt className="text-muted-foreground">Board</dt>
        <dd className="num truncate">{r.footprint ?? "—"}{r.values ? ` · ${r.values.board}` : ""}</dd>
      </dl>
      {r.status !== "match" ? <p className="mt-1.5 text-muted-foreground">{r.why}</p> : null}
      {bottom ? <p className="mt-1 text-muted-foreground">Bottom side</p> : null}
    </>
  );
}
