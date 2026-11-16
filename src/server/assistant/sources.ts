import "server-only";
import { db } from "@/lib/db";
import { ARTICLES } from "@/knowledge";
import { getBuild } from "@/server/build";
import { getDeepAnalysis } from "@/server/deep-analysis";
import { getReverse } from "@/server/reverse";
import { searchKnowledge } from "@/server/knowledge";
import { ensureFx } from "@/server/fx";
import { partReport } from "@/server/part-report";
import { lineFitFor, linesForAssistant } from "@/server/lines";
import type { AssistantSources, BuildLike } from "@/lib/assistant/types";

/**
 * The platform's data as the assistant's tools read it — the same loaders the pages use, nothing written.
 * One instance per question: a BoM that several tools ask for is loaded once.
 */
export function createSources(): AssistantSources {
  const once = <T>(store: Map<string, Promise<T>>, key: string, load: () => Promise<T>) => {
    let p = store.get(key);
    if (!p) store.set(key, (p = load()));
    return p;
  };
  const builds = new Map<string, Promise<BuildLike | null>>();
  const deeps = new Map<string, Promise<Awaited<ReturnType<AssistantSources["deep"]>>>>();
  const reverses = new Map<string, Promise<Awaited<ReturnType<AssistantSources["reverse"]>>>>();

  return {
    async searchArticles(query, limit) {
      return (await searchKnowledge(query, limit)).map(({ slug, domain, title, summary }) => ({ slug, domain, title, summary }));
    },
    async article(slug) {
      return ARTICLES.find((a) => a.slug === slug) ?? null;
    },
    async findBoms(query, limit) {
      const q = query.trim();
      const rows = await db.bomRevision.findMany({
        where: q ? { OR: [{ id: q }, { bom: { name: { contains: q, mode: "insensitive" } } }, { bom: { project: { code: { equals: q, mode: "insensitive" } } } }, { bom: { project: { name: { contains: q, mode: "insensitive" } } } }] } : {},
        orderBy: { createdAt: "desc" },
        take: limit,
        select: { id: true, revision: true, bom: { select: { name: true, project: { select: { code: true, name: true } } } }, _count: { select: { lines: true } } },
      });
      return rows.map((r) => ({ revisionId: r.id, name: r.bom.name, revision: r.revision, project: `${r.bom.project.code} ${r.bom.project.name}`, lines: r._count.lines }));
    },
    build: (id) => once(builds, id, () => getBuild(id)),
    deep: (id) => once(deeps, id, async () => (await getDeepAnalysis(id, "INR"))?.report ?? null),
    reverse: (id) => once(reverses, id, async () => (await getReverse(id))?.report ?? null),
    async part(mpn) {
      await ensureFx();
      return partReport(mpn);
    },
    lines: () => linesForAssistant(),
    lineFit: (id) => lineFitFor(id),
  };
}
