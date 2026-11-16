"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export async function acknowledgeEvents(ids: string[]) {
  const user = await requireUser();
  if (!ids.length) return;
  await db.sourcingEvent.updateMany({ where: { id: { in: ids.slice(0, 500) } }, data: { acknowledged: true } });
  await db.auditLog.create({ data: { userId: user.id, action: "alerts.ack", entity: "SourcingEvent", data: { count: ids.length } } });
  revalidatePath("/", "layout");
}
