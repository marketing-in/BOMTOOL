"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { readServices, type OrderService } from "@/lib/order-services";

export async function saveServices(poId: string, services: OrderService[]): Promise<{ error?: string; message?: string }> {
  await requireUser("sourcing.buy");
  const po = await db.purchaseOrderDraft.findUnique({ where: { id: poId }, select: { status: true } });
  if (!po) return { error: "PO not found" };
  if (po.status !== "DRAFT") return { error: "Only a draft PO can change its services" };
  const clean = readServices(services);
  await db.purchaseOrderDraft.update({ where: { id: poId }, data: { services: clean as unknown as Prisma.InputJsonValue } });
  revalidatePath(`/sourcing/pos/${poId}`);
  return { message: clean.length ? `${clean.length} service${clean.length === 1 ? "" : "s"} saved` : "Services cleared" };
}
