"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { MAX_BOM_BYTES } from "@/lib/bom/parse";
import { autoMap, detectHeaderRow, headerSignature, templateMapping } from "@/lib/bom/columns";
import { BOM_AMONG_BOARD_FILES, boardSpecFromDetails, bomAmong, pickDetail, readJobPack, readPackSummary, sameRevision, summarisePack, summaryWorthKeeping, type JobPack, type PackSummary } from "@/lib/bom/workbook";
import { isBomField, mappingProblem, type ColumnMapping } from "@/lib/bom/fields";
import { certainMapping, decidingColumns, type Certainty } from "@/lib/bom/certain-mapping";
import { ingestRevision, scoreRevision } from "@/server/bom-pipeline";
import { MAX_UPLOAD_BYTES, sortBoardFiles, type BoardFiles } from "@/lib/board/upload";
import { openArchives } from "@/lib/board/archive";
import { hasRealDesignators, linkPlacements, saveGerbers, savePlacements, savePlacementsFromFile, savePlacementsFromFound } from "@/server/board";
import { bomRowsFromFound, findParts, FOUND_BOM_MAPPING, type FoundParts } from "@/lib/board/find-parts";

export type ActionState = { error?: string } | undefined;

type Template = { signature: string; mapping: ColumnMapping; savedAt: string };

const MAX_ROWS = 5000;

const codeFrom = (name: string) =>
  name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24) || "NEW";

const uploadSchema = z.object({
  customerId: z.string().optional(),
  newCustomer: z.string().trim().max(120).optional(),
  project: z.string().trim().min(1, "Project name is required").max(120),
  bomName: z.string().trim().min(1, "BoM name is required").max(120),
  revision: z.string().trim().min(1, "Revision is required").max(20),
  buildQty: z.coerce.number().int().min(1, "Build qty must be at least 1").max(10_000_000),
  stage: z.enum(["PROTOTYPE", "NPI", "PRODUCTION"]),
});

export async function uploadBom(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser("bom.write");
  const parsed = uploadSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const input = parsed.data;

  // A quick look's board can stand in for the BoM file: its components, read off the Gerbers, become the rows.
  const previewId = typeof form.get("previewId") === "string" ? String(form.get("previewId")) : "";
  const preview = previewId ? await db.boardPreview.findUnique({ where: { id: previewId } }) : null;
  let found = (preview?.components ?? null) as FoundParts | null;
  let fromBoard = form.get("useFound") === "1";

  const file = form.get("file");
  const hasFile = file instanceof File && file.size > 0;
  // Board files (Gerber zip or layers, drill, centroid), or the Gerbers of a quick look. Read first: with no BoM
  // file, the Gerbers alone are enough to start — their components become the BoM.
  let boardUploads = form.getAll("boardFiles").filter((f): f is File => f instanceof File && f.size > 0);
  // The BoM sent among the board files (a customer's workbook beside the Gerber zip): a spreadsheet there that reads as
  // a BoM is the BoM, not the pick-and-place file. Its placement sheet still says where the parts sit.
  const sent = hasFile ? file : null;
  let bomFile: File | null = sent;
  let packRead: JobPack | null = null;
  // The same workbook given as the BoM and again among the board files is the BoM only.
  if (sent) boardUploads = boardUploads.filter((f) => !(f.name === sent.name && f.size === sent.size));
  else if (!fromBoard) {
    const sheets = boardUploads.filter((f) => BOM_AMONG_BOARD_FILES.test(f.name) && f.size <= MAX_BOM_BYTES);
    const among = bomAmong(await Promise.all(sheets.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))));
    if (among) {
      const taken = sheets[among.index];
      bomFile = taken;
      packRead = among.pack;
      boardUploads = boardUploads.filter((f) => f !== taken);
    }
  }
  if (boardUploads.reduce((s, f) => s + f.size, 0) > MAX_UPLOAD_BYTES) return { error: "Board files exceed 20 MB in total." };
  let board: BoardFiles | null = null;
  if (boardUploads.length) {
    try {
      board = sortBoardFiles(await openArchives(await Promise.all(boardUploads.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })))));
    } catch (e) {
      return { error: `Board files: ${e instanceof Error ? e.message : "could not be read"}` };
    }
    if (!board.gerbers.length && !board.centroid) return { error: "No Gerber, drill or centroid files among the board files." };
  }

  let rows: string[][];
  let sheetName: string | null = null;
  let fileName: string;
  // A workbook can carry more than the BoM: the placement report, load lists, not-fitted lists (src/lib/bom/workbook.ts).
  let pack: JobPack | null = null;
  if (fromBoard) {
    if (!preview) return { error: "That quick look is gone — upload the Gerbers again." };
    if (!found?.parts.length) return { error: "No components were found on that board — upload its BoM file instead." };
    rows = bomRowsFromFound(found);
    fileName = `${preview.name} — components from the Gerbers`;
  } else if (!bomFile && board?.gerbers.length) {
    // Gerbers only: read the parts off the board (designators from a pick-and-place file or the Gerbers, else guessed from the pads).
    try {
      found = findParts(board.gerbers, board.centroid ? { name: board.centroid.name, text: new TextDecoder().decode(board.centroid.bytes) } : null);
    } catch {
      found = null;
    }
    if (!found?.parts.length) return { error: "No components could be read off these Gerbers. Add the BoM file as well, or a pick-and-place file." };
    fromBoard = true;
    rows = bomRowsFromFound(found);
    fileName = `${input.bomName} — components from the Gerbers`;
  } else {
    if (!bomFile) return { error: "Choose a BoM file, or Gerber files, to upload." };
    if (bomFile.size > MAX_BOM_BYTES) return { error: "File is larger than 10 MB." };
    // The BoM sheet(s) the person chose on the upload form, when the file has several that read like one.
    const bomSheets = form.getAll("bomSheet").filter((v): v is string => typeof v === "string" && !!v);
    try {
      pack = packRead ?? readJobPack(new Uint8Array(await bomFile.arrayBuffer()), bomFile.name, { bomSheets });
      rows = pack.rows;
      sheetName = pack.bomSheets.length > 1 ? pack.bomSheets.join(" + ").slice(0, 190) : pack.bomSheet;
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Could not read the file." };
    }
    fileName = bomFile.name;
  }
  if (rows.length < 2) return { error: "The file has no table rows." };
  if (rows.length > MAX_ROWS) return { error: `BoM has ${rows.length} rows; the limit is ${MAX_ROWS}.` };

  // Resolve customer → project → BoM, creating what doesn't exist yet.
  let customer = input.customerId && input.customerId !== "new" ? await db.customer.findUnique({ where: { id: input.customerId } }) : null;
  if (!customer) {
    if (!input.newCustomer) return { error: "Pick a customer or enter a new customer name." };
    const existing = await db.customer.findFirst({ where: { name: { equals: input.newCustomer, mode: "insensitive" } } });
    customer = existing ?? (await db.customer.create({ data: { name: input.newCustomer, code: `${codeFrom(input.newCustomer)}-${Date.now().toString(36).slice(-4).toUpperCase()}` } }));
  }
  let project =
    (await db.project.findFirst({ where: { customerId: customer.id, name: { equals: input.project, mode: "insensitive" } } })) ??
    (await db.project.create({
      data: { customerId: customer.id, name: input.project, stage: input.stage, code: `${codeFrom(input.project)}-${Date.now().toString(36).slice(-4).toUpperCase()}` },
    }));
  const bom =
    (await db.bom.findFirst({ where: { projectId: project.id, name: { equals: input.bomName, mode: "insensitive" } } })) ??
    (await db.bom.create({ data: { projectId: project.id, name: input.bomName } }));
  if (await db.bomRevision.findUnique({ where: { bomId_revision: { bomId: bom.id, revision: input.revision } } })) {
    return { error: `${bom.name} already has revision ${input.revision}. Use a new revision label.` };
  }

  // Header + mapping: a saved customer template wins when the customer's own header row is identical (the columns the
  // upload adds after it — a count, a section, joined alternates — are mapped automatically). Rows made from the board
  // have their own known mapping.
  const headerRow = fromBoard ? 0 : (pack?.headerRow ?? detectHeaderRow(rows));
  const own = pack?.ownColumns ? Math.min(pack.ownColumns, rows[headerRow].length) : rows[headerRow].length;
  const signature = headerSignature(rows[headerRow].slice(0, own));
  const templates = (customer.bomTemplates ?? []) as Template[];
  const template = fromBoard ? undefined : templates.find((t) => t.signature === signature && t.mapping.length === own);
  const auto = autoMap(rows[headerRow], rows.slice(headerRow + 1));
  const mapping = fromBoard ? FOUND_BOM_MAPPING : template ? templateMapping(template.mapping, auto.mapping, own) : auto.mapping;

  // What the file says beyond the BoM table: designators that are on the board and not fitted become not-fitted
  // lines, the bare board's line becomes the board spec, the sheets and the file's own totals are checked against the
  // BoM, and the details (name, part number, revision, board) go where the app keeps them.
  let summary: PackSummary | null = null;
  if (pack) {
    const read = summarisePack(pack, { rows, headerRow, mapping, boardNotes: board?.notes ?? [] });
    rows = read.rows;
    summary = read.summary;
    // A revision the file itself states (not one read off the file name alone) that differs from the one typed.
    const fileRev = pickDetail(pack.details, "revision");
    if (fileRev && fileRev.via !== "file-name" && !sameRevision(fileRev.value, input.revision)) summary.findings.push({ level: "amber", text: `This upload is rev ${input.revision}; the file says rev ${fileRev.value} (${fileRev.from}).` });
    if (!summaryWorthKeeping(summary)) summary = null;
    // The file's own words fill what the project does not say yet (the bare board's line first, then a details
    // sheet); what the project already says stays.
    const spec = read.spec;
    const fromLine = spec ? { layers: spec.layers, thicknessMm: spec.thicknessMm, finish: spec.finish, mask: spec.mask, silk: spec.silk, sizeMm: spec.sizeMm, copperOz: spec.copperOz, material: spec.material } : {};
    const said = Object.fromEntries(Object.entries({ ...boardSpecFromDetails(pack.details), ...fromLine }).filter(([, v]) => v !== undefined));
    if (Object.keys(said).length) {
      const current = (project.boardSpec ?? {}) as Record<string, unknown>;
      const merged = { ...said, ...current };
      if (JSON.stringify(merged) !== JSON.stringify(current)) project = await db.project.update({ where: { id: project.id }, data: { boardSpec: merged as Prisma.InputJsonValue } });
    }
    // The assembly's own number, when the BoM does not have one yet.
    const partNumber = pickDetail(pack.details, "partNumber");
    if (partNumber && !bom.assemblyPartNumber) await db.bom.update({ where: { id: bom.id }, data: { assemblyPartNumber: partNumber.value.slice(0, 60) } });
  } else if (board?.notes.length) {
    summary = { sheets: [], placementSource: null, placements: 0, notFitted: [], added: [], findings: [], board: null, boardNotes: board.notes };
  }
  // Columns the upload can take without asking (a saved template, or an automatic mapping it is sure of): the mapping
  // page is skipped and the footprint match opens (src/lib/bom/certain-mapping.ts).
  const columns: Certainty | null = pack ? certainMapping({ rows, headerRow, mapping, confidence: auto.confidence, bomFound: pack.bomFound, template: !!template }) : null;

  const revision = await db.bomRevision.create({
    data: {
      bomId: bom.id,
      revision: input.revision,
      status: fromBoard ? "MAPPED" : "DRAFT",
      sourceFileName: fileName,
      sheetName,
      rawRows: rows,
      headerRow,
      columnMapping: mapping,
      pack: (summary ?? undefined) as Prisma.InputJsonValue | undefined,
      // The file's own notes (scope, build remarks), each with where it was read.
      notes: pack?.details.notes.length ? pack.details.notes.map((n) => `${n.text} — ${n.from}`).join("\n").slice(0, 8000) : undefined,
      buildQty: input.buildQty,
      uploadedById: user.id,
    },
  });
  let boardNote = "";
  try {
    if (board?.gerbers.length) await saveGerbers(db, revision.id, board.gerbers, { panel: board.panel });
    else if (preview)
      await db.boardModel.create({
        data: {
          revisionId: revision.id,
          source: "gerber",
          widthMm: preview.widthMm,
          heightMm: preview.heightMm,
          layerCount: preview.layerCount,
          thicknessMm: preview.thicknessMm,
          finish: preview.finish,
          maskColor: preview.maskColor,
          silkColor: preview.silkColor,
          files: (preview.files ?? undefined) as Prisma.InputJsonValue | undefined,
          artwork: (preview.artwork ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });
    if (board?.centroid) await savePlacementsFromFile(db, revision.id, board.centroid.name, board.centroid.bytes);
    // No pick-and-place file among the board files: the workbook's own placement sheet says where the parts sit.
    else if (pack?.placements.length) await savePlacements(db, revision.id, pack.placements);
    else if (fromBoard && found) await savePlacementsFromFound(db, revision.id, found.parts);
    else {
      // No pick-and-place file: Gerbers that name their pads (X2) or carry a component layer still say where each part sits.
      const read = board?.gerbers.length ? findParts(board.gerbers) : found;
      if (hasRealDesignators(read)) await savePlacementsFromFound(db, revision.id, read.parts);
    }
  } catch {
    boardNote = "boardError=1";
  }
  await db.auditLog.create({
    data: {
      userId: user.id,
      action: fromBoard ? "bom.fromBoard" : "bom.upload",
      entity: "BomRevision",
      entityId: revision.id,
      data: { file: fileName, rows: rows.length, template: !!template, boardFiles: boardUploads.map((f) => f.name), preview: preview?.id ?? null, components: fromBoard ? found?.source : undefined, gerbersOnly: fromBoard && !preview, sheets: pack?.sheets.map((s) => `${s.name}: ${s.kind}${s.used ? "" : " (not used)"}`), bomSheets: pack?.bomSheets, details: pack?.details.items.filter((d) => d.key).map((d) => `${d.key}: ${d.value}`), panel: board?.panel ? board.panel.count : undefined },
    },
  });
  if (fromBoard) {
    // Nothing to map: match the generated rows and open the footprint match (step 3).
    await ingestRevision(db, revision.id);
    await linkPlacements(db, revision.id);
    revalidatePath("/boms");
    redirect(`/boms/${revision.id}/match`);
  }
  // The columns are certain and the board files were read: what confirming the mapping does, without the page — match
  // the lines, point the placements (saved before the lines existed) at them, and open the footprint match. No template
  // is saved: a template means a person confirmed the columns. A board that could not be read goes to the mapping page,
  // which says so.
  let matchNote = "";
  if (columns?.certain && !boardNote) {
    let matched = false;
    try {
      await db.bomRevision.update({ where: { id: revision.id }, data: { status: "MAPPED" } });
      await ingestRevision(db, revision.id);
      await linkPlacements(db, revision.id);
      matched = true;
    } catch (e) {
      // Back to the mapping page, which says the columns were recognised but matching failed. Confirming the columns
      // there matches the lines again (ingestRevision replaces any lines this attempt wrote).
      console.error(`Automatic matching failed for BoM revision ${revision.id}:`, e);
      matchNote = "matchError=1";
      await db.bomRevision.update({ where: { id: revision.id }, data: { status: "DRAFT" } }).catch(() => undefined);
    }
    if (matched) {
      await db.auditLog.create({
        data: { userId: user.id, action: "bom.map", entity: "BomRevision", entityId: revision.id, data: { saveTemplate: false, auto: true, via: columns.via, columns: decidingColumns(rows[headerRow], mapping) } },
      });
      revalidatePath("/boms");
      redirect(`/boms/${revision.id}/match`);
    }
  }
  const query = [template ? "template=1" : "", boardNote, matchNote].filter(Boolean).join("&");
  redirect(`/boms/${revision.id}/map${query ? `?${query}` : ""}`);
}

const mappingSchema = z.object({
  revisionId: z.string().min(1),
  headerRow: z.number().int().min(0),
  mapping: z.array(z.string().nullable()),
  saveTemplate: z.boolean(),
});

export async function confirmMapping(input: z.infer<typeof mappingSchema>): Promise<ActionState> {
  const user = await requireUser("bom.write");
  const parsed = mappingSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid mapping." };
  const { revisionId, headerRow, saveTemplate } = parsed.data;
  const mapping: ColumnMapping = parsed.data.mapping.map((f) => (isBomField(f) ? f : null));

  const problem = mappingProblem(mapping);
  if (problem) return { error: problem };

  const rev = await db.bomRevision.findUnique({ where: { id: revisionId }, include: { bom: { include: { project: { include: { customer: true } } } } } });
  if (!rev) return { error: "BoM revision not found." };
  const rows = (rev.rawRows ?? []) as string[][];
  if (headerRow >= rows.length || mapping.length !== rows[headerRow].length) return { error: "Mapping does not fit the file." };

  await db.bomRevision.update({ where: { id: revisionId }, data: { headerRow, columnMapping: mapping, status: "MAPPED" } });

  if (saveTemplate) {
    // Saved for the customer's own header: the columns the upload added after it are not part of their file.
    const customer = rev.bom.project.customer;
    const kept = readPackSummary(rev.pack)?.ownColumns;
    const own = kept && headerRow === rev.headerRow ? Math.min(kept, mapping.length) : mapping.length;
    const signature = headerSignature(rows[headerRow].slice(0, own));
    const templates = ((customer.bomTemplates ?? []) as Template[]).filter((t) => t.signature !== signature);
    templates.push({ signature, mapping: mapping.slice(0, own), savedAt: new Date().toISOString() });
    await db.customer.update({ where: { id: customer.id }, data: { bomTemplates: templates as unknown as Prisma.InputJsonValue } });
  }

  await ingestRevision(db, revisionId);
  // Lines were re-created: point an uploaded centroid's placements at them again.
  await linkPlacements(db, revisionId);
  await db.auditLog.create({ data: { userId: user.id, action: "bom.map", entity: "BomRevision", entityId: revisionId, data: { saveTemplate } } });
  revalidatePath("/boms");
  // First the question that decides everything else: can our machines build it? Then board, parts, box, price.
  redirect(`/boms/${revisionId}/match`);
}

export async function selectMatch(lineId: string, partId: string | null): Promise<ActionState> {
  const user = await requireUser("bom.write");
  const line = await db.bomLine.findUnique({ where: { id: lineId }, include: { matches: true } });
  if (!line) return { error: "Line not found." };
  if (partId && !line.matches.some((m) => m.partId === partId)) return { error: "That part is not a candidate for this line." };

  await db.$transaction([
    db.bomLineMatch.updateMany({ where: { bomLineId: lineId }, data: { selected: false } }),
    ...(partId ? [db.bomLineMatch.updateMany({ where: { bomLineId: lineId, partId }, data: { selected: true } })] : []),
    db.bomLine.update({ where: { id: lineId }, data: { partId, needsReview: !partId } }),
  ]);
  await scoreRevision(db, line.revisionId);
  await db.auditLog.create({ data: { userId: user.id, action: "bom.selectMatch", entity: "BomLine", entityId: lineId, data: { partId } } });
  revalidatePath(`/boms/${line.revisionId}`);
}

const ALT_REASON = { DROP_IN: "Drop-in", PIN_TO_PIN: "Pin-to-pin", FUNCTIONAL: "Functional", UPGRADE: "Upgrade" } as const;

/**
 * Moves a line onto a recorded alternate of its current part. Both parts stay as candidates, so
 * the line can be switched back; a functional alternate flags the line for engineering review.
 */
export async function switchToAlternate(lineId: string, altPartId: string): Promise<ActionState> {
  const user = await requireUser("bom.write");
  const line = await db.bomLine.findUnique({ where: { id: lineId }, select: { partId: true, revisionId: true } });
  if (!line?.partId) return { error: "Match this line to a part first." };
  const from = line.partId;
  const alt = await db.alternate.findUnique({ where: { partId_altPartId: { partId: from, altPartId } }, include: { part: { select: { mpn: true } } } });
  if (!alt) return { error: "That part is not a recorded alternate for this line." };
  const reason = `${ALT_REASON[alt.type]} alternate for ${alt.part.mpn}${alt.approvedBy ? ` (approved by ${alt.approvedBy})` : ""}`;
  await db.$transaction([
    db.bomLineMatch.upsert({
      where: { bomLineId_partId: { bomLineId: lineId, partId: from } },
      create: { bomLineId: lineId, partId: from, method: "MANUAL", confidence: 100, reason: "Original part" },
      update: {},
    }),
    db.bomLineMatch.upsert({
      where: { bomLineId_partId: { bomLineId: lineId, partId: altPartId } },
      create: { bomLineId: lineId, partId: altPartId, method: "MANUAL", confidence: alt.confidence, reason },
      update: { reason },
    }),
    db.bomLineMatch.updateMany({ where: { bomLineId: lineId }, data: { selected: false } }),
    db.bomLineMatch.updateMany({ where: { bomLineId: lineId, partId: altPartId }, data: { selected: true } }),
    db.bomLine.update({ where: { id: lineId }, data: { partId: altPartId, needsReview: alt.type === "FUNCTIONAL" } }),
  ]);
  await scoreRevision(db, line.revisionId);
  await db.auditLog.create({ data: { userId: user.id, action: "bom.useAlternate", entity: "BomLine", entityId: lineId, data: { from, to: altPartId, type: alt.type } } });
  revalidatePath(`/boms/${line.revisionId}`);
}

export async function setBuildQty(revisionId: string, buildQty: number): Promise<ActionState> {
  await requireUser("bom.write");
  if (!Number.isInteger(buildQty) || buildQty < 1 || buildQty > 10_000_000) return { error: "Build qty must be a whole number ≥ 1." };
  await db.bomRevision.update({ where: { id: revisionId }, data: { buildQty } });
  await scoreRevision(db, revisionId);
  revalidatePath(`/boms/${revisionId}`);
}
