import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, X } from "lucide-react";
import { getPreviewViewerData } from "@/server/board-view";
import { boardPricesFor } from "@/server/build";
import { catalogueFits } from "@/server/found-parts";
import { getDisplayCurrency } from "@/lib/prefs";
import { classifyPcb } from "@/lib/directory/recognise";
import { compressRefs, groupFound, kindLabel, type FoundParts } from "@/lib/board/find-parts";
import { pcbTechnology } from "@/knowledge/pcb-technologies";
import { asmPartsFromFound } from "@/lib/feasibility/parts";
import { countJoints } from "@/lib/feasibility/joints";
import { estimatePaste, PASTE_SOURCE_LABEL } from "@/lib/feasibility/paste";
import { PageHeader } from "@/components/data/page-header";
import { DeleteQuickLookButton } from "@/components/bom/delete-controls";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { ViewerLoader } from "@/components/viewer/viewer-loader";
import { moneyIn, qtyLabel } from "@/components/build/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Board quick look" };

const QUANTITIES = [10, 100, 1000];

const SOURCE_SHORT: Record<FoundParts["source"], string> = {
  "component-layer": "From the component layer",
  placement: "From the pick-and-place file",
  "pad-designators": "From pad designators",
  guessed: "Guessed from the pads",
  none: "None read",
};

const SOURCE: Record<FoundParts["source"], string> = {
  "component-layer": "Read from the component layer in the Gerbers — designators, values and part numbers as the designer set them.",
  placement: "Read from the pick-and-place file and placed on the Gerber pads.",
  "pad-designators": "Read from the designators on the Gerber pads (X2). Values and part numbers aren't in Gerbers — you choose the parts when you quote.",
  guessed: "Guessed from the pads, drills and silkscreen: designators are numbered here, and Gerbers carry no values or part numbers — you choose the parts when you quote.",
  none: "No components could be read from these files.",
};

export default async function QuickLookBoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const data = await getPreviewViewerData(id);
  if (!data) notFound();
  const { createdAt, files, found, ...viewer } = data;
  const copper = files.filter((f) => f.type === "copper").length;
  const facts = { widthMm: data.board.width, heightMm: data.board.height, layers: copper || data.board.layerCount, thicknessMm: data.board.thickness, finish: data.board.finish };
  const groups = found ? groupFound(found.parts) : [];
  const [fabs, currency, fits] = await Promise.all([boardPricesFor(facts, QUANTITIES), getDisplayCurrency(), catalogueFits(groups)]);
  const m = moneyIn(currency);
  const tech = pcbTechnology(classifyPcb(facts).primary);
  const parts = found?.parts ?? [];
  // Joints, paste and stencil from what the files alone tell us (Phase 15).
  const bodies = new Map(viewer.parts.map((p) => [p.refDes, p.body]));
  const asm = asmPartsFromFound(parts, (ref) => bodies.get(ref) ?? null);
  const joints = countJoints(asm);
  const paste = estimatePaste(asm, data.board.fab ?? null);
  const holes = data.board.fab?.holes ?? null;
  const grams = (g: number) => (g >= 10 ? `${g.toFixed(0)} g` : `${g.toFixed(2)} g`);
  const stats = [
    { label: "Components", value: parts.length.toLocaleString("en-IN"), note: `${groups.length} footprints` },
    { label: "SMT placements", value: parts.filter((p) => !p.tht).length.toLocaleString("en-IN"), note: `${parts.filter((p) => !p.tht && p.side === "TOP").length} top · ${parts.filter((p) => !p.tht && p.side === "BOTTOM").length} bottom` },
    { label: "Through-hole", value: parts.filter((p) => p.tht).length.toLocaleString("en-IN"), note: "hand or wave soldered" },
    { label: "Solder joints", value: joints.total.toLocaleString("en-IN"), note: `${(joints.smt.TOP.joints + joints.smt.BOTTOM.joints).toLocaleString("en-IN")} SMT · ${joints.tht.joints.toLocaleString("en-IN")} through-hole` },
  ];
  const build = [
    { label: "Solder paste a board", value: paste.sides.length ? grams(paste.gramsPerBoard) : "—", note: paste.source ? PASTE_SOURCE_LABEL[paste.source] : "no surface-mount parts" },
    { label: "Stencil", value: paste.sides.length ? `${Math.min(...paste.sides.map((s) => s.stencilUm))} µm` : "—", note: paste.sides.map((s) => `${s.side === "TOP" ? "top" : "bottom"} ${s.apertures.toLocaleString("en-IN")} apertures`).join(" · ") || "no stencil needed" },
    { label: "AOI / X-ray joints", value: `${joints.inspection.aoiJoints.toLocaleString("en-IN")} / ${joints.inspection.xrayJoints.toLocaleString("en-IN")}`, note: joints.hidden.parts ? `${joints.hidden.parts} parts soldered under the body` : "every SMT joint is visible to AOI" },
    { label: "Finest pitch", value: joints.finestPitchMm ? `${joints.finestPitchMm} mm` : "—", note: holes ? `${holes.component.toLocaleString("en-IN")} lead holes · ${holes.vias.toLocaleString("en-IN")} vias drilled` : "drills not measured" },
  ];
  return (
    <>
      <PageHeader
        eyebrow={
          <span className="flex gap-2">
            <Link href="/viewer" className="hover:text-foreground">Viewer</Link>
            <span aria-hidden>/</span>
            <span>Quick look</span>
          </span>
        }
        title={data.title}
        actions={
          <>
          {can(user.role, "bom.write") ? <DeleteQuickLookButton id={id} name={data.title} after="/viewer" /> : null}
          <Link href={`/boms/new?board=${id}`} className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:brightness-110">
            {parts.length ? "Quote this board →" : "Add the BoM — quote the whole product →"}
          </Link>
          </>
        }
      />
      <ul className="mb-5 flex flex-wrap gap-1.5">
        {[
          `${data.board.width.toFixed(1)} × ${data.board.height.toFixed(1)} mm`,
          `${copper || data.board.layerCount} copper layers`,
          data.board.finish,
          `${data.board.maskColor} mask`,
          `${files.length} files`,
          createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
        ].map((c) => (
          <li key={c} className="num rounded-md border bg-card px-2.5 py-1 text-[13px]">{c}</li>
        ))}
      </ul>
      <ViewerLoader data={viewer} initialMode={parts.length ? "pcba" : "bare"} />

      {parts.length ? (
        <dl className="mt-8 grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} title={s.note}>
              <dd className="text-3xl leading-none font-semibold tracking-tight tabular-nums">{s.value}</dd>
              <dt className="mt-1.5 text-xs text-muted-foreground">{s.label}</dt>
            </div>
          ))}
        </dl>
      ) : null}

      <section aria-labelledby="components" className="mt-8 overflow-hidden rounded-xl border bg-card">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b px-5 py-4">
          <h2 id="components" className="text-lg font-semibold tracking-tight">Components on this board</h2>
          <span
            className="text-xs text-muted-foreground"
            title={found ? SOURCE[found.source] : "This quick look was uploaded before components were read from Gerbers — upload the files again to list them."}
          >
            {found ? SOURCE_SHORT[found.source] : "Upload the files again to list them"}
          </span>
        </div>
        {parts.length ? (
          <>
            <details className="group border-b">
              <summary className="cursor-pointer px-5 py-3 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">Paste, stencil, inspection</summary>
              <dl className="grid grid-cols-2 gap-x-8 gap-y-5 px-5 pt-1 pb-5 sm:grid-cols-4" aria-label="What the build takes">
                {[...stats, ...build].map((s) => (
                  <div key={s.label}>
                    <dd className="text-xl leading-tight font-semibold tracking-tight tabular-nums">{s.value}</dd>
                    <dt className="mt-0.5 text-xs">{s.label}</dt>
                    <dd className="text-xs text-muted-foreground">{s.note}</dd>
                  </div>
                ))}
              </dl>
            </details>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="px-5 py-2 font-normal">Footprint</th>
                    <th className="px-3 py-2 font-normal">What it is</th>
                    <th className="px-3 py-2 text-right font-normal">Qty</th>
                    <th className="px-3 py-2 font-normal">Side</th>
                    <th className="px-3 py-2 font-normal">Designators</th>
                    <th className="px-3 py-2 font-normal">Value / MPN</th>
                    <th className="px-5 py-2 font-normal">In our catalogue</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {groups.map((g) => {
                    const fit = fits.get(g.key);
                    const refs = compressRefs(g.refs);
                    return (
                      <tr key={g.key}>
                        <td className="num px-5 py-2.5 font-medium whitespace-nowrap">{g.package || "—"}</td>
                        <td className="px-3 py-2.5">
                          {kindLabel(g)}
                          {g.tht ? <span className="ml-1.5 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">through-hole</span> : null}
                        </td>
                        <td className="num px-3 py-2.5 text-right">{g.refs.length}</td>
                        <td className="px-3 py-2.5 text-xs whitespace-nowrap text-muted-foreground">{g.bottom ? (g.top ? `Top ${g.top} · bottom ${g.bottom}` : "Bottom") : "Top"}</td>
                        <td className="num max-w-64 truncate px-3 py-2.5 text-xs text-muted-foreground" title={g.refs.join(", ")}>{refs}</td>
                        <td className="num px-3 py-2.5 text-xs">{g.mpn ?? g.value ?? <span className="text-muted-foreground">—</span>}</td>
                        <td className="px-5 py-2.5 text-xs whitespace-nowrap">
                          {fit?.parts ? (
                            <>
                              {fit.href ? <Link href={fit.href} className="text-primary hover:underline">{fit.parts} parts</Link> : `${fit.parts} parts`}
                              <span className={cn("text-muted-foreground", fit.inStock && "text-risk-green")}> · {fit.inStock} in our stores</span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">None yet — search when you quote</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
        {found?.notes.length ? (
          <ul className="space-y-0.5 border-t px-5 py-3 text-xs text-muted-foreground">
            {found.notes.slice(0, 6).map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <section aria-labelledby="bare-board" className="mt-6 overflow-hidden rounded-xl border bg-card">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-5 py-4">
          <h2 id="bare-board" className="text-lg font-semibold tracking-tight">Bare board prices{tech ? ` — ${tech.name}` : ""}</h2>
          <span className="text-xs text-muted-foreground">Landed estimate, per board</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="px-5 py-2 font-normal">Fab</th>
                <th className="px-3 py-2 font-normal">For this board</th>
                <th className="px-3 py-2 text-right font-normal">Lead</th>
                {QUANTITIES.map((q) => (
                  <th key={q} className="px-3 py-2 text-right font-normal">{qtyLabel(q)}</th>
                ))}
                <th className="px-5 py-2 text-right font-normal">Tooling</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {fabs.map((f) => (
                <tr key={f.id} className={cn(!f.fits && "text-muted-foreground")}>
                  <td className="px-5 py-2.5">
                    <span className="font-medium">{f.name}</span>
                    <span className="block text-xs text-muted-foreground">{f.online ? "Online quick-turn · " : ""}{f.country}</span>
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    {f.fits ? (
                      <span className="inline-flex items-center gap-1 text-risk-green"><Check className="size-3.5" aria-hidden /> Fits</span>
                    ) : (
                      <span className="inline-flex items-start gap-1 text-risk-amber"><X className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {f.gaps.join("; ")}</span>
                    )}
                  </td>
                  <td className="num px-3 py-2.5 text-right">{f.leadDays} d</td>
                  {f.prices.map((p) => (
                    <td key={p.qty} className="num px-3 py-2.5 text-right">{m.unit(p.unit)}</td>
                  ))}
                  <td className="num px-5 py-2.5 text-right">{m.whole(f.prices[0]?.nre ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!fabs.length ? <p className="px-5 py-3 text-sm text-muted-foreground">No PCB fabricators on file — run <code>npm run vendors:sync</code>.</p> : null}
        </div>
      </section>
    </>
  );
}
