import Link from "next/link";
import { ArrowRight, CircuitBoard, BadgeCheck, Banknote, Check, Layers, Leaf, ListChecks, Microchip, PackageCheck, ShieldCheck, type LucideIcon } from "lucide-react";
import type { BomCardData } from "@/server/bom-cards";
import { SCORE_KEYS, SCORE_LABEL, type ScoreKey, type Scores } from "@/lib/bom/scores";
import { scoreToRisk } from "@/lib/risk";
import { RiskDot } from "@/components/data/badges";
import { BoardIso } from "@/components/viz/board-iso";
import { cn } from "@/lib/utils";

const STAGE: Record<string, string> = { PROTOTYPE: "Prototype", NPI: "NPI", PRODUCTION: "Production" };
const SCORE_ICON: Record<ScoreKey, LucideIcon> = { availability: PackageCheck, resilience: ShieldCheck, quality: BadgeCheck, economic: Banknote, sustainability: Leaf };
const BAR = { green: "bg-risk-green", amber: "bg-risk-amber", red: "bg-risk-red", grey: "bg-risk-grey" } as const;
const INK = { green: "text-risk-green", amber: "text-risk-amber", red: "text-risk-red", grey: "text-muted-foreground" } as const;

/** The five scores as five small bars: height is the score, colour its level, the icon which score it is. */
function ScoreBars({ scores }: { scores: Scores }) {
  return (
    <ul className="flex items-end gap-1.5" aria-label="Scores out of 100">
      {SCORE_KEYS.map((k) => {
        const v = Number.isFinite(scores[k]) ? Math.round(scores[k]) : null;
        const level = scoreToRisk(v);
        const Icon = SCORE_ICON[k];
        return (
          <li key={k} title={`${SCORE_LABEL[k]} ${v ?? "—"}`} className="flex w-7 flex-col items-center gap-1">
            <span className="num text-[10px] leading-none text-muted-foreground" aria-hidden>{v ?? "—"}</span>
            <span className="flex h-8 w-2 items-end overflow-hidden rounded-full bg-muted" aria-hidden>
              <span className={cn("w-full rounded-full", BAR[level])} style={{ height: `${Math.max(8, v ?? 0)}%` }} />
            </span>
            <Icon className={cn("size-3.5", INK[level])} aria-hidden />
            <span className="sr-only">{SCORE_LABEL[k]} {v ?? "not scored"}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** What the five score icons stand for — shown once on a screen of cards, not on every card. */
export function ScoreLegend({ className }: { className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground", className)} aria-label="The five scores">
      {SCORE_KEYS.map((k) => {
        const Icon = SCORE_ICON[k];
        return (
          <li key={k} className="inline-flex items-center gap-1">
            <Icon className="size-3.5" aria-hidden /> {SCORE_LABEL[k]}
          </li>
        );
      })}
    </ul>
  );
}

/** The steps as one segmented bar, and the next step to take as a link. */
function StepBar({ id, progress, className }: { id: string; progress: NonNullable<BomCardData["progress"]>; className?: string }) {
  const { steps, done, look, next } = progress;
  return (
    <div className={className ?? "mt-4"}>
      <div className="flex gap-0.5" role="img" aria-label={`Process: ${done} of ${steps.length} steps done${look ? `, ${look} need a look` : ""}`}>
        {steps.map((s) => (
          <span key={s.key} title={`${s.n} · ${s.label}${s.note ? ` — ${s.note}` : ""}`} className={cn("h-1.5 flex-1 rounded-full", s.state === "done" ? "bg-risk-green" : s.state === "attention" ? "bg-risk-amber" : "bg-muted")} />
        ))}
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-xs">
        <span className="shrink-0 text-muted-foreground">
          <span className="num font-medium text-foreground">{done}</span> of {steps.length} steps
        </span>
        {next ? (
          <Link href={`/boms/${id}${next.path}`} title={next.note ?? undefined} className="relative z-10 inline-flex min-w-0 items-center gap-1 rounded-sm font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
            <span className="truncate">Next: {next.n} · {next.label}</span> <ArrowRight className="size-3 shrink-0" aria-hidden />
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1 font-medium text-risk-green">
            <Check className="size-3.5" aria-hidden /> Up to date
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * One BoM revision as a card (Phase 26), the same on the BoM list and on Home: the board itself drawn from the
 * Gerbers, how far the job has got through its steps and what comes next, the five scores as small bars, and
 * what needs a look. The title is the link to the BoM; "Next" goes straight to the step to do.
 */
export function BomCard({ b, compact }: { b: BomCardData; /** One slim row: the board, the name and the progress — for Home. */ compact?: boolean }) {
  const draft = b.status === "DRAFT";
  if (compact) {
    return (
      <article className="group relative flex items-center gap-4 rounded-xl border bg-card p-4 transition-colors duration-150 hover:border-primary/40">
        <div className="hidden w-24 shrink-0 rounded-lg bg-muted/60 p-2 sm:block">
          {b.board ? (
            <BoardIso revisionId={b.id} width={b.board.width} height={b.board.height} thickness={b.board.thickness} artwork={b.board.artwork} maskColor={b.board.maskColor} parts={b.board.parts} label={`${b.name} in 3D`} className="max-h-20" />
          ) : (
            <CircuitBoard className="mx-auto size-10 text-muted-foreground/60" strokeWidth={1} aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h3 className="truncate leading-tight font-semibold">
              <Link href={`/boms/${b.id}${b.board || b.placements ? "/match" : ""}`} className="outline-none after:absolute after:inset-0 after:rounded-lg group-hover:underline focus-visible:after:ring-2 focus-visible:after:ring-ring">
                {b.name}
              </Link>
            </h3>
            <span className="min-w-0 truncate text-xs text-muted-foreground">{b.customer}</span>
          </div>
          <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground" aria-label="To look at">
            <li className="num">rev {b.revision} · {b.buildQty.toLocaleString("en-IN")} pcs</li>
            {b.risk ? <li className="inline-flex items-center gap-1.5"><RiskDot level="red" /><span className="num font-medium text-foreground">{b.risk}</span> lifecycle risk</li> : null}
            {b.issues ? <li className="inline-flex items-center gap-1.5"><RiskDot level="amber" /><span className="num font-medium text-foreground">{b.issues}</span> to review</li> : null}
            {!b.board ? <li>No Gerbers yet</li> : null}
          </ul>
          {b.progress ? <StepBar id={b.id} progress={b.progress} className="mt-2" /> : null}
        </div>
      </article>
    );
  }
  return (
    <article className="group relative flex flex-col rounded-xl border bg-card p-5 transition-colors duration-150 hover:border-primary/40">
      <div className="flex flex-col gap-4">
        <div className="flex h-36 w-full shrink-0 items-center justify-center rounded-lg bg-muted/60 p-3">
          {b.board ? (
            <BoardIso revisionId={b.id} width={b.board.width} height={b.board.height} thickness={b.board.thickness} artwork={b.board.artwork} maskColor={b.board.maskColor} parts={b.board.parts} label={`${b.name} in 3D`} className="h-28 w-auto max-w-full" />
          ) : (
            <div className="text-center">
              <CircuitBoard className="mx-auto size-12 text-muted-foreground/50" strokeWidth={1} aria-hidden />
              <span className="mt-2 block text-xs text-muted-foreground">No Gerbers yet</span>
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
            <span className="truncate">{b.customer}</span>
            <span className="shrink-0">{STAGE[b.stage] ?? b.stage}</span>
          </div>
          <h3 className="mt-2 text-lg leading-snug font-semibold">
            <Link href={`/boms/${b.id}${b.board || b.placements ? "/match" : ""}`} className="outline-none after:absolute after:inset-0 after:rounded-lg group-hover:underline focus-visible:after:ring-2 focus-visible:after:ring-ring">
              {b.name}
            </Link>
          </h3>
          <div className="num truncate text-xs text-muted-foreground">
            {b.partNumber ? `${b.partNumber} · ` : ""}rev {b.revision}
          </div>
          <ul className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground" aria-label="Size of the BoM">
            <li className="inline-flex items-center gap-1" title={`${b.matched} of ${b.lines} lines matched to a part`}>
              <ListChecks className="size-3.5" aria-hidden /> <span className={cn("num font-medium", b.matched < b.lines ? "text-risk-amber" : "text-foreground")}>{b.matched < b.lines ? `${b.matched}/${b.lines}` : b.lines}</span> lines
            </li>
            <li className="inline-flex items-center gap-1">
              <Microchip className="size-3.5" aria-hidden /> <span className="num font-medium text-foreground">{b.placements.toLocaleString("en-IN")}</span> placed
            </li>
            <li className="inline-flex items-center gap-1">
              <Layers className="size-3.5" aria-hidden /> <span className="num font-medium text-foreground">{b.buildQty.toLocaleString("en-IN")}</span> pcs
            </li>
          </ul>
        </div>
      </div>

      {b.progress ? <StepBar id={b.id} progress={b.progress} /> : null}

      <div className="mt-3 flex items-end justify-between gap-3 border-t pt-3">
        {b.scores ? <ScoreBars scores={b.scores} /> : <span className="text-xs text-risk-amber">{draft ? "Columns still to map" : "Not scored yet"}</span>}
        <ul className="flex flex-col items-end gap-1 text-xs" aria-label="To look at">
          {b.risk ? <li className="inline-flex items-center gap-1.5"><RiskDot level="red" /><span className="num font-medium">{b.risk}</span> lifecycle risk</li> : null}
          {b.issues ? <li className="inline-flex items-center gap-1.5"><RiskDot level="amber" /><span className="num font-medium">{b.issues}</span> to review</li> : null}
          {!b.risk && !b.issues && !draft ? <li className="inline-flex items-center gap-1 text-risk-green"><Check className="size-3.5" aria-hidden /> Parts clear</li> : null}
        </ul>
      </div>
    </article>
  );
}
