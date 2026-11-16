import Link from "next/link";
import Form from "next/form";
import type { Prisma } from "@prisma/client";
import { Boxes, Hourglass, TimerReset, Wallet } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getDisplayCurrency } from "@/lib/prefs";
import { convert, formatMoneyCompact } from "@/lib/currency";
import { normaliseMpn } from "@/lib/normalise";
import { mslState, formatHours, FLOOR_LIFE_HOURS, MSL_LABEL } from "@/lib/ops/msl";
import { PageHeader, Stat, EmptyState } from "@/components/data/page-header";
import { RiskDot } from "@/components/data/badges";
import { LotActions, ReceiveForm } from "@/components/ops/inventory-forms";
import { Ring } from "@/components/viz/ring";
import { cn } from "@/lib/utils";

export const metadata = { title: "Inventory" };

const FILTERS = [
  { key: "all", label: "All lots" },
  { key: "msl", label: "MSL bags open" },
  { key: "expiring", label: "Floor life < 24 h" },
  { key: "reserved", label: "Reserved" },
  { key: "consigned", label: "Consigned" },
] as const;

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ q?: string; f?: string }> }) {
  const user = await requireUser();
  const { q, f = "all" } = await searchParams;
  const currency = await getDisplayCurrency();
  const where: Prisma.InventoryLotWhereInput = {};
  if (q?.trim()) where.OR = [{ part: { mpnNormalised: { contains: normaliseMpn(q) } } }, { bin: { contains: q, mode: "insensitive" } }, { lotCode: { contains: q, mode: "insensitive" } }, { reelId: { contains: q, mode: "insensitive" } }];
  if (f === "msl" || f === "expiring") where.mslOpenedAt = { not: null };
  if (f === "reserved") where.reservedQty = { gt: 0 };
  if (f === "consigned") where.isConsigned = true;

  const [lots, all, warehouses, customers, parts, open] = await Promise.all([
    db.inventoryLot.findMany({ where, include: { part: { include: { manufacturer: true } }, warehouse: true, customer: true }, orderBy: [{ warehouse: { code: "asc" } }, { bin: "asc" }], take: 300 }),
    db.inventoryLot.findMany({ select: { qty: true, reservedQty: true, unitCost: true, currency: true, isConsigned: true, msl: true, mslOpenedAt: true, floorLifeHoursLeft: true } }),
    db.warehouse.findMany({ orderBy: { code: "asc" } }),
    db.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.part.findMany({ orderBy: { mpn: "asc" }, select: { id: true, mpn: true } }),
    // The bags whose floor-life clock is running: the clocks at the top of the page.
    db.inventoryLot.findMany({ where: { mslOpenedAt: { not: null } }, select: { id: true, bin: true, msl: true, mslOpenedAt: true, floorLifeHoursLeft: true, part: { select: { id: true, mpn: true } } } }),
  ]);
  const now = new Date();
  const rows = lots
    .map((l) => ({ l, m: mslState({ msl: l.msl, openedAt: l.mslOpenedAt, hoursLeft: l.floorLifeHoursLeft }, now) }))
    .filter(({ m }) => (f === "expiring" ? m.tracked && (m.hoursLeft ?? 0) < 24 : true));
  const value = all.filter((l) => !l.isConsigned && l.unitCost).reduce((s, l) => s + convert(l.qty * Number(l.unitCost), l.currency, currency), 0);
  const openBags = all.filter((l) => mslState({ msl: l.msl, openedAt: l.mslOpenedAt, hoursLeft: l.floorLifeHoursLeft }, now).running).length;
  const expiring = all.filter((l) => {
    const m = mslState({ msl: l.msl, openedAt: l.mslOpenedAt, hoursLeft: l.floorLifeHoursLeft }, now);
    return m.tracked && m.running && (m.hoursLeft ?? 0) < 24;
  }).length;
  const stores = can(user.role, "inventory.write");
  const INK = { green: "var(--risk-green)", amber: "var(--risk-amber)", red: "var(--risk-red)", grey: "var(--risk-grey)" } as const;
  const clocks = open
    .map((l) => ({ l, m: mslState({ msl: l.msl, openedAt: l.mslOpenedAt, hoursLeft: l.floorLifeHoursLeft }, now), total: l.msl ? FLOOR_LIFE_HOURS[l.msl] : null }))
    .filter((c) => c.m.tracked && c.m.running)
    .sort((a, b) => (a.m.hoursLeft ?? 0) - (b.m.hoursLeft ?? 0))
    .slice(0, 8);

  return (
    <>
      <PageHeader title="Inventory" description="Know what is on hand, where it lives and what needs attention before the next build." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Boxes} label="Lots" value={all.length} hint={`${all.filter((l) => l.isConsigned).length} consigned`} />
        <Stat icon={Wallet} label="Own stock value" value={formatMoneyCompact(value, currency)} hint="At book cost" />
        <Stat icon={Hourglass} label="MSL bags open" value={openBags} hint="Floor-life clock running" tone={openBags ? "amber" : "plain"} />
        <Stat icon={TimerReset} label="Floor life < 24 h" value={expiring} hint={expiring ? "Close into dry storage or bake" : "None at risk"} tone={expiring ? "red" : "green"} />
      </div>

      {clocks.length ? (
        <section aria-labelledby="clocks" className="mb-6 overflow-hidden rounded-lg border bg-card">
          <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
            <h2 id="clocks" className="flex items-center gap-2 text-base font-semibold">
              <span aria-hidden className="h-4 w-1 rounded-full bg-[var(--brand-accent)]" />
              Floor-life clocks
            </h2>
            <Link href="/inventory?f=msl" className="text-xs text-muted-foreground hover:text-foreground">All open bags</Link>
          </div>
          <ul className="-mr-px -mb-px flex flex-wrap">
            {clocks.map(({ l, m, total }) => {
              const left = m.hoursLeft ?? 0;
              const share = total ? Math.max(0, Math.min(1, left / total)) : 0;
              return (
                <li key={l.id} className="flex w-1/2 flex-col items-center gap-1 border-r border-b px-2 py-3 text-center sm:w-1/4 xl:w-[12.5%]">
                  <Ring
                    className="size-16"
                    // A full red ring when the floor life is used up; otherwise the share that is left.
                    parts={
                      m.expired
                        ? [{ key: "out", value: 1, color: INK.red }]
                        : [
                            { key: "left", value: share, color: INK[m.level] },
                            { key: "used", value: 1 - share, color: "transparent" },
                          ]
                    }
                    center={m.expired ? "0 h" : formatHours(m.hoursLeft)}
                    label={m.expired ? `${l.part.mpn}: floor life used up, bake required` : `${l.part.mpn}: ${formatHours(m.hoursLeft)} of floor life left`}
                  />
                  <Link href={`/parts/${l.part.id}`} className="num block max-w-full truncate text-xs font-medium hover:underline" title={l.part.mpn}>{l.part.mpn}</Link>
                  <span className={cn("text-[11px]", m.expired ? "font-medium text-risk-red" : "text-muted-foreground")}>{m.expired ? "bake required" : `${l.msl ? MSL_LABEL[l.msl] : ""} · ${l.bin}`}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <div className={cn("grid gap-6", stores && "xl:grid-cols-[minmax(0,1fr)_340px]")}>
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Form action="/inventory" className="min-w-52 flex-1 sm:max-w-xs">
              <input type="hidden" name="f" value={f} />
              <label htmlFor="iq" className="sr-only">Search lots</label>
              <input id="iq" name="q" defaultValue={q} placeholder="MPN, bin, lot or reel…" className="h-9 w-full rounded-md border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </Form>
            <nav className="flex flex-wrap gap-1" aria-label="Filter">
              {FILTERS.map((x) => (
                <Link key={x.key} href={`/inventory?f=${x.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`} aria-current={f === x.key ? "page" : undefined} className={cn("inline-flex h-9 items-center rounded-md px-2.5 text-xs", f === x.key ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground")}>
                  {x.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="overflow-hidden rounded-lg border bg-card">
            {rows.length ? (
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="px-3 py-2 font-normal">Bin</th>
                      <th className="px-3 py-2 font-normal">Part</th>
                      <th className="px-3 py-2 font-normal">Lot / reel</th>
                      <th className="px-3 py-2 text-right font-normal">Qty</th>
                      <th className="px-3 py-2 text-right font-normal">Reserved</th>
                      <th className="px-3 py-2 font-normal">DC</th>
                      <th className="px-3 py-2 font-normal">MSL floor life</th>
                      <th className="px-3 py-2 font-normal">CoC</th>
                      <th className="px-3 py-2"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rows.map(({ l, m }) => (
                      <tr key={l.id}>
                        <td className="num px-3 py-2 text-xs">{l.warehouse.code} · {l.bin}</td>
                        <td className="px-3 py-2">
                          <Link href={`/parts/${l.partId}`} className="num font-medium hover:underline">{l.part.mpn}</Link>
                          <div className="text-xs text-muted-foreground">{l.part.manufacturer.name}{l.isConsigned ? ` · consigned for ${l.customer?.name}` : ""}</div>
                        </td>
                        <td className="num px-3 py-2 text-xs text-muted-foreground">{l.reelId ?? l.lotCode ?? "—"}</td>
                        <td className="num px-3 py-2 text-right">{l.qty.toLocaleString("en-IN")}</td>
                        <td className="num px-3 py-2 text-right">{l.reservedQty ? l.reservedQty.toLocaleString("en-IN") : "—"}</td>
                        <td className="num px-3 py-2 text-xs">{l.dateCode ?? "—"}</td>
                        <td className="px-3 py-2 text-xs">
                          {m.tracked ? (
                            <span className="inline-flex items-center gap-1.5">
                              <RiskDot level={m.level} />
                              {MSL_LABEL[l.msl!]} · {m.expired ? "bake required" : `${formatHours(m.hoursLeft)}${m.running ? " left" : " (dry)"}`}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">{l.msl ? MSL_LABEL[l.msl] : "—"}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center"><RiskDot level={l.cocOnFile ? "green" : "amber"} /></td>
                        <td className="px-2 py-1.5">{stores ? <LotActions lotId={l.id} qty={l.qty} msl={m.tracked} running={m.running} /> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No lots match">Change the filter or search.</EmptyState>
            )}
          </div>
          {lots.length === 300 ? <p className="mt-2 text-xs text-muted-foreground">Showing the first 300 lots — search to narrow down.</p> : null}
        </div>
        {stores ? <ReceiveForm parts={parts} warehouses={warehouses.map((w) => ({ id: w.id, name: `${w.code} · ${w.name}` }))} customers={customers} /> : null}
      </div>
    </>
  );
}
