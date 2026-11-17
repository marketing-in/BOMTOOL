import Link from "next/link";
import { ArrowRight, Banknote, Clock, Crosshair, Droplet, Factory, FlaskConical, TriangleAlert, Wallet } from "lucide-react";
import type { Feasibility } from "@/server/feasibility";
import { GROUP_LABEL, type CostGroup } from "@/lib/costing/quote";
import { PASTE_SOURCE_LABEL } from "@/lib/feasibility/paste";
import { EXPENSE_KIND_LABEL, type ExpenseKind } from "@/lib/costing/expenses";
import type { Level } from "@/lib/feasibility/gates";
import { ASSEMBLY } from "@/data/assembly";
import { moneyIn, qtyLabel } from "@/components/build/format";
import { cn } from "@/lib/utils";
import { Fold } from "@/components/viz/fold";
import { SegBar, type Seg } from "@/components/viz/seg-bar";
import { amount, grams, mg, n0, n1, p1 } from "./format";

/**
 * The figures behind "Can we build it?" (Phase 25): each a folded bar with its headline number and a small chart —
 * joints, paste, shifts, cost, the SMT line, consumables, and what we spend against what we charge. Opened, each
 * shows the same tables the page always had.
 */

type Money = ReturnType<typeof moneyIn>;
type P = { f: Feasibility; m: Money; id: string };

const GROUP_ORDER: CostGroup[] = ["board", "components", "box", "assembly", "test", "finish", "handling", "margin"];
const TONE: Record<Level, { text: string; dot: string }> = {
  green: { text: "text-risk-green", dot: "bg-risk-green" },
  amber: { text: "text-risk-amber", dot: "bg-risk-amber" },
  red: { text: "text-risk-red", dot: "bg-risk-red" },
};
const PALETTE = ["var(--cost-1)", "var(--cost-3)", "var(--cost-4)", "var(--cost-7)", "var(--cost-5)", "var(--cost-2)"];

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card px-4 py-2.5">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="num text-sm">{value}</dd>
    </div>
  );
}

function MoneyTile({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: Level }) {
  return (
    <div className="bg-card px-4 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("num mt-0.5 text-xl font-semibold tracking-tight", tone && TONE[tone].text)}>{value}</dd>
      <dd className="mt-0.5 text-xs text-muted-foreground">{hint}</dd>
    </div>
  );
}

export function JointsFold({ f }: P) {
  const j = f.joints;
  const segs: Seg[] = [
    { key: "aoi", label: "Seen by the camera (AOI)", value: j.inspection.aoiJoints, color: "var(--cost-1)" },
    { key: "xray", label: "Under the body (X-ray)", value: j.inspection.xrayJoints, color: "var(--cost-7)" },
    { key: "tht", label: "Through-hole", value: j.inspection.thtJoints, color: "var(--cost-4)" },
  ];
  return (
    <Fold id="joints" icon={Crosshair} title="Joints on one board" note={`${n0(j.placements)} placements · how each joint is inspected`} figure={`${n0(f.pinCount)} pins`} visual={<SegBar segs={segs} label="Joints by how they are inspected" legend={false} />}>
      <div className="px-4 py-3">
        <SegBar segs={segs} label="Joints by how they are inspected" thick />
      </div>
      <dl className="grid grid-cols-2 gap-px border-t bg-border sm:grid-cols-4">
        <Fact label="SPI — paste deposits" value={n0(j.inspection.spiDeposits)} />
        <Fact label="AOI — visible joints" value={n0(j.inspection.aoiJoints)} />
        <Fact label="X-ray — under the body" value={n0(j.inspection.xrayJoints)} />
        <Fact label="Through-hole joints" value={n0(j.inspection.thtJoints)} />
        <Fact label="SMT top / bottom" value={`${n0(j.smt.TOP.joints)} / ${n0(j.smt.BOTTOM.joints)}`} />
        <Fact label="Finest pitch" value={j.finestPitchMm ? `${j.finestPitchMm} mm` : "—"} />
        <Fact label="Probe nets (estimate)" value={`~${n0(j.inspection.probeNets)}`} />
        <Fact label="Holes drilled (Gerbers)" value={f.holes ? `${n0(f.holes.component)} lead · ${n0(f.holes.vias)} via` : "—"} />
        <Fact label={`Pin count, ×${ASSEMBLY.pins.doubleFactor} parts counted twice${f.dnp.counted ? ", DNP in" : ""}`} value={n0(f.pinCount)} />
        <Fact label="MOSFET · relay · connector · inductor" value={`${n0(j.doubled.byClass.mosfet ?? 0)} · ${n0(j.doubled.byClass.relay ?? 0)} · ${n0(j.doubled.byClass.connector ?? 0)} · ${n0(j.doubled.byClass.inductor ?? 0)}`} />
        <Fact label="DNP — not populated" value={f.dnp.parts ? `${n0(f.dnp.parts)} parts · ${n0(f.dnp.pins)} pins` : "None"} />
        <Fact label={f.dnp.counted ? "Pin count without DNP" : "Pin count if DNP were fitted"} value={n0(f.dnp.counted ? j.weighted : j.weighted + f.dnp.weighted)} />
      </dl>
      <div className="overflow-x-auto border-t">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-4 py-2 font-normal">Package</th>
              <th className="px-4 py-2 font-normal">Soldered by</th>
              <th className="px-4 py-2 text-right font-normal">Parts</th>
              <th className="px-4 py-2 text-right font-normal">Joints each</th>
              <th className="px-4 py-2 text-right font-normal">Pin count</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {j.byPackage.slice(0, 14).map((r, i) => (
              <tr key={`${r.mount}:${r.pkg}:${r.jointsEach}:${i}`}>
                <td className="px-4 py-1.5">
                  {r.pkg}
                  <span className="block max-w-[26ch] truncate text-xs text-muted-foreground">{r.refs.slice(0, 6).join(", ")}{r.refs.length > 6 ? ` +${r.refs.length - 6}` : ""}</span>
                </td>
                <td className="px-4 py-1.5 text-xs text-muted-foreground">{r.mount === "SMT" ? (r.hidden ? "Reflow — X-ray" : "Reflow — AOI") : r.mount === "THT" ? "Wave / selective" : "Press-fit, no solder"}</td>
                <td className="num px-4 py-1.5 text-right">{n0(r.parts)}</td>
                <td className="num px-4 py-1.5 text-right">{r.jointsEach}</td>
                <td className="num px-4 py-1.5 text-right font-medium">
                  {n0(r.joints * r.factor)}
                  {r.factor > 1 ? <span className="ml-1 rounded-sm bg-risk-amber-soft px-1 text-[11px] font-normal text-foreground dark:bg-risk-amber/20">×{r.factor}</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {j.byPackage.length > 14 ? <p className="border-t px-4 py-2 text-xs text-muted-foreground">and {j.byPackage.length - 14} more packages with {n0(j.byPackage.slice(14).reduce((s, r) => s + r.joints * r.factor, 0))} pins.</p> : null}
      {f.dnp.parts ? (
        <p className="border-t px-4 py-2 text-xs text-muted-foreground">
          DNP — not bought, placed or soldered{f.dnp.counted ? ", but their pins are in the pin count" : ""}: <span className="num text-foreground">{f.dnp.refs.slice(0, 12).join(", ")}{f.dnp.refs.length > 12 ? ` +${f.dnp.refs.length - 12}` : ""}</span>
          {f.dnp.pasteG > 0 ? (f.dnp.printed ? <> Their pads are printed: about {mg(f.dnp.pasteG)} of the paste a board.</> : <> Their pads would take another {mg(f.dnp.pasteG)} of paste a board.</>) : null}
        </p>
      ) : null}
    </Fold>
  );
}

export function PasteFold({ f, m }: P) {
  const j = f.joints;
  const heavy = { parts: f.paste.sides.reduce((s, p) => s + p.heavyParts, 0), grams: f.paste.sides.reduce((s, p) => s + p.heavyExtraG, 0) };
  const top = f.pasteByPackage.slice(0, 5);
  const rest = f.pasteByPackage.slice(5).reduce((s, r) => s + r.grams, 0);
  const segs: Seg[] = [
    ...top.map((r, i) => ({ key: r.pkg, label: r.pkg, value: r.grams, color: PALETTE[i % PALETTE.length], text: mg(r.grams) })),
    ...(rest > 0 ? [{ key: "rest", label: "Other packages", value: rest, color: "var(--risk-grey)", text: mg(rest) }] : []),
  ];
  const has = f.paste.sides.length > 0;
  return (
    <Fold
      id="paste"
      icon={Droplet}
      title="Solder paste and solder"
      note={has ? `${grams(f.pasteLot.issueG)} to issue for the lot · ${f.pasteLot.jars} × ${ASSEMBLY.paste.jarG} g jar${f.pasteLot.jars === 1 ? "" : "s"}` : "No surface-mount parts, so no paste"}
      figure={has ? `${grams(f.paste.gramsPerBoard)} a board` : "—"}
      visual={segs.length ? <SegBar segs={segs} label="Where the paste goes, by package" legend={false} /> : undefined}
    >
      {has ? (
        <>
          {segs.length ? (
            <div className="px-4 py-3">
              <SegBar segs={segs} label="Where the paste goes on one board, by package" thick />
            </div>
          ) : null}
          <div className="overflow-x-auto border-t">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="px-4 py-2 font-normal">Side</th>
                  <th className="px-4 py-2 text-right font-normal">Apertures</th>
                  <th className="px-4 py-2 text-right font-normal">Area, mm²</th>
                  <th className="px-4 py-2 text-right font-normal">Stencil</th>
                  <th className="px-4 py-2 text-right font-normal">Volume, mm³</th>
                  <th className="px-4 py-2 text-right font-normal">Paste</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {f.paste.sides.map((s) => (
                  <tr key={s.side}>
                    <td className="px-4 py-1.5">
                      {s.side === "TOP" ? "Top" : "Bottom"}
                      <span className="block text-xs text-muted-foreground">{PASTE_SOURCE_LABEL[s.source]}</span>
                    </td>
                    <td className="num px-4 py-1.5 text-right">{n0(s.apertures)}</td>
                    <td className="num px-4 py-1.5 text-right">{n1(s.areaMm2)}</td>
                    <td className="num px-4 py-1.5 text-right">{s.stencilUm} µm</td>
                    <td className="num px-4 py-1.5 text-right">{n1(s.volumeMm3)}</td>
                    <td className="num px-4 py-1.5 text-right font-medium">{grams(s.grams)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="grid grid-cols-2 gap-px border-t bg-border sm:grid-cols-4">
            <Fact label="Paste on one board" value={grams(f.paste.gramsPerBoard)} />
            <Fact label={`Paste on one panel of ${f.panel.boards}`} value={grams(f.paste.gramsPerBoard * f.panel.boards)} />
            <Fact label={`Panel ${f.panel.cols} × ${f.panel.rows}${f.panel.rotated ? ", board turned" : ""}`} value={`${f.panel.lengthMm} × ${f.panel.widthMm} mm · ${n0(f.panels)} panels`} />
            <Fact label="Double paste: inductors, connectors" value={heavy.parts ? `${n0(heavy.parts)} parts · +${mg(heavy.grams)}` : "None on this board"} />
            <Fact label={`Printed on ${qtyLabel(f.qty)}`} value={grams(f.pasteLot.printedG)} />
            <Fact label={`Wipes and misprints, ${ASSEMBLY.paste.wipeLossPct} %`} value={grams(f.pasteLot.wipeG)} />
            <Fact label="Left on the stencils" value={grams(f.pasteLot.beadG)} />
            <Fact label="To issue from stores" value={`${grams(f.pasteLot.issueG)} · ${m.whole(f.pasteLot.cost)}`} />
          </dl>
        </>
      ) : (
        <p className="px-4 py-3 text-sm text-muted-foreground">No surface-mount parts, so no paste.</p>
      )}
      {f.pasteByPackage.length ? (
        <div className="overflow-x-auto border-t">
          <table className="w-full min-w-[520px] text-sm">
            <caption className="px-4 pt-3 pb-1 text-left text-xs text-muted-foreground">Where the paste goes on one board, by component package</caption>
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="px-4 py-2 font-normal">Package</th>
                <th className="px-4 py-2 text-right font-normal">Parts</th>
                <th className="px-4 py-2 text-right font-normal">Paste each</th>
                <th className="px-4 py-2 text-right font-normal">Paste a board</th>
                <th className="px-4 py-2 text-right font-normal">Lot</th>
                <th className="w-28 px-4 py-2 font-normal">Share</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {f.pasteByPackage.slice(0, 10).map((r) => (
                <tr key={r.pkg}>
                  <td className="px-4 py-1.5">
                    {r.pkg}
                    <span className="block max-w-[26ch] truncate text-xs text-muted-foreground">{r.refs.slice(0, 6).join(", ")}{r.refs.length > 6 ? ` +${r.refs.length - 6}` : ""}</span>
                  </td>
                  <td className="num px-4 py-1.5 text-right">{n0(r.parts)}</td>
                  <td className="num px-4 py-1.5 text-right">{mg(r.gramsEach)}</td>
                  <td className="num px-4 py-1.5 text-right font-medium">{mg(r.grams)}</td>
                  <td className="num px-4 py-1.5 text-right">{grams(r.grams * f.qty)}</td>
                  <td className="px-4 py-1.5">
                    <span className="flex items-center gap-2">
                      <span className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                        <span className="block h-full rounded-full bg-primary/70" style={{ width: `${r.sharePct}%` }} />
                      </span>
                      <span className="num w-9 text-right text-xs text-muted-foreground">{Math.round(r.sharePct)} %</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {f.pasteByPackage.length > 10 ? <p className="border-t px-4 py-2 text-xs text-muted-foreground">and {f.pasteByPackage.length - 10} more packages with {mg(f.pasteByPackage.slice(10).reduce((s, r) => s + r.grams, 0))} between them.</p> : null}
        </div>
      ) : null}
      {j.tht.joints ? (
        <p className="border-t px-4 py-3 text-sm">
          Wave / selective solder: <span className="num">{grams(f.solderLot.perBoardG)}</span> a board, <span className="num">{grams(f.solderLot.lotG)}</span> of bar for the lot with dross
          <span className="text-muted-foreground"> — about {m.whole(f.solderLot.cost)}.</span>
        </p>
      ) : null}
      <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
        Aperture area × stencil thickness × {Math.round(ASSEMBLY.paste.transfer * 100)} % transfer × {ASSEMBLY.paste.densityGPerCm3} g/cm³
      </p>
    </Fold>
  );
}

export function ShiftsFold({ f }: P) {
  const j = f.joints;
  const cap = f.capacity;
  const maxHours = Math.max(0.01, ...cap.stages.map((s) => s.hours));
  const days = Math.max(1, Math.ceil(cap.days));
  const segs: Seg[] = cap.stages.map((s, i) => ({ key: s.key, label: s.label, value: s.hours, color: PALETTE[i % PALETTE.length], text: `${n1(s.hours)} h` }));
  return (
    <Fold id="capacity" icon={Clock} title={`Shifts — ${qtyLabel(f.qty)} through our lines`} note={`${n1(cap.totalHours)} h of line time · ${days} working day${days === 1 ? "" : "s"}`} figure={`${n1(cap.totalShifts)} shifts`} visual={<SegBar segs={segs} label="Line time by stage" legend={false} />}>
      <p className="px-4 py-2 text-xs text-muted-foreground">
        {n0(j.placements + j.tht.parts + j.pressFit.parts)} components a board{f.smtLine ? ` · SMT on ${f.smtLine.code} (${f.smtLine.name})` : ""} · {ASSEMBLY.shift.hours} h shift, {Math.round(ASSEMBLY.shift.productive * 100)} % productive
      </p>
      <ol className="divide-y border-t">
        {cap.stages.map((s) => (
          <li key={s.key} className="grid grid-cols-[minmax(0,1fr)_5.5rem_5rem] items-center gap-3 px-4 py-2">
            <span className="min-w-0">
              <span className="flex items-baseline gap-2 text-sm">
                <span className="truncate">{s.label}</span>
                {s.line ? <span className="num shrink-0 text-[11px] text-muted-foreground">{s.line} · {s.shiftsPerDay} shift{s.shiftsPerDay === 1 ? "" : "s"}/day</span> : null}
                {s.key === cap.bottleneck ? <span className="shrink-0 rounded-sm bg-risk-amber-soft px-1.5 text-[11px] text-foreground dark:bg-risk-amber/20">longest</span> : null}
              </span>
              <span className="block truncate text-xs text-muted-foreground">{s.note}</span>
              <span className="mt-1 block h-1 overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full bg-primary/70" style={{ width: `${(s.hours / maxHours) * 100}%` }} />
              </span>
            </span>
            <span className="num text-right text-sm">{n1(s.hours)} h</span>
            <span className="num text-right text-sm font-medium">{n1(s.shifts)} sh</span>
          </li>
        ))}
      </ol>
      <dl className="grid grid-cols-3 gap-px border-t bg-border">
        {cap.daysAt.map((d) => (
          <Fact key={d.shiftsPerDay} label={`Working ${d.shiftsPerDay} shift${d.shiftsPerDay === 1 ? "" : "s"} a day`} value={`${Math.max(1, Math.ceil(d.days))} day${Math.ceil(d.days) > 1 ? "s" : ""}`} />
        ))}
      </dl>
      <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
        Material first: about {Math.ceil(f.facts.capacity.materialLeadDays / 7)} week{Math.ceil(f.facts.capacity.materialLeadDays / 7) === 1 ? "" : "s"}{f.build.leadDriver ? ` (${f.build.leadDriver})` : ""}.
      </p>
    </Fold>
  );
}

export function CostFold({ f, m, id }: P) {
  const consumables = f.facts.cost.pastePerBoard;
  const groups = GROUP_ORDER.filter((g) => f.quote.byGroup[g] > 0);
  const segs: Seg[] = groups.map((g) => ({ key: g, label: GROUP_LABEL[g], value: f.quote.byGroup[g], color: `var(--cost-${GROUP_ORDER.indexOf(g) + 1})`, text: m.unit(f.quote.byGroup[g]) }));
  return (
    <Fold id="cost" icon={Banknote} title={`Cost of one board at ${qtyLabel(f.qty)}`} note={`${m.whole(f.quote.lotPrice)} the lot + ${m.whole(f.quote.nreTotal)} one-off, ex-GST`} figure={m.unit(f.quote.unitPrice)} visual={<SegBar segs={segs} label="Cost of one board by group" legend={false} />}>
      <div className="px-4 py-3">
        <SegBar segs={segs} label="Cost of one board by group" thick />
        {consumables > 0 ? <p className="mt-2 text-xs text-muted-foreground">Assembly includes solder paste {m.unit(consumables)}.</p> : null}
      </div>
      <div className="flex items-center justify-between gap-3 border-t px-4 py-2 text-sm font-medium">
        <span>Price a board, ex-GST</span>
        <span className="num">{m.unit(f.quote.unitPrice)}</span>
      </div>
      <dl className="grid grid-cols-2 gap-px border-t bg-border sm:grid-cols-4">
        <Fact label="Lot" value={m.whole(f.quote.lotPrice)} />
        <Fact label="One-off (NRE)" value={m.whole(f.quote.nreTotal)} />
        <Fact label={`GST ${f.build.rates.gstPct} %`} value={m.whole(f.quote.gst)} />
        <Fact label="Total to the client" value={m.whole(f.quote.total)} />
      </dl>
      <p className="border-t px-4 py-2.5 text-xs">
        <Link href={`/boms/${id}/build/quote`} className="inline-flex items-center gap-1 font-medium underline decoration-border hover:decoration-foreground">
          Build &amp; quote <ArrowRight className="size-3" aria-hidden />
        </Link>
      </p>
    </Fold>
  );
}

export function SmtLineFold({ f, id }: P) {
  const sheet = f.smtSheet;
  if (!sheet) return null;
  return (
    <Fold id="smt-line" icon={Factory} title={`SMT line, station by station${sheet.line ? ` — ${sheet.line}` : ""}`} note={`${n0(sheet.panels)} panels of ${sheet.panel.boards} · ${n1(sheet.runHours)} h running + ${n1(sheet.setupHours)} h set-up`} figure={`${n0(sheet.boardsPerShift)} a shift`}>
      <dl className="grid grid-cols-2 gap-px bg-border lg:grid-cols-4">
        <Fact label="Paste a board / a panel" value={`${mg(sheet.pasteGPerBoard)} / ${mg(sheet.pasteGPerPanel)}`} />
        <Fact label={`Panels for ${qtyLabel(f.qty)}`} value={`${n0(sheet.panels)} × ${sheet.panel.boards} boards`} />
        <Fact label="Line running time, plus set-up" value={`${n1(sheet.runHours)} h + ${n1(sheet.setupHours)} h`} />
        <Fact label="Finished boards a shift" value={n0(sheet.boardsPerShift)} />
      </dl>
      {sheet.sides.map((side) => (
        <div key={side.side} className="border-t">
          <div className="flex flex-wrap items-baseline justify-between gap-2 bg-muted/40 px-4 py-2">
            <h3 className="text-xs font-medium">
              {sheet.sides.length > 1 ? `Pass ${side.pass} — ${side.side === "TOP" ? "top" : "bottom"} side` : `${side.side === "TOP" ? "Top" : "Bottom"} side`} · {n0(side.placements)} placements
            </h3>
            <span className="num text-xs text-muted-foreground">
              One panel every {n0(side.taktSec)} s — {n1(side.panelsPerHour)} panels, {n0(side.boardsPerHour)} boards an hour · slowest: {side.bottleneck}
            </span>
          </div>
          <ol className="divide-y">
            {side.stations.map((st, i) => (
              <li key={st.key} className="grid gap-x-4 gap-y-2 px-4 py-3 lg:grid-cols-[14rem_minmax(0,1fr)]">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn("grid size-6 shrink-0 place-items-center rounded-md text-[11px] font-medium text-white", TONE[st.level].dot)}>{i + 1}</span>
                    <span className="text-sm font-medium">{st.name}</span>
                  </div>
                  <div className="num mt-1 pl-8 text-xs text-muted-foreground">
                    {st.secPerPanel !== null ? `${n0(st.secPerPanel)} s a panel` : ""}
                    {st.inline ? "" : " · beside the line"}
                    {st.name === side.bottleneck ? <span className="ml-1.5 rounded-sm bg-risk-amber-soft px-1.5 text-[11px] text-foreground dark:bg-risk-amber/20">sets the pace</span> : null}
                  </div>
                  {st.inline && st.secPerPanel !== null ? (
                    <span className="mt-1.5 ml-8 block h-1 overflow-hidden rounded-full bg-muted">
                      <span className="block h-full rounded-full bg-primary/70" style={{ width: `${Math.min(100, (st.secPerPanel / side.taktSec) * 100)}%` }} />
                    </span>
                  ) : null}
                </div>
                <div className="min-w-0">
                  <p className="text-sm">{st.what}</p>
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3 xl:grid-cols-5">
                    {st.figures.map((fg) => (
                      <div key={fg.label} className="min-w-0">
                        <dt className="text-[11px] text-muted-foreground">{fg.label}</dt>
                        <dd className="num text-sm">{fg.value}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-2 text-xs text-muted-foreground">{st.settings.join(" · ")}</p>
                  {st.watch.map((w) => (
                    <p key={w} className="mt-1.5 flex items-start gap-1.5 text-xs">
                      <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-risk-amber" aria-hidden />
                      <span>{w}</span>
                    </p>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        </div>
      ))}
      <p className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t px-4 py-2.5 text-xs text-muted-foreground">
        <span title="Station times and the reflow profile are plant settings, not readings from the machines.">Plant settings, not machine readings</span>
        <Link href={`/boms/${id}/line`} className="inline-flex items-center gap-1 font-medium underline decoration-border hover:decoration-foreground">
          Watch the line run <ArrowRight className="size-3" aria-hidden />
        </Link>
      </p>
    </Fold>
  );
}

export function ConsumablesFold({ f, m }: P) {
  const priced = f.consumables.reduce((s, c) => s + (c.cost ?? 0), 0);
  return (
    <Fold
      id="consumables"
      icon={FlaskConical}
      title={`Consumables — what ${qtyLabel(f.qty)} use up`}
      note={f.coating ? (f.masked.length ? `Masking: ${f.masked.length} parts a board before coating` : "Coated, nothing to mask") : "No coating, so no masking"}
      figure={priced > 0 ? m.whole(priced) : `${f.consumables.length} items`}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-4 py-2 font-normal">Consumable</th>
              <th className="px-4 py-2 text-right font-normal">A board</th>
              <th className="px-4 py-2 text-right font-normal">A panel of {f.panel.boards}</th>
              <th className="px-4 py-2 text-right font-normal">The lot</th>
              <th className="px-4 py-2 text-right font-normal">Cost</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {f.consumables.map((c) => (
              <tr key={c.key}>
                <td className="px-4 py-1.5">
                  {c.label}
                  <span className="block text-xs text-muted-foreground">{c.note}</span>
                </td>
                <td className="num px-4 py-1.5 text-right">{amount(c.perBoard, c.unit)}</td>
                <td className="num px-4 py-1.5 text-right">{amount(c.perBoard * f.panel.boards, c.unit)}</td>
                <td className="num px-4 py-1.5 text-right font-medium">{amount(c.lot, c.unit)}</td>
                <td className="num px-4 py-1.5 text-right">{c.cost === null ? <span className="text-muted-foreground">no rate on file</span> : m.whole(c.cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {f.masked.length ? <p className="border-t px-4 py-2 text-xs text-muted-foreground">Masked before coating: <span className="num text-foreground">{f.masked.slice(0, 16).join(", ")}{f.masked.length > 16 ? ` +${f.masked.length - 16}` : ""}</span></p> : null}
    </Fold>
  );
}

export function ExpensesFold({ f, m }: P) {
  const x = f.expenses.find((e) => e.qty === f.qty) ?? f.expenses[0];
  if (!x) return null;
  const pctOf = (perBoard: number) => (x.perBoard.price > 0 ? (perBoard / x.perBoard.price) * 100 : 0);
  const work = pctOf(x.perBoard.consumables + x.perBoard.process);
  const segs: Seg[] = [
    { key: "material", label: "Material", value: x.materialPctOfPrice, color: "var(--cost-2)", text: p1(x.materialPctOfPrice) },
    { key: "work", label: "Consumables and line work", value: work, color: "var(--cost-4)", text: p1(work) },
    { key: "handling", label: "Handling", value: pctOf(x.perBoard.handling), color: "var(--cost-7)", text: p1(pctOf(x.perBoard.handling)) },
    { key: "margin", label: "Margin", value: x.marginPctOfPrice, color: "var(--risk-green)", text: p1(x.marginPctOfPrice) },
  ];
  const keptTone: Level = x.keptLot <= 0 ? "red" : x.keptPct < 8 ? "amber" : "green";
  return (
    <Fold
      id="expenses"
      icon={Wallet}
      title={`What we spend and what we charge — ${qtyLabel(f.qty)}`}
      note={`Spend ${m.whole(x.lot.spend + x.unchargedLot)} · charge ${m.whole(x.lot.price)}, ex-GST`}
      figure={<span className={TONE[keptTone].text}>{p1(x.keptPct)} left</span>}
      visual={<SegBar segs={segs} label="Of the price" legend={false} />}
    >
      <dl className="grid grid-cols-2 gap-px bg-border lg:grid-cols-4">
        <MoneyTile label="We spend on the lot" value={m.whole(x.lot.spend + x.unchargedLot)} hint={`${m.unit(x.perBoard.spend + x.unchargedLot / x.qty)} a board — material ${p1(x.materialPctOfPrice)} of the price`} />
        <MoneyTile label="We charge for the lot" value={m.whole(x.lot.price)} hint={`${m.unit(x.perBoard.price)} a board, plus ${m.whole(x.nre)} one-off at cost`} />
        <MoneyTile label="Left after expenses" value={m.whole(x.keptLot)} hint={`${p1(x.keptPct)} of the price: margin ${m.whole(x.lot.margin)} + handling allowance ${m.whole(x.lot.handling)}${x.unchargedLot ? ` − ${m.whole(x.unchargedLot)} not charged` : ""}`} tone={keptTone} />
        <MoneyTile label="Paid out before we are paid" value={m.whole(x.cashOut)} hint="Material and one-off tooling bought ahead of delivery" />
      </dl>
      <div className="border-t px-4 py-3">
        <SegBar segs={segs} label="Of the price" thick />
      </div>
      <div className="overflow-x-auto border-t">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-4 py-2 font-normal">Expense</th>
              <th className="px-4 py-2 text-right font-normal">A board</th>
              <th className="px-4 py-2 text-right font-normal">The lot</th>
              <th className="px-4 py-2 text-right font-normal">Of the price</th>
            </tr>
          </thead>
          {(Object.keys(EXPENSE_KIND_LABEL) as ExpenseKind[]).map((k) => {
            const rows = x.lines.filter((l) => l.kind === k);
            if (!rows.length) return null;
            const sub = rows.reduce((s, l) => s + l.perBoard, 0);
            return (
              <tbody key={k} className="divide-y border-b">
                <tr className="bg-muted/40">
                  <th scope="rowgroup" className="px-4 py-1.5 text-left text-xs font-medium">{EXPENSE_KIND_LABEL[k]}</th>
                  <td className="num px-4 py-1.5 text-right text-xs font-medium">{m.unit(sub)}</td>
                  <td className="num px-4 py-1.5 text-right text-xs font-medium">{m.whole(sub * x.qty)}</td>
                  <td className="num px-4 py-1.5 text-right text-xs font-medium">{p1(pctOf(sub))}</td>
                </tr>
                {rows.map((l) => (
                  <tr key={l.key}>
                    <td className="py-1.5 pr-4 pl-7">{l.label}</td>
                    <td className="num px-4 py-1.5 text-right">{m.unit(l.perBoard)}</td>
                    <td className="num px-4 py-1.5 text-right">{m.whole(l.lot)}</td>
                    <td className="num px-4 py-1.5 text-right text-muted-foreground">{p1(l.pctOfPrice)}</td>
                  </tr>
                ))}
              </tbody>
            );
          })}
          <tbody className="divide-y">
            {x.uncharged.map((u) => (
              <tr key={u.key}>
                <td className="px-4 py-1.5">{u.label} <span className="text-xs text-risk-amber">— not in the price</span></td>
                <td className="num px-4 py-1.5 text-right">{m.unit(u.lot / x.qty)}</td>
                <td className="num px-4 py-1.5 text-right">{m.whole(u.lot)}</td>
                <td className="num px-4 py-1.5 text-right text-muted-foreground">{p1(pctOf(u.lot / x.qty))}</td>
              </tr>
            ))}
            <tr>
              <td className="px-4 py-1.5">Handling allowance <span className="text-xs text-muted-foreground">— stores, incoming inspection, scrap</span></td>
              <td className="num px-4 py-1.5 text-right">{m.unit(x.perBoard.handling)}</td>
              <td className="num px-4 py-1.5 text-right">{m.whole(x.lot.handling)}</td>
              <td className="num px-4 py-1.5 text-right text-muted-foreground">{p1(pctOf(x.perBoard.handling))}</td>
            </tr>
            <tr>
              <td className="px-4 py-1.5">Margin</td>
              <td className="num px-4 py-1.5 text-right">{m.unit(x.perBoard.margin)}</td>
              <td className="num px-4 py-1.5 text-right">{m.whole(x.lot.margin)}</td>
              <td className="num px-4 py-1.5 text-right text-muted-foreground">{p1(x.marginPctOfPrice)}</td>
            </tr>
            <tr className="font-medium">
              <td className="px-4 py-2">Price to the customer, ex-GST</td>
              <td className="num px-4 py-2 text-right">{m.unit(x.perBoard.price)}</td>
              <td className="num px-4 py-2 text-right">{m.whole(x.lot.price)}</td>
              <td className="num px-4 py-2 text-right">100 %</td>
            </tr>
          </tbody>
        </table>
      </div>
      <dl className="grid grid-cols-2 gap-px border-t bg-border lg:grid-cols-4">
        <Fact label="Invoice: lot + one-off" value={m.whole(x.invoice)} />
        <Fact label={`With GST ${f.build.rates.gstPct} %`} value={m.whole(x.total)} />
        {x.whatIf.map((w) => (
          <Fact key={w.materialUpPct} label={`Left if material costs ${w.materialUpPct} % more`} value={`${m.whole(w.keptLot)} · ${p1(w.keptPct)}`} />
        ))}
      </dl>
      {f.expenses.length > 1 ? (
        <div className="overflow-x-auto border-t">
          <table className="w-full min-w-[640px] text-sm">
            <caption className="px-4 pt-3 pb-1 text-left text-xs text-muted-foreground">The same product at each quoted quantity</caption>
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="px-4 py-2 font-normal">Quantity</th>
                <th className="px-4 py-2 text-right font-normal">We spend a board</th>
                <th className="px-4 py-2 text-right font-normal">Price a board</th>
                <th className="px-4 py-2 text-right font-normal">Left a board</th>
                <th className="px-4 py-2 text-right font-normal">Left on the lot</th>
                <th className="px-4 py-2 text-right font-normal">Of the price</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {f.expenses.map((e) => (
                <tr key={e.qty} className={cn(e.qty === f.qty && "bg-muted/40 font-medium")}>
                  <td className="num px-4 py-1.5">{qtyLabel(e.qty)}</td>
                  <td className="num px-4 py-1.5 text-right">{m.unit(e.perBoard.spend + e.unchargedLot / e.qty)}</td>
                  <td className="num px-4 py-1.5 text-right">{m.unit(e.perBoard.price)}</td>
                  <td className="num px-4 py-1.5 text-right">{m.unit(e.keptLot / e.qty)}</td>
                  <td className="num px-4 py-1.5 text-right">{m.whole(e.keptLot)}</td>
                  <td className="num px-4 py-1.5 text-right">{p1(e.keptPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
        {x.breakEvenMaterialUpPct !== null ? `Material would have to cost ${p1(x.breakEvenMaterialUpPct)} more before this lot makes nothing. ` : ""}
        {x.unpriced ? `${x.unpriced} line${x.unpriced === 1 ? " has" : "s have"} no price, so the real spend is higher. ` : ""}
        Line rates are plant estimates.
      </p>
    </Fold>
  );
}
