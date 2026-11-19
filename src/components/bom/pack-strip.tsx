import { Ban, Check, ChevronDown, CircuitBoard, EyeOff, FileQuestion, FileText, History, LayoutGrid, Library, ListChecks, MapPin, Replace, Table2, type LucideIcon } from "lucide-react";
import type { PackSummary } from "@/lib/bom/workbook";
import { SHEET_KIND_LABEL, type SheetKind } from "@/lib/bom/sheet-kinds";
import { DETAIL_LABEL, pickDetail, type DetailKey, type FileDetail } from "@/lib/bom/details";
import { RiskDot } from "@/components/data/badges";
import { Info } from "@/components/viz/info";
import { cn } from "@/lib/utils";

const ICON: Record<SheetKind, LucideIcon> = {
  bom: Table2,
  placement: MapPin,
  "load-list": ListChecks,
  "not-fitted": Ban,
  alternates: Replace,
  details: FileText,
  "revision-history": History,
  reference: Library,
  other: FileQuestion,
};

/** The details worth a glance, in the order a planner reads them. */
const SHOWN: DetailKey[] = ["name", "product", "partNumber", "revision", "pcbRevision", "customer", "buildQty", "boardSize", "productSize", "layers", "thickness", "finish", "mask", "material", "variant", "date", "tool", "project"];

function shownValue(d: FileDetail): string {
  if (/^\d{4}-\d{2}-\d{2}T/.test(d.value)) return d.value.slice(0, 10);
  if ((d.key === "boardSize" || d.key === "productSize") && !/mm/i.test(d.value)) return `${d.value} mm`;
  return d.value;
}

const isLink = (v: string) => /^https?:\/\/\S+$/i.test(v.trim());
/** A value too long for half a row on a tablet (a part number, a link, a stack-up): it takes the row's two columns. */
const isLong = (d: FileDetail) => isLink(d.value) || shownValue(d).length > 22;
/** "Board / assembly" reads as "name" in a sentence. */
const inline = (d: FileDetail) => (d.key === "name" ? "name" : d.key ? DETAIL_LABEL[d.key].toLowerCase() : d.label.toLowerCase());
const n = (k: number, one: string, many = `${one}s`) => `${k.toLocaleString("en-IN")} ${k === 1 ? one : many}`;

type Choice = { selected: string[]; onToggle: (sheet: string) => void; candidates: string[]; disabled?: boolean };

/**
 * What the upload read from the customer's files (Phase 29, every page since Phase 37): one card per sheet with what it
 * is, what was taken from it and why; what the file says about itself, each value with the cell it came from; its own
 * totals checked against the lines; the bare board's line; and where the sheets disagree. Shown on the upload form
 * before submitting, on the mapping step, and folded on the BoM step. `choose` lets the person pick the BoM sheets.
 */
export function PackStrip({ pack, className, compact, choose, title = "Read from the file" }: { pack: PackSummary; className?: string; compact?: boolean; choose?: Choice; title?: string }) {
  const added = pack.added.length;
  const details = pack.details;
  const keyed = SHOWN.map((k) => pickDetail(details, k)).filter((d): d is FileDetail => !!d && d.via !== "file-name");
  const fromName = SHOWN.map((k) => pickDetail(details, k)).filter((d): d is FileDetail => !!d && d.via === "file-name");
  // Every circuit board the file describes ("Board · Remote PCB"), then up to six other values the file names.
  const unkeyed = (details?.items ?? []).filter((d) => !d.key);
  const boards = unkeyed.filter((d) => d.label.startsWith("Board · "));
  const rest = unkeyed.filter((d) => !d.label.startsWith("Board · "));
  const others = [...boards, ...rest.slice(0, 6)];
  const moreOthers = rest.length - Math.min(rest.length, 6);
  const totals = details?.totals ?? [];
  const notes = details?.notes ?? [];
  const red = pack.findings.filter((f) => f.level === "red").length;
  const amber = pack.findings.length - red;
  const name = pickDetail(details, "name") ?? pickDetail(details, "product");
  const rev = pickDetail(details, "revision");

  const body = (
    <>
      {pack.singlePage ? (
        <p className="mt-3 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          A CSV holds one sheet. To read every page — placements, not-fitted lists, alternates — upload the Excel file.
        </p>
      ) : null}

      {pack.sheets.length ? (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3" aria-label="Sheets">
          {pack.sheets.map((s) => {
            const Icon = ICON[s.kind] ?? FileQuestion;
            const picked = choose?.selected.includes(s.name);
            return (
              <li key={s.name} className={cn("flex gap-3 rounded-md border px-3 py-2.5", !s.used && "bg-muted/40")}>
                <Icon className={cn("mt-0.5 size-5 shrink-0", s.used ? "text-foreground" : "text-muted-foreground")} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="min-w-0 text-sm font-medium [overflow-wrap:anywhere]">{s.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {SHEET_KIND_LABEL[s.kind] ?? s.kind}
                      {s.side ? ` · ${s.side === "TOP" ? "top" : "bottom"}` : ""}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{s.says}</p>
                  {s.hidden || s.hiddenRows ? (
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <EyeOff className="size-3.5 shrink-0" aria-hidden />
                      {s.hidden ? "Hidden in Excel — read all the same" : `${s.hiddenRows!.toLocaleString("en-IN")} rows hidden by a filter in Excel — read all the same`}
                    </p>
                  ) : null}
                  {choose && (choose.candidates.includes(s.name) || picked) ? (
                    <div className="mt-1.5 text-xs">
                      <label className={cn("inline-flex items-center gap-1.5", picked && choose.selected.length === 1 ? "cursor-not-allowed" : "cursor-pointer")}>
                        <input
                          type="checkbox"
                          checked={!!picked}
                          disabled={choose.disabled || (picked && choose.selected.length === 1)}
                          onChange={() => choose.onToggle(s.name)}
                          className="size-3.5 accent-[var(--primary)]"
                        />
                        Use as BoM
                      </label>
                      {picked && choose.selected.length === 1 ? <span className="ml-2 text-muted-foreground">one BoM sheet is needed — tick another to change</span> : null}
                      {picked && pack.bomSheets && !pack.bomSheets.includes(s.name) ? <p className="mt-0.5 text-risk-amber">Ticked, but left out: {s.says.replace(/^[^—]*—\s*/, "")}</p> : null}
                    </div>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="num text-lg leading-none font-semibold">{s.count.toLocaleString("en-IN")}</span>
                  <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] leading-none", s.used ? "bg-risk-green-soft text-foreground" : "bg-muted text-muted-foreground")}>{s.used ? "Taken" : "Not used"}</span>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {keyed.length || others.length || totals.length ? (
        <div className="mt-4 border-t pt-3">
          {keyed.length || others.length ? (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 xl:grid-cols-4" aria-label="Details from the file">
              {[...keyed, ...others].map((d) => (
                <div key={`${d.key ?? d.label}-${d.from}`} className={cn("min-w-0", isLong(d) && "col-span-2")}>
                  <dt className="text-xs break-words text-muted-foreground">{d.key ? DETAIL_LABEL[d.key] : d.label}</dt>
                  <dd className="num text-sm font-medium [overflow-wrap:anywhere]">
                    {isLink(d.value) ? (
                      <a href={d.value.trim()} target="_blank" rel="noopener noreferrer" className="underline decoration-muted-foreground/50 underline-offset-2 hover:decoration-foreground">
                        {d.value.trim()}
                      </a>
                    ) : (
                      shownValue(d)
                    )}
                  </dd>
                  <dd className="text-[11px] break-words text-muted-foreground">{d.from}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {moreOthers > 0 ? <p className="mt-2 text-xs text-muted-foreground">{n(moreOthers, "more value")} in the file, kept with the BoM.</p> : null}
          {fromName.length && !keyed.length ? (
            <p className="text-xs text-muted-foreground">
              From the file name — {fromName.map((d) => `${inline(d)}: ${d.value}`).join(" · ")}
            </p>
          ) : null}
          {totals.length ? (
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm" aria-label="The file's own totals">
              {totals.map((t) => {
                const ok = t.read === t.said;
                const unknown = t.read === null || t.read === undefined;
                return (
                  <li key={`${t.label}-${t.from}`} className="flex items-center gap-1.5" title={t.from}>
                    <RiskDot level={unknown ? "grey" : ok ? "green" : "amber"} />
                    <span className="text-muted-foreground">{t.label}</span>
                    <span className="num font-medium">{t.said.toLocaleString("en-IN")}</span>
                    {unknown ? null : ok ? <Check className="size-3.5 text-risk-green" aria-label="agrees" /> : <span className="num text-xs text-risk-amber">read {t.read!.toLocaleString("en-IN")}</span>}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}

      {pack.board || added || pack.boardNotes.length || pack.alternates?.on ? (
        <ul className="mt-3 space-y-1.5 text-sm">
          {pack.board ? (
            <li className="flex items-start gap-2">
              <CircuitBoard className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                <span className="font-medium">Bare board</span> <span className="num">{pack.board.label || "no spec in the text"}</span>
              </span>
            </li>
          ) : null}
          {pack.alternates?.on ? (
            <li className="flex items-start gap-2">
              <Replace className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                <span className="num font-medium">{n(pack.alternates.alternates, "alternate")}</span> <span className="text-muted-foreground">from “{pack.alternates.sheet}”:</span>{" "}
                {pack.alternates.withMpn ? (
                  <>
                    <span className="num font-medium">{n(pack.alternates.withMpn, "part number")}</span> <span className="text-muted-foreground">on {n(pack.alternates.lines, "line")}, tried when the first part does not match</span>
                  </>
                ) : null}
                {pack.alternates.ipnOnly ? (
                  <>
                    {pack.alternates.withMpn ? <span className="text-muted-foreground">; </span> : null}
                    <span className="num font-medium">{pack.alternates.ipnOnly.toLocaleString("en-IN")}</span>{" "}
                    <span className="text-muted-foreground">known only by an internal part number, kept on {n(pack.alternates.ipnLines ?? 0, "line")}</span>
                  </>
                ) : null}
              </span>
            </li>
          ) : null}
          {added ? (
            <li className="flex items-start gap-2">
              <Ban className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                <span className="num font-medium">{added}</span> <span className="text-muted-foreground">added as not-fitted lines:</span> <span className="num">{pack.added.join(", ")}</span>
              </span>
            </li>
          ) : null}
          {pack.boardNotes.map((note) => (
            <li key={note} className="flex items-start gap-2">
              <LayoutGrid className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>{note}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {notes.length ? (
        <details className="group mt-3 text-sm">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-muted-foreground hover:text-foreground">
            <ChevronDown className="size-4 transition-transform duration-150 group-open:rotate-180" aria-hidden />
            {notes.length} {notes.length === 1 ? "note" : "notes"} in the file (all sheets)
          </summary>
          <ul className="mt-2 space-y-1.5 pl-5">
            {notes.map((n) => (
              <li key={`${n.from}-${n.text.slice(0, 40)}`}>
                {n.text} <span className="text-xs text-muted-foreground">— {n.from}</span>
              </li>
            ))}
          </ul>
        </details>
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
    </>
  );

  const heading = (
    <div className="flex items-center gap-1">
      <h2 className="text-sm font-semibold">{title}</h2>
      <Info label="About what was read">
        <p>Every sheet of the workbook is read, not only the first. The BoM is the sheet whose header reads most like one; BoM sheets with other parts (top and bottom, PCBA and mechanical) are merged, and a copy is left out.</p>
        <p>A placement report says where every part sits and on which side. Load lists are what the pick-and-place machine is programmed from. Designators on a not-fitted list stay on the board with empty pads. Alternates are tried when the first part does not match.</p>
        <p>Title rows and details sheets give the board&apos;s name, revision and size; the file&apos;s own totals are checked against the lines.</p>
      </Info>
    </div>
  );

  if (compact) {
    return (
      <details className={cn("group rounded-xl border bg-card", className)}>
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3.5">
          <ChevronDown className="size-4 text-muted-foreground transition-transform duration-150 group-open:rotate-180" aria-hidden />
          <span className="text-sm font-semibold">{title}</span>
          <span className="text-sm text-muted-foreground">
            {pack.sheets.length ? `${pack.sheets.length} ${pack.sheets.length === 1 ? "sheet" : "sheets"}` : "one table"}
            {name ? <> · <span className="text-foreground">{name.value}</span></> : null}
            {rev ? <> · rev <span className="num text-foreground">{rev.value}</span></> : null}
          </span>
          {red || amber ? (
            <span className="ml-auto flex items-center gap-3 text-xs">
              {red ? <span className="flex items-center gap-1.5"><RiskDot level="red" /> {red} to settle</span> : null}
              {amber ? <span className="flex items-center gap-1.5"><RiskDot level="amber" /> {amber} to check</span> : null}
            </span>
          ) : null}
        </summary>
        <div className="border-t px-5 pb-5">{body}</div>
      </details>
    );
  }

  return (
    <section aria-label={title} className={cn("rounded-xl border bg-card p-5", className)}>
      {heading}
      {body}
    </section>
  );
}
