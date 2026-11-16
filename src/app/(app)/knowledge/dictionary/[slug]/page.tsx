import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Box, BookOpen, Check } from "lucide-react";
import { ARTICLES } from "@/knowledge";
import { dictEntry, entriesIn, groupOf, referencedBy, relatedEntries, type DictEntry } from "@/knowledge/dictionary";
import { circuitById } from "@/knowledge/circuits";
import { highlightedParts } from "@/lib/schematic";
import { getDisplayCurrency } from "@/lib/prefs";
import { formatMoney } from "@/lib/currency";
import { LIFECYCLE_LABEL, LIFECYCLE_RISK } from "@/lib/risk";
import { cn } from "@/lib/utils";
import { bodyForEntry, catalogueForEntry } from "@/server/dictionary";
import { PageHeader, Section, EmptyState } from "@/components/data/page-header";
import { RiskDot } from "@/components/data/badges";
import { PartPhoto } from "@/components/data/part-photo";
import { Schematic } from "@/components/knowledge/schematic";
import { StackupExplorer } from "@/components/knowledge/stackup-explorer";
import { EntryModelLoader } from "@/components/dictionary/entry-model-loader";
import { LineStrip } from "@/components/dictionary/line-strip";
import { GROUP_ICON } from "@/components/dictionary/group-icon";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return { title: dictEntry((await params).slug)?.name ?? "Dictionary" };
}

const chip = "inline-flex h-7 items-center rounded-md border bg-muted/40 px-2 text-xs";

export default async function DictionaryEntryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const e = dictEntry(slug);
  if (!e) notFound();
  const group = groupOf(e.group);
  const Icon = GROUP_ICON[e.group];
  const currency = await getDisplayCurrency();
  const catalogue = e.categories?.length ? await catalogueForEntry(e, currency) : null;
  const body = bodyForEntry(e);
  const circuit = circuitById(e.circuit);
  const lit = circuit ? highlightedParts(circuit, e.slug).size > 0 : false;
  const related = relatedEntries(e);
  const mentioned = referencedBy(e.slug).filter((x) => x.slug !== e.slug && !related.includes(x));
  const siblings = entriesIn(e.group).filter((x) => x.slug !== e.slug && !related.includes(x));
  const article = e.article ? ARTICLES.find((a) => a.slug === e.article) : undefined;
  const subs = (e.subassemblies ?? []).map((s) => ({ text: dictEntry(s)?.name ?? s, slug: dictEntry(s) ? s : null }));
  const stack = e.model?.kind === "explorer" && e.model.explorer === "pcb" ? Number(e.model.preset) || 4 : null;
  const side = body ? "model" : stack ? "stack" : null;
  const inside = packageExplorer(e);

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="flex flex-wrap gap-2">
            <Link href="/knowledge" className="hover:text-foreground">Knowledge</Link>
            <span aria-hidden>/</span>
            <Link href="/knowledge/dictionary" className="hover:text-foreground">Dictionary</Link>
            <span aria-hidden>/</span>
            <Link href={`/knowledge/dictionary?group=${e.group}`} className="hover:text-foreground">{group.label}</Link>
          </span>
        }
        title={e.name}
        description={
          <>
            {e.oneLiner}
            {e.aka?.length ? <span className="mt-1.5 block text-xs">Also called {e.aka.join(" · ")}</span> : null}
          </>
        }
      />

      <div className={cn("mb-6 grid gap-6", side && "lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)]")}>
        <div className="rounded-lg border bg-card p-5">
          <h2 className="flex items-center gap-2 text-base font-medium">
            <span className="grid size-7 place-items-center rounded-md bg-primary/8 text-primary">
              <Icon className="size-3.5" aria-hidden />
            </span>
            What it does
          </h2>
          <p className="mt-2 max-w-[72ch] text-sm leading-relaxed text-foreground/85">{e.what}</p>
          <h2 className="mt-5 text-base font-medium">How it works</h2>
          <p className="mt-2 max-w-[72ch] text-sm leading-relaxed text-foreground/85">{e.how}</p>
        </div>
        {side === "model" && body ? (
          <figure className="flex flex-col overflow-hidden rounded-lg border bg-card">
            <div className="h-64 bg-muted/40 sm:h-72">
              <EntryModelLoader body={body} />
            </div>
            <figcaption className="flex items-center justify-between gap-3 border-t px-4 py-2.5 text-xs text-muted-foreground">
              <span>
                Typical package · <span className="text-foreground">{modelCaption(e)}</span>
              </span>
              {inside ? (
                <Link href={`/knowledge/explore?view=package&preset=${inside}`} className="inline-flex items-center gap-1 hover:text-foreground">
                  <Box className="size-3.5" aria-hidden /> Inside the package
                </Link>
              ) : (
                <span className="hidden sm:inline">Drag to turn</span>
              )}
            </figcaption>
          </figure>
        ) : side === "stack" && stack ? (
          <div className="space-y-2">
            <StackupExplorer initialLayers={stack} />
            <Link href={`/knowledge/explore?view=pcb&preset=${stack}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              <Box className="size-4 text-primary" aria-hidden /> Open the {stack}-layer board in 3D
            </Link>
          </div>
        ) : null}
      </div>

      {e.station ? (
        <figure className="mb-6 rounded-lg border bg-card">
          <figcaption className="flex h-11 items-center border-b px-4 text-sm font-medium">Where it sits on our lines</figcaption>
          <div className="overflow-x-auto px-4 py-4">
            <LineStrip station={e.station} className="min-w-[640px]" />
          </div>
        </figure>
      ) : null}

      {circuit ? (
        <Section
          title={`Application circuit — ${circuit.title}`}
          className="mb-6"
          action={
            lit ? (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span aria-hidden className="inline-block h-0.5 w-4 rounded-full bg-primary" />
                {e.name.replace(/\s*\(.*\)$/, "")}
              </span>
            ) : null
          }
        >
          <div className="overflow-x-auto px-4 py-5">
            <Schematic circuit={circuit} focus={e.slug} className="mx-auto" minScale={1.15} maxScale={1.9} />
          </div>
          <div className="border-t px-4 py-3">
            <p className="max-w-[90ch] text-sm leading-relaxed text-muted-foreground">{circuit.caption}</p>
          </div>
        </Section>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Section title="Key specifications">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="px-4 py-2 font-normal">Parameter</th>
                    <th className="px-4 py-2 font-normal">What it tells you</th>
                    <th className="px-4 py-2 font-normal">Typical</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {e.specs.map((s) => (
                    <tr key={s.name} className="align-top">
                      <td className="px-4 py-2.5 font-medium">{s.name}</td>
                      <td className="px-4 py-2.5 leading-relaxed text-foreground/80">{s.meaning}</td>
                      <td className="num px-4 py-2.5 text-muted-foreground">{s.typical ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <div className="grid gap-6 md:grid-cols-2">
            <Section title="How to choose one">
              <ol className="space-y-2.5 px-4 py-3 text-sm">
                {e.selection.map((s, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="num mt-px w-4 shrink-0 text-right text-xs text-muted-foreground">{i + 1}</span>
                    <span className="leading-relaxed">{s}</span>
                  </li>
                ))}
              </ol>
            </Section>
            <Section title="Where it’s used">
              <Bullets items={e.uses} />
            </Section>
          </div>

          <Section title="Alternatives & substitution">
            <div className="px-4 py-3">
              <h3 className="text-xs text-muted-foreground">Before swapping, check</h3>
              <ul className="mt-2 space-y-2 text-sm">
                {e.alternatives.rules.map((r, i) => (
                  <li key={i} className="flex gap-2.5">
                    <Check className="mt-0.5 size-4 shrink-0 text-risk-green" aria-hidden />
                    <span className="leading-relaxed">{r}</span>
                  </li>
                ))}
              </ul>
            </div>
            {e.alternatives.equivalents?.length ? (
              <div className="border-t">
                <h3 className="px-4 pt-3 text-xs text-muted-foreground">Known equivalents — search our catalogue by clicking a part</h3>
                <div className="overflow-x-auto">
                  <table className="mt-1 w-full min-w-[600px] text-sm">
                    <thead className="text-left text-xs text-muted-foreground">
                      <tr className="border-b">
                        <th className="px-4 py-2 font-normal">Part</th>
                        <th className="px-4 py-2 font-normal">Alternatives</th>
                        <th className="px-4 py-2 font-normal">Note</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {e.alternatives.equivalents.map((q) => (
                        <tr key={q.part} className="align-top">
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <Link href={partSearch(q.part)} className="num font-medium hover:underline">{q.part}</Link>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="flex flex-wrap gap-1.5">
                              {q.alts.map((a) => (
                                <Link key={a} href={partSearch(a)} className={cn(chip, "num h-6 transition-colors duration-150 hover:border-foreground/30 hover:bg-muted")}>
                                  {a}
                                </Link>
                              ))}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 leading-relaxed text-foreground/80">{q.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">A starting point, not an approval: confirm pinout, ratings and package against both datasheets before adding an alternate.</p>
              </div>
            ) : null}
            {e.alternatives.crossFamily?.length ? (
              <div className="border-t px-4 py-3">
                <h3 className="text-xs text-muted-foreground">A different kind of part that can do the job</h3>
                <ul className="mt-2 space-y-2 text-sm">
                  {e.alternatives.crossFamily.map((c, i) => (
                    <li key={i} className="flex gap-2.5">
                      <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="leading-relaxed">{c}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Section>

          {subs.length || e.maintenance?.length ? (
            <div className="grid gap-6 md:grid-cols-2">
              {subs.length ? (
                <Section title="Main sub-assemblies">
                  <ul className="flex flex-wrap gap-2 px-4 py-3">
                    {subs.map((s) => (
                      <li key={s.text}>
                        {s.slug ? (
                          <Link href={`/knowledge/dictionary/${s.slug}`} className={cn(chip, "transition-colors duration-150 hover:border-foreground/30 hover:bg-muted")}>
                            {s.text}
                          </Link>
                        ) : (
                          <span className={cn(chip, "text-foreground/80")}>{s.text}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </Section>
              ) : null}
              {e.maintenance?.length ? (
                <Section title="Maintenance">
                  <dl className="divide-y text-sm">
                    {e.maintenance.map((m) => (
                      <div key={m.task} className="grid grid-cols-[6.5rem_1fr] gap-3 px-4 py-2.5">
                        <dt className="text-muted-foreground">{m.interval}</dt>
                        <dd className="leading-relaxed">{m.task}</dd>
                      </div>
                    ))}
                  </dl>
                </Section>
              ) : null}
            </div>
          ) : null}

          {e.defects?.length || e.consumables?.length ? (
            <div className="grid gap-6 md:grid-cols-2">
              {e.defects?.length ? (
                <Section title={e.group === "machines" && isInspection(e) ? "Defects it catches" : "Defects when it drifts"}>
                  <Bullets items={e.defects} tone="amber" />
                </Section>
              ) : null}
              {e.consumables?.length ? (
                <Section title="Consumables & spares">
                  <Bullets items={e.consumables} />
                </Section>
              ) : null}
            </div>
          ) : null}

          {e.ems?.length || e.pitfalls?.length || e.sourcing?.length ? (
            <div className="grid gap-6 md:grid-cols-2">
              {e.ems?.length ? (
                <Section title="On our lines">
                  <Bullets items={e.ems} />
                </Section>
              ) : null}
              {e.pitfalls?.length ? (
                <Section title="Pitfalls">
                  <Bullets items={e.pitfalls} tone="amber" />
                </Section>
              ) : null}
              {e.sourcing?.length ? (
                <Section title="Buying tips">
                  <Bullets items={e.sourcing} />
                </Section>
              ) : null}
            </div>
          ) : null}
        </div>

        <aside className="min-w-0 space-y-6">
          {catalogue ? (
            <Section title="In our catalogue" action={<span className="text-xs text-muted-foreground">Best @1k, {currency}</span>}>
              {catalogue.rows.length ? (
                <ul className="divide-y">
                  {catalogue.rows.map((r) => (
                    <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-md border bg-muted/40">
                        <PartPhoto src={r.imageUrl} alt="" className="size-full bg-white p-0.5" fallback={<Icon className="size-4 text-muted-foreground" aria-hidden />} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <RiskDot level={LIFECYCLE_RISK[r.lifecycle]} />
                          <span className="sr-only">{LIFECYCLE_LABEL[r.lifecycle]}</span>
                          <Link href={`/parts/${r.id}`} className="num truncate text-sm font-medium hover:underline">{r.mpn}</Link>
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {r.maker}
                          {r.packageName ? ` · ${r.packageName}` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="num block text-sm">{r.bestUnit === null ? "—" : formatMoney(r.bestUnit, currency, { unit: true })}</span>
                        <span className="num block text-xs whitespace-nowrap text-muted-foreground">
                          {r.ownStock.toLocaleString("en-IN")} own · {r.marketStock.toLocaleString("en-IN")} mkt
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="None in the catalogue yet">Parts of this kind appear here once a BoM brings them in.</EmptyState>
              )}
              {catalogue.categories.length ? (
                <div className="flex flex-wrap gap-x-4 gap-y-1 border-t px-4 py-2.5 text-xs">
                  {catalogue.categories.map((c) => (
                    <Link key={c.slug} href={`/parts?category=${c.slug}`} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
                      All {c.name.toLowerCase()} <span className="num">({c.count})</span>
                      <ArrowRight className="size-3" aria-hidden />
                    </Link>
                  ))}
                </div>
              ) : null}
            </Section>
          ) : null}

          {e.packages?.length || e.makers?.length ? (
            <Section title="Packages & makers">
              <div className="space-y-3 px-4 py-3">
                {e.packages?.length ? (
                  <div>
                    <h3 className="mb-1.5 text-xs text-muted-foreground">Common packages</h3>
                    <ul className="flex flex-wrap gap-1.5">
                      {e.packages.map((p) => (
                        <li key={p} className={chip}>{p}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {e.makers?.length ? (
                  <div>
                    <h3 className="mb-1.5 text-xs text-muted-foreground">Who makes them</h3>
                    <p className="text-sm leading-relaxed">{e.makers.join(", ")}</p>
                  </div>
                ) : null}
              </div>
            </Section>
          ) : null}

          {article ? (
            <Link
              href={`/knowledge/${article.slug}`}
              className="group block rounded-lg border bg-card p-4 outline-none transition-[border-color,box-shadow] duration-150 hover:border-foreground/20 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <BookOpen className="size-3.5" aria-hidden /> Deep dive
              </span>
              <span className="mt-1 block text-sm font-medium group-hover:underline">{article.title}</span>
              <span className="mt-1 line-clamp-3 block text-xs leading-relaxed text-muted-foreground">{article.summary}</span>
            </Link>
          ) : null}

          {related.length ? (
            <Section title="Related">
              <EntryLinks entries={related} />
            </Section>
          ) : null}
          {mentioned.length ? (
            <Section title={e.group.startsWith("machine") ? "Found in" : "Mentioned in"}>
              <EntryLinks entries={mentioned.slice(0, 10)} />
            </Section>
          ) : null}
          {siblings.length ? (
            <Section
              title={`More ${group.label.toLowerCase()}`}
              action={
                <Link href={`/knowledge/dictionary?group=${e.group}`} className="text-xs text-muted-foreground hover:text-foreground">
                  All {entriesIn(e.group).length}
                </Link>
              }
            >
              <EntryLinks entries={siblings.slice(0, 8)} />
            </Section>
          ) : null}
          <p className="num px-1 text-xs text-muted-foreground">Dictionary entry · version {e.version}</p>
        </aside>
      </div>
    </>
  );
}

/** Which package cut-away to offer for a semiconductor entry, from its typical package. */
function packageExplorer(e: DictEntry): string | null {
  if (e.model?.kind !== "package") return null;
  const p = e.model.package.toUpperCase();
  if (p.includes("WLCSP") || p.includes("CSP")) return "wlcsp";
  if (p.includes("BGA")) return "bga";
  if (p.includes("QFN") || p.includes("DFN")) return "qfn";
  if (/SOIC|SOP|SSOP|MSOP/.test(p)) return "soic";
  return null;
}

/** Catalogue search for a part number, without the "(maker)" or "(package)" note. */
function partSearch(mpn: string) {
  return `/parts?q=${encodeURIComponent(mpn.replace(/\s*\(.*\)$/, ""))}`;
}

function modelCaption(e: DictEntry): string {
  const m = e.model;
  if (m?.kind === "package") return m.package;
  if (m?.kind === "body") return `${m.l} × ${m.w} × ${m.h} mm`;
  return "";
}

/** AOI, SPI, X-ray and test stations find defects; everything else causes them when it drifts. */
function isInspection(e: DictEntry) {
  return ["spi", "aoi", "axi", "ict", "flying-probe", "fct", "burn-in"].includes(e.station ?? "");
}

function Bullets({ items, tone }: { items: string[]; tone?: "amber" }) {
  return (
    <ul className="space-y-2 px-4 py-3 text-sm">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2.5">
          {tone ? <RiskDot level={tone} className="mt-[7px]" /> : <span aria-hidden className="mt-[9px] size-1 shrink-0 rounded-full bg-foreground/40" />}
          <span className="leading-relaxed">{t}</span>
        </li>
      ))}
    </ul>
  );
}

function EntryLinks({ entries }: { entries: DictEntry[] }) {
  return (
    <ul className="divide-y">
      {entries.map((x) => {
        const I = GROUP_ICON[x.group];
        return (
          <li key={x.slug}>
            <Link href={`/knowledge/dictionary/${x.slug}`} className="flex items-start gap-2.5 px-4 py-2.5 transition-colors duration-150 hover:bg-muted/40">
              <I className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0">
                <span className="block text-sm">{x.name}</span>
                <span className="line-clamp-1 block text-xs text-muted-foreground">{x.oneLiner}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
