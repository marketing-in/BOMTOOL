import { Ban, CircuitBoard, FileQuestion, LayoutGrid, ListChecks, MapPin, Table2, type LucideIcon } from "lucide-react";
import type { PackSummary, SheetKind } from "@/lib/bom/workbook";
import { SHEET_KIND_LABEL } from "@/lib/bom/workbook";
import { RiskDot } from "@/components/data/badges";
import { Info } from "@/components/viz/info";
import { cn } from "@/lib/utils";

const ICON: Record<SheetKind, LucideIcon> = { bom: Table2, placement: MapPin, "load-list": ListChecks, "not-fitted": Ban, other: FileQuestion };

/**
 * What the upload read from the customer's files (Phase 29): one chip per sheet of the workbook, the bare board's
 * line, what was done to the fabrication files, and where the sheets disagree. Shown on the mapping step.
 */
export function PackStrip({ pack, className }: { pack: PackSummary; className?: string }) {
  const added = pack.added.length;
  return (
    <section aria-label="Read from the file" className={cn("rounded-xl border bg-card p-5", className)}>
      <div className="flex items-center gap-1">
        <h2 className="text-sm font-semibold">Read from the file</h2>
        <Info label="About what was read">
          <p>Every sheet of the workbook is read, not only the first. The BoM is the sheet whose header reads most like one.</p>
          <p>A placement report says where every part sits and on which side. Load lists are what the pick-and-place machine is programmed from. Designators on a not-fitted list stay on the board with empty pads.</p>
        </Info>
      </div>

      {pack.sheets.length ? (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {pack.sheets.map((s) => {
            const Icon = ICON[s.kind];
            return (
              <li key={s.name} title={s.says} className={cn("flex items-center gap-3 rounded-md border px-3 py-2", !s.used && "opacity-60")}>
                <Icon className={cn("size-5 shrink-0", s.used ? "text-primary" : "text-muted-foreground")} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{s.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {SHEET_KIND_LABEL[s.kind]}
                    {s.side ? ` · ${s.side === "TOP" ? "top" : "bottom"}` : ""}
                  </div>
                </div>
                <span className="num text-lg leading-none font-semibold">{s.count.toLocaleString("en-IN")}</span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {pack.board || added || pack.boardNotes.length ? (
        <ul className="mt-3 space-y-1.5 text-sm">
          {pack.board ? (
            <li className="flex items-start gap-2">
              <CircuitBoard className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <span>
                <span className="font-medium">Bare board</span> <span className="num">{pack.board.label || "no spec in the text"}</span>
              </span>
            </li>
          ) : null}
          {added ? (
            <li className="flex items-start gap-2">
              <Ban className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <span>
                <span className="num font-medium">{added}</span> <span className="text-muted-foreground">added as not-fitted lines:</span> <span className="num">{pack.added.join(", ")}</span>
              </span>
            </li>
          ) : null}
          {pack.boardNotes.map((note) => (
            <li key={note} className="flex items-start gap-2">
              <LayoutGrid className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <span>{note}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {pack.findings.length ? (
        <ul className="mt-3 space-y-1.5 border-t pt-3 text-sm" aria-label="Where the sheets disagree">
          {pack.findings.map((f) => (
            <li key={f.text} className="flex items-start gap-2">
              <span className="mt-1.5">
                <RiskDot level={f.level} />
              </span>
              <span>{f.text}</span>
            </li>
          ))}
        </ul>
      ) : pack.sheets.length > 1 ? (
        <p className="mt-3 flex items-center gap-2 border-t pt-3 text-sm text-muted-foreground">
          <RiskDot level="green" />
          The sheets agree with each other.
        </p>
      ) : null}
    </section>
  );
}
