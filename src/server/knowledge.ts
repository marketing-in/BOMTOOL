import "server-only";
import { db } from "@/lib/db";

export type KnowledgeHit = { slug: string; domain: string; title: string; summary: string; rank: number };

/**
 * Postgres full-text search, weighted title (A) > tags/summary (B) > body (D).
 * Falls back to substring matching for tokens FTS doesn't stem well ("0603", "SOT-23", "J-STD-033").
 */
export async function searchKnowledge(q: string, limit = 30): Promise<KnowledgeHit[]> {
  const query = q.trim();
  if (!query) return [];
  const hits = await db.$queryRaw<KnowledgeHit[]>`
    SELECT slug, domain::text AS domain, title, summary,
           ts_rank(doc, websearch_to_tsquery('english', ${query})) AS rank
    FROM (
      SELECT slug, domain, title, summary,
             setweight(to_tsvector('english', title), 'A') ||
             setweight(to_tsvector('english', array_to_string(tags, ' ')), 'B') ||
             setweight(to_tsvector('english', summary), 'B') ||
             setweight(to_tsvector('english', body::text), 'D') AS doc
      FROM "KnowledgeArticle"
    ) k
    WHERE doc @@ websearch_to_tsquery('english', ${query})
    ORDER BY rank DESC
    LIMIT ${limit}`;
  if (hits.length) return hits.map((h) => ({ ...h, rank: Number(h.rank) }));

  const like = `%${query}%`;
  const rows = await db.$queryRaw<KnowledgeHit[]>`
    SELECT slug, domain::text AS domain, title, summary, 0.01 AS rank
    FROM "KnowledgeArticle"
    WHERE title ILIKE ${like} OR summary ILIKE ${like} OR array_to_string(tags, ' ') ILIKE ${like} OR body::text ILIKE ${like}
    ORDER BY (title ILIKE ${like}) DESC, title
    LIMIT ${limit}`;
  return rows.map((h) => ({ ...h, rank: Number(h.rank) }));
}
