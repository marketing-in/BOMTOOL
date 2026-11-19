import Link from "next/link";
import { BookOpen, Check, CircleAlert, FileSpreadsheet, FileUp, TriangleAlert } from "lucide-react";
import type { FootprintMatch, MatchStatus, RefResult, ValuePair } from "@/lib/board/footprint-match";
import type { PartBody } from "@/lib/board/placement-film";
import { ORDER, STATUS } from "@/components/bom/footprint-status";
import type { BoardArt } from "@/components/bom/placement-film";
import { FootprintBoard } from "@/components/bom/footprint-board";
import type { ViewerData } from "@/components/viewer/types";
import { compressRefs } from "@/lib/board/find-parts";
import { cn } from "@/lib/utils";
import { Ring } from "@/components/viz/ring";

/**
 * Step 3, "Footprint match" (Phase 24), as a picture: a ring of how many designators agree, a count per result, the
 * board with every part flying in onto its pads (3D, or the flat 2D film; mismatches blink red), and only the problems
 * listed.
 */

const TONE = {
  green: { box: "border-risk-green/30 bg-risk-green-soft", text: "text-risk-green", icon: Check },
  amber: { box: "border-risk-amber/40 bg-risk-amber-soft", text: "text-risk-amber", icon: TriangleAlert },
  red: { box: "border-risk-red/30 bg-risk-red-soft", text: "text-risk-red", icon: CircleAlert },
} as const;

/** A ring split by result, with the share that matches in the middle. */
function MatchRing({ m }: { m: FootprintMatch }) {
  const pct = m.total ? Math.round((m.counts.match / m.total) * 100) : 0;
  return (
    <Ring
      className="size-36"
      parts={ORDER.map((s) => ({ key: s, value: m.counts[s], color: STATUS[s].color, opacity: s === "not-in-bom" || s === "not-on-board" ? 0.65 : 1 }))}
      center={m.total ? `${pct}%` : "—"}
      sub={m.total ? "match" : "no board"}
      label={m.total ? `${pct}% of designators match` : "Nothing to compare yet"}
    />
  );
}

type Row = { status: MatchStatus; refs: string[]; lineNo: number | null; mpn: string | null; bomPkg: string | null; footprint: string | null; why: string; values: ValuePair | null };

/** Designators with the same line, result, footprint and reason become one row (two wrong values stay apart). */
function rows(refs: RefResult[]): Row[] {
  const by = new Map<string, Row>();
  for (const r of refs) {
    const key = `${r.status}|${r.lineNo}|${r.bomPkg}|${r.footprint}|${r.status === "match" ? "" : r.why}|${r.values ? `${r.values.bom}/${r.values.board}` : ""}`;
    const row = by.get(key);
    if (row) row.refs.push(r.ref);
    else by.set(key, { status: r.status, refs: [r.ref], lineNo: r.lineNo, mpn: r.mpn, bomPkg: r.bomPkg, footprint: r.footprint, why: r.why, values: r.values ?? null });
  }
  return [...by.values()];
}

/** The values both sides give: one when they agree ("100 nF"), both when they differ. */
function ValueCell({ v, tone }: { v: ValuePair | null; tone: string }) {
  if (!v) return <span className="font-sans text-muted-foreground">—</span>;
  if (v.same) return <>{v.board}</>;
  return (
    <span className={cn("font-medium", tone)}>
      <span className="font-sans font-normal text-muted-foreground">BoM</span> {v.bom} <span className="font-sans font-normal text-muted-foreground">· board</span> {v.board}
    </span>
  );
}

/** showValues: a Value column, when the board files carry values that were compared. */
function Table({ list, showValues = false }: { list: Row[]; showValues?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="px-4 py-2 font-medium">Designators</th>
            <th className="px-4 py-2 font-medium">BoM line</th>
            <th className="px-4 py-2 font-medium">BoM package</th>
            <th className="px-4 py-2 font-medium">Board footprint</th>
            {showValues ? <th className="px-4 py-2 font-medium">Value</th> : null}
            <th className="px-4 py-2 font-medium">Result</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {list.map((r, i) => {
            const S = STATUS[r.status];
            return (
              <tr key={i}>
                <td className="num px-4 py-2 font-medium">{compressRefs(r.refs)} <span className="font-sans text-xs font-normal text-muted-foreground">×{r.refs.length}</span></td>
                <td className="px-4 py-2">{r.lineNo ? <><span className="num text-muted-foreground">L{r.lineNo}</span> <span className="num">{r.mpn ?? ""}</span></> : <span className="text-muted-foreground">—</span>}</td>
                <td className="num px-4 py-2">{r.bomPkg ?? <span className="font-sans text-muted-foreground">—</span>}</td>
                <td className="num px-4 py-2">{r.footprint ?? <span className="font-sans text-muted-foreground">—</span>}</td>
                {showValues ? (
                  <td className="num px-4 py-2">
                    <ValueCell v={r.values} tone={S.text} />
                  </td>
                ) : null}
                <td className="px-4 py-2">
                  <span className={cn("inline-flex items-center gap-1.5 font-medium", S.text)}><S.icon className="size-4" aria-hidden /> {S.label}</span>
                  {r.status !== "match" ? <span className="block text-xs text-muted-foreground">{r.why}</span> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export type { BoardArt };

export function FootprintMatchView({
  match: m,
  revisionId,
  board,
  art = null,
  bodies,
  mask,
  viewer = null,
}: {
  match: FootprintMatch;
  revisionId: string;
  board: { widthMm: number; heightMm: number } | null;
  art?: BoardArt | null;
  /** Each placed designator's body and rotation, from the package data (keyed by upper-case designator). */
  bodies?: Record<string, PartBody>;
  /** Solder-mask colour name of the board (green when not given). */
  mask?: string | null;
  /** The assembled board for the 3D view (null: the 2D film only). */
  viewer?: ViewerData | null;
}) {
  const t = TONE[m.level];
  const all = rows(m.refs);
  const problems = all.filter((r) => r.status !== "match").sort((a, b) => ORDER.indexOf(b.status) - ORDER.indexOf(a.status));
  const good = all.filter((r) => r.status === "match");
  return (
    <div className="space-y-6">
      <section aria-label="Result" className={cn("flex flex-wrap items-center gap-6 rounded-xl border p-6", t.box)}>
        <MatchRing m={m} />
        <div className="min-w-0 flex-1">
          <h2 className={cn("flex items-center gap-2 text-2xl leading-tight font-semibold tracking-tight", t.text)}>
            <t.icon className="size-6 shrink-0" aria-hidden /> {m.title}
          </h2>
          <p className="mt-1.5 max-w-[70ch] text-sm">{m.summary}</p>
          {m.level === "red" ? <p className="mt-3 text-sm font-medium">Fix the BoM or the board files before the machine check.</p> : null}
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <Link href={`/boms/${revisionId}/board`} className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-card px-3 font-medium outline-none transition-colors duration-150 hover:bg-part-soft focus-visible:ring-2 focus-visible:ring-ring">
              <FileUp className="size-4" aria-hidden /> {m.hasBoard ? "Replace board files" : "Add Gerbers"}
            </Link>
            {m.level !== "green" && m.hasBoard ? (
              <Link href={`/boms/${revisionId}`} className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-card px-3 font-medium outline-none transition-colors duration-150 hover:bg-part-soft focus-visible:ring-2 focus-visible:ring-ring">
                <FileSpreadsheet className="size-4" aria-hidden /> Fix in the BoM
              </Link>
            ) : null}
            <Link href="/knowledge/bom-gerber-footprint-match" className="inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-muted-foreground outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
              <BookOpen className="size-4" aria-hidden /> Why it matters
            </Link>
          </div>
        </div>
      </section>

      {m.hasBoard ? (
        <>
          <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border lg:grid-cols-5" aria-label="Designators by result">
            {ORDER.map((s) => {
              const S = STATUS[s];
              return (
                <li key={s} title={S.short} className="bg-card p-5">
                  <div className={cn("text-3xl leading-none font-semibold tracking-tight tabular-nums", !m.counts[s] && "text-muted-foreground/50")}>{m.counts[s].toLocaleString("en-IN")}</div>
                  <div className={cn("mt-1.5 flex items-center gap-1.5 truncate text-xs font-medium", m.counts[s] ? S.text : "text-muted-foreground")}><S.icon className="size-3.5 shrink-0" aria-hidden /> {S.label}</div>
                  <span className="sr-only">{S.short}</span>
                </li>
              );
            })}
          </ul>

          <FootprintBoard refs={m.refs} board={board} art={art} bodies={bodies} mask={mask} counts={m.counts} viewer={viewer} />

          {problems.length ? (
            <section aria-labelledby="to-fix" className="overflow-hidden rounded-xl border bg-card">
              <h2 id="to-fix" className="border-b px-5 py-4 text-base font-semibold">To fix or check <span className="num font-normal text-muted-foreground">· {problems.reduce((s, r) => s + r.refs.length, 0)} designators</span></h2>
              <Table list={problems} showValues={m.valuesChecked > 0} />
            </section>
          ) : null}

          {good.length ? (
            <details className="group overflow-hidden rounded-xl border bg-card">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold outline-none select-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                <Check className="size-4 text-risk-green" aria-hidden /> Matching designators <span className="num font-normal text-muted-foreground">· {m.counts.match.toLocaleString("en-IN")}</span>
                <span className="ml-auto text-xs font-normal text-muted-foreground group-open:hidden">Show</span>
                <span className="ml-auto hidden text-xs font-normal text-muted-foreground group-open:inline">Hide</span>
              </summary>
              <div className="border-t"><Table list={good} showValues={m.valuesChecked > 0} /></div>
            </details>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
