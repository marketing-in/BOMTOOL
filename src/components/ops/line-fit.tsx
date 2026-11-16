import Link from "next/link";
import { Check, CircleAlert, Factory, Pencil, TriangleAlert } from "lucide-react";
import type { Level, LineCheck, LineRole, PlantCheck, StepCheck } from "@/lib/ops/machines";
import { cn } from "@/lib/utils";
import { Info } from "@/components/viz/info";
import { stageIcon } from "@/components/viz/step-icon";
import { Tip } from "@/components/viz/tip";

/**
 * "Can our machines build it?" as a picture (Phase 19, redrawn in Phase 25): each line is a lane of station icons in
 * the order the board passes them, coloured by whether that station takes this board. The machine names and the
 * reasons open on a tap; the line to use for each job is marked.
 */

const TONE: Record<Level, { box: string; dot: string; text: string; node: string; word: string }> = {
  green: { box: "border-risk-green/30 bg-risk-green-soft", dot: "bg-risk-green", text: "text-risk-green", node: "border-risk-green/50 bg-risk-green-soft text-risk-green", word: "Fits" },
  amber: { box: "border-risk-amber/40 bg-risk-amber-soft", dot: "bg-risk-amber", text: "text-risk-amber", node: "border-risk-amber bg-risk-amber-soft text-risk-amber", word: "Check" },
  red: { box: "border-risk-red/30 bg-risk-red-soft", dot: "bg-risk-red", text: "text-risk-red", node: "border-risk-red bg-risk-red-soft text-risk-red", word: "Does not fit" },
};
const ANSWER: Record<Level, string> = { green: "Yes", amber: "Yes — with a point to check", red: "Not as it stands" };
const ROLE_WORD: Record<LineRole, string> = { smt: "SMT", tht: "Through-hole & test", box: "Box build" };

function LevelIcon({ level, className }: { level: Level; className?: string }) {
  const Icon = level === "green" ? Check : level === "amber" ? TriangleAlert : CircleAlert;
  return <Icon className={cn("size-4 shrink-0", TONE[level].text, className)} aria-hidden />;
}

const fmt = (p: [number, number]) => `${p[0]}×${p[1]} mm`;

function needsList(plant: PlantCheck): string[] {
  const n = plant.needs;
  return [
    n.boardMm ? `Board ${fmt(n.boardMm)}${n.thicknessMm ? `, ${n.thicknessMm} mm thick` : ""}` : null,
    n.smt.placements ? `${n.smt.placements} SMT parts on ${n.smt.sides === 2 ? "both sides" : "one side"}` : null,
    n.smt.smallestChip ? `chips down to ${n.smt.smallestChip}` : null,
    n.smt.finestPitchMm ? `pitch down to ${n.smt.finestPitchMm} mm` : null,
    n.smt.hidden ? `${n.smt.hidden} with hidden joints` : null,
    n.smt.tallestMm ? `tallest part ${n.smt.tallestMm} mm` : null,
    n.tht.parts ? `${n.tht.parts} through-hole` : null,
    n.pressFit ? `${n.pressFit} press-fit` : null,
    n.coating ? "conformal coating" : null,
    n.ict ? "in-circuit test" : null,
    n.box ? "box build" : null,
  ].filter((x): x is string => !!x);
}

function Station({ s, last }: { s: StepCheck; last: boolean }) {
  const Icon = stageIcon(s.stage);
  return (
    <li className={cn("relative flex w-[4.75rem] flex-col items-center", !last && "after:absolute after:top-[19px] after:left-[calc(50%+20px)] after:h-0.5 after:w-[36px] after:bg-border")}>
      <Tip
        label={`${s.label}: ${TONE[s.level].word.toLowerCase()}`}
        className="rounded-full"
        content={
          <>
            <div className="flex items-center gap-2 font-semibold">
              <LevelIcon level={s.level} /> {s.label}
            </div>
            {s.recommended ? <p className="text-xs text-muted-foreground">Recommended, not required.</p> : null}
            {s.machines.length ? (
              <ul className="space-y-0.5 text-xs">{s.machines.map((m) => <li key={m}>{m}</li>)}</ul>
            ) : (
              <p className="text-xs text-muted-foreground">No machine on this line</p>
            )}
            {s.reasons.map((r) => (
              <p key={r} className={cn("text-xs", s.level === "red" ? "text-risk-red" : "text-foreground")}>{r}</p>
            ))}
          </>
        }
      >
        <span className={cn("relative grid size-10 place-items-center rounded-full border-2 transition-transform duration-150 hover:scale-105", TONE[s.level].node, !s.machines.length && "border-dashed")}>
          <Icon className="size-[18px]" aria-hidden />
          {s.level !== "green" ? (
            <span className={cn("absolute -right-1.5 -bottom-1.5 grid size-5 place-items-center rounded-full text-white ring-2 ring-card", s.level === "red" ? "bg-risk-red" : "bg-risk-amber")}>
              {s.level === "red" ? <CircleAlert className="size-3" aria-hidden /> : <TriangleAlert className="size-3" aria-hidden />}
            </span>
          ) : null}
        </span>
      </Tip>
      <span className="mt-1 px-0.5 text-center text-[11px] leading-tight text-muted-foreground" aria-hidden>{s.label}</span>
    </li>
  );
}

function Lane({ c, roles, canEdit }: { c: LineCheck; roles: LineRole[]; canEdit: boolean }) {
  const level = c.level === "na" ? "green" : c.level;
  const reasons = c.steps.filter((s) => s.level !== "green").flatMap((s) => s.reasons.map((r) => ({ r, level: s.level })));
  return (
    <li className={cn("rounded-lg border bg-card px-4 py-3", roles.length ? "ring-2 ring-primary/35" : "opacity-80")}>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="min-w-0 flex-1 lg:w-48 lg:flex-none">
          <div className="flex items-start gap-2">
            <span className="num rounded-md bg-primary px-1.5 py-0.5 text-xs font-bold text-primary-foreground">{c.code}</span>
            <h3 className="text-sm leading-tight font-semibold">{c.name.replace(/^.*—\s*/, "")}</h3>
          </div>
          <div className="mt-1 text-xs">
            {roles.length ? (
              <span className="font-semibold text-primary">Use this line <span className="font-normal text-muted-foreground">· {roles.map((r) => ROLE_WORD[r]).join(" + ")}</span></span>
            ) : (
              <span className="text-muted-foreground">Could also do it</span>
            )}
          </div>
        </div>
        {/* On a tablet the stations take a row of their own, under the line's name and verdict. */}
        <ol className="order-last flex min-w-0 basis-full flex-wrap gap-y-2 lg:order-none lg:flex-1 lg:basis-0" aria-label={`Stations of line ${c.code}`}>
          {c.steps.map((s, i) => <Station key={s.stage} s={s} last={i === c.steps.length - 1} />)}
        </ol>
        <div className="flex shrink-0 items-center gap-2">
          <span className={cn("inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold", TONE[level].box)}>
            <span className={cn("size-2 rounded-full", TONE[level].dot)} aria-hidden />
            {TONE[level].word}
          </span>
          <Link href={`/operations/lines#line-${c.code}`} className="inline-flex h-7 items-center gap-1 rounded-md border bg-card px-2 text-xs font-medium outline-none transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring" aria-label={`${canEdit ? "Edit" : "Open"} line ${c.code} and its machines`}>
            {canEdit ? <Pencil className="size-3" aria-hidden /> : null} {canEdit ? "Edit line" : "Open line"}
          </Link>
        </div>
      </div>
      {reasons.length ? (
        <ul className="mt-2 space-y-0.5 border-t pt-2 text-xs">
          {reasons.map(({ r, level: l }) => (
            <li key={r} className="flex items-start gap-1.5">
              <LevelIcon level={l} className="mt-px size-3.5" /> <span>{r}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function LineFitPanel({ plant, canEdit }: { plant: PlantCheck; canEdit: boolean }) {
  const t = TONE[plant.level];
  const needed = plant.lines.filter((c) => c.level !== "na");
  const idle = plant.lines.filter((c) => c.level === "na");
  // The lines to use first, in the order the board travels; the alternatives after them. One line can do two jobs.
  const order: LineRole[] = ["smt", "tht", "box"];
  const rolesOf = (code: string) => order.filter((r) => plant.use[r] === code);
  const first = (code: string) => { const r = rolesOf(code)[0]; return r ? order.indexOf(r) : 9; };
  const sorted = [...needed].sort((a, b) => first(a.code) - first(b.code));
  return (
    <section id="line-fit" aria-labelledby="line-fit-title" className="scroll-mt-24">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id="line-fit-title" className="text-base font-semibold tracking-tight">Can our machines build it?</h2>
        <span className={cn("inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold", t.box)}>
          <LevelIcon level={plant.level} className="size-3.5" /> {ANSWER[plant.level]}
        </span>
        <Info label="About the machine check">
          <p>{plant.summary}</p>
          <p className="text-xs text-muted-foreground">What this board asks of a line:</p>
          <ul className="flex flex-wrap gap-1 text-xs">
            {needsList(plant).map((n) => <li key={n} className="rounded-full border bg-muted/50 px-2 py-0.5">{n}</li>)}
          </ul>
        </Info>
        <Link href="/operations/lines" className="ml-auto inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border bg-card px-3 text-sm font-medium outline-none transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
          <Factory className="size-4" aria-hidden /> {canEdit ? "Set up lines & machines" : "Our lines & machines"}
        </Link>
      </div>
      {plant.level === "red" ? <p role="alert" className="mb-3 rounded-lg border border-risk-red/30 bg-risk-red-soft px-4 py-2.5 text-sm">{plant.summary}</p> : null}
      {sorted.length ? <ul className="space-y-2">{sorted.map((c) => <Lane key={c.lineId} c={c} roles={rolesOf(c.code)} canEdit={canEdit} />)}</ul> : <p className="rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground">{plant.summary}</p>}
      {idle.length ? <p className="mt-2 text-xs text-muted-foreground">Not needed for this board: {idle.map((c) => c.code).join(", ")}.</p> : null}
    </section>
  );
}
