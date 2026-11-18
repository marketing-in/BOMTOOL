import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Box as BoxIcon, ExternalLink, FileText, Layers } from "lucide-react";
import type { SupplierKind } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { getDisplayCurrency } from "@/lib/prefs";
import { convert, priceAtQty } from "@/lib/currency";
import { bestOffer, readBreaks } from "@/lib/pricing";
import { landedCost } from "@/lib/landed-cost";
import { isLive, priceSeries } from "@/lib/price-trend";
import { getPart } from "@/server/catalogue";
import { FALLBACK_DUTY, loadDutyRates } from "@/server/bom-pipeline";
import { getLiveSince } from "@/server/price-history";
import { webUrl } from "@/server/sourcing/normalise";
import { getBuild, type LineRow } from "@/server/build";
import { partChoices, type PartChoice } from "@/server/found-parts";
import { activeAdapters } from "@/server/sourcing";
import { searchMarket } from "@/server/sourcing/market";
import { compressRefs, kindLabel, KIND_PLURAL } from "@/lib/board/find-parts";
import { LifecycleBadge, RiskDot } from "@/components/data/badges";
import { PartPhoto } from "@/components/data/part-photo";
import { PackageDrawing } from "@/components/knowledge/package-drawing";
import { PriceHistoryChartLoader } from "@/components/data/price-history-chart-loader";
import type { PriceSeries } from "@/components/data/price-history-chart";
import { RefreshButton } from "@/components/sourcing/refresh-button";
import { ViewerLoader } from "@/components/viewer/viewer-loader";
import { BuildHeader } from "@/components/build/build-header";
import { ChooseButton, UseAlternateButton } from "@/components/build/choose-button";
import { SourcingChoice } from "@/components/build/sourcing-choice";
import { OrderBy } from "@/components/build/order-by";
import { rank, readDir, readSort, share, SORT, type Dir, type Figures, type SortKey } from "@/lib/costing/rank";
import { RISK_BAND, sourceRisk, type Band } from "@/lib/costing/strategy";
import { SUPPLIER_TIER } from "@/lib/risk";
import { ChoosePart } from "@/components/build/choose-part";
import { BoardMap } from "@/components/build/board-map";
import { BreakChart } from "@/components/build/break-chart";
import { moneyIn, qtyLabel } from "@/components/build/format";
import { cn } from "@/lib/utils";


const ROHS: Record<string, [string, "green" | "amber" | "red"]> = { COMPLIANT: ["RoHS ✓", "green"], COMPLIANT_WITH_EXEMPTION: ["RoHS exempt", "amber"], NON_COMPLIANT: ["Not RoHS", "red"], UNKNOWN: ["RoHS ?", "amber"] };
const REACH: Record<string, [string, "green" | "amber" | "red"]> = { COMPLIANT: ["REACH ✓", "green"], CONTAINS_SVHC: ["REACH: SVHC", "amber"], UNKNOWN: ["REACH ?", "amber"] };
const OURS = new Set<SupplierKind>(["INTERNAL_STOCK", "CONSIGNED"]);
const DISTI = new Set<SupplierKind>(["AUTHORISED", "MANUFACTURER"]);
const FILTERS = [
  ["all", "All lines"],
  ["attention", "Needs attention"],
  ["chosen", "Source chosen"],
] as const;

/** How exposed a source is, in the plant's three colours. */
const BAND: Record<Band, { label: string; level: "green" | "amber" | "red" }> = {
  ours: { label: "Ours", level: "green" },
  authorised: { label: "Authorised", level: "green" },
  open: { label: "Partner / excess", level: "amber" },
  broker: { label: "Broker", level: "red" },
};
const TIER_SHORT: Record<number, string> = { 1: "Our inventory", 2: "Channel partner", 3: "Distributor", 4: "Marketplace" };
const weeksLabel = (w: number | null) => (w === null ? "lead ?" : w <= 0 ? "on a shelf" : `${Number.isInteger(w) ? w : w.toFixed(1)} wk`);

/** What a BoM line is ranked on: its wait, its cost a board, the part's risk score and all the stock there is. */
const lineFigures = (l: LineRow): Figures => ({
  lead: l.leadWeeks,
  price: l.cost.priced ? l.perBoard : null,
  risk: l.risk?.score ?? null,
  stock: l.partId ? l.stock.ours + l.stock.partners + l.stock.distributors + l.stock.market : null,
  usable: !l.dnp && !l.excluded,
});

const needsAttention = (l: LineRow) => !l.dnp && !l.excluded && (!l.cost.priced || (l.risk?.level ?? "green") !== "green" || l.missing.length > 0);

export default async function PartsSection({ id, searchParams }: { id: string; searchParams: { line?: string; show?: string; view?: string; find?: string; sort?: string; dir?: string } }) {
  const user = await requireUser();
  const { line: lineParam, show = "all", view, find, sort: sortParam, dir: dirParam } = searchParams;
  const sort = readSort(sortParam);
  const dir = readDir(dirParam, sort);
  const [b, currency] = await Promise.all([getBuild(id), getDisplayCurrency()]);
  if (!b) notFound();
  const m = moneyIn(currency);
  const edit = can(user.role, "bom.write");
  const buyer = can(user.role, "sourcing.buy");
  const filtered = show === "attention" ? b.lines.filter(needsAttention) : show === "chosen" ? b.lines.filter((l) => l.pinned) : b.lines;
  const shown = sort === "order" ? filtered : rank(filtered, lineFigures, sort, dir);
  const sel = b.lines.find((l) => l.id === lineParam) ?? shown.find((l) => !l.excluded && !l.dnp) ?? b.lines[0] ?? null;
  const href = (o: { line?: string; show?: string; view?: string; sort?: SortKey; dir?: Dir }) => {
    const p = new URLSearchParams();
    const s = o.show ?? show;
    if (s !== "all") p.set("show", s);
    if (o.line ?? sel?.id) p.set("line", (o.line ?? sel?.id)!);
    if (o.view) p.set("view", o.view);
    // The order holds from line to line; choosing another figure starts in the direction it reads best in.
    const k = o.sort ?? sort;
    const d = o.dir ?? (o.sort && o.sort !== sort ? SORT[k].first : dir);
    if (k !== "order") {
      p.set("sort", k);
      if (d !== SORT[k].first) p.set("dir", d);
    }
    return `/boms/${id}/build/parts?${p.toString()}#components`;
  };
  const withGaps = [...new Set(b.lines.filter((l) => l.partId && l.missing.length).map((l) => l.partId!))];

  return (
    <>
      <BuildHeader b={b} current="parts" currency={currency} section />

      <SourcingChoice sourcing={b.sourcing} revisionId={b.revisionId} unit={m.unit} canEdit={edit} />

      <div className="grid gap-6 xl:grid-cols-[400px_minmax(0,1fr)]">
        <aside className="min-w-0 xl:sticky xl:top-4 xl:self-start">
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2.5">
              <div role="tablist" aria-label="Show" className="inline-flex gap-0.5 rounded-md border bg-card p-0.5">
                {FILTERS.map(([key, label]) => (
                  <Link key={key} role="tab" aria-selected={show === key} href={href({ show: key })} className={cn("rounded px-2 py-1 text-xs transition-colors duration-150", show === key ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                    {label}
                  </Link>
                ))}
              </div>
              <span className="num text-xs text-muted-foreground">at {qtyLabel(b.refQty)}</span>
            </div>
            <div className="border-b px-3 py-2">
              <OrderBy label="Order lines by" sort={sort} dir={dir} href={href} />
            </div>
            <ol className="max-h-[70dvh] divide-y overflow-y-auto" aria-label="BoM lines">
              {shown.map((l) => (
                <li key={l.id}>
                  <Link
                    href={href({ line: l.id })}
                    aria-current={l.id === sel?.id ? "true" : undefined}
                    className={cn("flex items-start gap-2.5 px-3 py-2.5 outline-none transition-colors duration-150 hover:bg-muted/50 focus-visible:bg-muted/60", l.id === sel?.id && "bg-part-soft", (l.dnp || l.excluded) && "text-muted-foreground")}
                  >
                    <span className="num w-6 shrink-0 pt-0.5 text-right text-xs text-muted-foreground">{l.lineNo}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        {l.risk ? <RiskDot level={l.risk.level} /> : <RiskDot level={l.dnp ? "grey" : "red"} />}
                        <span className="num truncate text-sm font-medium">{l.mpn ?? (l.footprint ? `${l.footprint} — no part yet` : "Not matched")}</span>
                      </span>
                      <span className="num block truncate text-xs text-muted-foreground">{l.refDes || "—"} · {l.qtyPerBoard}/board</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {l.dnp ? "Do not place" : l.excluded === "box" ? "Priced with the box" : l.excluded === "board" ? "Priced in step 6 — the bare board" : (l.sourceLabel ?? "No source")}
                        {l.pinned ? " · chosen" : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className={cn("num block text-sm", !l.cost.priced && !l.dnp && "text-risk-red")}>{l.dnp || l.excluded ? "—" : l.cost.priced ? m.unit(l.perBoard) : "no price"}</span>
                      {sort !== "order" && sort !== "price" && !l.dnp && !l.excluded ? (
                        <span className="num block text-[11px] text-muted-foreground">
                          {sort === "lead" ? weeksLabel(l.leadWeeks) : sort === "risk" ? (l.risk ? `risk ${l.risk.score}` : "risk ?") : `${(lineFigures(l).stock ?? 0).toLocaleString("en-IN")} avail.`}
                        </span>
                      ) : null}
                      {l.missing.length ? <span className="block text-[11px] text-risk-amber">{l.missing.length} detail{l.missing.length === 1 ? "" : "s"} missing</span> : null}
                    </span>
                  </Link>
                </li>
              ))}
              {!shown.length ? <li className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing here.</li> : null}
            </ol>
            {buyer && withGaps.length ? (
              <div className="border-t px-3 py-2.5">
                <RefreshButton scope={{ partIds: withGaps, label: `${withGaps.length} parts with gaps` }} label={`Fill ${withGaps.length} parts with gaps`} variant="ghost" />
              </div>
            ) : null}
          </div>
        </aside>

        <div className="min-w-0">{sel ? <LineDetail b={b} sel={sel} m={m} currency={currency} edit={edit} buyer={buyer} view={view} href={href} show={show} find={find} sort={sort} dir={dir} /> : <p className="text-sm text-muted-foreground">This BoM has no lines.</p>}</div>
      </div>

    </>
  );
}

async function LineDetail({
  b,
  sel,
  m,
  currency,
  edit,
  buyer,
  view,
  href,
  show,
  find,
  sort,
  dir,
}: {
  b: NonNullable<Awaited<ReturnType<typeof getBuild>>>;
  sel: LineRow;
  m: ReturnType<typeof moneyIn>;
  currency: Awaited<ReturnType<typeof getDisplayCurrency>>;
  edit: boolean;
  buyer: boolean;
  view?: string;
  href: (o: { line?: string; show?: string; view?: string; sort?: SortKey; dir?: Dir }) => string;
  show: string;
  find?: string;
  sort: SortKey;
  dir: Dir;
}) {
  const part = sel.partId ? await getPart(sel.partId) : null;
  const where = (
    <section aria-label="Where it sits on the board" className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        <h3 className="text-base font-semibold">On the board</h3>
        <span className="flex gap-3 text-xs">
          {view === "3d" ? <Link href={href({})} className="text-muted-foreground hover:text-foreground">Flat map</Link> : <Link href={href({ view: "3d" })} className="font-medium underline decoration-border hover:decoration-foreground">Show in 3D</Link>}
          <Link href={`/boms/${b.revisionId}/viewer`} className="text-muted-foreground hover:text-foreground">3D viewer</Link>
        </span>
      </div>
      {view === "3d" ? (
        <div className="p-2">
          <ViewerLoader key={sel.id} data={b.viewer} initialMode="pcba" initialLine={sel.id} />
        </div>
      ) : (
        <div className="mx-auto max-w-xl px-4 py-3">
          <BoardMap width={b.viewer.board.width} height={b.viewer.board.height} parts={b.viewer.parts} lineId={sel.id} title={`${sel.refDes} on the board`} />
          {b.viewer.approximateLayout ? <p className="mt-1 text-xs text-risk-amber">Approximate layout — no pick-and-place file.</p> : null}
        </div>
      )}
    </section>
  );

  if (!part) {
    // No part yet — a footprint read off the Gerbers, or an MPN not in our catalogue: choose one here.
    const need = Math.max(1, sel.required);
    const ch = await partChoices(sel.id, need, currency, find);
    // The same search goes to the distributors, so a part we don't hold yet can be chosen and priced here.
    const sellers = activeAdapters().filter((a) => a.searchKeyword && a.dailyLimit > 0);
    const sellerNames = sellers.map((a) => a.label).join(" and ");
    const live = ch?.query && ch.query.length >= 2 && (edit || buyer) && sellers.length ? await searchMarket(ch.query, currency, need) : null;
    const failed = live?.sources.filter((s) => s.error).map((s) => s.label) ?? [];
    const market = live
      ? {
          query: ch!.query,
          note: `${sellerNames} · price at ${need.toLocaleString("en-IN")} pcs${failed.length ? ` · ${failed.join(", ")} did not answer` : ""}`,
          rows: live.results.slice(0, 12).map((r) => ({
            key: r.key,
            partId: r.partId,
            mpn: r.mpn,
            manufacturer: r.manufacturer,
            description: r.description,
            lifecycle: r.lifecycle,
            stock: r.totalStock,
            sellers: [...new Set(r.offers.map((o) => o.seller))].slice(0, 2).join(", "),
            price: r.bestAtNeed === null ? null : m.unit(r.bestAtNeed),
          })),
        }
      : null;
    const rows = (list: PartChoice[]) => list.map((c) => ({ ...c, price: c.unit === null ? null : m.unit(c.unit) }));
    const kind = ch?.kind ? kindLabel({ kind: ch.kind === "passive" ? "other" : ch.kind, passive: ch.kind === "passive" }) : null;
    const nothing = ch && !ch.matches.length && !ch.fits.length && !ch.found.length;
    const asked = ch?.query || sel.mpn || "";
    return (
      <div className="space-y-4">
        <section className="rounded-xl border bg-card" aria-labelledby="choose-part">
          <div className="border-b px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 id="choose-part" className="flex items-center gap-2 text-base font-semibold">
                <AlertTriangle className="size-4 text-risk-red" aria-hidden />
                <span>Line {sel.lineNo}</span> needs a part
              </h2>
              <span className="num text-xs text-muted-foreground">{sel.qtyPerBoard}/board · {sel.required.toLocaleString("en-IN")} for the build</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {ch?.footprint ? <span className="num mr-1.5 rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">{ch.footprint}</span> : null}
              {kind ?? sel.description ?? "Unknown part"}
              {ch?.refs.length ? <span className="num"> · {compressRefs(ch.refs)}</span> : null}
              {sel.mpn ? <span className="num"> · asked for {sel.mpn}</span> : null}
            </p>
            {ch?.guessed ? <p className="mt-2 text-xs text-risk-amber">Guessed from the Gerber pads — the value is not in the files.</p> : null}
          </div>
          {ch ? (
            <ChoosePart
              revisionId={b.revisionId}
              lineId={sel.id}
              refs={ch.refs}
              canEdit={edit}
              market={market}
              lineHref={`/boms/${b.revisionId}/build/parts?${show !== "all" ? `show=${show}&` : ""}line=`}
              sections={[
                { title: "Match candidates", note: "proposed by the matcher", rows: rows(ch.matches) },
                { title: `Fits ${ch.footprint ?? "this footprint"}${ch.kind ? ` · ${KIND_PLURAL[ch.kind]}` : ""}`, note: `${ch.fitsTotal} in our catalogue`, rows: rows(ch.fits) },
                { title: `Found for “${ch.query}”`, rows: rows(ch.found) },
              ]}
            />
          ) : null}
          {nothing && !market ? <p className="border-b px-4 py-3 text-sm text-muted-foreground">Nothing in our catalogue fits this footprint yet.</p> : null}
          <form method="get" action={`/boms/${b.revisionId}/build/parts`} className="flex flex-wrap items-center gap-2 px-4 py-3">
            <input type="hidden" name="line" value={sel.id} />
            {show !== "all" ? <input type="hidden" name="show" value={show} /> : null}
            <label htmlFor="find-part" className="sr-only">Search our catalogue{sellerNames ? ` and ${sellerNames}` : ""}</label>
            <input id="find-part" name="find" defaultValue={ch?.query ?? ""} placeholder="10k 0603, LM358, 100nF" className="h-9 min-w-56 flex-1 rounded-md border bg-card px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            <button type="submit" className="h-9 rounded-md border bg-card px-3 text-sm font-medium outline-none transition-colors duration-150 hover:bg-part-soft focus-visible:ring-2 focus-visible:ring-ring" title={sellerNames ? `Our catalogue and ${sellerNames}` : "Our catalogue"}>Search</button>
            {asked ? (
              <Link href={`/parts/market?q=${encodeURIComponent(asked)}`} className="text-sm text-muted-foreground hover:text-foreground">
                All distributors →
              </Link>
            ) : null}
          </form>
        </section>
        {where}
      </div>
    );
  }

  const [rates, liveSince] = await Promise.all([loadDutyRates(db), getLiveSince(db)]);
  const need = Math.max(1, sel.required);
  const landedInr = (native: number | null, cur: string, qty: number, country: string | null, freightPct: number) =>
    native === null ? null : landedCost({ unitPrice: native, currency: cur, qty, originCountry: country, hsn: part.hsnCode, rates, freightPct, fallback: FALLBACK_DUTY }).netPerUnit;
  const customerId = (await db.bomRevision.findUnique({ where: { id: b.revisionId }, select: { bom: { select: { project: { select: { customerId: true } } } } } }))?.bom.project.customerId;

  type Row = { key: string; name: string; detail: string; qty: number; unit: number | null; landed: number | null; lead: string; coc: boolean; dc: string | null; pin: { offerId?: string; excessListingId?: string; ours?: boolean } | null; mock?: boolean; url?: string | null; /** Weeks until the need is here from this source; null when unknown. */ leadWeeks: number | null; /** 0 our shelf … 5 a broker (sourceRisk). */ risk: number; tier?: number };
  const lots = part.inventoryLots.filter((l) => !l.isConsigned || l.customerId === customerId);
  const oursRow: Row[] = lots.length
    ? [
        {
          key: "ours",
          name: "Our stores & consignment",
          detail: lots.map((l) => `${l.isConsigned ? "consigned" : l.warehouse.name} ${l.bin}`).slice(0, 3).join(" · "),
          qty: lots.reduce((s, l) => s + Math.max(0, l.qty - l.reservedQty), 0),
          unit: (() => {
            const l = lots.find((x) => x.unitCost);
            return l?.unitCost ? convert(Number(l.unitCost), l.currency, "INR") : null;
          })(),
          landed: null,
          lead: "now",
          coc: lots.every((l) => l.cocOnFile),
          dc: lots[0]?.dateCode ?? null,
          pin: { ours: true },
          leadWeeks: 0,
          risk: 0,
        },
      ]
    : [];
  const listingRow = (e: (typeof part.excessListings)[number]): Row => ({
    key: e.id,
    name: e.supplier.name,
    detail: [e.location, e.acceptsBids ? "open to bids" : null].filter(Boolean).join(" · "),
    qty: e.qty,
    unit: e.askPrice ? convert(Number(e.askPrice), e.currency, "INR") : null,
    landed: landedInr(e.askPrice ? Number(e.askPrice) : null, e.currency, Math.min(e.qty, need), e.supplier.country, Number(e.supplier.freightPct)),
    lead: e.leadDays ? `${e.leadDays} d` : "—",
    coc: e.cocAvailable,
    dc: e.dateCode,
    pin: { excessListingId: e.id },
    leadWeeks: e.leadDays ? e.leadDays / 7 : null,
    risk: sourceRisk({ tier: SUPPLIER_TIER[e.supplier.kind], kind: e.supplier.kind, coc: e.cocAvailable, condition: e.condition }),
  });
  const offerRow = (o: (typeof part.offers)[number]): Row => {
    const breaks = readBreaks(o.priceBreaks);
    const q = Math.max(need, o.moq);
    const native = priceAtQty(breaks, q);
    return {
      key: o.id,
      name: o.supplier.name,
      detail: `${o.packaging ?? ""} · MOQ ${o.moq} · SPQ ${o.spq}`,
      qty: o.stock,
      unit: native === null ? null : convert(native, o.currency, "INR"),
      landed: landedInr(native, o.currency, q, o.supplier.country, Number(o.supplier.freightPct)),
      lead: o.stock >= need ? "in stock" : o.factoryLeadTimeWeeks ? `${o.factoryLeadTimeWeeks} wk` : "—",
      coc: o.cocAvailable,
      dc: o.dateCode,
      pin: o.stock > 0 ? { offerId: o.id } : null,
      mock: o.source === "mock",
      url: o.url,
      leadWeeks: o.stock >= need ? 0 : o.factoryLeadTimeWeeks,
      risk: sourceRisk({ tier: SUPPLIER_TIER[o.supplier.kind], kind: o.supplier.kind, coc: o.cocAvailable, condition: o.condition }),
    };
  };
  const tiers: { n: number; title: string; rows: Row[] }[] = [
    { n: 1, title: "Our inventory", rows: oursRow },
    { n: 2, title: "Channel partners & sourcing agents", rows: part.excessListings.filter((e) => e.supplier.kind === "CHANNEL_PARTNER").map(listingRow) },
    { n: 3, title: "Distributors (online)", rows: part.offers.filter((o) => DISTI.has(o.supplier.kind)).map(offerRow).sort((x, y) => (x.landed ?? Infinity) - (y.landed ?? Infinity)) },
    {
      n: 4,
      title: "Marketplace — excess and brokers (inspect before use)",
      rows: [...part.excessListings.filter((e) => e.supplier.kind !== "CHANNEL_PARTNER" && !OURS.has(e.supplier.kind)).map(listingRow), ...part.offers.filter((o) => o.supplier.kind === "BROKER").map(offerRow)],
    },
  ];
  const isPinned = (p: Row["pin"]) => !!p && !!sel.pin && (p.offerId ? sel.pin.offerId === p.offerId : p.excessListingId ? sel.pin.excessListingId === p.excessListingId : !!p.ours && !!sel.pin.ours);
  // Every source in one list, for ranking: what it costs landed, how long it takes, how exposed it is, how much it has.
  const flat = tiers.flatMap((t) => t.rows.map((r) => ({ ...r, tier: t.n })));
  const figures = (r: Row): Figures => ({ lead: r.leadWeeks, price: r.landed ?? r.unit, risk: r.risk, stock: r.qty, usable: r.qty > 0 });
  const ranked = sort === "order" ? flat : rank(flat, figures, sort, dir);
  const usable = flat.filter((r) => r.qty > 0);
  const barOf = (r: Row) => (sort === "order" || r.qty <= 0 ? 0 : share(figures(r)[sort], usable.map((x) => figures(x)[sort])));
  /** Parts the quote takes from this source now. */
  const inQuote = (r: Row) =>
    !r.pin || sel.excluded ? 0 : sel.plan.filter((p) => (r.pin!.offerId ? p.offerId === r.pin!.offerId : r.pin!.excessListingId ? p.excessListingId === r.pin!.excessListingId : p.tier <= 2)).reduce((s, p) => s + p.qty, 0);
  const bar = (r: Row, key: SortKey) =>
    sort === key ? (
      <span className="mt-1 ml-auto block h-1 w-16 overflow-hidden rounded-sm bg-muted" aria-hidden>
        <span className="block h-full bg-primary/70" style={{ width: `${Math.max(barOf(r) * 100, r.qty > 0 ? 4 : 0)}%` }} />
      </span>
    ) : null;
  const hot = (key: SortKey) => (sort === key ? "font-semibold text-foreground" : "");
  const sourceRow = (r: Row, place?: number) => {
    const taken = inQuote(r);
    const band = BAND[RISK_BAND(r.risk)];
    return (
      <tr key={r.key} className={cn(r.qty <= 0 && "text-muted-foreground", (isPinned(r.pin) || taken > 0) && "bg-part-soft/60")}>
        {place !== undefined ? <td className="num w-10 py-2 pl-4 text-right text-sm text-muted-foreground">{r.qty > 0 ? place : "—"}</td> : null}
        <td className="px-3 py-2">
          <span className="font-medium">{r.name}</span>
          {r.mock ? <span className="ml-1.5 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">mock</span> : null}
          {taken > 0 ? <span className="num ml-1.5 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap text-primary-foreground">In the quote · {taken.toLocaleString("en-IN")}</span> : null}
          <span className="block text-xs text-muted-foreground">{place !== undefined && r.tier ? `${TIER_SHORT[r.tier]} · ` : ""}{r.detail}</span>
        </td>
        <td className={cn("num px-3 py-2 text-right", hot("stock"))}>{r.qty.toLocaleString("en-IN")}<span className="block text-[11px] font-normal text-muted-foreground">available</span>{bar(r, "stock")}</td>
        <td className={cn("num px-3 py-2 text-right", hot("price"))}>{m.unit(r.landed ?? r.unit)}<span className="block text-[11px] font-normal whitespace-nowrap text-muted-foreground">landed · unit {m.unit(r.unit)}</span>{bar(r, "price")}</td>
        <td className={cn("num px-3 py-2 text-right text-xs whitespace-nowrap", hot("lead"))}>{r.lead}<span className="block text-[11px] font-normal text-muted-foreground">DC {r.dc ?? "—"}</span>{bar(r, "lead")}</td>
        <td className={cn("px-3 py-2 text-xs whitespace-nowrap", hot("risk"))}>
          <span className="inline-flex items-center gap-1.5"><RiskDot level={band.level} /> {band.label}</span>
          <span className="block text-[11px] font-normal text-muted-foreground">{r.coc ? "CoC" : "no CoC"}</span>
          {bar(r, "risk")}
        </td>
        <td className="py-2 pr-4 pl-1 text-right whitespace-nowrap">
          {edit && r.pin && !sel.excluded ? <ChooseButton act={{ kind: "pin", revisionId: b.revisionId, lineId: sel.id, pin: r.pin }} chosen={isPinned(r.pin)} label="Use" /> : null}
        </td>
      </tr>
    );
  };

  // Price history in the display currency, one series per seller (live once it exists).
  const names = new Map(part.offers.map((o) => [o.supplierId, o.supplier.name]));
  const points = part.priceHistory.map((h) => ({ supplierId: h.supplierId, currency: h.currency, unitPrice: Number(h.unitPrice), recordedAt: h.recordedAt }));
  const anyLive = points.some((p) => isLive(p, liveSince));
  const series: PriceSeries[] = [...priceSeries(points.filter((p) => isLive(p, liveSince) === anyLive), liveSince).values()]
    .map((list) => ({ supplier: `${names.get(list[0].supplierId ?? "") ?? "Market"}${anyLive ? "" : " (simulated)"}`, points: list.map((p) => ({ t: p.recordedAt.getTime(), price: convert(p.unitPrice, p.currency, currency) })) }))
    .sort((x, y) => y.points.length - x.points.length);

  const alts = part.alternatesFrom.filter((a) => a.altPart.lifecycle !== "EOL" && a.altPart.lifecycle !== "OBSOLETE");
  const altData = alts.length
    ? await db.part.findMany({ where: { id: { in: alts.map((a) => a.altPartId) } }, select: { id: true, inventoryLots: { select: { qty: true, reservedQty: true } }, offers: { select: { supplierId: true, currency: true, stock: true, moq: true, priceBreaks: true } } } })
    : [];
  const altInfo = new Map(altData.map((a) => [a.id, { stock: a.inventoryLots.reduce((s, l) => s + Math.max(0, l.qty - l.reservedQty), 0) + a.offers.reduce((s, o) => s + o.stock, 0), unit: bestOffer(a.offers, need, "INR")?.unit ?? null }]));
  const photo = webUrl(part.imageUrl);
  const datasheet = webUrl(part.datasheetUrl);
  const [rohsText, rohsLevel] = ROHS[part.rohs];
  const [reachText, reachLevel] = REACH[part.reach];

  return (
    <div className="space-y-4">
      <section aria-label="Part" className="grid gap-5 rounded-xl border bg-card p-5 sm:grid-cols-[120px_minmax(0,1fr)]">
        <div className="grid aspect-square w-full max-w-[120px] place-items-center overflow-hidden rounded-md border bg-white p-2">
          <PartPhoto src={photo} alt={`${part.mpn} photo`} className="max-h-full max-w-full" fallback={part.package ? <PackageDrawing pkg={part.package} size={90} /> : <span className="text-xs text-muted-foreground">No photo yet</span>} />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-semibold tracking-tight">
              <span className="mr-1 text-sm font-normal text-muted-foreground">Line {sel.lineNo}</span>{" "}
              {part.mpn}
            </h2>
            <span className="flex items-center gap-3 text-xs">
              {datasheet ? (
                <a href={datasheet} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium underline decoration-border hover:decoration-foreground">
                  <FileText className="size-3.5" aria-hidden /> Datasheet
                </a>
              ) : (
                <span className="text-muted-foreground">No datasheet yet</span>
              )}
              <Link href={`/parts/${part.id}`} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
                Part page <ExternalLink className="size-3" aria-hidden />
              </Link>
            </span>
          </div>
          <p className="text-sm text-muted-foreground"><span className="text-foreground">{part.manufacturer.name}</span> · {part.description}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <LifecycleBadge lifecycle={part.lifecycle} />
            {[[rohsText, rohsLevel], [reachText, reachLevel], [part.msl ? `MSL ${part.msl.replace("MSL_", "")}` : "MSL ?", part.msl ? "green" : "amber"], [part.package?.name ?? "package ?", "grey"], [`${part.category.name}`, "grey"]].map(([t, lv]) => (
              <span key={t} className="inline-flex h-6 items-center gap-1.5 rounded-md bg-muted px-2 text-xs">
                <RiskDot level={lv as "green" | "amber" | "red" | "grey"} /> {t}
              </span>
            ))}
          </div>
          <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-4">
            <div><dd className="text-2xl leading-none font-semibold tracking-tight tabular-nums">{sel.cost.priced ? m.unit(sel.perBoard) : "no price"}</dd><dt className="mt-1.5 text-xs text-muted-foreground">Cost per board</dt></div>
            <div className="min-w-0"><dd className="text-2xl leading-none font-semibold tracking-tight tabular-nums" title={sel.refDes}>{sel.qtyPerBoard}</dd><dt className="mt-1.5 max-w-48 truncate text-xs text-muted-foreground" title={sel.refDes}>Per board · {sel.refDes || "—"}</dt></div>
            <div><dd className="text-2xl leading-none font-semibold tracking-tight tabular-nums">{sel.required.toLocaleString("en-IN")}</dd><dt className="mt-1.5 text-xs text-muted-foreground" title="Including attrition">Need at {qtyLabel(b.refQty)}</dt></div>
            <div><dd className="flex items-center gap-2 text-2xl leading-none font-semibold tracking-tight tabular-nums">{sel.risk ? <><RiskDot level={sel.risk.level} />{sel.risk.score}</> : "—"}</dd><dt className="mt-1.5 text-xs text-muted-foreground">Risk / 100</dt></div>
          </dl>
        </div>
      </section>

      {sel.excluded ? (
        <p className="flex items-center gap-2 rounded-md border bg-muted/40 px-4 py-3 text-sm">
          {sel.excluded === "box" ? <BoxIcon className="size-4 text-muted-foreground" aria-hidden /> : <Layers className="size-4 text-muted-foreground" aria-hidden />}
          {sel.excluded === "box" ? "The enclosure — priced with the box." : "The bare board — priced in step 6."}
        </p>
      ) : null}

      {sel.missing.length ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-risk-amber/40 bg-risk-amber-soft px-4 py-3 text-sm">
          <span>
            <span className="font-medium">Missing:</span> {sel.missing.join(", ")}
          </span>
          {buyer ? <RefreshButton scope={{ partIds: [part.id], label: part.mpn }} label="Search distributors" /> : null}
        </section>
      ) : null}

      <section aria-labelledby="sources" className="overflow-hidden rounded-xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <h3 id="sources" className="text-base font-semibold">Where it comes from — choose a source</h3>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <span title="Landed = freight + duty, net of GST credit">at {need.toLocaleString("en-IN")} pcs</span>
            {edit && sel.pinned && !sel.excluded ? <ChooseButton act={{ kind: "pin", revisionId: b.revisionId, lineId: sel.id, pin: null }} chosen={false} label="Back to sourcing order" /> : null}
          </span>
        </div>
        {!sel.pinned && sel.plan.length ? (
          <p className="border-b bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
            Picks: {sel.plan.map((p) => `${p.qty.toLocaleString("en-IN")} from ${p.source}${p.unit !== null ? ` at ${m.unit(p.unit)}` : ""}`).join(" + ")}.
          </p>
        ) : null}
        <div className="border-b px-4 py-2.5">
          <OrderBy label="Rank sources by" first="Our order" sort={sort} dir={dir} href={href} />
        </div>
        {sort === "order" ? (
          tiers.map((t) => (
            <div key={t.n} className="border-b last:border-b-0">
              <h4 className="px-4 pt-3 pb-1 text-xs font-medium text-muted-foreground">{t.n} · {t.title}</h4>
              {t.rows.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <tbody className="divide-y">{t.rows.map((r) => sourceRow(r))}</tbody>
                  </table>
                </div>
              ) : (
                <p className="px-4 pb-3 text-sm text-muted-foreground">None.</p>
              )}
            </div>
          ))
        ) : ranked.length ? (
          <>
            <p className="px-4 pt-3 pb-1 text-xs font-medium text-muted-foreground">
              All {ranked.length} option{ranked.length === 1 ? "" : "s"} · {SORT[sort].label.toLowerCase()}, {SORT[sort][dir]}
              {sort === "lead" ? ` · for ${need.toLocaleString("en-IN")} pcs` : sort === "price" ? " · landed" : ""}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm" aria-label={`Sources ranked by ${SORT[sort].label.toLowerCase()}, ${SORT[sort][dir]}`}>
                <tbody className="divide-y">{ranked.map((r, i) => sourceRow(r, i + 1))}</tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="px-4 py-3 text-sm text-muted-foreground">Nobody lists this part yet.</p>
        )}
      </section>

      <div className="grid gap-4 2xl:grid-cols-2">
        <section aria-label="Price breaks" className="rounded-xl border bg-card">
          <h3 className="border-b px-4 py-3 text-base font-semibold">Price breaks</h3>
          <div className="px-3 py-3">
            <BreakChart
              need={need}
              format={(v) => m.unit(v)}
              series={part.offers
                .filter((o) => DISTI.has(o.supplier.kind))
                .slice(0, 5)
                .map((o) => ({ key: o.id, label: o.supplier.name, breaks: readBreaks(o.priceBreaks).map((x) => ({ qty: x.qty, price: convert(x.price, o.currency, "INR") })) }))}
            />
          </div>
        </section>
        <section aria-label="Price history" className="rounded-xl border bg-card">
          <h3 className="border-b px-4 py-3 text-base font-semibold">Price history @1k</h3>
          <div className="px-2 py-3">
            <PriceHistoryChartLoader series={series} currency={currency} />
          </div>
        </section>
      </div>

      <div className="grid gap-4 2xl:grid-cols-2">
        <section aria-label="Risk analysis" className="rounded-xl border bg-card">
          <div className="flex items-baseline justify-between border-b px-4 py-2.5">
            <h3 className="text-base font-semibold">Risk analysis</h3>
            {sel.risk ? <span className="num text-xs text-muted-foreground">{sel.risk.score} / 100</span> : null}
          </div>
          {sel.risk ? <p className="px-4 pt-2.5 text-sm">{sel.risk.summary}</p> : null}
          <ul className="divide-y">
            {sel.riskFactors.map((f) => (
              <li key={f.key} className="px-4 py-2">
                <div className="flex items-center gap-2 text-sm">
                  <RiskDot level={f.level} />
                  <span>{f.label}</span>
                  <span className="num ml-auto text-xs text-muted-foreground">{f.score}</span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-sm bg-muted">
                  <div className={cn("h-full", f.level === "green" ? "bg-risk-green" : f.level === "amber" ? "bg-risk-amber" : "bg-risk-red")} style={{ width: `${f.score}%` }} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{f.reason}{f.action ? <> <span className="text-foreground">Do:</span> {f.action}</> : null}</p>
              </li>
            ))}
          </ul>
        </section>

        <div className="space-y-4">
          <section aria-label="Alternates" className="rounded-xl border bg-card">
            <h3 className="border-b px-4 py-3 text-base font-semibold">Alternates</h3>
            {alts.length ? (
              <ul className="divide-y">
                {alts.map((a) => {
                  const info = altInfo.get(a.altPartId);
                  return (
                    <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                      <Link href={`/parts/${a.altPartId}`} className="num font-medium hover:underline">{a.altPart.mpn}</Link>
                      <span className="text-xs text-muted-foreground">{a.altPart.manufacturer.name} · {a.type.replace(/_/g, " ").toLowerCase()}{a.approvedAt ? " · approved" : ""}</span>
                      <span className="num ml-auto text-xs">{info ? `${info.stock.toLocaleString("en-IN")} avail. · ${m.unit(info.unit)}` : ""}</span>
                      {edit ? <UseAlternateButton lineId={sel.id} altPartId={a.altPartId} mpn={a.altPart.mpn} /> : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-4 py-3 text-sm text-muted-foreground">
                None recorded. <Link href={`/parts/${part.id}`} className="underline decoration-border hover:decoration-foreground">Part page</Link>
              </p>
            )}
          </section>
          {where}
        </div>
      </div>
    </div>
  );
}
