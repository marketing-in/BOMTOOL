import type { Prisma, PrismaClient } from "@prisma/client";
import { ARTICLES } from "@/knowledge";
import { normaliseManufacturerKey } from "@/lib/normalise";
import { MANUFACTURERS } from "../../prisma/seed-data/manufacturers";

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

/**
 * Adds the makers and maker aliases of the seed list a database does not have yet (a maker added to the list, a
 * spelling learnt from a customer's BoM), without touching anything else: existing makers keep their data, an alias
 * already pointing at another maker stays where it is.
 */
export async function syncManufacturers(db: PrismaClient) {
  const makers = new Map((await db.manufacturer.findMany({ select: { id: true, name: true } })).map((m) => [m.name, m.id]));
  const taken = new Set((await db.manufacturerAlias.findMany({ select: { alias: true } })).map((a) => a.alias));
  let created = 0;
  let aliases = 0;
  for (const m of MANUFACTURERS) {
    let id = makers.get(m.name);
    if (!id) {
      id = (await db.manufacturer.create({ data: { name: m.name, shortName: m.shortName, website: m.website, country: m.country, brandTier: m.tier } })).id;
      makers.set(m.name, id);
      created++;
    }
    for (const key of new Set([m.name, ...(m.shortName ? [m.shortName] : []), ...m.aliases].map(normaliseManufacturerKey).filter(Boolean))) {
      if (taken.has(key)) continue;
      await db.manufacturerAlias.create({ data: { alias: key, manufacturerId: id } });
      taken.add(key);
      aliases++;
    }
  }
  return { created, aliases, total: MANUFACTURERS.length };
}

