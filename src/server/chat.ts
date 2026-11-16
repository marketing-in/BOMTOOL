import "server-only";
import { db } from "@/lib/db";

/** Threads are keyed "listing:<excessListingId>" or "rfq:<rfqId>". */
export type ThreadContext = { thread: string; title: string; seller: string; detail: string; href: string };

export function parseThread(thread: string): { kind: "listing" | "rfq"; id: string } | null {
  const m = /^(listing|rfq):([a-z0-9]+)$/i.exec(thread);
  return m ? { kind: m[1] as "listing" | "rfq", id: m[2] } : null;
}

export async function threadContext(thread: string): Promise<ThreadContext | null> {
  const t = parseThread(thread);
  if (!t) return null;
  if (t.kind === "listing") {
    const l = await db.excessListing.findUnique({ where: { id: t.id }, include: { part: { select: { id: true, mpn: true } }, supplier: { select: { name: true } } } });
    if (!l) return null;
    const ask = l.askPrice ? ` at ${Number(l.askPrice)} ${l.currency}` : "";
    return { thread, title: l.part.mpn, seller: l.supplier.name, detail: `${l.qty.toLocaleString("en-IN")} pcs${ask}${l.dateCode ? ` · DC ${l.dateCode}` : ""}${l.location ? ` · ${l.location}` : ""}`, href: `/parts/${l.part.id}` };
  }
  const r = await db.rfq.findUnique({ where: { id: t.id }, include: { suppliers: { select: { name: true } }, _count: { select: { lines: true } } } });
  if (!r) return null;
  return { thread, title: r.number, seller: r.suppliers.map((x) => x.name).join(", ") || "Suppliers", detail: `${r._count.lines} lines · ${r.status.toLowerCase().replace(/_/g, " ")}`, href: `/sourcing/rfqs/${r.id}` };
}

export function listMessages(thread: string) {
  return db.message.findMany({ where: { thread }, orderBy: { createdAt: "asc" } });
}

/** Threads with their latest message, newest first. */
export async function recentThreads(take = 30) {
  const rows = await db.message.findMany({ orderBy: { createdAt: "desc" }, take: 400, select: { thread: true, body: true, author: true, createdAt: true } });
  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!latest.has(r.thread)) latest.set(r.thread, r);
  return [...latest.values()].slice(0, take);
}
