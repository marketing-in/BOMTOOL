import Link from "next/link";
import { notFound } from "next/navigation";
import { Box, Check, CircleDot, Cpu, Layers, X } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getDisplayCurrency } from "@/lib/prefs";
import { getDeepAnalysis } from "@/server/deep-analysis";
import { matchBoxMakers, matchFabs, type BoardCapabilities, type BoxCapabilities, type Vendor } from "@/lib/supply-chain";
import { PageHeader } from "@/components/data/page-header";
import { RiskDot } from "@/components/data/badges";
import { cn } from "@/lib/utils";
import { classifyBox, classifyPcb, recogniseBoard } from "@/lib/directory/recognise";
import { BOARD_TYPES } from "@/server/directory";
import { pcbTechnology } from "@/knowledge/pcb-technologies";
import { boxType } from "@/knowledge/box-types";

export const metadata = { title: "Supply chain" };

const ROHS: Record<string, string> = { COMPLIANT: "✓", COMPLIANT_WITH_EXEMPTION: "exempt", NON_COMPLIANT: "✗", UNKNOWN: "?" };
const REACH: Record<string, string> = { COMPLIANT: "✓", CONTAINS_SVHC: "SVHC", UNKNOWN: "?" };
const KIT: Record<string, { text: string; tone: string }> = {
  "in-bom": { text: "On the BoM", tone: "text-risk-green" },
  supplied: { text: "Ships with the box", tone: "text-risk-green" },
  missing: { text: "Not on the BoM", tone: "text-risk-red" },
  nre: { text: "Machining / NRE", tone: "text-risk-amber" },
  check: { text: "Check", tone: "text-risk-amber" },
};
const n = (x: number) => x.toLocaleString("en-IN");

function Step({ n: num, icon: Icon, title, hint, children }: { n: number; icon: typeof Box; title: string; hint: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`step-${num}`} className="rounded-lg border bg-card">
      <div className="flex items-start gap-3 border-b px-4 py-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Icon className="size-4" aria-hidden /></span>
        <div>
          <h2 id={`step-${num}`} className="text-base font-medium">{num} · {title}</h2>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function FitCell({ fits, gaps }: { fits: boolean; gaps: string[] }) {
  return fits ? (
    <span className="inline-flex items-center gap-1 text-risk-green"><Check className="size-3.5" aria-hidden /> Fits</span>
  ) : (
    <span className="inline-flex items-start gap-1 text-risk-amber"><X className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {gaps.join("; ")}</span>
  );
}

export default async function SupplyChainPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const currency = await getDisplayCurrency();
  const r = await getDeepAnalysis(id, currency);
  if (!r) notFound();
  const { report, data, analysis, lines: deepLines } = r;
  const project = analysis.revision.bom.project;
  const production = project.stage === "PRODUCTION";

  const vendors = await db.supplier.findMany({ where: { active: true, OR: [{ supplies: { has: "pcb-fab" } }, { supplies: { has: "enclosure" } }] }, orderBy: { name: "asc" } });
  const as = <C,>(tag: string) => vendors.filter((v) => v.supplies.includes(tag) && v.capabilities).map((v) => ({ id: v.id, code: v.code, name: v.name, country: v.country, capabilities: v.capabilities as unknown as C }) satisfies Vendor<C>);
  const fabs = matchFabs({ layers: data.board.layerCount, thicknessMm: data.board.thickness, finish: data.board.finish, ipcClass: 2, production }, as<BoardCapabilities>("pcb-fab"));
  const enc = data.enclosure;
  const makers = enc ? matchBoxMakers({ style: enc.style, ipRating: enc.ipRating, cutouts: data.box?.cutouts.length ?? 0 }, as<BoxCapabilities>("enclosure")) : [];
  const encLine = enc?.partId ? analysis.lines.find((l) => l.partId === enc.partId) : null;

  // The product in build order: which PCB technology, board type and box type it is.
  const spec = (project.boardSpec ?? {}) as { copperOz?: number; material?: string };
  const pcb = classifyPcb({ layers: data.board.layerCount, thicknessMm: data.board.thickness, copperOz: spec.copperOz, material: spec.material, finish: data.board.finish });
  const kinds = recogniseBoard(
    {
      mpns: analysis.lines.map((l) => l.part?.mpn ?? l.rawMpn ?? "").filter(Boolean),
      text: analysis.lines.map((l) => `${l.part?.description ?? l.rawDescription ?? ""} ${l.part?.category.name ?? ""} ${l.part?.mpn ?? ""}`).join(" "),
      partCount: data.parts.length,
      widthMm: data.board.width,
      heightMm: data.board.height,
      layers: data.board.layerCount,
    },
    BOARD_TYPES,
  );
  const box = classifyBox(enc?.style, enc?.ipRating);
  const flow = [
    { step: "1 · Bare board", label: pcbTechnology(pcb.primary)?.name ?? pcb.primary, extra: pcb.also.map((x) => pcbTechnology(x)?.name ?? x), href: `/directory/pcb?t=${pcb.primary}#${pcb.primary}` },
    { step: "2 · Board type", label: kinds[0]?.name ?? "No close match", extra: kinds[0]?.reasons.slice(0, 1) ?? [], href: kinds[0] ? `/directory/board-types/${kinds[0].id}` : "/directory/board-types" },
    { step: "3 · Components", label: `${deepLines.filter((l) => !l.dnp).length} lines`, extra: [], href: `/directory/components` },
    { step: "4 · Box", label: box ? (boxType(box)?.name ?? box) : "No enclosure", extra: enc ? [enc.label] : [], href: box ? `/directory/boxes?t=${box}#${box}` : "/directory/boxes" },
  ];

  const fffById = new Map(analysis.lines.map((l) => [l.id, l.part?.alternatesFrom.length ?? 0]));
  const lines = deepLines.filter((l) => !l.dnp);
  const c = report.coverage;
  const tiers = [
    ["Our inventory", c.ours],
    ["Channel partners", c.partners],
    ["Distributors", c.suppliers],
    ["Marketplace", c.market],
    ["No source", c.none],
  ] as const;

  return (
    <>
      <PageHeader
        title={`Supply chain — ${data.product?.name ?? data.title}`}
        description="Everything this product is made of and who can supply it: the bare board, every component (our stock → channel partners → online), and the box."
      />

      <nav aria-label="This product in the directory" className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {flow.map((f) => (
          <Link key={f.step} href={f.href} className="rounded-lg border bg-card p-3 transition-colors duration-150 hover:border-foreground/20">
            <span className="block text-xs text-muted-foreground">{f.step}</span>
            <span className="block text-sm font-medium">{f.label}</span>
            {f.extra.length ? <span className="block truncate text-xs text-muted-foreground">{f.extra.join(" · ")}</span> : null}
          </Link>
        ))}
      </nav>

      <div className="space-y-6">
        <Step n={1} icon={Layers} title="Bare board (PCB)" hint={`${data.board.source === "gerber" ? "From the uploaded Gerbers" : "From the project's board spec"} · ${production ? "production" : "prototype"} lead times`}>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 border-b px-4 py-3 text-sm sm:grid-cols-6">
            {[
              ["Size", `${data.board.width.toFixed(1)} × ${data.board.height.toFixed(1)} mm`],
              ["Layers", data.board.layerCount],
              ["Thickness", `${data.board.thickness} mm`],
              ["Finish", data.board.finish],
              ["Mask / silk", `${data.board.maskColor} / ${data.board.silkColor}`],
              ["IPC class", "2 (assumed)"],
            ].map(([k, v]) => (
              <div key={String(k)}>
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="num">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="px-4 py-2 font-normal">PCB fabricator</th>
                  <th className="px-4 py-2 font-normal">For this board</th>
                  <th className="px-4 py-2 text-right font-normal">Lead</th>
                  <th className="px-4 py-2 font-normal">Range</th>
                  <th className="px-4 py-2 font-normal">Certifications</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {fabs.map((f) => (
                  <tr key={f.id} className={f.fits ? undefined : "text-muted-foreground"}>
                    <td className="px-4 py-2.5">{f.name}<span className="block text-xs text-muted-foreground">{f.country}</span></td>
                    <td className="px-4 py-2.5 text-xs"><FitCell fits={f.fits} gaps={f.gaps} /></td>
                    <td className="num px-4 py-2.5 text-right">{f.leadDays} d</td>
                    <td className="px-4 py-2.5 text-xs">up to {f.capabilities.maxLayers} layers · {f.capabilities.finishes.join(", ")} · {f.capabilities.thicknessMm.join("–")} mm · class {f.capabilities.ipcClass}</td>
                    <td className="px-4 py-2.5 text-xs">{f.capabilities.certifications.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!fabs.length ? <p className="px-4 py-3 text-sm text-muted-foreground">No PCB fabricators on file — run <code>npm run vendors:sync</code> or add your approved vendors.</p> : null}
          </div>
        </Step>

        <Step n={2} icon={Cpu} title="Components" hint="Each line, in sourcing order. Click a part for every offer, its risk and its alternates.">
          <div className="grid grid-cols-2 divide-x border-b text-center sm:grid-cols-5">
            {tiers.map(([label, v], i) => (
              <div key={label} className="px-2 py-3">
                <span className="block text-xs text-muted-foreground">{i < 4 ? `${i + 1} · ` : ""}{label}</span>
                <span className={cn("num mt-0.5 block text-lg font-medium", i === 4 && v ? "text-risk-red" : undefined)}>{v}</span>
                <span className="block text-[11px] text-muted-foreground">lines covered first here</span>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="px-4 py-2 font-normal">Line · part</th>
                  <th className="px-3 py-2 text-right font-normal">Need</th>
                  <th className="px-3 py-2 text-right font-normal">Ours</th>
                  <th className="px-3 py-2 text-right font-normal">Partners</th>
                  <th className="px-3 py-2 text-right font-normal">Distributors</th>
                  <th className="px-3 py-2 text-right font-normal">Marketplace</th>
                  <th className="px-3 py-2 text-center font-normal">RoHS</th>
                  <th className="px-3 py-2 text-center font-normal">REACH</th>
                  <th className="px-3 py-2 text-center font-normal" title="Form-fit-function drop-in alternates">FFF</th>
                  <th className="px-4 py-2 font-normal">Risk</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {lines.map((l) => {
                  const covered = l.ours + l.partners + l.suppliers + l.market >= l.required;
                  return (
                    <tr key={l.lineId}>
                      <td className="px-4 py-2">
                        {l.partId ? <Link href={`/parts/${l.partId}`} className="num font-medium hover:underline">{l.mpn}</Link> : <span className="num font-medium">{l.mpn ?? "Not matched"}</span>}
                        <span className="num block max-w-64 truncate text-xs text-muted-foreground">L{l.lineNo} · {l.refDes}</span>
                      </td>
                      <td className={cn("num px-3 py-2 text-right", !covered && l.partId && "text-risk-red")}>{n(l.required)}</td>
                      <td className="num px-3 py-2 text-right">{n(l.ours)}</td>
                      <td className="num px-3 py-2 text-right">{n(l.partners)}</td>
                      <td className="num px-3 py-2 text-right">{n(l.suppliers)}</td>
                      <td className="num px-3 py-2 text-right">{n(l.market)}</td>
                      <td className="px-3 py-2 text-center text-xs">{l.rohs ? ROHS[l.rohs] : "—"}</td>
                      <td className="px-3 py-2 text-center text-xs">{l.reach ? REACH[l.reach] : "—"}</td>
                      <td className="num px-3 py-2 text-center text-xs">{fffById.get(l.lineId) || "—"}</td>
                      <td className="px-4 py-2 text-xs">
                        {l.risk ? (
                          <span className="inline-flex items-center gap-1.5"><RiskDot level={l.risk.level} /> <span className="num">{l.risk.score}</span> <span className="truncate text-muted-foreground">{l.risk.summary}</span></span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-2 text-xs text-muted-foreground">
            Verdict: {report.verdict.title}. <Link href={`/boms/${id}/analysis`} className="underline-offset-2 hover:underline">Deep analysis →</Link>
          </p>
        </Step>

        <Step n={3} icon={Box} title="Box build" hint={enc ? `${enc.label}${enc.ipRating ? ` · ${enc.ipRating}` : ""} · ${data.box?.cutouts.length ?? 0} connector cut-outs` : "No enclosure in the project spec"}>
          {enc ? (
            <>
              <div className="border-b px-4 py-3 text-sm">
                <span className="text-xs text-muted-foreground">The enclosure itself: </span>
                {encLine?.part ? (
                  <>
                    <Link href={`/parts/${encLine.part.id}`} className="num font-medium hover:underline">{encLine.part.mpn}</Link>
                    <span className="num text-muted-foreground"> · ours {n(encLine.internalQty)} · partners {n(encLine.partnerQty)} · distributors {n(encLine.authorisedStock)}</span>
                  </>
                ) : (
                  <span className="text-risk-amber">{enc.mpn} is not on the BoM — add it so it gets bought.</span>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="px-4 py-2 font-normal">Enclosure maker</th>
                      <th className="px-4 py-2 font-normal">For this box</th>
                      <th className="px-4 py-2 text-right font-normal">Lead</th>
                      <th className="px-4 py-2 font-normal">Makes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {makers.map((m) => (
                      <tr key={m.id} className={m.fits ? undefined : "text-muted-foreground"}>
                        <td className="px-4 py-2.5">{m.name}<span className="block text-xs text-muted-foreground">{m.country}</span></td>
                        <td className="px-4 py-2.5 text-xs"><FitCell fits={m.fits} gaps={m.gaps} /></td>
                        <td className="num px-4 py-2.5 text-right">{m.leadDays} d</td>
                        <td className="px-4 py-2.5 text-xs">{m.capabilities.styles.join(", ")} · up to {m.capabilities.ipMax} · {m.capabilities.services.join(", ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data.box?.kit.length ? (
                <div className="border-t px-4 py-3">
                  <h3 className="text-xs text-muted-foreground">Box-build kit</h3>
                  <ul className="mt-2 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                    {data.box.kit.map((k) => (
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
                </div>
              ) : null}
            </>
          ) : (
            <p className="px-4 py-3 text-sm text-muted-foreground">Add an enclosure to the project&apos;s board spec to plan the box build.</p>
          )}
        </Step>

        <p className="text-xs text-muted-foreground">Vendors marked “— sample” are placeholders from the seed: replace them with the plant&apos;s approved vendor list. Fit checks use each vendor&apos;s stated range; confirm with a quote.</p>
      </div>
    </>
  );
}
