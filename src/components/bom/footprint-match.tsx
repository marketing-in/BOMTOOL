import Link from "next/link";
import { BookOpen, Check, CircleAlert, CircuitBoard, Eye, FileSpreadsheet, FileUp, TriangleAlert, Unplug } from "lucide-react";
import type { FootprintMatch, MatchStatus, RefResult } from "@/lib/board/footprint-match";
import { compressRefs } from "@/lib/board/find-parts";
import { cn } from "@/lib/utils";
import { Ring } from "@/components/viz/ring";

/**
 * Step 3, "Footprint match" (Phase 24), as a picture: a ring of how many designators agree, a count per result, the
 * board with every placed part coloured by result, and only the problems listed.
 */

const STATUS: Record<MatchStatus, { label: string; short: string; color: string; text: string; icon: typeof Check }> = {
  match: { label: "Match", short: "Same footprint in the BoM and on the board", color: "var(--risk-green)", text: "text-risk-green", icon: Check },
  mismatch: { label: "Do not match", short: "The BoM names one footprint, the board has another", color: "var(--risk-red)", text: "text-risk-red", icon: CircleAlert },
  check: { label: "Check by eye", short: "One side names no footprint we can read", color: "var(--risk-amber)", text: "text-risk-amber", icon: Eye },
  "not-on-board": { label: "Not on the board", short: "In the BoM, but not placed on the board", color: "var(--risk-red)", text: "text-risk-red", icon: Unplug },
  "not-in-bom": { label: "Not in the BoM", short: "Placed on the board, but no BoM line", color: "var(--risk-red)", text: "text-risk-red", icon: FileSpreadsheet },
};
const ORDER: MatchStatus[] = ["match", "check", "mismatch", "not-on-board", "not-in-bom"];

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

/** The board from above: every placed part a dot in its result's colour; bottom-side parts are rings. */
function BoardMap({ refs, board, art }: { refs: RefResult[]; board: { widthMm: number; heightMm: number } | null; art: BoardArt | null }) {
  const pts = refs.filter((r): r is RefResult & { x: number; y: number } => r.x !== null && r.y !== null);
  if (!pts.length) return null;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  // With the Gerber drawing on file and every part inside it, the dots sit on the real board.
  const real = art && Math.min(...xs) >= art.box.x - 1 && Math.min(...ys) >= art.box.y - 1 && Math.max(...xs) <= art.box.x + art.box.w + 1 && Math.max(...ys) <= art.box.y + art.box.h + 1 ? art : null;
  const inside = board && Math.min(...xs) >= -1 && Math.min(...ys) >= -1 && Math.max(...xs) <= board.widthMm + 1 && Math.max(...ys) <= board.heightMm + 1;
  const pad = 4;
  const x0 = real ? real.box.x : inside ? 0 : Math.min(...xs) - pad;
  const y0 = real ? real.box.y : inside ? 0 : Math.min(...ys) - pad;
  const w = real ? real.box.w : inside ? board.widthMm : Math.max(...xs) - Math.min(...xs) + pad * 2;
  const h = real ? real.box.h : inside ? board.heightMm : Math.max(...ys) - Math.min(...ys) + pad * 2;
  const dot = Math.max(0.7, Math.min(w, h) / 55);
  return (
    <figure className="rounded-xl border bg-card p-5">
      <figcaption className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm font-semibold">
        <span className="flex items-center gap-2"><CircuitBoard className="size-4 text-primary" aria-hidden /> The board, part by part</span>
        <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-normal text-muted-foreground">
          {(["match", "check", "mismatch", "not-in-bom"] as MatchStatus[]).map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: STATUS[s].color, opacity: s === "not-in-bom" ? 0.55 : 1 }} aria-hidden />{STATUS[s].label}</span>
          ))}
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full border-2 border-muted-foreground" aria-hidden />bottom side</span>
        </span>
      </figcaption>
      <svg viewBox={`${-2} ${-2} ${w + 4} ${h + 4}`} className="mx-auto max-h-[420px] w-full" role="img" aria-label={`Board map: ${pts.length} placed parts coloured by footprint match`}>
        <rect x="0" y="0" width={w} height={h} rx={Math.min(w, h) / 40} fill="#14532d" opacity="0.92" />
        {real ? <image href={real.href} x="0" y="0" width={w} height={h} preserveAspectRatio="none" /> : null}
        <rect x="0" y="0" width={w} height={h} rx={Math.min(w, h) / 40} fill="none" stroke="#c9a227" strokeWidth={dot / 3} />
        {pts
          // Problems drawn last, on top.
          .sort((a, b) => Number(a.status !== "match") - Number(b.status !== "match"))
          .map((p) => {
            const cx = p.x - x0;
            const cy = h - (p.y - y0);
            const bad = p.status !== "match";
            const bottom = p.side === "BOTTOM";
            return (
              <g key={p.ref}>
                {bad ? <circle cx={cx} cy={cy} r={dot * 2.2} fill={STATUS[p.status].color} opacity="0.25" /> : null}
                {real && !bottom ? <circle cx={cx} cy={cy} r={(bad ? dot * 1.25 : dot) + dot / 4} fill="#fff" opacity="0.9" /> : null}
                <circle cx={cx} cy={cy} r={bad ? dot * 1.25 : dot} fill={bottom ? "none" : STATUS[p.status].color} stroke={STATUS[p.status].color} strokeWidth={bottom ? dot / 2 : 0} opacity={p.status === "match" ? 0.85 : 1}>
                  <title>{`${p.ref} — ${STATUS[p.status].label}: ${p.why}`}</title>
                </circle>
              </g>
            );
          })}
      </svg>
    </figure>
  );
}

/** The Gerber drawing of the top side and where it sits in the placements' own frame (mm). */
export type BoardArt = { href: string; box: { x: number; y: number; w: number; h: number } };

type Row = { status: MatchStatus; refs: string[]; lineNo: number | null; mpn: string | null; bomPkg: string | null; footprint: string | null; why: string };

/** Designators with the same line, result and footprint become one row. */
function rows(refs: RefResult[]): Row[] {
  const by = new Map<string, Row>();
  for (const r of refs) {
    const key = `${r.status}|${r.lineNo}|${r.bomPkg}|${r.footprint}`;
    const row = by.get(key);
    if (row) row.refs.push(r.ref);
    else by.set(key, { status: r.status, refs: [r.ref], lineNo: r.lineNo, mpn: r.mpn, bomPkg: r.bomPkg, footprint: r.footprint, why: r.why });
  }
  return [...by.values()];
}

function Table({ list }: { list: Row[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="px-4 py-2 font-medium">Designators</th>
            <th className="px-4 py-2 font-medium">BoM line</th>
            <th className="px-4 py-2 font-medium">BoM package</th>
            <th className="px-4 py-2 font-medium">Board footprint</th>
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

export function FootprintMatchView({ match: m, revisionId, board, art = null }: { match: FootprintMatch; revisionId: string; board: { widthMm: number; heightMm: number } | null; art?: BoardArt | null }) {
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

          <BoardMap refs={m.refs} board={board} art={art} />

          {problems.length ? (
            <section aria-labelledby="to-fix" className="overflow-hidden rounded-xl border bg-card">
              <h2 id="to-fix" className="border-b px-5 py-4 text-base font-semibold">To fix or check <span className="num font-normal text-muted-foreground">· {problems.reduce((s, r) => s + r.refs.length, 0)} designators</span></h2>
              <Table list={problems} />
            </section>
          ) : null}

          {good.length ? (
            <details className="group overflow-hidden rounded-xl border bg-card">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold outline-none select-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                <Check className="size-4 text-risk-green" aria-hidden /> Matching designators <span className="num font-normal text-muted-foreground">· {m.counts.match.toLocaleString("en-IN")}</span>
                <span className="ml-auto text-xs font-normal text-muted-foreground group-open:hidden">Show</span>
                <span className="ml-auto hidden text-xs font-normal text-muted-foreground group-open:inline">Hide</span>
              </summary>
              <div className="border-t"><Table list={good} /></div>
            </details>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
