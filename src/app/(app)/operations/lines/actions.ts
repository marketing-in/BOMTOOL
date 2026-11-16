"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { TokenBucket } from "@/lib/rate-limit";
import { CHIP_ORDER, MACHINE_KINDS, mergeCapability, readSpecs, writeSpecs, type SpecSource } from "@/lib/ops/machines";
import { AssistantError } from "@/lib/assistant/types";
import type { LookupResult } from "@/lib/assistant/machine-lookup";
import { lookupMachine } from "@/server/assistant/machine-lookup";

/** Line and machine setup (Phase 19). Everything here needs `lines.write` (admin, planning). */

type Result = { error?: string; message?: string } | undefined;

const LINE_TYPES = ["SMT", "THT", "BOX_BUILD", "MIXED"] as const;
const MACHINE_TYPES = Object.keys(MACHINE_KINDS) as [string, ...string[]];

// A machine's limits change what every BoM can be built on, so every page that judges a board is refreshed.
const refresh = () => revalidatePath("/", "layout");

async function audit(userId: string, action: string, entity: "Line" | "Machine", entityId: string) {
  await db.auditLog.create({ data: { userId, action, entity, entityId } });
}

// ── Lines

const optInt = z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), z.coerce.number().int().min(0).max(1_000_000).nullable());

const lineInput = z.object({
  id: z.string().optional(),
  code: z.string().trim().min(1, "Give the line a code, e.g. L5").max(12).regex(/^[A-Za-z0-9-]+$/, "Letters, digits and dashes only"),
  name: z.string().trim().min(1, "Give the line a name").max(120),
  type: z.enum(LINE_TYPES),
  description: z.string().trim().max(400).optional().default(""),
  shiftsPerDay: z.coerce.number().int().min(1).max(3),
  capacityCph: optInt,
  feederSlots: optInt,
  active: z.boolean().default(true),
  /** The line's own summary (src/lib/ops/machines.ts LINE_CAP_FIELDS); checked and merged by mergeCapability. */
  capability: z.record(z.string(), z.unknown()).optional(),
});

export async function saveLine(input: Omit<z.input<typeof lineInput>, "type"> & { type: string }): Promise<Result & { id?: string }> {
  const user = await requireUser("lines.write");
  const p = lineInput.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message };
  const { id, capability: capEdits, ...data } = p.data;
  const clash = await db.line.findFirst({ where: { code: data.code, ...(id ? { id: { not: id } } : {}) }, select: { id: true } });
  if (clash) return { error: `Another line is already called ${data.code}.` };
  const fields = { ...data, description: data.description || null };
  if (id) {
    const current = await db.line.findUnique({ where: { id }, select: { capability: true } });
    if (!current) return { error: "That line no longer exists." };
    const capability = capEdits ? mergeCapability(current.capability, capEdits) : current.capability;
    await db.line.update({ where: { id }, data: { ...fields, capability: capability as Prisma.InputJsonValue } });
    await audit(user.id, "line.update", "Line", id);
    refresh();
    return { message: `${data.code} saved`, id };
  }
  const last = await db.line.aggregate({ _max: { sortOrder: true } });
  // A new line starts with whatever summary was typed in (often none): its machines say what it can do.
  const created = await db.line.create({ data: { ...fields, capability: mergeCapability({}, capEdits ?? {}) as Prisma.InputJsonValue, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
  await audit(user.id, "line.create", "Line", created.id);
  refresh();
  return { message: `${data.code} added — now add its machines`, id: created.id };
}

/** The next free code in the L1, L2… series. */
async function nextCode(): Promise<string> {
  const codes = new Set((await db.line.findMany({ select: { code: true } })).map((l) => l.code.toUpperCase()));
  let n = codes.size + 1;
  while (codes.has(`L${n}`)) n++;
  return `L${n}`;
}

/** A copy of a line with all its machines and their limits, under the next free code — the quick start for a similar line. */
export async function duplicateLine(id: string): Promise<Result & { id?: string }> {
  const user = await requireUser("lines.write");
  const src = await db.line.findUnique({ where: { id }, include: { machines: { orderBy: { position: "asc" } } } });
  if (!src) return { error: "That line no longer exists." };
  const code = await nextCode();
  const last = await db.line.aggregate({ _max: { sortOrder: true } });
  const copy = await db.line.create({
    data: {
      code,
      name: `${src.name.replace(/^.*—\s*/, "")} (copy of ${src.code})`,
      type: src.type,
      description: src.description,
      capability: (src.capability ?? {}) as Prisma.InputJsonValue,
      capacityCph: src.capacityCph,
      feederSlots: src.feederSlots,
      shiftsPerDay: src.shiftsPerDay,
      active: true,
      sortOrder: (last._max.sortOrder ?? 0) + 1,
      machines: { create: src.machines.map((m) => ({ type: m.type, vendor: m.vendor, model: m.model, position: m.position, specs: (m.specs ?? undefined) as Prisma.InputJsonValue | undefined })) },
    },
  });
  await audit(user.id, "line.duplicate", "Line", copy.id);
  refresh();
  return { message: `${code} made as a copy of ${src.code} — rename it and change what differs`, id: copy.id };
}

/** A line with work orders keeps its history: it is retired instead of deleted. */
export async function removeLine(id: string): Promise<Result> {
  const user = await requireUser("lines.write");
  const line = await db.line.findUnique({ where: { id }, select: { code: true, _count: { select: { workOrders: true } } } });
  if (!line) return { error: "That line no longer exists." };
  if (line._count.workOrders) {
    await db.line.update({ where: { id }, data: { active: false } });
    await audit(user.id, "line.retire", "Line", id);
    refresh();
    return { message: `${line.code} has work orders, so it was retired rather than deleted.` };
  }
  await db.line.delete({ where: { id } });
  await audit(user.id, "line.delete", "Line", id);
  refresh();
  return { message: `${line.code} deleted` };
}

// ── Machines

const machineInput = z.object({
  type: z.enum(MACHINE_TYPES),
  vendor: z.string().trim().min(1, "Who makes it?").max(80),
  model: z.string().trim().min(1, "Which model?").max(120),
  /** Year built or bought; kept with the machine's specs. */
  year: z.number().int().min(1970, "Year looks too early").max(2100, "Year looks wrong").nullable().optional(),
});

/** A look-up needs the make, and the model or the year (the AI can work out the model from brand and year). */
const lookupInput = z
  .object({ type: z.enum(MACHINE_TYPES), vendor: z.string().trim().min(1, "Who makes it?").max(80), model: z.string().trim().max(120), year: z.number().int().min(1970).max(2100).nullable().optional() })
  .refine((x) => x.model.length > 0 || !!x.year, { message: "Give the model, or the year so the AI can work out the model." });
const yearExtra = (extra: Record<string, unknown>, year: number | null | undefined) => {
  const { year: _old, ...rest } = extra;
  void _old;
  return year ? { ...rest, year } : rest;
};

export async function addMachine(lineId: string, input: z.input<typeof machineInput>): Promise<Result & { id?: string }> {
  const user = await requireUser("lines.write");
  const p = machineInput.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message };
  const last = await db.machine.aggregate({ where: { lineId }, _max: { position: true } });
  const { year, ...data } = p.data;
  const m = await db.machine.create({ data: { lineId, ...data, type: data.type as Prisma.MachineCreateInput["type"], position: (last._max.position ?? 0) + 1, ...(year ? { specs: { year } } : {}) } });
  await audit(user.id, "machine.create", "Machine", m.id);
  refresh();
  return { message: `${p.data.vendor} ${p.data.model} added`, id: m.id };
}

const pairIn = z.tuple([z.number().positive().max(3000), z.number().positive().max(3000)]).optional();
const posIn = (max: number) => z.number().positive().max(max).optional();
const specsInput = z.object({
  maxBoardMm: pairIn,
  minBoardMm: pairIn,
  minThicknessMm: posIn(20),
  maxThicknessMm: posIn(20),
  minChip: z.enum(CHIP_ORDER).optional(),
  minPitchMm: posIn(5),
  maxComponentMm: pairIn,
  maxComponentHeightMm: posIn(200),
  cph: posIn(500_000),
  feederSlots: posIn(2000),
  zones: posIn(40),
  nitrogen: z.boolean().optional(),
  technology: z.enum(["2D", "3D", "2.5D", "CT"]).optional(),
});
const sourceInput = z.object({
  by: z.enum(["manual", "claude", "typical"]),
  confidence: z.enum(["high", "medium", "low"]).optional(),
  notes: z.string().max(600).optional(),
  sources: z.array(z.object({ title: z.string().max(200), url: z.string().url().max(500) })).max(8).optional(),
});

/** Saves a machine's make, model and limits; the limits record where they came from. */
export async function saveMachine(id: string, input: { machine: z.input<typeof machineInput>; specs: Record<string, unknown>; source: z.input<typeof sourceInput> }): Promise<Result> {
  const user = await requireUser("lines.write");
  const m = machineInput.safeParse(input.machine);
  const s = specsInput.safeParse(input.specs);
  const src = sourceInput.safeParse(input.source);
  if (!m.success) return { error: m.error.issues[0]?.message };
  if (!s.success) return { error: `Check the limits: ${s.error.issues[0]?.path.join(".")} ${s.error.issues[0]?.message}` };
  if (!src.success) return { error: "Where the limits came from could not be read." };
  const current = await db.machine.findUnique({ where: { id }, select: { specs: true } });
  if (!current) return { error: "That machine no longer exists." };
  const { extra } = readSpecs(current.specs);
  const source: SpecSource = { ...src.data, at: new Date().toISOString() };
  await db.machine.update({
    where: { id },
    data: { vendor: m.data.vendor, model: m.data.model, type: m.data.type as Prisma.MachineUpdateInput["type"], specs: writeSpecs(m.data.type, s.data, source, yearExtra(extra, m.data.year)) as Prisma.InputJsonValue },
  });
  await audit(user.id, "machine.update", "Machine", id);
  refresh();
  return { message: `${m.data.vendor} ${m.data.model} saved` };
}

/** Renumbers a line's machines 1…n in the given order. Positions are unique per line, so they step aside first. */
async function renumber(lineId: string, ids: string[]) {
  await db.$transaction([
    ...ids.map((id, i) => db.machine.update({ where: { id }, data: { position: 10_000 + i } })),
    ...ids.map((id, i) => db.machine.update({ where: { id }, data: { position: i + 1 } })),
  ]);
}

export async function moveMachine(id: string, dir: -1 | 1): Promise<Result> {
  const user = await requireUser("lines.write");
  const m = await db.machine.findUnique({ where: { id }, select: { lineId: true } });
  if (!m) return { error: "That machine no longer exists." };
  const ids = (await db.machine.findMany({ where: { lineId: m.lineId }, orderBy: { position: "asc" }, select: { id: true } })).map((x) => x.id);
  const i = ids.indexOf(id);
  const j = i + dir;
  if (j < 0 || j >= ids.length) return undefined;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  await renumber(m.lineId, ids);
  await audit(user.id, "machine.move", "Machine", id);
  refresh();
  return undefined;
}

export async function removeMachine(id: string): Promise<Result> {
  const user = await requireUser("lines.write");
  const m = await db.machine.findUnique({ where: { id }, select: { lineId: true, vendor: true, model: true } });
  if (!m) return { error: "That machine no longer exists." };
  await db.machine.delete({ where: { id } });
  const rest = (await db.machine.findMany({ where: { lineId: m.lineId }, orderBy: { position: "asc" }, select: { id: true } })).map((x) => x.id);
  if (rest.length) await renumber(m.lineId, rest);
  await audit(user.id, "machine.delete", "Machine", id);
  refresh();
  return { message: `${m.vendor} ${m.model} removed` };
}

// ── The AI looks a machine up

const PER_MINUTE = 6;
const g = globalThis as unknown as { __emsLookupBuckets?: Map<string, TokenBucket> };

export type LookupState = { result?: LookupResult; mode?: "claude" | "mock"; model?: string | null; error?: string };

/** Finds a machine's limits for the form to fill in. Nothing is saved: the user reviews them and presses Save. */
export async function lookupMachineLimits(input: z.input<typeof lookupInput>): Promise<LookupState> {
  const user = await requireUser("lines.write");
  const p = lookupInput.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message };
  g.__emsLookupBuckets ??= new Map();
  let b = g.__emsLookupBuckets.get(user.id);
  if (!b) g.__emsLookupBuckets.set(user.id, (b = new TokenBucket(PER_MINUTE)));
  const wait = b.take();
  if (wait > 0) return { error: `Too many look-ups. Try again in ${Math.ceil(wait / 1000)} s.` };
  try {
    const r = await lookupMachine(p.data);
    return { result: r.result, mode: r.mode, model: r.model };
  } catch (e) {
    if (!(e instanceof AssistantError)) console.error("[machine lookup]", e instanceof Error ? e.message : e);
    return { error: e instanceof AssistantError ? e.message : "The look-up failed. Try again, or type the limits in from the datasheet." };
  }
}
