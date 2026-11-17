import Link from "next/link";
import { notFound } from "next/navigation";
import { sectionHref } from "@/lib/bom/workflow";
import { Banknote, Check, CircleAlert, Clock, Droplet, Grid3x3, Lock, TriangleAlert } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getDisplayCurrency } from "@/lib/prefs";
import { getFeasibility } from "@/server/feasibility";
import { getBuild } from "@/server/build";
import { PASTE_SOURCE_LABEL } from "@/lib/feasibility/paste";
import type { Level } from "@/lib/feasibility/gates";
import { ASSEMBLY } from "@/data/assembly";
import { RestartReview } from "@/components/feasibility/gate-sign";
import { Gate, GateStepper } from "@/components/feasibility/gates";
import { ConsumablesFold, CostFold, ExpensesFold, JointsFold, PasteFold, ShiftsFold, SmtLineFold } from "@/components/feasibility/sections";
import { grams, n0, n1 } from "@/components/feasibility/format";
import { moneyIn, qtyLabel } from "@/components/build/format";
import { cn } from "@/lib/utils";
import { lineFitFor, processCheckFor } from "@/server/lines";
import { workflowFor } from "@/server/workflow";
import { LineFitPanel } from "@/components/ops/line-fit";
import { ProcessCheckPanel } from "@/components/ops/process-check";
import { BoardIso } from "@/components/viz/board-iso";
import { Info } from "@/components/viz/info";
import { Kpi } from "@/components/viz/kpi";
import { Ring } from "@/components/viz/ring";


const TONE: Record<Level, { text: string; bar: string }> = {
  green: { text: "text-risk-green", bar: "bg-risk-green" },
  amber: { text: "text-risk-amber", bar: "bg-risk-amber" },
  red: { text: "text-risk-red", bar: "bg-risk-red" },
};

/**
 * Step 7, section 1 — "Can we build it?" (Phase 25: picture first). The answer on top with the customer's own board beside it,
 * then our machines as lanes, the process as a chain of icons, the nine gates as one row, and every table of
 * figures folded under its headline number.
 */
export default async function EstimateSection({ id, searchParams }: { id: string; searchParams: { qty?: string } }) {
  const user = await requireUser();
  const want = Number(searchParams.qty);
  const [f, currency, plant, b] = await Promise.all([getFeasibility(id, Number.isFinite(want) && want > 0 ? want : undefined), getDisplayCurrency(), lineFitFor(id).catch(() => null), getBuild(id).catch(() => null)]);
  const pc = plant ? await processCheckFor(id).catch(() => null) : null;
  const wf = await workflowFor(id);
  if (!f) notFound();
  const m = moneyIn(currency);
  const role = user.role;
  const canSign = can(role, "bom.write") || can(role, "workorder.write") || can(role, "compliance.write");
  const canWaive = role === "ADMIN" || role === "QUALITY";
  const v = f.verdict;
  const tone = TONE[v.level];
  const j = f.joints;
  const cap = f.capacity;
  const signed = f.gates.filter((g) => g.status === "signed").length;
  const days = Math.max(1, Math.ceil(cap.days));
  const checks = v.greens + v.ambers + v.reds;
  const view = b?.viewer ?? null;
  const placed = view ? view.parts.filter((p) => !p.dnp).length : 0;
  const VerdictIcon = v.level === "green" ? Check : v.level === "amber" ? TriangleAlert : CircleAlert;
  const p = { f, m, id };

  return (
    <div className="space-y-8">
      {wf?.matchBlocked ? (
        <p role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-risk-red/30 bg-risk-red-soft px-4 py-3 text-sm">
          <CircleAlert className="size-4 shrink-0 text-risk-red" aria-hidden />
          <span className="font-medium">The BoM and the board do not match yet.</span> {wf.states.match?.note}.
          <Link href={`/boms/${id}/match`} className="font-medium underline underline-offset-2">Open the match</Link>
        </p>
      ) : null}

      <section aria-label="Verdict" className="overflow-hidden rounded-xl border bg-card">
        <div className={cn("grid items-center gap-x-6 gap-y-4 p-5", view ? "md:grid-cols-[12rem_minmax(0,1fr)_auto] xl:grid-cols-[14rem_minmax(0,1fr)_auto]" : "md:grid-cols-[minmax(0,1fr)_auto]")}>
          {view ? (
            <Link href={`/boms/${id}/viewer`} aria-label="Open the board in 3D" className="group mx-auto block w-full max-w-56 rounded-lg bg-muted/60 p-3 outline-none transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
              <BoardIso revisionId={id} width={view.board.width} height={view.board.height} thickness={view.board.thickness} artwork={!!view.board.top} maskColor={view.board.maskColor} parts={view.parts.map((part) => ({ refDes: part.refDes, x: part.x, y: part.y, rotation: part.rotation, side: part.side, body: part.body, dnp: part.dnp, mark: part.marking ?? part.mpn }))} label={`${f.product?.name ?? f.title} in 3D`} className="transition-transform duration-200 group-hover:scale-[1.03]" />
              <span className="mt-1.5 block text-center text-[11px] text-muted-foreground">
                {n0(view.board.width)} × {n0(view.board.height)} mm · {view.board.layerCount} layers · {n0(placed)} parts
              </span>
            </Link>
          ) : null}
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground">{[f.product?.customer, f.product?.name ?? f.title].filter(Boolean).join(" · ")}</p>
            <h2 className="text-sm font-medium text-muted-foreground">Can we build it?</h2>
            <div className={cn("mt-1 flex items-center gap-2 text-3xl leading-tight font-semibold tracking-tight", tone.text)}>
              <VerdictIcon className="size-6 shrink-0" aria-hidden />
              <span>{v.label}</span>
              <Info label="About this answer">
                <p>{v.summary}</p>
              </Info>
            </div>
            <ul className="mt-3 flex flex-wrap gap-1.5 text-xs" aria-label="Checks">
              <li className="inline-flex h-7 items-center gap-1.5 rounded-md border bg-card px-2.5"><span className="size-2 rounded-full bg-risk-green" aria-hidden /><span className="num font-semibold">{v.greens}</span> OK</li>
              <li className={cn("inline-flex h-7 items-center gap-1.5 rounded-md border bg-card px-2.5", !v.ambers && "opacity-60")}><span className="size-2 rounded-full bg-risk-amber" aria-hidden /><span className="num font-semibold">{v.ambers}</span> to watch</li>
              <li className={cn("inline-flex h-7 items-center gap-1.5 rounded-md border bg-card px-2.5", !v.reds && "opacity-60")}><span className="size-2 rounded-full bg-risk-red" aria-hidden /><span className="num font-semibold">{v.reds}</span> blocker{v.reds === 1 ? "" : "s"}</li>
              <li className="inline-flex h-7 items-center gap-1.5 rounded-md border bg-card px-2.5"><Lock className="size-3 text-muted-foreground" aria-hidden /><span className="num font-semibold">{signed} of {f.gates.length}</span> gates signed{f.review?.passed ? " — review passed" : ""}</li>
            </ul>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">{f.review ? "Review qty" : "Qty"}</span>
              {(f.review ? [f.qty] : f.quantities).map((q) => (
                <Link
                  key={q}
                  href={sectionHref(id, "feasibility", { qty: String(q) })}
                  aria-current={q === f.qty ? "true" : undefined}
                  className={cn("num inline-flex h-8 items-center rounded-md border px-3 text-sm outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring", q === f.qty ? "border-primary bg-primary font-semibold text-primary-foreground" : "bg-card hover:bg-part-soft")}
                >
                  {qtyLabel(q)}
                </Link>
              ))}
            </div>
          </div>
          <Ring
            className="mx-auto size-28 lg:size-32"
            parts={[
              { key: "ok", value: v.greens, color: "var(--risk-green)" },
              { key: "watch", value: v.ambers, color: "var(--risk-amber)" },
              { key: "block", value: v.reds, color: "var(--risk-red)" },
            ]}
            center={checks ? `${Math.round((v.greens / checks) * 100)}%` : "—"}
            sub="checks OK"
            label={`${v.greens} checks OK, ${v.ambers} to watch, ${v.reds} blocker${v.reds === 1 ? "" : "s"}`}
          />
        </div>
        <div className="grid gap-px border-t bg-border sm:grid-cols-2 xl:grid-cols-4" aria-label="Key figures">
          <Kpi
            className="rounded-none border-0"
            icon={Grid3x3}
            label="Pins a board"
            value={n0(f.pinCount)}
            info={
              <p>
                {n0(j.total)} solder joints{j.doubled.parts ? `, ${n0(j.doubled.parts)} parts counted ×${ASSEMBLY.pins.doubleFactor}` : ""}
                {f.dnp.counted && f.dnp.parts ? `, ${n0(f.dnp.weighted)} DNP pins counted in` : ""} · {n0(j.smt.TOP.joints + j.smt.BOTTOM.joints)} SMT · {n0(j.tht.joints)} through-hole
                {j.pressFit.pins ? ` · ${n0(j.pressFit.pins)} press-fit pins` : ""} — {n0(j.total * f.qty)} in the lot.
              </p>
            }
          />
          <Kpi
            className="rounded-none border-0"
            icon={Droplet}
            label="Paste a board"
            value={f.paste.sides.length ? grams(f.paste.gramsPerBoard) : "—"}
            info={<p>{f.paste.sides.length ? `${grams(f.pasteLot.issueG)} to issue for the lot (${f.pasteLot.jars} × ${ASSEMBLY.paste.jarG} g jar${f.pasteLot.jars === 1 ? "" : "s"}) — ${f.paste.source ? PASTE_SOURCE_LABEL[f.paste.source] : ""}.` : "No surface-mount parts."}</p>}
          />
          <Kpi
            className="rounded-none border-0"
            icon={Banknote}
            label="Price a board"
            value={m.unit(f.quote.unitPrice)}
            info={<p>Ex-GST. {m.whole(f.quote.lotPrice)} the lot + {m.whole(f.quote.nreTotal)} one-off{f.quote.unpriced ? ` — ${f.quote.unpriced} lines not priced` : ""}.</p>}
          />
          <Kpi
            className="rounded-none border-0"
            icon={Clock}
            label={`Shifts for ${qtyLabel(f.qty)}`}
            value={n1(cap.totalShifts)}
            info={<p>{n1(cap.totalHours)} h of line time · {days} working day{days === 1 ? "" : "s"} on our shift pattern · {cap.hoursPerShift.toFixed(1)} productive hours a shift.</p>}
          />
        </div>
      </section>

      {plant ? <LineFitPanel plant={plant} canEdit={can(role, "lines.write")} /> : null}
      {pc ? <ProcessCheckPanel check={pc.check} revisionId={id} /> : null}

      <section aria-labelledby="gates" className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 id="gates" className="text-lg font-semibold tracking-tight">Gates</h2>
          <span className="inline-flex h-7 items-center gap-1.5 rounded-md border bg-card px-2.5 text-xs font-semibold">
            <Lock className="size-3 text-risk-green" aria-hidden /> <span className="num">{signed} of {f.gates.length}</span> signed
          </span>
          <Info label="About the gates">
            <p>A gate opens when the one before it is signed. A signed gate is locked: nothing in it can be changed or reopened.</p>
            {f.superseded ? <p className="text-xs text-muted-foreground">{f.superseded} earlier review{f.superseded === 1 ? " is" : "s are"} kept as superseded.</p> : null}
          </Info>
          {f.review && role === "ADMIN" ? <span className="ml-auto"><RestartReview revisionId={id} /></span> : null}
        </div>
        <GateStepper gates={f.gates} />
        <ol className="space-y-1.5">
          {f.gates.map((g) => (
            <Gate key={g.key} g={g} revisionId={id} qty={f.qty} canSign={canSign} canWaive={canWaive} />
          ))}
        </ol>
      </section>

      <section aria-labelledby="figures" className="space-y-2">
        <h2 id="figures" className="text-lg font-semibold tracking-tight">Figures</h2>
        <JointsFold {...p} />
        <PasteFold {...p} />
        <ShiftsFold {...p} />
        <CostFold {...p} />
        <SmtLineFold {...p} />
        <ConsumablesFold {...p} />
        <ExpensesFold {...p} />
      </section>
    </div>
  );
}
