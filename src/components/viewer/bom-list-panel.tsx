"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ListTree, Search } from "lucide-react";
import { bomRows, type BomRow as Row } from "@/lib/board/bom-rows";
import { cn } from "@/lib/utils";
import type { ViewerPart } from "./types";

const DOT: Record<Row["level"], string> = { green: "bg-risk-green", amber: "bg-risk-amber", red: "bg-risk-red", grey: "bg-risk-grey" };
const LEVEL_TEXT: Record<Row["level"], string> = { green: "low risk", amber: "watch", red: "high risk", grey: "not assessed" };
const k = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

/**
 * The BoM beside the board: every line with its designators, where we can get it (ours / channel partners /
 * online) and compliance. Picking a line selects its parts on the board; picking a part on the board marks its line.
 */
export function BomListPanel({ parts, selectedLine, onPick }: { parts: ViewerPart[]; selectedLine: string | null; onPick: (refDes: string) => void }) {
  const rows = useMemo(() => bomRows(parts), [parts]);
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) => [r.mpn, r.manufacturer, ...r.refs].some((x) => x?.toLowerCase().includes(t)));
  }, [rows, q]);
  const list = useRef<HTMLUListElement>(null);
  const active = useRef<HTMLLIElement>(null);
  // Bring the picked line into view inside the list only — never scroll the page away from the board.
  useEffect(() => {
    const ul = list.current;
    const li = active.current;
    if (!ul || !li) return;
    if (li.offsetTop < ul.scrollTop || li.offsetTop + li.offsetHeight > ul.scrollTop + ul.clientHeight) ul.scrollTop = Math.max(0, li.offsetTop - ul.clientHeight / 3);
  }, [selectedLine]);
  if (!rows.length) return null;
  const short = rows.filter((r) => r.supply && !r.dnp && r.supply.ours + r.supply.partners + r.supply.suppliers + r.supply.market === 0).length;

  return (
    <section aria-labelledby="bom-list" className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h2 id="bom-list" className="flex items-center gap-1.5 text-sm font-medium">
          <ListTree className="size-4 text-muted-foreground" aria-hidden /> BoM on this board
        </h2>
        <span className="num text-xs text-muted-foreground">
          {rows.length} lines · {parts.length} parts{short ? ` · ${short} no stock` : ""}
        </span>
      </div>
      <div className="relative border-b px-3 py-2">
        <Search className="pointer-events-none absolute top-1/2 left-5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <label htmlFor="bom-filter" className="sr-only">Find a part on this board</label>
        <input id="bom-filter" value={q} onChange={(e) => setQ(e.target.value)} placeholder="MPN, maker or RefDes…" className="h-9 w-full rounded-md border bg-background pr-2 pl-7 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </div>
      <div className="grid grid-cols-[1fr_repeat(3,3rem)] gap-1 border-b px-4 py-1.5 text-[10px] text-muted-foreground">
        <span>Line · part</span>
        <span className="text-right" title="Our inventory">Ours</span>
        <span className="text-right" title="Channel partners & sourcing agents">Partners</span>
        <span className="text-right" title="Distributors online + marketplace">Online</span>
      </div>
      <ul ref={list} className="relative max-h-[52dvh] divide-y overflow-y-auto" aria-label="BoM lines">
        {shown.map((r) => {
          const on = r.lineId !== null && r.lineId === selectedLine;
          return (
            <li key={r.key} ref={on ? active : undefined}>
              <button
                type="button"
                onClick={() => onPick(r.refs[0])}
                aria-pressed={on}
                className={cn("grid w-full grid-cols-[1fr_repeat(3,3rem)] items-start gap-1 px-4 py-2 text-left outline-none transition-colors duration-150 hover:bg-muted/50 focus-visible:bg-muted/60", on && "bg-primary/10")}
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span className={cn("size-2 shrink-0 rounded-full", DOT[r.level])} aria-hidden />
                    <span className="sr-only">{LEVEL_TEXT[r.level]}:</span>
                    <span className="num truncate text-sm font-medium">{r.mpn ?? "Not matched"}</span>
                  </span>
                  <span className="num block truncate text-[11px] text-muted-foreground">
                    {r.lineNo ? `L${r.lineNo} · ` : ""}
                    {r.refs.length > 4 ? `${r.refs.slice(0, 3).join(", ")} +${r.refs.length - 3}` : r.refs.join(", ")}
                    {r.dnp ? " · DNP" : ""}
                  </span>
                  {r.matched ? (
                    <span className="mt-0.5 flex gap-1 text-[10px]">
                      <span className={cn("rounded px-1", r.rohs === "COMPLIANT" ? "bg-risk-green-soft" : r.rohs === "NON_COMPLIANT" ? "bg-risk-red-soft" : "bg-muted")}>RoHS {r.rohs === "COMPLIANT" ? "✓" : r.rohs === "NON_COMPLIANT" ? "✗" : r.rohs === "COMPLIANT_WITH_EXEMPTION" ? "exempt" : "?"}</span>
                      <span className={cn("rounded px-1", r.reach === "COMPLIANT" ? "bg-risk-green-soft" : r.reach === "CONTAINS_SVHC" ? "bg-risk-amber-soft" : "bg-muted")}>REACH {r.reach === "COMPLIANT" ? "✓" : r.reach === "CONTAINS_SVHC" ? "SVHC" : "?"}</span>
                    </span>
                  ) : null}
                </span>
                {r.supply ? (
                  <>
                    <span className="num text-right text-xs">{k(r.supply.ours)}</span>
                    <span className="num text-right text-xs">{k(r.supply.partners)}</span>
                    <span className="num text-right text-xs">{k(r.supply.suppliers + r.supply.market)}</span>
                  </>
                ) : (
                  <span className="col-span-3 text-right text-[11px] text-muted-foreground">—</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
