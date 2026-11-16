import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { getDisplayCurrency } from "@/lib/prefs";
import { convert, formatMoney } from "@/lib/currency";
import { readBreaks } from "@/lib/pricing";
import { SUPPLIER_TIER } from "@/lib/risk";
import { getPart } from "@/server/catalogue";
import { db } from "@/lib/db";
import { PageHeader, Section, EmptyState } from "@/components/data/page-header";
import { LifecycleBadge, RiskDot, SupplierTierBadge } from "@/components/data/badges";
import type { PriceSeries } from "@/components/data/price-history-chart";
import { PriceHistoryChartLoader } from "@/components/data/price-history-chart-loader";
import { RefreshButton } from "@/components/sourcing/refresh-button";
import { AddToCartButton } from "@/components/sourcing/cart-buttons";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { landedCost } from "@/lib/landed-cost";
import { priceAtQty } from "@/lib/currency";
import { FALLBACK_DUTY, loadDutyRates } from "@/server/bom-pipeline";
import { ensureFx } from "@/server/fx";
import { ArrowUp, BookOpen, Check, FileText, HelpCircle } from "lucide-react";
import { analysePartRisk } from "@/lib/part-risk";
import { isLive, priceSeries, priceTrendPct } from "@/lib/price-trend";
import { getLiveSince } from "@/server/price-history";
import { fractionalYear } from "@/lib/bom/scores";
import { BidButton } from "@/components/sourcing/cart-buttons";
import { PartPhoto } from "@/components/data/part-photo";
import { webUrl } from "@/server/sourcing/normalise";
import type { Check as ParamCheck } from "@/lib/alternates";
import { suggestAlternates } from "@/server/alternates";
import { ApproveAlternateButton, RemoveAlternateButton } from "@/components/parts/alternate-buttons";
import { cn } from "@/lib/utils";
import { ChatLink } from "@/components/sourcing/chat-link";
import { entryForPart } from "@/knowledge/dictionary";
import { GROUP_ICON } from "@/components/dictionary/group-icon";
import { articleForCategory, PACKAGE_FAMILY_ARTICLE, ARTICLES } from "@/knowledge";
import { PackageDrawing } from "@/components/knowledge/package-drawing";

const MSL_LABEL: Record<string, string> = { MSL_1: "1 (unlimited)", MSL_2: "2 (1 yr)", MSL_2A: "2a (4 wk)", MSL_3: "3 (168 h)", MSL_4: "4 (72 h)", MSL_5: "5 (48 h)", MSL_5A: "5a (24 h)", MSL_6: "6 (bake before use)" };
const ROHS_LABEL: Record<string, string> = { COMPLIANT: "Compliant", COMPLIANT_WITH_EXEMPTION: "Compliant with exemption", NON_COMPLIANT: "Not compliant", UNKNOWN: "Unknown" };
const REACH_LABEL: Record<string, string> = { COMPLIANT: "No SVHC", CONTAINS_SVHC: "Contains SVHC", UNKNOWN: "Unknown" };
const ALT_LABEL: Record<string, string> = { DROP_IN: "Drop-in (FFF)", PIN_TO_PIN: "Pin-to-pin", FUNCTIONAL: "Functional — needs review", UPGRADE: "Upgrade path" };

type Source = {
  key: string;
  tier: number;
  kind: Parameters<typeof SupplierTierBadge>[0]["kind"];
  name: string;
  detail: string;
  qty: number;
  unit: number | null;
  dateCode: string | null;
  coc: boolean;
  leadWeeks: number | null;
  landed: number | null;
  mock: boolean;
  url: string | null;
  supplierId: string | null;
  offerId: string | null;
  /** Distributor price breaks in the display currency (empty for stock lots and excess). */
  breaks: { qty: number; price: number }[];
  moq: number | null;
  askPrice: number | null;
  askCurrency: string | null;
  acceptsBids: boolean;
};

/** Order quantities shown as columns, like a distributor's price table. */
const BREAK_QTYS = [1, 10, 100, 1000, 10000];
const OURS = new Set(["INTERNAL_STOCK", "CONSIGNED"]);
const SUPPLIERS = new Set(["AUTHORISED", "MANUFACTURER"]);

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const part = await db.part.findUnique({ where: { id }, select: { mpn: true } });
  return { title: part?.mpn ?? "Part" };
}

export default async function PartPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  await ensureFx();
  const [part, currency, rates, liveSince] = await Promise.all([getPart(id), getDisplayCurrency(), loadDutyRates(db), getLiveSince(db)]);
  if (!part) notFound();
  const REF = 1000;
  const suggestions = await suggestAlternates(part.id, currency);
  const engineer = can(user.role, "bom.write");
  const datasheet = webUrl(part.datasheetUrl);
  const photo = webUrl(part.imageUrl);
  const landedAt = (native: number | null, cur: string, qty: number, country: string | null, freightPct: number) =>
    native === null
      ? null
      : convert(landedCost({ unitPrice: native, currency: cur, qty, originCountry: country, hsn: part.hsnCode, rates, freightPct, fallback: FALLBACK_DUTY }).netPerUnit, "INR", currency);

  // Sourcing waterfall: internal stores → consigned → excess → authorised → brokers.
  const sources: Source[] = [
    ...part.inventoryLots.map((l) => ({
      key: l.id,
      tier: l.isConsigned ? 2 : 1,
      kind: l.isConsigned ? ("CONSIGNED" as const) : ("INTERNAL_STOCK" as const),
      name: l.isConsigned ? `Consigned — ${l.customer?.name ?? "customer"}` : l.warehouse.name,
      detail: `Bin ${l.bin}${l.reelId ? ` · ${l.reelId}` : ""}${l.mslOpenedAt ? ` · bag open, ${l.floorLifeHoursLeft ?? "?"} h left` : ""}`,
      qty: l.qty - l.reservedQty,
      unit: l.unitCost ? convert(Number(l.unitCost), l.currency, currency) : null,
      dateCode: l.dateCode,
      coc: l.cocOnFile,
      leadWeeks: 0,
      landed: l.unitCost ? convert(Number(l.unitCost), l.currency, currency) : null,
      mock: false,
      url: null,
      supplierId: null,
      offerId: null,
      breaks: [],
      moq: null,
      askPrice: null,
      askCurrency: null,
      acceptsBids: false,
    })),
    ...part.excessListings.map((e) => ({
      key: e.id,
      tier: 3,
      kind: e.supplier.kind,
      name: e.supplier.name,
      detail: [e.location, e.leadDays ? `${e.leadDays} days to us` : null, e.acceptsBids ? "open to bids" : null].filter(Boolean).join(" · "),
      qty: e.qty,
      unit: e.askPrice ? convert(Number(e.askPrice), e.currency, currency) : null,
      dateCode: e.dateCode,
      coc: e.cocAvailable,
      leadWeeks: null,
      landed: landedAt(e.askPrice ? Number(e.askPrice) : null, e.currency, Math.min(e.qty, REF), e.supplier.country, Number(e.supplier.freightPct)),
      mock: false,
      url: null,
      supplierId: e.supplierId,
      offerId: null,
      breaks: [],
      moq: null,
      askPrice: e.askPrice ? Number(e.askPrice) : null,
      askCurrency: e.currency,
      acceptsBids: e.acceptsBids,
    })),
    ...part.offers.map((o) => {
      const breaks = readBreaks(o.priceBreaks);
      const at1k = breaks.filter((b) => b.qty <= 1000).at(-1) ?? breaks[0];
      return {
        key: o.id,
        tier: SUPPLIER_TIER[o.supplier.kind],
        kind: o.supplier.kind,
        name: o.supplier.name,
        detail: `${o.packaging ?? ""} · MOQ ${o.moq} · SPQ ${o.spq}`,
        qty: o.stock,
        unit: at1k ? convert(at1k.price, o.currency, currency) : null,
        dateCode: o.dateCode,
        coc: o.cocAvailable,
        leadWeeks: o.factoryLeadTimeWeeks,
        landed: landedAt(priceAtQty(breaks, Math.max(REF, o.moq)), o.currency, Math.max(REF, o.moq), o.supplier.country, Number(o.supplier.freightPct)),
        mock: o.source === "mock",
        url: o.url,
        supplierId: o.supplierId,
        offerId: o.id,
        breaks: breaks.map((b) => ({ qty: b.qty, price: convert(b.price, o.currency, currency) })),
        moq: o.moq,
        askPrice: null,
        askCurrency: null,
        acceptsBids: false,
      };
    }),
  ].sort((a, b) => a.tier - b.tier || (a.unit ?? Infinity) - (b.unit ?? Infinity));

  // Knowledge links: what this kind of part is, its package, and risk topics that apply to it.
  const kind = entryForPart({
    categorySlug: part.category.slug,
    description: part.description,
    mpn: part.mpn,
    params: Object.fromEntries(part.parameters.map((p) => [p.parameter.name, p.valueText])),
  });
  const KindIcon = kind ? GROUP_ICON[kind.group] : null;
  const learn = [
    articleForCategory(part.category.slug),
    part.package ? ARTICLES.find((a) => a.slug === PACKAGE_FAMILY_ARTICLE[part.package!.family]) : undefined,
    part.msl && part.msl !== "MSL_1" ? ARTICLES.find((a) => a.slug === "msl-handling") : undefined,
    part.lifecycle !== "ACTIVE" ? ARTICLES.find((a) => a.slug === "lifecycle-states") : undefined,
    part.counterfeitRisk >= 4 ? ARTICLES.find((a) => a.slug === "counterfeit-risk") : undefined,
    part.rohs === "COMPLIANT_WITH_EXEMPTION" || part.reach === "CONTAINS_SVHC" ? ARTICLES.find((a) => a.slug === "rohs-reach") : undefined,
  ].filter((a, i, arr): a is (typeof ARTICLES)[number] => !!a && arr.findIndex((b) => b?.slug === a.slug) === i);

  const facts: [string, React.ReactNode][] = [
    ["Category", `${part.category.parent?.name ?? ""} › ${part.category.name}`],
    ["Package", part.package ? `${part.package.name}${part.package.pitchMm ? ` · ${part.package.pitchMm} mm pitch` : ""}` : "—"],
    ["Mounting", part.mountType],
    ["MSL (J-STD-020)", part.msl ? MSL_LABEL[part.msl] : "—"],
    ["RoHS", ROHS_LABEL[part.rohs]],
    ["REACH", REACH_LABEL[part.reach]],
    ["HSN (India)", <span key="hsn" className="num">{part.hsnCode ?? "—"}</span>],
    ["ECCN", <span key="eccn" className="num">{part.eccn ?? "—"}</span>],
    ["Country of origin", part.countryOfOrigin ?? "—"],
    ["Manufacturer lead time", part.mfrLeadTimeWeeks ? `${part.mfrLeadTimeWeeks} weeks` : "—"],
    ["In market since", part.introducedYear ?? "—"],
    ["Counterfeit risk", <span key="cf" className="num">{part.counterfeitRisk} / 5</span>],
  ];

  // Chart one series per seller and market (live once it exists, else the simulated market),
  // converted to the display currency; the trend comes from one consistent series only.
  const supplierNames = new Map(part.offers.map((o) => [o.supplierId, o.supplier.name]));
  const points = part.priceHistory.map((h) => ({ supplierId: h.supplierId, currency: h.currency, unitPrice: Number(h.unitPrice), recordedAt: h.recordedAt }));
  const anyLive = points.some((p) => isLive(p, liveSince));
  const series: PriceSeries[] = [...priceSeries(points.filter((p) => isLive(p, liveSince) === anyLive), liveSince).values()]
    .map((list) => ({
      supplier: `${supplierNames.get(list[0].supplierId ?? "") ?? "Market"}${anyLive ? "" : " (simulated)"}`,
      points: list.map((p) => ({ t: p.recordedAt.getTime(), price: convert(p.unitPrice, p.currency, currency) })),
    }))
    .sort((a, b) => b.points.length - a.points.length);
  const trend = priceTrendPct(points, { liveSince });
  const change = trend ?? 0;
  const buyer = can(user.role, "sourcing.buy");

  // Availability in the order we source: our inventory → supplier inventory → marketplace.
  const ours = sources.filter((x) => OURS.has(x.kind));
  const suppliers = sources.filter((x) => SUPPLIERS.has(x.kind));
  const partners = sources.filter((x) => x.kind === "CHANNEL_PARTNER");
  const market = sources.filter((x) => !OURS.has(x.kind) && !SUPPLIERS.has(x.kind) && x.kind !== "CHANNEL_PARTNER");
  const total = (list: Source[]) => list.reduce((t, x) => t + Math.max(0, x.qty), 0);
  const authorised = part.offers.filter((o) => SUPPLIERS.has(o.supplier.kind));
  const leads = authorised.map((o) => o.factoryLeadTimeWeeks).filter((w): w is number => w !== null);
  const risk = analysePartRisk({
    lifecycle: part.lifecycle,
    introducedYear: part.introducedYear,
    counterfeitRisk: part.counterfeitRisk,
    rohs: part.rohs,
    reach: part.reach,
    ownQty: total(ours),
    marketplaceQty: total(market),
    authorisedStock: authorised.reduce((t, o) => t + o.stock, 0),
    authorisedSources: new Set(authorised.filter((o) => o.stock > 0).map((o) => o.supplierId)).size,
    leadWeeks: leads.length ? Math.min(...leads) : (part.mfrLeadTimeWeeks ?? null),
    alternates: part.alternatesFrom.filter((a) => a.type === "DROP_IN" || a.type === "PIN_TO_PIN").length,
    priceTrendPct: trend,
    need: REF,
    nowYear: fractionalYear(new Date()),
  });
  const money = (v: number | null) => (v === null ? "—" : formatMoney(v, currency, { unit: true }));

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/parts" className="hover:text-foreground">Parts catalogue</Link>}
        title={<span className="num">{part.mpn}</span>}
        description={
          <>
            <span className="text-foreground">{part.manufacturer.name}</span> · {part.description}
          </>
        }
        actions={
          <>
            {datasheet ? (
              <a
                href={datasheet}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-card px-2.5 text-xs outline-none transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              >
                <FileText className="size-3.5 text-muted-foreground" aria-hidden />
                Datasheet
              </a>
            ) : null}
            <LifecycleBadge lifecycle={part.lifecycle} />
            {buyer ? <RefreshButton scope={{ partIds: [part.id], label: part.mpn }} label="Refresh offers" /> : null}
          </>
        }
      />

      {part.counterfeitRisk >= 4 ? (
        <div className="mb-6 flex items-start gap-2.5 rounded-lg border border-risk-amber/40 bg-risk-amber-soft px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-risk-amber" aria-hidden />
          <span>Frequently counterfeited part. Buy from authorised channels only, or require CoC, decapsulation / X-ray inspection for broker stock.</span>
        </div>
      ) : null}

      <section aria-label="Part summary" className="mb-6 grid gap-5 rounded-lg border bg-card p-4 sm:grid-cols-[160px_minmax(0,1fr)] xl:grid-cols-[180px_minmax(0,1fr)_300px]">
        <div className="grid aspect-square w-full max-w-[180px] place-items-center overflow-hidden rounded-md border bg-white p-3">
          <PartPhoto
            src={photo}
            alt={`${part.mpn} product photo`}
            className="max-h-full max-w-full"
            fallback={part.package ? <PackageDrawing pkg={part.package} size={130} /> : <span className="text-xs text-muted-foreground">No photo yet</span>}
          />
        </div>
        <dl className="grid content-start gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Fact label="Manufacturer part number"><span className="num font-medium">{part.mpn}</span></Fact>
          <Fact label="Brand">{part.manufacturer.name}</Fact>
          <Fact label="Category">{part.category.name}</Fact>
          <Fact label="Package">{part.package ? `${part.package.name}${part.package.pitchMm ? ` · ${part.package.pitchMm} mm` : ""}` : "—"}</Fact>
          <Fact label="Lifecycle"><LifecycleBadge lifecycle={part.lifecycle} /></Fact>
          <Fact label="RoHS">
            <span className="inline-flex items-center gap-1.5"><RiskDot level={part.rohs === "COMPLIANT" ? "green" : part.rohs === "NON_COMPLIANT" ? "red" : "amber"} />{ROHS_LABEL[part.rohs]}</span>
          </Fact>
          <Fact label="REACH">
            <span className="inline-flex items-center gap-1.5"><RiskDot level={part.reach === "COMPLIANT" ? "green" : "amber"} />{REACH_LABEL[part.reach]}</span>
          </Fact>
          <Fact label="Moisture sensitivity">{part.msl ? `MSL ${MSL_LABEL[part.msl]}` : "—"}</Fact>
          <Fact label="Datasheet">
            {datasheet ? (
              <a href={datasheet} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline">
                <FileText className="size-3.5 text-muted-foreground" aria-hidden /> PDF
              </a>
            ) : (
              "—"
            )}
          </Fact>
        </dl>
        <a
          href="#risk"
          className="block rounded-md border bg-muted/30 p-4 outline-none transition-colors duration-150 hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring sm:col-span-2 xl:col-span-1"
        >
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldAlert className="size-3.5" aria-hidden /> Risk analysis
          </span>
          <span className="mt-2 flex items-baseline gap-2">
            <span className={cn("num text-3xl font-semibold tracking-tight", risk.level === "green" ? "text-risk-green" : risk.level === "amber" ? "text-risk-amber" : "text-risk-red")}>{risk.score}</span>
            <span className="text-sm text-muted-foreground">/ 100</span>
          </span>
          <span className="mt-1 block text-sm">{risk.summary}</span>
          {risk.factors.filter((f) => f.action).slice(0, 2).map((f) => (
            <span key={f.key} className="mt-2 block text-xs text-muted-foreground">→ {f.action}</span>
          ))}
        </a>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <section aria-labelledby="availability" className="rounded-lg border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
              <h2 id="availability" className="text-base font-medium">Availability</h2>
              <span className="text-xs text-muted-foreground">Prices in {currency}; landed = freight + duty, net of GST credit</span>
            </div>
            <div className="grid grid-cols-2 divide-x border-b text-center sm:grid-cols-4">
              {[
                ["Our inventory", total(ours), ours.length],
                ["Channel partners & agents", total(partners), partners.length],
                ["Distributors (online)", total(suppliers), suppliers.length],
                ["Marketplace", total(market), market.length],
              ].map(([label, qty, count], i) => (
                <a key={String(label)} href={`#tier-${i + 1}`} className="px-2 py-3 transition-colors duration-150 hover:bg-muted/40">
                  <span className="block text-xs text-muted-foreground">
                    {i + 1} · {label}
                  </span>
                  <span className="num mt-0.5 block text-lg font-medium">{Number(qty).toLocaleString("en-IN")}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {count} {Number(count) === 1 ? "source" : "sources"}
                  </span>
                </a>
              ))}
            </div>

            <Tier id="tier-1" n={1} title="Our inventory" hint="Stores and customer-consigned stock — free quantity after reservations.">
              {ours.length ? (
                <table className="w-full min-w-[460px] text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="px-4 py-2 font-normal">Location</th>
                      <th className="px-4 py-2 text-right font-normal">Free</th>
                      <th className="px-4 py-2 text-right font-normal">Unit cost</th>
                      <th className="px-4 py-2 text-right font-normal">DC</th>
                      <th className="px-4 py-2 text-center font-normal">CoC</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {ours.map((x) => (
                      <tr key={x.key} className={x.qty === 0 ? "text-muted-foreground" : undefined}>
                        <td className="px-4 py-2.5">
                          <span className="flex flex-wrap items-center gap-2">
                            <SupplierTierBadge kind={x.kind} />
                            <span className="text-xs">{x.name}</span>
                          </span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">{x.detail}</span>
                        </td>
                        <td className="num px-4 py-2.5 text-right">{x.qty.toLocaleString("en-IN")}</td>
                        <td className="num px-4 py-2.5 text-right whitespace-nowrap">{money(x.unit)}</td>
                        <td className="num px-4 py-2.5 text-right text-xs">{x.dateCode ?? "—"}</td>
                        <td className="px-4 py-2.5 text-center"><RiskDot level={x.coc ? "green" : "red"} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="px-4 py-3 text-sm text-muted-foreground">None in our stores or consignment.</p>
              )}
            </Tier>

            <Tier id="tier-2" n={2} title="Channel partners & sourcing agents" hint="Stock lists from our partners and agents — trusted, quick to us, open to a counter-offer.">
              {partners.length ? (
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="px-4 py-2 font-normal">Partner</th>
                      <th className="px-4 py-2 font-normal">Where · lead</th>
                      <th className="px-4 py-2 text-right font-normal">Available</th>
                      <th className="px-4 py-2 text-right font-normal">Unit</th>
                      <th className="px-4 py-2 text-right font-normal">DC</th>
                      <th className="px-4 py-2 text-center font-normal">CoC</th>
                      <th className="px-2 py-2"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {partners.map((x) => (
                      <tr key={x.key}>
                        <td className="px-4 py-2.5 text-sm">{x.name}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{x.detail}</td>
                        <td className="num px-4 py-2.5 text-right">{x.qty.toLocaleString("en-IN")}</td>
                        <td className="num px-4 py-2.5 text-right whitespace-nowrap">{money(x.unit)}</td>
                        <td className="num px-4 py-2.5 text-right text-xs">{x.dateCode ?? "—"}</td>
                        <td className="px-4 py-2.5 text-center"><RiskDot level={x.coc ? "green" : "amber"} /></td>
                        <td className="px-2 py-2">
                          <span className="flex items-center justify-end gap-1">
                            {buyer && x.qty > 0 ? <BidButton item={{ partId: part.id, qty: Math.min(x.qty, REF), supplierId: x.supplierId, offerId: null, excessListingId: x.key }} askPrice={x.askPrice} currency={x.askCurrency ?? currency} /> : null}
                            <ChatLink thread={`listing:${x.key}`} />
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="px-4 py-3 text-sm text-muted-foreground">No channel partner or agent lists this part.</p>
              )}
            </Tier>

            <Tier id="tier-3" n={3} title="Distributors (online)" hint="Authorised distributors and manufacturer direct — price per unit at each order quantity.">
              {suppliers.length ? (
                <table className="w-full min-w-[920px] text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="px-4 py-2 font-normal">Supplier</th>
                      <th className="px-4 py-2 text-right font-normal">Stock</th>
                      <th className="px-4 py-2 text-right font-normal">MOQ</th>
                      <th className="px-4 py-2 text-right font-normal">Lead</th>
                      {BREAK_QTYS.map((q) => (
                        <th key={q} className="px-3 py-2 text-right font-normal">{q >= 1000 ? `${q / 1000}k` : q}</th>
                      ))}
                      <th className="px-4 py-2 text-right font-normal">Landed @1k</th>
                      <th className="px-2 py-2"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {suppliers.map((x) => (
                      <tr key={x.key} className={x.qty === 0 ? "text-muted-foreground" : undefined}>
                        <td className="px-4 py-2.5">
                          <span className="text-sm">
                            {x.url ? <a href={x.url} target="_blank" rel="noreferrer" className="hover:underline">{x.name}</a> : x.name}
                            {x.mock ? <span className="ml-1 rounded bg-muted px-1 text-[10px] text-muted-foreground" title="Simulated market data">mock</span> : null}
                          </span>
                          <span className="block text-xs text-muted-foreground">{x.detail}</span>
                        </td>
                        <td className="num px-4 py-2.5 text-right">{x.qty.toLocaleString("en-IN")}</td>
                        <td className="num px-4 py-2.5 text-right">{x.moq?.toLocaleString("en-IN") ?? "—"}</td>
                        <td className="num px-4 py-2.5 text-right text-xs">{x.leadWeeks === null ? "—" : `${x.leadWeeks} wk`}</td>
                        {BREAK_QTYS.map((q) => {
                          const p = q >= (x.moq ?? 1) ? priceAtQty(x.breaks, q) : null;
                          return (
                            <td key={q} className="num px-3 py-2.5 text-right whitespace-nowrap">
                              {p === null ? <span className="text-muted-foreground">—</span> : money(p)}
                            </td>
                          );
                        })}
                        <td className="num px-4 py-2.5 text-right whitespace-nowrap text-muted-foreground">{money(x.landed)}</td>
                        <td className="px-2 py-2">
                          {buyer && x.qty > 0 ? <AddToCartButton item={{ partId: part.id, qty: Math.max(REF, x.moq ?? 1), supplierId: x.supplierId, offerId: x.offerId, excessListingId: null }} /> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="px-4 py-3 text-sm text-muted-foreground">No distributor offers yet{buyer ? " — use Refresh offers above" : ""}.</p>
              )}
            </Tier>

            <Tier id="tier-4" n={4} title="Marketplace" hint="Our own and partner EMS/OEM excess, then independent brokers. Broker stock needs a CoC and inspection.">
              {market.length ? (
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="px-4 py-2 font-normal">Seller</th>
                      <th className="px-4 py-2 font-normal">Detail</th>
                      <th className="px-4 py-2 text-right font-normal">Available</th>
                      <th className="px-4 py-2 text-right font-normal">Unit</th>
                      <th className="px-4 py-2 text-right font-normal">DC</th>
                      <th className="px-4 py-2 text-center font-normal">CoC</th>
                      <th className="px-2 py-2"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {market.map((x) => (
                      <tr key={x.key} className={x.qty === 0 ? "text-muted-foreground" : undefined}>
                        <td className="px-4 py-2.5"><SupplierTierBadge kind={x.kind} /><span className="mt-1 block text-xs">{x.name}</span></td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">
                          {x.detail}
                          {x.kind === "BROKER" ? <span className="mt-0.5 block text-risk-amber">Independent seller — require CoC and inspection</span> : null}
                        </td>
                        <td className="num px-4 py-2.5 text-right">{x.qty.toLocaleString("en-IN")}</td>
                        <td className="num px-4 py-2.5 text-right whitespace-nowrap">{money(x.unit)}</td>
                        <td className="num px-4 py-2.5 text-right text-xs">{x.dateCode ?? "—"}</td>
                        <td className="px-4 py-2.5 text-center"><RiskDot level={x.coc ? "green" : "red"} /></td>
                        <td className="px-2 py-2">
                          {buyer && x.qty > 0 ? (
                            x.acceptsBids ? (
                              <span className="flex items-center justify-end gap-1">
                                <BidButton item={{ partId: part.id, qty: Math.min(x.qty, REF), supplierId: x.supplierId, offerId: null, excessListingId: x.key }} askPrice={x.askPrice} currency={x.askCurrency ?? currency} />
                                <ChatLink thread={`listing:${x.key}`} />
                              </span>
                            ) : (
                              <AddToCartButton
                                item={{ partId: part.id, qty: Math.min(x.qty, REF), supplierId: x.supplierId, offerId: x.offerId, excessListingId: x.kind === "OWN_EXCESS" || x.kind === "PARTNER_EXCESS" ? x.key : null }}
                              />
                            )
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="px-4 py-3 text-sm text-muted-foreground">No excess or broker listings.</p>
              )}
            </Tier>
          </section>

          <Section title="Alternates & form-fit-function">
            {part.alternatesFrom.length ? (
              <ul className="divide-y">
                {part.alternatesFrom.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                    <Link href={`/parts/${a.altPartId}`} className="num text-sm font-medium hover:underline">{a.altPart.mpn}</Link>
                    <span className="text-xs text-muted-foreground">{a.altPart.manufacturer.name}</span>
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      <RiskDot level={a.type === "FUNCTIONAL" ? "amber" : "green"} />
                      {ALT_LABEL[a.type]}
                    </span>
                    <span className="num ml-auto text-xs text-muted-foreground">{a.confidence}%</span>
                    {engineer ? <RemoveAlternateButton partId={part.id} altPartId={a.altPartId} mpn={a.altPart.mpn} /> : null}
                    <p className="w-full text-xs text-muted-foreground">
                      {a.notes ? `${a.notes} ` : ""}
                      {a.approvedAt ? `Approved by ${a.approvedBy ?? "engineering"} on ${a.approvedAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}.` : "Recorded automatically: same category, package and critical parameters."}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No alternates recorded">Approve one of the suggestions below, or add one when a BoM brings in a second source.</EmptyState>
            )}
            <div className="border-t">
              <h3 className="px-4 pt-3 text-xs text-muted-foreground">Suggested from parameters — other parts in this category, compared value by value</h3>
              {suggestions.length ? (
                <ul className="divide-y">
                  {suggestions.map((s) => (
                    <li key={s.part.id} className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                        <Link href={`/parts/${s.part.id}`} className="num text-sm font-medium hover:underline">{s.part.mpn}</Link>
                        <span className="text-xs text-muted-foreground">{s.part.manufacturer}</span>
                        <span className="inline-flex items-center gap-1.5 text-xs">
                          <RiskDot level={s.type === "FUNCTIONAL" ? "amber" : "green"} />
                          {ALT_LABEL[s.type ?? "FUNCTIONAL"]}
                        </span>
                        {s.secondSource ? <span className="rounded bg-muted px-1.5 py-0.5 text-[11px]">Second source</span> : null}
                        <span className="num ml-auto text-xs text-muted-foreground">{s.confidence}%</span>
                        <span className="num text-xs whitespace-nowrap">{s.part.unit === null ? "—" : formatMoney(s.part.unit, currency, { unit: true })}</span>
                        <span className="num text-xs whitespace-nowrap text-muted-foreground">{s.part.stock.toLocaleString("en-IN")} avail.</span>
                        {engineer ? <ApproveAlternateButton partId={part.id} altPartId={s.part.id} /> : null}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{s.summary}</p>
                      <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={`How ${s.part.mpn} compares`}>
                        {s.checks.filter((c) => c.outcome !== "info").map((c) => (
                          <CheckChip key={c.key} check={c} />
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-4 pt-1.5 pb-3 text-sm text-muted-foreground">No other catalogue part meets every parameter of this one yet.</p>
              )}
            </div>
          </Section>
        </div>

        <div className="min-w-0 space-y-6">
          <div id="risk" className="scroll-mt-20">
            <Section title="Risk analysis" action={<span className="num text-xs text-muted-foreground">{risk.score} / 100 at {REF.toLocaleString("en-IN")} pcs</span>}>
              <p className="px-4 pt-3 text-sm">{risk.summary}</p>
              <ul className="mt-1 divide-y">
                {risk.factors.map((f) => (
                  <li key={f.key} className="px-4 py-2.5">
                    <div className="flex items-center gap-2 text-sm">
                      <RiskDot level={f.level} />
                      <span className="font-medium">{f.label}</span>
                      <span className="num ml-auto text-xs text-muted-foreground">{f.score}</span>
                    </div>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                      <div className={cn("h-full rounded-full", f.level === "green" ? "bg-risk-green" : f.level === "amber" ? "bg-risk-amber" : "bg-risk-red")} style={{ width: `${f.score}%` }} />
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{f.reason}</p>
                    {f.action ? <p className="mt-1 text-xs leading-relaxed"><span className="font-medium">Do:</span> {f.action}</p> : null}
                  </li>
                ))}
              </ul>
            </Section>
          </div>

          <Section
            title="Price history @1k"
            action={
              trend === null ? (
                <span className="text-xs text-muted-foreground">{anyLive ? "live history building up" : "no trend yet"}</span>
              ) : (
                <span className={`num text-xs ${change > 3 ? "text-risk-red" : change < -3 ? "text-risk-green" : "text-muted-foreground"}`}>
                  {change >= 0 ? "+" : ""}
                  {change.toFixed(1)}% in 90 days
                </span>
              )
            }
          >
            <div className="px-2 py-3">
              <PriceHistoryChartLoader series={series} currency={currency} />
            </div>
          </Section>

          {kind && KindIcon ? (
            <Section
              title="About this kind of part"
              action={
                <Link href={`/knowledge/dictionary/${kind.slug}`} className="text-xs text-muted-foreground hover:text-foreground">
                  Dictionary
                </Link>
              }
            >
              <div className="px-4 py-3">
                <Link href={`/knowledge/dictionary/${kind.slug}`} className="group flex items-center gap-2.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/8 text-primary">
                    <KindIcon className="size-4" aria-hidden />
                  </span>
                  <span className="text-sm font-medium group-hover:underline">{kind.name}</span>
                </Link>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{kind.oneLiner}</p>
                <h3 className="mt-3 text-xs text-muted-foreground">Before swapping, check</h3>
                <ul className="mt-1.5 space-y-1.5 text-sm">
                  {kind.alternatives.rules.slice(0, 3).map((r, i) => (
                    <li key={i} className="flex gap-2">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-risk-green" aria-hidden />
                      <span className="leading-relaxed">{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Section>
          ) : null}

          {learn.length || part.package ? (
            <Section title="Learn about this part">
              <div className="flex gap-4 px-4 py-3">
                {part.package ? <PackageDrawing pkg={part.package} size={88} /> : null}
                <ul className="min-w-0 flex-1 space-y-2 text-sm">
                  {learn.map((a) => (
                    <li key={a.slug}>
                      <Link href={`/knowledge/${a.slug}`} className="inline-flex items-start gap-1.5 font-medium hover:underline">
                        <BookOpen className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                        {a.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </Section>
          ) : null}

          <Section title="Parameters">
            <dl className="divide-y text-sm">
              {part.parameters.map((p) => (
                <div key={p.id} className="flex justify-between gap-4 px-4 py-2">
                  <dt className="text-muted-foreground">{p.parameter.name}</dt>
                  <dd className="num text-right">{p.valueText}</dd>
                </div>
              ))}
            </dl>
          </Section>

          <Section title="Compliance & logistics">
            <dl className="divide-y text-sm">
              {facts.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 px-4 py-2">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-right">{v}</dd>
                </div>
              ))}
            </dl>
          </Section>

          {part.bomLines.length ? (
            <Section title="Used in">
              <ul className="divide-y text-sm">
                {part.bomLines.map((l) => (
                  <li key={l.id} className="px-4 py-2">
                    <Link href={`/boms/${l.revisionId}`} className="hover:underline">{l.revision.bom.name}</Link>
                    <span className="num ml-2 text-xs text-muted-foreground">{l.refDes}</span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </div>
      </div>
    </>
  );
}

/** One parameter of a suggested alternate: same, better (with the change) or not listed. */
function CheckChip({ check: c }: { check: ParamCheck }) {
  const tone = c.outcome === "better" ? "bg-risk-green-soft" : c.outcome === "same" ? "bg-muted/60" : "bg-risk-amber-soft";
  const Icon = c.outcome === "better" ? ArrowUp : c.outcome === "same" ? Check : HelpCircle;
  const value = c.outcome === "same" ? c.from : c.outcome === "unknown" ? "not listed" : `${c.from ?? "—"} → ${c.to ?? "—"}`;
  return (
    <li className={cn("inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px]", tone)}>
      <Icon className={cn("size-3", c.outcome === "same" ? "text-risk-green" : "text-foreground/70")} aria-hidden />
      <span className="text-muted-foreground">{c.name}</span>
      <span className="num">{value}</span>
      <span className="sr-only">{c.outcome}</span>
    </li>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words">{children}</dd>
    </div>
  );
}

function Tier({ id, n, title, hint, children }: { id: string; n: number; title: string; hint: string; children: React.ReactNode }) {
  return (
    <div id={id} className="scroll-mt-20 border-b last:border-b-0">
      <div className="flex items-baseline gap-2 px-4 pt-3 pb-1">
        <span className="num grid size-5 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-medium text-primary">{n}</span>
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="hidden truncate text-xs text-muted-foreground sm:inline">{hint}</span>
      </div>
      <div className="overflow-x-auto pb-1">{children}</div>
    </div>
  );
}
