import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Factory, Gauge, PackageCheck, ShoppingCart, XCircle } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getDisplayCurrency } from "@/lib/prefs";
import { formatMoneyCompact } from "@/lib/currency";
import { mslState, formatHours, MSL_LABEL } from "@/lib/ops/msl";
import { WO_STATUS } from "@/lib/ops/labels";
import { analyseWorkOrder } from "@/server/operations";
import { PageHeader, Section, Stat, EmptyState } from "@/components/data/page-header";
import { RiskDot } from "@/components/data/badges";
import { WoActions } from "@/components/ops/wo-actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const wo = await db.workOrder.findUnique({ where: { id: (await params).id }, select: { number: true } });
  return { title: wo?.number ?? "Work order" };
}

export default async function WorkOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const currency = await getDisplayCurrency();
  const r = await analyseWorkOrder(id, currency);
  if (!r) notFound();
  const { wo, analysis, ctb, needs, lineOptions, shortageValue } = r;
  const lines = await db.line.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { id: true, code: true } });
  const lineById = new Map(analysis.lines.map((l) => [l.id, l]));
  const now = new Date();
  const kit = [...wo.reservations].sort((a, b) => a.lot.bin.localeCompare(b.lot.bin));

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/operations/work-orders" className="hover:text-foreground">Work orders</Link>}
        title={<span className="num">{wo.number}</span>}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5"><RiskDot level={WO_STATUS[wo.status].level} />{WO_STATUS[wo.status].label}</span>
            <Link href={`/boms/${wo.bomRevisionId}`} className="hover:underline">{wo.bomRevision.bom.name} rev {wo.bomRevision.revision}</Link>
            <span>{wo.project.customer.name}</span>
            <span className="num">{wo.buildQty.toLocaleString("en-IN")} boards</span>
          </span>
        }
        actions={
          <WoActions
            id={wo.id}
            status={wo.status}
            lineId={wo.lineId}
            plannedStart={wo.plannedStart?.toISOString().slice(0, 10) ?? null}
            days={wo.plannedStart && wo.plannedEnd ? Math.max(1, Math.round((wo.plannedEnd.getTime() - wo.plannedStart.getTime()) / 86_400_000)) : 1}
            lines={lines}
            hasReservations={wo.reservations.some((x) => !x.issued)}
            canPlan={can(user.role, "workorder.write")}
            canStores={can(user.role, "inventory.write")}
          />
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Gauge} tone={ctb.pct >= 100 ? "green" : ctb.pct >= 80 ? "amber" : "red"} label="Clear to build" value={`${ctb.pct}%`} hint={`${ctb.blocking.length} line${ctb.blocking.length === 1 ? "" : "s"} blocking`} />
        <Stat icon={ShoppingCart} label="To buy, landed" value={formatMoneyCompact(shortageValue, currency)} hint="After our stock and excess" />
        <Stat icon={PackageCheck} label="Reserved picks" value={wo.reservations.length} hint={`${wo.reservations.filter((x) => x.issued).length} issued to line`} />
        <Stat icon={Factory} label="Line" value={wo.line?.code ?? "—"} hint={wo.plannedStart ? `starts ${wo.plannedStart.toISOString().slice(0, 10)}` : "not scheduled"} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Section title="Blocking lines">
            {ctb.blocking.length ? (
              <ul className="divide-y text-sm">
                {ctb.blocking.map((b) => {
                  const l = lineById.get(b.lineId)!;
                  return (
                    <li key={b.lineId} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
                      <RiskDot level={b.reason === "UNMATCHED" ? "red" : "amber"} />
                      {l.part ? <Link href={`/parts/${l.part.id}`} className="num font-medium hover:underline">{l.part.mpn}</Link> : <span className="num text-muted-foreground">{l.rawMpn ?? l.rawDescription}</span>}
                      <span className="num text-xs text-muted-foreground">{l.refDes}</span>
                      <span className="num ml-auto text-xs">{b.reason === "UNMATCHED" ? "not matched to a part" : `short ${b.short.toLocaleString("en-IN")} of ${l.required.toLocaleString("en-IN")}`}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState title="Clear to build">Every line is covered by stock we hold or have reserved.</EmptyState>
            )}
            {ctb.blocking.length ? (
              <div className="border-t px-4 py-2.5 text-xs text-muted-foreground">
                Buy the gap from <Link href={`/boms/${wo.bomRevisionId}`} className="underline">the BoM</Link> → Add shortages to cart.
              </div>
            ) : null}
          </Section>

          <Section title={`Kitting list (${kit.length})`} action={kit.length ? <span className="text-xs text-muted-foreground">sorted by bin</span> : null}>
            {kit.length ? (
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="px-4 py-2 font-normal">Bin</th>
                      <th className="px-4 py-2 font-normal">Part</th>
                      <th className="px-4 py-2 font-normal">Reel / lot</th>
                      <th className="px-4 py-2 text-right font-normal">Qty</th>
                      <th className="px-4 py-2 font-normal">MSL</th>
                      <th className="px-4 py-2 font-normal">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {kit.map((k) => {
                      const m = mslState({ msl: k.lot.msl, openedAt: k.lot.mslOpenedAt, hoursLeft: k.lot.floorLifeHoursLeft }, now);
                      return (
                        <tr key={k.id}>
                          <td className="num px-4 py-2">{k.lot.bin}</td>
                          <td className="num px-4 py-2 font-medium">{k.lot.part.mpn}</td>
                          <td className="num px-4 py-2 text-xs text-muted-foreground">{k.lot.reelId ?? k.lot.lotCode ?? "—"} · DC {k.lot.dateCode ?? "?"}{k.lot.isConsigned ? " · consigned" : ""}</td>
                          <td className="num px-4 py-2 text-right">{k.qty.toLocaleString("en-IN")}</td>
                          <td className="px-4 py-2 text-xs">
                            {m.tracked ? (
                              <span className="inline-flex items-center gap-1.5"><RiskDot level={m.level} />{MSL_LABEL[k.lot.msl!]} · {m.expired ? "bake first" : formatHours(m.hoursLeft)}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-xs">{k.issued ? "issued" : "reserved"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="Nothing reserved yet">Reserve stock to build the kitting list.</EmptyState>
            )}
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Which line can build it">
            <ul className="divide-y text-sm">
              {lineOptions.map((o) => (
                <li key={o.id} className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {o.fit.ok ? <CheckCircle2 className="size-4 text-risk-green" aria-hidden /> : <XCircle className="size-4 text-risk-red" aria-hidden />}
                    <span className="num font-medium">{o.code}</span>
                    <span className="truncate text-xs text-muted-foreground">{o.name.replace(/^.*—\s*/, "")}</span>
                    {o.hours !== null ? <span className="num ml-auto text-xs text-muted-foreground">≈ {o.hours.toFixed(1)} h</span> : null}
                  </div>
                  {o.fit.reasons.length ? <p className="mt-1 text-xs text-risk-red">{o.fit.reasons.join(" · ")}</p> : null}
                  {o.feeders ? (
                    <p className="num mt-1 text-xs text-muted-foreground">
                      {o.feeders.needed} feeder slots needed / {o.feeders.slots ?? "?"} on line → {o.feeders.setups} setup{o.feeders.setups === 1 ? "" : "s"}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Job needs (from the BoM)">
            <dl className="num grid grid-cols-2 gap-x-3 gap-y-1.5 px-4 py-3 text-sm">
              <dt className="font-sans text-muted-foreground">Smallest chip</dt>
              <dd className="text-right">{needs.smallestChip ?? "—"}</dd>
              <dt className="font-sans text-muted-foreground">Finest pitch</dt>
              <dd className="text-right">{needs.finestPitchMm ? `${needs.finestPitchMm} mm` : "—"}</dd>
              <dt className="font-sans text-muted-foreground">BGA / LGA</dt>
              <dd className="text-right">{needs.hasBga ? "yes" : "no"}</dd>
              <dt className="font-sans text-muted-foreground">Double-sided</dt>
              <dd className="text-right">{needs.doubleSided ? "yes" : "no"}</dd>
              <dt className="font-sans text-muted-foreground">Through-hole</dt>
              <dd className="text-right">{needs.hasTht ? "yes" : "no"}</dd>
              <dt className="font-sans text-muted-foreground">Board</dt>
              <dd className="text-right">{needs.boardMm ? `${needs.boardMm.join(" × ")} mm` : "—"}</dd>
            </dl>
          </Section>
        </div>
      </div>
    </>
  );
}
