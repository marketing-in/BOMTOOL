import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, CircleDot, Search, X } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getDisplayCurrency } from "@/lib/prefs";
import { getBuild, type BoxOption } from "@/server/build";
import { BOX_TYPES, boxType } from "@/knowledge/box-types";
import { ViewerLoader } from "@/components/viewer/viewer-loader";
import { RefreshButton } from "@/components/sourcing/refresh-button";
import { BuildHeader } from "@/components/build/build-header";
import { ChooseButton } from "@/components/build/choose-button";
import { CompareBars } from "@/components/build/bars";
import { moneyIn, qtyLabel } from "@/components/build/format";
import { BoardIso } from "@/components/viz/board-iso";
import { SegBar } from "@/components/viz/seg-bar";
import { cn } from "@/lib/utils";

export const metadata = { title: "Build & quote — box" };

const KIT: Record<string, { text: string; tone: string; ink: string }> = {
  "in-bom": { text: "On the BoM", tone: "text-risk-green", ink: "var(--risk-green)" },
  supplied: { text: "Ships with the box", tone: "text-risk-green", ink: "var(--cost-3)" },
  missing: { text: "Not on the BoM", tone: "text-risk-red", ink: "var(--risk-red)" },
  nre: { text: "Machining / NRE", tone: "text-risk-amber", ink: "var(--cost-4)" },
  check: { text: "Check", tone: "text-risk-amber", ink: "var(--risk-amber)" },
};

/** Does this option belong to the box type? Catalogue boxes by their style; made-to-fit by the maker style. */
function ofType(o: BoxOption, slug: string) {
  const t = boxType(slug);
  if (!t) return true;
  if (o.type === slug) return true;
  return o.kind === "catalogue" ? t.enclosureStyle === o.spec.style && slug !== "sealed-ip67" : t.makerStyle === o.spec.style;
}

export default async function BoxStepPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ type?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { type: typeParam } = await searchParams;
  const [b, currency] = await Promise.all([getBuild(id), getDisplayCurrency()]);
  if (!b) notFound();
  const m = moneyIn(currency);
  const edit = can(user.role, "bom.write");
  const buyer = can(user.role, "sourcing.buy");
  const chosen = b.box.chosen;
  const type = typeParam === "all" ? "all" : (typeParam ?? chosen?.type ?? b.box.recognisedType ?? "all");
  const catalogue = b.box.catalogue.filter((o) => type === "all" || ofType(o, type));
  const custom = b.box.custom.filter((o) => type === "all" || ofType(o, type));
  const isChosen = (o: BoxOption) => chosen?.key === o.key;
  const perUnitAtRef = (o: BoxOption) => {
    const p = o.prices.find((x) => x.qty === b.refQty);
    return !p || p.unit === null ? null : p.unit + p.nre / b.refQty;
  };
  const unpriced = catalogue.filter((o) => o.partId && o.prices.some((p) => p.unit === null)).map((o) => o.partId!);
  const t = type === "all" ? null : boxType(type);

  return (
    <>
      <BuildHeader b={b} current="box" currency={currency} />

      <section aria-label="The product in its box">
        {b.viewer.enclosure ? (
          <ViewerLoader key={chosen?.key ?? "none"} data={b.viewer} initialMode="box" compact />
        ) : (
          // No box: the product is the board itself, so the board is the picture.
          <div className="flex flex-col items-center gap-2 rounded-lg border bg-card px-6 py-6 text-center">
            <Link
              href={`/boms/${id}/viewer`}
              aria-label="Open the board in 3D"
              className="group block w-full max-w-sm rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <BoardIso
                revisionId={id}
                width={b.viewer.board.width}
                height={b.viewer.board.height}
                thickness={b.viewer.board.thickness}
                artwork={!!b.viewer.board.top}
                maskColor={b.viewer.board.maskColor}
                parts={b.viewer.parts.map((part) => ({ refDes: part.refDes, x: part.x, y: part.y, rotation: part.rotation, side: part.side, body: part.body, dnp: part.dnp, mark: part.marking ?? part.mpn }))}
                label={`${b.product?.name ?? b.title} in 3D`}
                className="transition-transform duration-200 group-hover:scale-[1.02]"
              />
            </Link>
            <p className="text-sm font-medium">Board only — no box chosen.</p>
            <p className="text-sm text-muted-foreground">Pick a box below to see it in its box.</p>
          </div>
        )}
      </section>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border bg-card">
          <h2 className="border-b px-4 py-3 text-base font-medium">The box{b.box.auto && chosen ? " — from the project spec" : ""}</h2>
          {chosen ? (
            <div className="space-y-3 px-4 py-3 text-sm">
              <div>
                <span className="block font-medium">{chosen.spec.label}</span>
                <span className="num block text-xs text-muted-foreground">
                  {chosen.spec.length} × {chosen.spec.width} × {chosen.spec.height} mm · {chosen.spec.material} · {chosen.ipRating ?? "IP —"}
                  {chosen.maker ? ` · ${chosen.maker.name}` : ""}
                </span>
              </div>
              <p className={cn("flex items-start gap-1.5 text-xs", chosen.fits ? "text-risk-green" : "text-risk-red")}>
                {chosen.fits ? <Check className="mt-0.5 size-3.5 shrink-0" aria-hidden /> : <X className="mt-0.5 size-3.5 shrink-0" aria-hidden />}
                {chosen.fitText}
              </p>
              <dl className="num grid grid-cols-2 gap-2 text-xs">
                {chosen.prices.map((p) => (
                  <div key={p.qty}>
                    <dt className="font-sans text-muted-foreground">{qtyLabel(p.qty)}</dt>
                    <dd className="text-sm">{m.unit(p.unit)}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-xs text-muted-foreground">
                {chosen.cutouts ? `${chosen.cutouts} connector cut-out${chosen.cutouts === 1 ? "" : "s"} machined (in the price) · ` : ""}
                {chosen.prices[0]?.nre ? `${m.whole(chosen.prices[0].nre)} one-off` : "no one-off cost"} · {chosen.leadDays ? `${chosen.leadDays} d lead` : "in stock"}
              </p>
            </div>
          ) : (
            <p className="px-4 py-3 text-sm text-muted-foreground">Board only.</p>
          )}
          {edit ? (
            <div className="flex flex-wrap gap-2 border-t px-4 py-3">
              <ChooseButton act={{ kind: "box", revisionId: id, choice: { kind: "none" } }} chosen={b.box.choice?.kind === "none"} label="Board only, no box" chosenLabel="Board only" />
              {!b.box.auto ? <ChooseButton act={{ kind: "box", revisionId: id, choice: null }} chosen={false} label="Back to the project's box" /> : null}
            </div>
          ) : null}
        </section>
        {b.box.kit.length ? (
          <section className="rounded-lg border bg-card">
            <h2 className="border-b px-4 py-3 text-base font-medium">Box-build kit</h2>
            {/* The kit at a glance: how much of it is covered, how much is missing or to check. */}
            <div className="border-b px-4 py-3">
              <SegBar
                thick
                label="Box-build kit by status"
                segs={Object.entries(KIT)
                  .map(([status, k]) => ({ key: status, label: k.text, value: b.box.kit.filter((x) => x.status === status).length, color: k.ink }))
                  .filter((x) => x.value > 0)}
              />
            </div>
            <ul className="space-y-1.5 px-4 py-3 text-sm">
              {b.box.kit.map((k) => (
                <li key={k.key} className="flex items-start gap-2">
                  <CircleDot className={cn("mt-0.5 size-3.5 shrink-0", KIT[k.status]?.tone)} aria-hidden />
                  <span>
                    {k.label}
                    {k.qty > 1 ? <span className="num text-muted-foreground"> ×{k.qty}</span> : null}
                    <span className={cn("block text-xs", KIT[k.status]?.tone)}>{KIT[k.status]?.text ?? k.status}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <nav aria-label="Box types" className="mt-6">
        <h2 className="mb-2 text-base font-medium">Box type</h2>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[{ slug: "all", name: "All boxes", summary: "Every catalogue box and every box our makers can make to fit." }, ...BOX_TYPES].map((bt) => {
            const active = bt.slug === type;
            const n = [...b.box.catalogue, ...b.box.custom].filter((o) => bt.slug === "all" || ofType(o, bt.slug)).length;
            return (
              <li key={bt.slug}>
                <Link
                  href={`/boms/${id}/build/box?type=${bt.slug}`}
                  aria-current={active ? "true" : undefined}
                  title={bt.summary}
                  className={cn("block h-full rounded-lg border bg-card px-3 py-2.5 outline-none transition-colors duration-150 hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring", active && "border-primary bg-primary/[0.04]")}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium">{bt.name}</span>
                    <span className="num text-xs text-muted-foreground">{n}</span>
                  </span>
                  {bt.slug === b.box.recognisedType ? <span className="mt-0.5 block text-[11px] text-primary">This product&apos;s type</span> : null}
                </Link>
              </li>
            );
          })}
        </ul>
        {t ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {t.name}: {t.ip[0]}–{t.ip[1]}, shielding {t.shielding}. {t.machining}{" "}
            <Link href={`/directory/boxes?t=${t.slug}#${t.slug}`} className="underline-offset-2 hover:underline">In the directory →</Link>
          </p>
        ) : null}
      </nav>

      <section aria-labelledby="catalogue" className="mt-4 rounded-lg border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <h2 id="catalogue" className="text-base font-medium">Catalogue boxes — our stock, distributors, marketplace</h2>
          <span className="flex flex-wrap items-center gap-2">
            {buyer && unpriced.length ? <RefreshButton scope={{ partIds: unpriced, label: `${unpriced.length} enclosures` }} label={`Get prices for ${unpriced.length} boxes`} /> : null}
            <Link href={`/parts/market?q=${encodeURIComponent(t ? `${t.name.replace(/ box$/i, "")} enclosure` : "aluminium enclosure")}`} className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs hover:bg-muted">
              <Search className="size-3.5" aria-hidden /> Search distributors
            </Link>
          </span>
        </div>
        {catalogue.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="px-4 py-2 font-normal">Box</th>
                  <th className="px-3 py-2 font-normal">For this board</th>
                  <th className="px-3 py-2 text-right font-normal">1 · Ours</th>
                  <th className="px-3 py-2 text-right font-normal">2 · Partners</th>
                  <th className="px-3 py-2 text-right font-normal">3 · Distributors</th>
                  <th className="px-3 py-2 text-right font-normal">4 · Marketplace</th>
                  {b.quantities.map((q) => (
                    <th key={q} className="px-3 py-2 text-right font-normal">{qtyLabel(q)}</th>
                  ))}
                  <th className="px-4 py-2"><span className="sr-only">Choose</span></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {catalogue.map((o) => (
                  <tr key={o.key} className={cn(!o.fits && "text-muted-foreground", isChosen(o) && "bg-primary/[0.04]")}>
                    <td className="px-4 py-2.5">
                      {o.partId ? <Link href={`/parts/${o.partId}`} className="font-medium hover:underline">{o.spec.label}</Link> : <span className="font-medium">{o.spec.label}</span>}
                      <span className="num block text-xs text-muted-foreground">{o.spec.length} × {o.spec.width} × {o.spec.height} mm · {o.ipRating ?? "IP —"}{o.tiers?.mock ? " · simulated prices" : ""}</span>
                    </td>
                    <td className="max-w-56 px-3 py-2.5 text-xs">
                      <span className={o.fits ? "text-risk-green" : "text-risk-amber"}>{o.fits ? "Fits" : "Doesn't fit"}</span>
                      <span className="block text-muted-foreground">{o.fitText}</span>
                    </td>
                    <td className="num px-3 py-2.5 text-right">{o.tiers ? <>{o.tiers.ours.toLocaleString("en-IN")}<span className="block text-[11px] text-muted-foreground">{m.unit(o.tiers.oursUnit)}</span></> : "—"}</td>
                    <td className="num px-3 py-2.5 text-right">{o.tiers ? o.tiers.partners.toLocaleString("en-IN") : "—"}</td>
                    <td className="num px-3 py-2.5 text-right">{o.tiers ? <>{o.tiers.distributors.toLocaleString("en-IN")}<span className="block text-[11px] text-muted-foreground">{m.unit(o.tiers.distributorUnit)}</span></> : "—"}</td>
                    <td className="num px-3 py-2.5 text-right">{o.tiers ? <>{o.tiers.market.toLocaleString("en-IN")}<span className="block text-[11px] text-muted-foreground">{m.unit(o.tiers.marketUnit)}</span></> : "—"}</td>
                    {o.prices.map((p) => (
                      <td key={p.qty} className="num px-3 py-2.5 text-right">{p.unit === null ? <span className="text-xs text-muted-foreground">no price</span> : m.unit(p.unit)}</td>
                    ))}
                    <td className="px-4 py-2.5 text-right">{edit ? <ChooseButton act={{ kind: "box", revisionId: id, choice: { kind: "catalogue", mpn: o.spec.mpn } }} chosen={isChosen(o) && !b.box.auto} label={isChosen(o) ? "Confirm" : "Choose"} /> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-4 py-3 text-sm text-muted-foreground">No catalogue boxes of this type — use a box made to fit below, or search the distributors.</p>
        )}
        <p className="border-t px-4 py-2 text-xs text-muted-foreground">Unit price per box at each quantity: our stock first at book cost, then the cheapest distributor landed, then the marketplace; connector cut-outs added.</p>
      </section>

      <section aria-labelledby="custom" className="mt-4 rounded-lg border bg-card">
        <div className="border-b px-4 py-3">
          <h2 id="custom" className="text-base font-medium">Made to fit by our box makers</h2>
          <p className="text-xs text-muted-foreground">Sized from the board and its tallest part; an estimate until the maker quotes. Moulded and die-cast boxes need a tool — the one-off cost.</p>
        </div>
        {custom.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="px-4 py-2 font-normal">Maker · box</th>
                  <th className="px-3 py-2 text-right font-normal">Lead</th>
                  {b.quantities.map((q) => (
                    <th key={q} className="px-3 py-2 text-right font-normal">{qtyLabel(q)}</th>
                  ))}
                  <th className="px-3 py-2 text-right font-normal">One-off</th>
                  <th className="px-4 py-2"><span className="sr-only">Choose</span></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {custom.map((o) => (
                  <tr key={o.key} className={cn(isChosen(o) && "bg-primary/[0.04]")}>
                    <td className="px-4 py-2.5">
                      <span className="font-medium">{o.maker?.name}</span>
                      <span className="block text-xs text-muted-foreground">{o.spec.label} · up to {o.ipRating}</span>
                    </td>
                    <td className="num px-3 py-2.5 text-right">{o.leadDays} d</td>
                    {o.prices.map((p) => (
                      <td key={p.qty} className="num px-3 py-2.5 text-right">{m.unit(p.unit)}</td>
                    ))}
                    <td className="num px-3 py-2.5 text-right">{m.whole(o.prices[0]?.nre ?? 0)}</td>
                    <td className="px-4 py-2.5 text-right">
                      {edit && o.maker ? <ChooseButton act={{ kind: "box", revisionId: id, choice: { kind: "custom", style: o.spec.style as "sheet-metal" | "diecast" | "extruded" | "moulded", supplierId: o.maker.id } }} chosen={isChosen(o)} /> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-4 py-3 text-sm text-muted-foreground">None of our box makers makes this type to fit — add one under suppliers, or pick another type.</p>
        )}
      </section>

      {[...catalogue, ...custom].some((o) => o.fits) ? (
        <div className="mt-4 rounded-lg border bg-card px-4 py-4">
          <CompareBars
            caption={`Per box at ${qtyLabel(b.refQty)}, one-off costs spread over the lot — boxes that fit`}
            format={(v) => m.unit(v)}
            rows={[...catalogue, ...custom]
              .filter((o) => o.fits)
              .sort((x, y) => (perUnitAtRef(x) ?? Infinity) - (perUnitAtRef(y) ?? Infinity))
              .map((o) => ({ key: o.key, label: o.maker ? `${o.maker.name.replace(/ — sample$/, "")} · ${o.spec.style}` : o.spec.label, value: perUnitAtRef(o), tone: isChosen(o) ? "chosen" : "fits" }))}
          />
        </div>
      ) : null}

    </>
  );
}
