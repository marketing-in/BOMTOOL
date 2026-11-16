import Link from "next/link";
import { ClipboardList, FileText, Hourglass, PackageX } from "lucide-react";
import { db } from "@/lib/db";
import { getDisplayCurrency } from "@/lib/prefs";
import { convert, formatMoneyCompact } from "@/lib/currency";
import { mslState } from "@/lib/ops/msl";
import { WO_STATUS } from "@/lib/ops/labels";
import { analyseRevision } from "@/server/bom-pipeline";
import { boardThumbFor } from "@/server/board-thumb";
import { PageHeader, Section, Stat, EmptyState } from "@/components/data/page-header";
import { RiskDot, LifecycleBadge } from "@/components/data/badges";
import { Illustration } from "@/components/ui/illustration";
import { BoardIso } from "@/components/viz/board-iso";
import { Ring } from "@/components/viz/ring";

export const metadata = { title: "Operations" };

const DAY = 86_400_000;

const CTB_INK = (pct: number) => (pct >= 100 ? "var(--risk-green)" : pct >= 80 ? "var(--risk-amber)" : "var(--risk-red)");

/**
 * Operations (Phase 28: picture first): each open work order with its own board and a ring for clear-to-build,
 * line load, the parts at risk, floor-life clocks and spend.
 */
export default async function OperationsPage() {
  const currency = await getDisplayCurrency();
  const now = new Date();
  const horizon = new Date(now.getTime() + 14 * DAY);
  const [wos, lines, lots, pos] = await Promise.all([
    db.workOrder.findMany({ where: { status: { notIn: ["DONE", "CANCELLED"] } }, include: { bomRevision: { include: { bom: true } }, line: true }, orderBy: { plannedStart: "asc" } }),
    db.line.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.inventoryLot.findMany({ where: { mslOpenedAt: { not: null } }, include: { part: { select: { id: true, mpn: true } } } }),
    db.purchaseOrderDraft.findMany({ where: { createdAt: { gt: new Date(now.getTime() - 90 * DAY) }, status: { not: "CANCELLED" } }, include: { supplier: true } }),
  ]);

  // Shortage value + top risk parts across the revisions behind open work orders.
  const revIds = [...new Set(wos.map((w) => w.bomRevisionId))];
  const analyses = (await Promise.all(revIds.map((id) => analyseRevision(db, id, currency, now, { buildQty: wos.filter((w) => w.bomRevisionId === id).reduce((s, w) => s + w.buildQty, 0) })))).filter((a) => !!a);
  const shortage = analyses.reduce((s, a) => s + a.totals.toBuyLanded, 0);
  const risky = analyses
    .flatMap((a) => a.lines.filter((l) => l.part && l.scores).map((l) => ({ l, a })))
    .sort((x, y) => Math.min(...Object.values(x.l.scores!)) - Math.min(...Object.values(y.l.scores!)))
    .slice(0, 8);

  // Utilisation: scheduled days per line in the next 14 days (work orders with start/end).
  const util = lines.map((l) => {
    const days = wos
      .filter((w) => w.lineId === l.id && w.plannedStart)
      .reduce((s, w) => {
        const st = Math.max(w.plannedStart!.getTime(), now.getTime());
        const en = Math.min((w.plannedEnd ?? new Date(w.plannedStart!.getTime() + DAY)).getTime(), horizon.getTime());
        return s + Math.max(0, (en - st) / DAY);
      }, 0);
    return { l, pct: Math.min(100, Math.round((days / 14) * 100)) };
  });

  const msl = lots
    .map((lot) => ({ lot, m: mslState({ msl: lot.msl, openedAt: lot.mslOpenedAt, hoursLeft: lot.floorLifeHoursLeft }, now) }))
    .filter((x) => x.m.tracked)
    .sort((a, b) => (a.m.hoursLeft ?? 0) - (b.m.hoursLeft ?? 0))
    .slice(0, 8);

  const spend = new Map<string, number>();
  for (const p of pos) {
    const b = (p.costBreakdown ?? {}) as { netTotal?: number };
    spend.set(p.supplier.name, (spend.get(p.supplier.name) ?? 0) + convert(b.netTotal ?? 0, "INR", currency));
  }
  const spendRows = [...spend.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const spendMax = Math.max(1, ...spendRows.map(([, v]) => v));
  const boards = new Map(await Promise.all(revIds.map(async (id) => [id, await boardThumbFor(id).catch(() => null)] as const)));
  const expiring = msl.filter((x) => (x.m.hoursLeft ?? 0) < 24).length;
  const clear = wos.filter((w) => (w.clearToBuildPct ?? 0) >= 100).length;

  return (
    <>
      <PageHeader title="Operations" />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={ClipboardList} label="Open work orders" value={wos.length} hint={`${clear} clear to build`} />
        <Stat icon={PackageX} label="Shortage value" value={formatMoneyCompact(shortage, currency)} hint="Landed, to buy for open WOs" tone={shortage > 0 ? "amber" : "plain"} />
        <Stat icon={Hourglass} label="MSL bags open" value={msl.length} hint={`${expiring} under 24 h`} tone={expiring ? "red" : "plain"} />
        <Stat icon={FileText} label="PO drafts, 90 days" value={pos.length} hint={formatMoneyCompact(spendRows.reduce((s, [, v]) => s + v, 0), currency)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Clear to build" action={<Link href="/operations/work-orders" className="text-xs text-muted-foreground hover:text-foreground">All</Link>}>
          {wos.length ? (
            <ul className="divide-y text-sm">
              {wos.map((w) => {
                const board = boards.get(w.bomRevisionId) ?? null;
                const pct = w.clearToBuildPct ?? 0;
                return (
                  <li key={w.id}>
                    <Link href={`/operations/work-orders/${w.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40">
                      {/* The board this order builds. */}
                      <span className="grid w-20 shrink-0 place-items-center rounded-md bg-muted/50 p-1">
                        {board ? (
                          <BoardIso revisionId={w.bomRevisionId} width={board.width} height={board.height} thickness={board.thickness} artwork={board.artwork} maskColor={board.maskColor} parts={board.parts} label={`${w.bomRevision.bom.name} in 3D`} className="max-h-14" />
                        ) : (
                          <Illustration kind="board" className="h-10 opacity-60" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="num font-medium">{w.number}</span>
                          <span className="inline-flex items-center gap-1.5 text-xs"><RiskDot level={WO_STATUS[w.status].level} />{WO_STATUS[w.status].label}</span>
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">{w.bomRevision.bom.name} · {w.buildQty} pcs · {w.line?.code ?? "no line"}</span>
                      </span>
                      <Ring
                        className="size-12"
                        parts={[
                          { key: "ctb", value: pct, color: CTB_INK(pct) },
                          { key: "rest", value: Math.max(0, 100 - pct), color: "transparent" },
                        ]}
                        center={w.clearToBuildPct === null ? "—" : `${pct}%`}
                        label={`Clear to build ${pct}%`}
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState title="No open work orders" />
          )}
        </Section>

        <Section title="Line load — next 14 days" action={<Link href="/operations/schedule" className="text-xs text-muted-foreground hover:text-foreground">Schedule</Link>}>
          <ul className="space-y-3 px-4 py-4">
            {util.map(({ l, pct }) => (
              <li key={l.id} className="grid grid-cols-[3rem_1fr_3rem] items-center gap-3 text-sm">
                <span className="num font-medium">{l.code}</span>
                <span className="h-2 overflow-hidden rounded-full bg-muted">
                  <span className={`block h-full rounded-full ${pct > 85 ? "bg-risk-red" : pct > 60 ? "bg-risk-amber" : "bg-primary"}`} style={{ width: `${pct}%` }} />
                </span>
                <span className="num text-right text-xs text-muted-foreground">{pct}%</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Top risk parts in open work orders">
          {risky.length ? (
            <ul className="divide-y text-sm">
              {risky.map(({ l, a }) => (
                <li key={l.id} className="flex items-center gap-3 px-4 py-2">
                  <RiskDot level={Math.min(...Object.values(l.scores!)) < 40 ? "red" : "amber"} />
                  <Link href={`/parts/${l.partId}`} className="num font-medium hover:underline">{l.part!.mpn}</Link>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{a.revision.bom.name} · {l.refDes}</span>
                  <LifecycleBadge lifecycle={l.part!.lifecycle} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No risk parts" />
          )}
        </Section>

        <Section title="MSL floor life" action={<Link href="/inventory?f=msl" className="text-xs text-muted-foreground hover:text-foreground">Inventory</Link>}>
          {msl.length ? (
            <ul className="divide-y text-sm">
              {msl.map(({ lot, m }) => (
                <li key={lot.id} className="flex items-center gap-3 px-4 py-2">
                  <RiskDot level={m.level} />
                  <span className="num font-medium">{lot.part.mpn}</span>
                  <span className="num text-xs text-muted-foreground">{lot.bin}</span>
                  <span className="num ml-auto text-xs">{m.expired ? "bake required" : `${Math.floor(m.hoursLeft ?? 0)} h left`}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No open MSL bags" />
          )}
        </Section>

        <Section title="Spend by supplier — PO drafts, 90 days" className="xl:col-span-2">
          {spendRows.length ? (
            <ul className="space-y-2 px-4 py-4">
              {spendRows.map(([name, v]) => (
                <li key={name} className="grid grid-cols-[12rem_1fr_6rem] items-center gap-3 text-sm">
                  <span className="truncate">{name}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${(v / spendMax) * 100}%` }} /></span>
                  <span className="num text-right text-xs">{formatMoneyCompact(v, currency)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No PO drafts yet">Create them from an RFQ comparison.</EmptyState>
          )}
        </Section>
      </div>
    </>
  );
}
