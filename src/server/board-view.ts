import "server-only";
import { db } from "@/lib/db";
import type { Currency } from "@/lib/currency";
import { bodyFor, packageFromFootprint, type BodySpec } from "@/lib/board/bodies";
import { bodyFromFootprint, kindForLine, kindLabel, mountFromFootprint, squareUp, type FoundPart, type FoundParts } from "@/lib/board/find-parts";
import { ENCLOSURES, boardFits, type EnclosureSpec } from "@/lib/board/enclosures";
import { analyseBox, type KitLine } from "@/lib/board/box";
import { EDGE_KEEPOUT, resistorCode } from "@/lib/board/artwork";
import { readFab } from "@/lib/board/fab-measure";
import { normaliseMpn } from "@/lib/normalise";
import { buildRoute, type RoutePart } from "@/lib/ops/route";
import { effectiveCapability } from "@/lib/ops/machines";
import { ARTICLES } from "@/knowledge";
import { dictEntry } from "@/knowledge/dictionary";
import { expandRefDes } from "@/lib/refdes";
import { analyseRevision, type RevisionAnalysis } from "@/server/bom-pipeline";
import { analysePartRisk, type PartRisk } from "@/lib/part-risk";
import { fractionalYear } from "@/lib/bom/scores";
import { entryForPart } from "@/knowledge/dictionary";
import { webUrl } from "@/server/sourcing/normalise";
import type { BoardArtwork } from "@/server/board";
import type { ViewerData, ViewerPart, ViewerRouteStep } from "@/components/viewer/types";

type Spec = { layers?: number; thicknessMm?: number; finish?: string; mask?: string; silk?: string; sizeMm?: [number, number]; enclosure?: string; coating?: string };

/** Categories that go into the box, not onto the board — never drawn as parts on the PCB. */
const OFF_BOARD = new Set(["enclosure", "fastener", "hookup-wire", "ribbon-cable", "shielded-cable", "harness-component"]);

/** Everything the 3D viewer needs for one BoM revision. */
export async function getViewerData(revisionId: string, currency: Currency): Promise<ViewerData | null> {
  return (await viewerDataWithAnalysis(revisionId, currency))?.data ?? null;
}

/**
 * The viewer data plus the BoM analysis and per-line part risk it was built from (the deep-analysis report reads all
 * three). `enclosure` puts the board in another box than the project spec's (a quote's chosen box; null = none).
 */
export async function viewerDataWithAnalysis(
  revisionId: string,
  currency: Currency,
  opts: { enclosure?: EnclosureSpec | null } = {},
): Promise<{ data: ViewerData; analysis: RevisionAnalysis; riskByLine: Map<string, PartRisk> } | null> {
  const a = await analyseRevision(db, revisionId, currency);
  if (!a) return null;
  const rev = a.revision;
  const [board, placements, packages, alternates, lines] = await Promise.all([
    db.boardModel.findUnique({ where: { revisionId } }),
    db.placement.findMany({ where: { revisionId } }),
    db.package.findMany(),
    db.alternate.findMany({
      where: { partId: { in: a.lines.map((l) => l.partId).filter((x): x is string => !!x) } },
      include: { altPart: { select: { mpn: true } } },
      orderBy: { confidence: "desc" },
    }),
    db.line.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, include: { machines: { orderBy: { position: "asc" } } } }),
  ]);
  const spec = (rev.bom.project.boardSpec ?? {}) as Spec;
  const width = board?.widthMm ?? spec.sizeMm?.[0] ?? 100;
  const height = board?.heightMm ?? spec.sizeMm?.[1] ?? 80;
  const artwork = (board?.artwork ?? null) as BoardArtwork | null;
  const box = artwork?.box ?? { x: 0, y: 0, w: width, h: height };
  const pkgNames = packages.map((p) => p.name);
  const byLine = new Map(a.lines.map((l) => [l.id, l]));
  const lineByRef = new Map<string, (typeof a.lines)[number]>();
  for (const l of a.lines) for (const r of expandRefDes(l.refDes)) lineByRef.set(r, l);

  const nowYear = fractionalYear(new Date());
  // Risk for every matched line at this build's need — the panel shows it per part, the report per line.
  const riskByLine = new Map<string, PartRisk>();
  for (const line of a.lines) {
    const p = line.part;
    if (!p) continue;
    riskByLine.set(
      line.id,
      analysePartRisk({
        lifecycle: p.lifecycle,
        introducedYear: p.introducedYear,
        counterfeitRisk: p.counterfeitRisk,
        rohs: p.rohs,
        reach: p.reach,
        ownQty: line.internalQty,
        marketplaceQty: line.excessQty + line.brokerStock,
        authorisedStock: line.authorisedStock,
        authorisedSources: line.authorisedSources,
        leadWeeks: line.factoryLeadWeeks ?? p.mfrLeadTimeWeeks ?? null,
        alternates: alternates.filter((x) => x.partId === p.id && (x.type === "DROP_IN" || x.type === "PIN_TO_PIN")).length,
        priceTrendPct: line.priceTrendPct,
        need: Math.max(1, line.required),
        nowYear,
      }),
    );
  }
  // Per part, computed once even when it sits at many designators.
  const enriched = new Map<string, Pick<ViewerPart, "kind" | "supply" | "risk">>();
  const enrich = (line: NonNullable<(typeof a.lines)[number]>): Pick<ViewerPart, "kind" | "supply" | "risk"> => {
    const p = line.part!;
    const hit = enriched.get(line.id);
    if (hit) return hit;
    const entry = entryForPart({ categorySlug: p.category.slug, description: p.description, mpn: p.mpn });
    const risk = riskByLine.get(line.id)!;
    const out = {
      kind: entry ? { slug: entry.slug, name: entry.name } : null,
      supply: { ours: line.internalQty, partners: line.partnerQty, suppliers: line.authorisedStock, market: line.excessQty + line.brokerStock, sources: line.authorisedSources, leadWeeks: line.factoryLeadWeeks },
      risk: { score: risk.score, level: risk.level, summary: risk.summary, actions: risk.factors.map((f) => f.action).filter((x): x is string => !!x).slice(0, 2) },
    };
    enriched.set(line.id, out);
    return out;
  };

  // What the process route needs to know about each designator.
  const routeInfo = new Map<string, Omit<RoutePart, "refDes" | "side" | "dnp">>();
  const toPart = (ref: string, x: number, y: number, rotation: number, side: "TOP" | "BOTTOM", footprint: string | null, lineId: string | null): ViewerPart => {
    const line = (lineId && byLine.get(lineId)) || lineByRef.get(ref) || null;
    const p = line?.part ?? null;
    const extra = line && p ? enrich(line) : { kind: null, supply: null, risk: null };
    const pkg = p?.package ?? packages.find((k) => k.name === packageFromFootprint(footprint, pkgNames)) ?? null;
    // No part yet (a footprint read off the Gerbers, say): the footprint still says through-hole or not.
    routeInfo.set(ref, { mount: p?.mountType ?? mountFromFootprint(footprint), pkg: pkg?.name ?? null, family: pkg?.family ?? null, pitchMm: pkg?.pitchMm ?? null, category: p?.category.slug ?? null, msl: p?.msl ?? null });
    const scores = line?.scores ?? null;
    return {
      refDes: ref,
      x,
      y,
      rotation: squareUp(rotation),
      side,
      body: !pkg && !p && footprint ? bodyFromFootprint(footprint, footprintKind(ref, footprint)) : bodyFor(pkg, { category: p?.category.slug ?? null, mpn: p?.mpn }),
      lineId: line?.id ?? null,
      lineNo: line?.lineNo ?? null,
      partId: p?.id ?? null,
      mpn: p?.mpn ?? line?.rawMpn ?? null,
      pkg: pkg?.name ?? null,
      value: line?.rawValue ?? null,
      marking: /resistor/.test(p?.category.slug ?? "") ? resistorCode(line?.rawValue ?? p?.description) : (p?.mpn ?? line?.rawMpn ?? null),
      manufacturer: p?.manufacturer.name ?? line?.rawManufacturer ?? null,
      description: p?.description ?? line?.rawDescription ?? null,
      lifecycle: p?.lifecycle ?? null,
      rohs: p?.rohs ?? null,
      reach: p?.reach ?? null,
      scores,
      worst: scores ? Math.min(scores.availability, scores.resilience, scores.quality, scores.economic, scores.sustainability) : null,
      required: line?.required ?? 0,
      available: (line?.internalQty ?? 0) + (line?.partnerQty ?? 0) + (line?.excessQty ?? 0) + (line?.authorisedStock ?? 0),
      shortfall: line?.shortfall ?? 0,
      bestUnit: line?.bestAuthorised?.unit ?? null,
      landedUnit: line?.bestAuthorised?.landedUnit ?? null,
      dnp: line?.dnp ?? false,
      alternates: p ? alternates.filter((x) => x.partId === p.id).slice(0, 4).map((x) => ({ partId: x.altPartId, mpn: x.altPart.mpn, type: x.type })) : [],
      imageUrl: webUrl(p?.imageUrl),
      datasheetUrl: webUrl(p?.datasheetUrl),
      ...extra,
    };
  };

  let parts: ViewerPart[];
  // The route covers every designator, even ones an approximate layout had no room to draw.
  let routeSource: ViewerPart[];
  let approximateLayout = false;
  if (placements.length) {
    parts = placements.map((pl) => toPart(pl.refDes, pl.x - box.x - box.w / 2, pl.y - box.y - box.h / 2, pl.rotation, pl.side === "BOTTOM" ? "BOTTOM" : "TOP", pl.footprint, pl.bomLineId));
    routeSource = parts;
  } else {
    // No centroid: shelf-pack every placed RefDes, biggest first, inside the board outline.
    approximateLayout = true;
    const refs = a.lines.filter((l) => !OFF_BOARD.has(l.part?.category.slug ?? "")).flatMap((l) => expandRefDes(l.refDes).map((r) => ({ r, l })));
    const items = refs.map(({ r, l }) => ({ r, l, part: toPart(r, 0, 0, 0, "TOP", null, l.id) })).sort((p, q) => q.part.body.length * q.part.body.width - p.part.body.length * p.part.body.width);
    routeSource = items.map((it) => it.part);
    // Clear of the corner mounting holes and the edge strip the generated artwork uses.
    let cx = EDGE_KEEPOUT;
    let cy = EDGE_KEEPOUT;
    let rowH = 0;
    parts = [];
    for (const it of items) {
      const w = it.part.body.length + 1.5;
      const h = it.part.body.width + 1.5;
      if (cx + w > width - EDGE_KEEPOUT) {
        cx = EDGE_KEEPOUT;
        cy += rowH;
        rowH = 0;
      }
      if (cy + h > height - EDGE_KEEPOUT) break; // board full; remaining parts not drawn
      parts.push({ ...it.part, x: cx + w / 2 - width / 2, y: cy + h / 2 - height / 2 });
      cx += w;
      rowH = Math.max(rowH, h);
    }
  }

  const enc = opts.enclosure !== undefined ? (opts.enclosure ?? undefined) : spec.enclosure ? ENCLOSURES[spec.enclosure] : undefined;
  const thickness = board?.thicknessMm ?? spec.thicknessMm ?? 1.6;
  const encPart = enc
    ? await db.part.findFirst({
        where: { mpnNormalised: normaliseMpn(enc.mpn) },
        select: { id: true, parameters: { where: { parameter: { key: "ip_rating" } }, select: { valueText: true } } },
      })
    : null;
  const kitLines: KitLine[] = a.lines.map((l) => ({
    refDes: l.refDes ?? "",
    mpn: l.part?.mpn ?? l.rawMpn ?? "",
    partId: l.part?.id ?? null,
    // Catalogue wording first, then the customer's own — either may say "standoff" or "label".
    description: [l.part?.description, l.rawDescription].filter(Boolean).join(" · "),
    category: l.part?.category.slug ?? null,
    qty: l.qtyPerBoard,
  }));
  const boxInfo = enc ? analyseBox(enc, { w: box.w, h: box.h, thickness }, parts, kitLines) : null;
  const layerCount = board?.layerCount ?? spec.layers ?? 2;
  const finish = board?.finish ?? spec.finish ?? "ENIG";
  const route = buildRoute({
    parts: routeSource.map((vp) => ({ refDes: vp.refDes, side: vp.side, dnp: vp.dnp, mount: null, pkg: null, family: null, pitchMm: null, category: null, msl: null, ...routeInfo.get(vp.refDes) })),
    board: { layers: layerCount, finish, widthMm: box.w, heightMm: box.h },
    stage: rev.bom.project.stage,
    buildQty: rev.buildQty,
    coating: spec.coating ?? null,
    enclosure: enc && boxInfo ? { mpn: enc.mpn, kitGaps: boxInfo.kit.filter((k) => k.status === "missing" || k.status === "check").length } : null,
    lines: lines.map((l) => ({ code: l.code, name: l.name, type: l.type, capability: effectiveCapability(l), capacityCph: l.capacityCph, machines: l.machines.map((m) => ({ type: m.type, vendor: m.vendor, model: m.model })) })),
  }).map(nameStep);
  const data: ViewerData = {
    revisionId,
    title: `${rev.bom.name} rev ${rev.revision}`,
    currency,
    board: {
      source: board?.source === "gerber" ? "gerber" : "spec",
      width: box.w,
      height: box.h,
      thickness,
      layerCount,
      maskColor: board?.maskColor ?? spec.mask ?? "green",
      silkColor: board?.silkColor ?? spec.silk ?? "white",
      finish,
      origin: artwork?.box ? { x: artwork.box.x, y: artwork.box.y } : null,
      top: artwork?.top ?? null,
      bottom: artwork?.bottom ?? null,
      layers: artwork?.layers ?? [],
      fab: readFab(board?.fab),
    },
    parts,
    approximateLayout,
    product: { name: rev.bom.project.name, partNumber: rev.bom.assemblyPartNumber, revision: rev.revision, customer: rev.bom.project.customer.name },
    enclosure: enc ? { ...enc, fits: boardFits(enc, box.w, box.h).fits, partId: encPart?.id ?? null, ipRating: encPart?.parameters[0]?.valueText ?? null } : null,
    box: boxInfo,
    route,
  };
  return { data, analysis: a, riskByLine };
}

/** Puts names on a route step's machine and article for display. */
function nameStep(s: ReturnType<typeof buildRoute>[number]): ViewerRouteStep {
  return { ...s, machineName: s.machine ? dictEntry(s.machine)?.name ?? null : null, articleTitle: s.article ? ARTICLES.find((a) => a.slug === s.article)?.title ?? null : null };
}

/** What a designator says a footprint holds (K relay, J connector …), for a line that has no part yet. */
function footprintKind(ref: string, footprint: string) {
  const k = kindForLine(ref, footprint, null, null);
  return k && k !== "passive" ? k : undefined;
}

/** A body for a part read off the Gerbers: our package when the footprint names one, else sized from the footprint. */
function foundBody(f: FoundPart, packages: { name: string; family: string; lengthMm: number | null; widthMm: number | null; heightMm: number | null; pinCount: number | null; pitchMm: number | null }[]): BodySpec {
  const pkg = packages.find((k) => k.name === packageFromFootprint(f.package, packages.map((x) => x.name)));
  if (pkg) return bodyFor(pkg, { category: f.kind === "capacitor" ? "mlcc" : f.kind === "led" ? "led" : null });
  if (f.package && !/^\d+-pad part$/.test(f.package)) return bodyFromFootprint(f.package, f.kind);
  return { ...bodyFor(null), length: Math.max(0.6, f.w), width: Math.max(0.6, f.d) };
}

/** A quick-look board: the bare PCB from its Gerbers, with the components read off them. */
export async function getPreviewViewerData(
  id: string,
): Promise<(ViewerData & { createdAt: Date; files: { name: string; type: string; side: string }[]; found: FoundParts | null }) | null> {
  const b = await db.boardPreview.findUnique({ where: { id } });
  if (!b) return null;
  const artwork = (b.artwork ?? null) as BoardArtwork | null;
  const found = (b.components ?? null) as FoundParts | null;
  const packages = found?.parts.length ? await db.package.findMany({ select: { name: true, family: true, lengthMm: true, widthMm: true, heightMm: true, pinCount: true, pitchMm: true } }) : [];
  const box = artwork?.box ?? { x: 0, y: 0, w: b.widthMm, h: b.heightMm };
  const parts: ViewerPart[] = (found?.parts ?? []).map((f) => ({
    refDes: f.ref,
    x: f.x - box.x - box.w / 2,
    y: f.y - box.y - box.h / 2,
    rotation: squareUp(f.rotation),
    side: f.side,
    body: foundBody(f, packages),
    lineId: null,
    lineNo: null,
    partId: null,
    mpn: f.mpn,
    pkg: f.package || null,
    value: f.value,
    marking: f.value ?? f.mpn,
    manufacturer: null,
    description: `${kindLabel(f)}${f.package ? ` · ${f.package}` : ""}`,
    lifecycle: null,
    rohs: null,
    reach: null,
    scores: null,
    worst: null,
    required: 0,
    available: 0,
    shortfall: 0,
    bestUnit: null,
    landedUnit: null,
    dnp: false,
    alternates: [],
    imageUrl: null,
    datasheetUrl: null,
    kind: null,
    supply: null,
    risk: null,
  }));
  return {
    revisionId: null,
    title: b.name,
    currency: "INR",
    board: {
      source: "gerber",
      width: artwork?.box?.w ?? b.widthMm,
      height: artwork?.box?.h ?? b.heightMm,
      thickness: b.thicknessMm,
      layerCount: b.layerCount,
      maskColor: b.maskColor,
      silkColor: b.silkColor,
      finish: b.finish,
      origin: artwork?.box ? { x: artwork.box.x, y: artwork.box.y } : null,
      top: artwork?.top ?? null,
      bottom: artwork?.bottom ?? null,
      layers: artwork?.layers ?? [],
      fab: readFab(b.fab),
    },
    parts,
    approximateLayout: false,
    product: null,
    enclosure: null,
    box: null,
    route: [],
    createdAt: b.createdAt,
    files: (b.files ?? []) as { name: string; type: string; side: string }[],
    found,
  };
}

