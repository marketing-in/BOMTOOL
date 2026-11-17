import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, Check, Crosshair, Drill, Globe, LayoutGrid, Layers, LibraryBig, MoveVertical, Paintbrush, Ruler, Scan, Scissors, Sparkles, Warehouse, Weight, X, type LucideIcon } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getDisplayCurrency } from "@/lib/prefs";
import { getBuild, type FabOption } from "@/server/build";
import { finishInfo, laminateFor } from "@/lib/costing/pcb";
import { pcbTechnology } from "@/knowledge/pcb-technologies";
import { ViewerLoader } from "@/components/viewer/viewer-loader";
import { BuildHeader } from "@/components/build/build-header";
import { ChooseButton, FabQuoteForm } from "@/components/build/choose-button";
import { CompareBars } from "@/components/build/bars";
import { moneyIn, qtyLabel } from "@/components/build/format";
import { Fold } from "@/components/viz/fold";
import { Info } from "@/components/viz/info";
import { BREAKAWAY_LABEL } from "@/lib/board/panel";
import { cn } from "@/lib/utils";


export default async function BareBoardSection({ id }: { id: string }) {
  const user = await requireUser();
  const [b, currency] = await Promise.all([getBuild(id), getDisplayCurrency()]);
  if (!b) notFound();
  const m = moneyIn(currency);
  const edit = can(user.role, "bom.write");
  const f = b.board.facts;
  const tech = pcbTechnology(b.board.technology.slug);
  const laminate = laminateFor(f.material);
  const finish = finishInfo(f.finish);
  const all = [...b.board.fabs, ...b.board.online];
  const panel = b.viewer.board.fab?.panel ?? null;
  const perBoardAtRef = (o: FabOption) => {
    const p = o.prices.find((x) => x.qty === b.refQty);
    return p?.unit === null || !p ? null : p.unit + p.nre / b.refQty;
  };

  return (
    <>
      <BuildHeader b={b} current="board" currency={currency} section />

      <section aria-label="The bare board in 3D">
        <ViewerLoader data={b.viewer} initialMode="bare" compact />
      </section>
      {panel ? (
        <section aria-label="The panel these Gerbers came as" className="mt-6 rounded-xl border bg-card p-5">
          <div className="flex items-center gap-1">
            <h3 className="text-base font-semibold">Came as a panel</h3>
            <Info label="About the panel">
              <p>The Gerbers drew the whole fabrication panel. One board was cut out of every layer, and everything on this BoM is measured on that one board.</p>
              <p>Rails are the waste strips the line&apos;s conveyor holds. Tooling holes and fiducials locate the panel in each machine. The boards are broken out after assembly.</p>
            </Info>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-8 gap-y-4">
            <svg viewBox={`0 0 ${panel.size.width} ${panel.size.height}`} role="img" aria-label={`Panel of ${panel.count} boards, ${panel.columns} across and ${panel.rows} up`} className="h-28 w-auto max-w-[45%] shrink-0 rounded-sm bg-muted">
              {Array.from({ length: panel.rows }, (_, r) =>
                Array.from({ length: panel.columns }, (_, c) => (
                  <rect key={`${r}-${c}`} x={panel.rails.left + (panel.gap.x && panel.rails.left ? panel.gap.x : 0) + c * panel.pitch.x} y={panel.rails.top + (panel.gap.y && panel.rails.top ? panel.gap.y : 0) + r * panel.pitch.y} width={panel.unit.width} height={panel.unit.height} className={r === panel.rows - 1 && c === 0 ? "fill-primary" : "fill-primary/35"} />
                )),
              )}
            </svg>
            <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
              {(
                [
                  [LayoutGrid, "Boards", `${panel.count}`, `${panel.columns} × ${panel.rows}`],
                  [Ruler, "Panel", `${panel.size.width.toFixed(0)} × ${panel.size.height.toFixed(0)} mm`, `${panel.gap.x || panel.gap.y ? `${Math.max(panel.gap.x, panel.gap.y)} mm between boards` : "boards share edges"}`],
                  [MoveVertical, "Rails", `${Math.max(panel.rails.top, panel.rails.bottom, panel.rails.left, panel.rails.right)} mm`, [panel.rails.top || panel.rails.bottom ? "top and bottom" : null, panel.rails.left || panel.rails.right ? "left and right" : null].filter(Boolean).join(", ") || "none"],
                  [Scissors, "Break-off", BREAKAWAY_LABEL[panel.breakaway], panel.mouseBites ? `${panel.mouseBites.toLocaleString("en-IN")} holes` : ""],
                  [Drill, "Tooling holes", `${panel.toolingHoles}`, ""],
                  [Crosshair, "Fiducials", `${panel.fiducials}`, "on the rails"],
                ] as [LucideIcon, string, string, string][]
              ).map(([Icon, k, v, note]) => (
                <div key={k} className="flex items-start gap-2">
                  <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div>
                    <dd className="num text-sm font-semibold">{v}</dd>
                    <dt className="text-xs text-muted-foreground">{k}{note ? ` · ${note}` : ""}</dt>
                  </div>
                </div>
              ))}
            </dl>
          </div>
        </section>
      ) : null}
      <section aria-label="This board" className="mt-6">
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-4 xl:grid-cols-8">
          {(
            [
              [Ruler, "Size", `${f.widthMm.toFixed(1)} × ${f.heightMm.toFixed(1)} mm`],
              [Scan, "Area", `${b.board.areaCm2.toFixed(0)} cm²`],
              [Layers, "Layers", String(f.layers)],
              [MoveVertical, "Thickness", `${f.thicknessMm} mm`],
              [Weight, "Copper", `${f.copperOz ?? 1} oz`],
              [Sparkles, "Finish", String(f.finish)],
              [Paintbrush, "Mask / silk", `${f.mask} / ${f.silk}`],
              [BadgeCheck, "IPC class", `${f.ipcClass ?? 2}${f.ipcClass ? "" : " (assumed)"}`],
            ] as [LucideIcon, string, string][]
          ).map(([Icon, k, v]) => (
            <div key={k} className="bg-card px-4 py-3.5">
              <dd className="text-base leading-tight font-semibold tabular-nums">{v}</dd>
              <dt className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Icon className="size-3.5" aria-hidden />
                {k}
              </dt>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">
          {f.source === "gerber" ? "From the Gerbers" : "From the project spec"} ·{" "}
          <Link href={`/boms/${id}/board`} className="underline decoration-border hover:decoration-foreground">Gerbers &amp; centroid</Link>
        </p>
      </section>

      <Fold className="mt-3" icon={LibraryBig} title="In the directory" note={[b.board.technology.name, laminate?.name, finish?.name].filter(Boolean).join(" · ")}>
          <ul className="divide-y text-sm">
            <li className="px-4 py-3">
              <span className="block text-xs text-muted-foreground">PCB technology</span>
              <Link href={`/directory/pcb?t=${b.board.technology.slug}#${b.board.technology.slug}`} className="font-medium hover:underline">{b.board.technology.name}</Link>
              {b.board.technology.also.length ? <span className="block text-xs text-muted-foreground">also {b.board.technology.also.join(", ")}</span> : null}
              {tech ? <span className="mt-1 block text-xs text-muted-foreground">{tech.summary} Cost ×{tech.costIndex} of a 2-layer board; {tech.leadDays.proto} d proto, {tech.leadDays.production} d production.</span> : null}
            </li>
            {laminate ? (
              <li className="px-4 py-3">
                <span className="block text-xs text-muted-foreground">Laminate{f.material ? ` (${f.material})` : " (assumed)"}</span>
                <Link href="/directory/pcb?view=laminates" className="font-medium hover:underline">{laminate.name}</Link>
                <span className="num mt-1 block text-xs text-muted-foreground">Tg {laminate.tg ?? "—"} °C · Td {laminate.td ?? "—"} °C · Dk {laminate.dk} · cost ×{laminate.cost}</span>
              </li>
            ) : null}
            {finish ? (
              <li className="px-4 py-3">
                <span className="block text-xs text-muted-foreground">Surface finish</span>
                <Link href="/directory/pcb?view=finishes" className="font-medium hover:underline">{finish.name}</Link>
                <span className="mt-1 block text-xs text-muted-foreground">{finish.best} Shelf life {finish.shelfLifeMonths} months.</span>
              </li>
            ) : null}
          </ul>
      </Fold>

      <section aria-labelledby="board-sources" className="mt-6 overflow-hidden rounded-xl border bg-card">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-5 py-4">
          <h3 id="board-sources" className="text-base font-semibold">Where the bare board comes from</h3>
          <span className="text-xs text-muted-foreground" title="Freight + duty, net of GST/IGST credit; tooling once per design">Landed, per board</span>
        </div>

        <Tier n={1} icon={Warehouse} title="Our inventory" hint="Bare boards of this design already in our stores.">
          {b.board.stock ? (
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
              <span>
                <span className="num font-medium">{b.board.stock.mpn}</span>
                <span className="num text-muted-foreground"> · {b.board.stock.qty.toLocaleString("en-IN")} in stores · {m.unit(b.board.stock.unit)} book cost</span>
              </span>
              {edit ? <ChooseButton act={{ kind: "board", revisionId: id, stockPartId: b.board.stock.partId }} chosen={b.board.chosen?.kind === "stock"} label="Use our stock" /> : null}
            </div>
          ) : (
            <p className="px-4 py-3 text-sm text-muted-foreground">None in stores.</p>
          )}
        </Tier>

        <Tier n={2} icon={Layers} title="PCB fabricators" hint="Fabs we buy from directly. Their price is an estimate from the board's area, layers, finish and quantity until they quote.">
          <FabTable rows={b.board.fabs} b={b} edit={edit} m={m} />
        </Tier>

        <Tier n={3} icon={Globe} title="Online quick-turn (marketplace)" hint="Instant-quote pool services: cheapest for prototypes, longer shipping, landed with duty.">
          <FabTable rows={b.board.online} b={b} edit={edit} m={m} />
        </Tier>

        {all.length ? (
          <div className="border-t px-4 py-4">
            <CompareBars
              caption={`Per board at ${qtyLabel(b.refQty)}, tooling spread over the lot`}
              format={(v) => m.unit(v)}
              rows={[...all]
                .sort((x, y) => (perBoardAtRef(x) ?? Infinity) - (perBoardAtRef(y) ?? Infinity))
                .map((o) => ({ key: o.id, label: o.name, value: perBoardAtRef(o), tone: b.board.chosen?.id === o.id ? "chosen" : o.fits ? "fits" : "muted" }))}
            />
          </div>
        ) : null}
      </section>

      <p className="mt-3 text-xs text-muted-foreground" title="Estimate: panel area × rate × PCB technology, finish, copper, thickness and IPC class × a volume curve, never below the fab's minimum lot.">
        Fabs marked “— sample” are placeholders with sample prices.
      </p>

    </>
  );
}

function Tier({ n, icon: Icon, title, hint, children }: { n: number; icon: typeof Layers; title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="border-t first:border-t-0">
      <div className="flex items-center gap-3 px-5 pt-3.5 pb-1" title={hint}>
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
          <Icon className="size-3.5" aria-hidden />
        </span>
        <h4 className="text-sm font-semibold">{n} · {title}</h4>
      </div>
      {children}
    </div>
  );
}

function FabTable({ rows, b, edit, m }: { rows: FabOption[]; b: NonNullable<Awaited<ReturnType<typeof getBuild>>>; edit: boolean; m: ReturnType<typeof moneyIn> }) {
  if (!rows.length) return <p className="px-4 py-3 text-sm text-muted-foreground">None on file.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr className="border-b">
            <th className="px-4 py-2 font-normal">Fab</th>
            <th className="px-3 py-2 font-normal">For this board</th>
            <th className="px-3 py-2 text-right font-normal">Lead</th>
            {b.quantities.map((q) => (
              <th key={q} className="px-3 py-2 text-right font-normal">{qtyLabel(q)}</th>
            ))}
            <th className="px-3 py-2 text-right font-normal">Tooling</th>
            <th className="px-4 py-2"><span className="sr-only">Choose</span></th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((o) => {
            const chosen = b.board.chosen?.kind === "fab" && b.board.chosen.id === o.id;
            return (
              <tr key={o.id} className={cn(!o.fits && "text-muted-foreground", chosen && "bg-part-soft/60")}>
                <td className="px-4 py-2.5">
                  <span className="font-medium">{o.name}</span>
                  <span className="block text-xs text-muted-foreground">{o.country} · {o.certifications.join(", ")}</span>
                  {chosen && edit ? <span className="mt-1.5 block"><FabQuoteForm revisionId={b.revisionId} supplierId={o.id} quoted={o.quoted} /></span> : null}
                </td>
                <td className="px-3 py-2.5 text-xs">
                  {o.fits ? (
                    <span className="inline-flex items-center gap-1 text-risk-green"><Check className="size-3.5" aria-hidden /> Fits</span>
                  ) : (
                    <span className="inline-flex items-start gap-1 text-risk-amber"><X className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {o.gaps.join("; ")}</span>
                  )}
                  {o.quoted ? <span className="mt-1 block font-medium text-foreground">Their quote</span> : <span className="mt-1 block text-muted-foreground">Estimate{o.minLot ? " · minimum lot" : ""}</span>}
                </td>
                <td className="num px-3 py-2.5 text-right">{o.leadDays} d</td>
                {o.prices.map((p) => (
                  <td key={p.qty} className="num px-3 py-2.5 text-right">{m.unit(p.unit)}</td>
                ))}
                <td className="num px-3 py-2.5 text-right">{m.whole(o.prices[0]?.nre ?? 0)}</td>
                <td className="px-4 py-2.5 text-right">
                  {edit ? (
                    <span className="inline-flex flex-col items-end gap-1">
                      <ChooseButton act={{ kind: "board", revisionId: b.revisionId, supplierId: o.id }} chosen={chosen && !b.board.chosen?.auto} label={chosen ? "Confirm" : "Choose"} />
                      {chosen && b.board.chosen?.auto ? <span className="text-[11px] text-muted-foreground">Suggested</span> : null}
                    </span>
                  ) : chosen ? (
                    <span className="rounded-md bg-part-soft px-2 py-1 text-xs font-medium">Chosen</span>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
