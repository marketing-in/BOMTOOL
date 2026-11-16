"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { importMarketResult } from "@/server/sourcing/market";

/** Adds a distributor search result to our catalogue and opens its part page. */
export async function importMarketPart(query: string, key: string): Promise<{ error?: string } | undefined> {
  const user = await requireUser();
  if (!can(user.role, "bom.write") && !can(user.role, "sourcing.buy")) return { error: "Only engineering or purchasing can add parts to the catalogue." };
  const res = await importMarketResult(query, key, user.id);
  if ("error" in res) return res;
  redirect(`/parts/${res.partId}`);
}
