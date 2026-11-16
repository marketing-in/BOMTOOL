import type { Prisma, PrismaClient } from "@prisma/client";
import { ARTICLES } from "@/knowledge";

/**
 * Upserts knowledge articles from the versioned seed files. Only rows whose stored version is older
 * are rewritten, so running it on a live database is safe and cheap.
 */
export async function syncKnowledge(db: PrismaClient) {
  const existing = new Map((await db.knowledgeArticle.findMany({ select: { slug: true, version: true } })).map((a) => [a.slug, a.version]));
  let created = 0;
  let updated = 0;
  for (const a of ARTICLES) {
    const prev = existing.get(a.slug);
    const data = {
      domain: a.domain,
      title: a.title,
      summary: a.summary,
      tags: a.tags,
      version: a.version,
      body: { sections: a.sections, standards: a.standards ?? [], related: a.related ?? [], categorySlugs: a.categorySlugs ?? [], visual: a.visual ?? null } as unknown as Prisma.InputJsonValue,
    };
    if (prev === undefined) {
      await db.knowledgeArticle.create({ data: { slug: a.slug, ...data } });
      created++;
    } else if (prev < a.version) {
      await db.knowledgeArticle.update({ where: { slug: a.slug }, data });
      updated++;
    }
  }
  return { created, updated, total: ARTICLES.length };
}
