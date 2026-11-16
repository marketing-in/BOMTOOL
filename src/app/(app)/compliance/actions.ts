"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

const rateSchema = z.object({
  prefix: z.string().regex(/^\d{4,8}$/, "HSN prefix must be 4–8 digits"),
  description: z.string().min(1, "Describe the goods").max(200),
  bcdPct: z.number().min(0).max(150),
  igstPct: z.number().min(0).max(28),
  note: z.string().max(300),
});

export async function saveDutyRate(input: z.infer<typeof rateSchema>): Promise<{ error?: string } | undefined> {
  const user = await requireUser("compliance.write");
  const p = rateSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message };
  const before = await db.hsnDutyRate.findUnique({ where: { prefix: p.data.prefix } });
  const data = { description: p.data.description, bcdPct: p.data.bcdPct, igstPct: p.data.igstPct, note: p.data.note || null };
  await db.hsnDutyRate.upsert({ where: { prefix: p.data.prefix }, create: { prefix: p.data.prefix, ...data }, update: data });
  await db.auditLog.create({
    data: { userId: user.id, action: "duty.save", entity: "HsnDutyRate", entityId: p.data.prefix, data: { before: before ? { bcd: Number(before.bcdPct), igst: Number(before.igstPct) } : null, after: { bcd: p.data.bcdPct, igst: p.data.igstPct } } },
  });
  revalidatePath("/compliance");
  revalidatePath("/sourcing/landed-cost");
  return {};
}
