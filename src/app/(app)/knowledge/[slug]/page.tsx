import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { DOMAIN_LABEL, PROCESSES, type Section, type Visual } from "@/knowledge";
import { PageHeader } from "@/components/data/page-header";
import { ArticleBody } from "@/components/knowledge/article-body";
import { ProcessPlayer } from "@/components/knowledge/process-player";
import { StackupExplorer } from "@/components/knowledge/stackup-explorer";
import { PackageDrawing } from "@/components/knowledge/package-drawing";

type Body = { sections: Section[]; standards: { code: string; title: string }[]; related: string[]; categorySlugs: string[]; visual: Visual | null };

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const a = await db.knowledgeArticle.findUnique({ where: { slug: (await params).slug }, select: { title: true } });
  return { title: a?.title ?? "Knowledge" };
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = await db.knowledgeArticle.findUnique({ where: { slug } });
  if (!a) notFound();
  const body = a.body as unknown as Body;
  const [related, categories, packages] = await Promise.all([
    db.knowledgeArticle.findMany({ where: { slug: { in: body.related } }, select: { slug: true, title: true, summary: true } }),
    body.categorySlugs.length
      ? db.category.findMany({ where: { slug: { in: body.categorySlugs } }, select: { slug: true, name: true, _count: { select: { parts: true } } } })
      : Promise.resolve([]),
    body.visual?.kind === "package" || body.visual?.kind === "packages"
      ? db.package.findMany({ where: body.visual.kind === "package" ? { family: body.visual.family } : {}, orderBy: [{ family: "asc" }, { pinCount: "asc" }] })
      : Promise.resolve([]),
  ]);
  const process = body.visual?.kind === "process" ? PROCESSES.find((p) => p.slug === (body.visual as { process: string }).process) : undefined;

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="flex gap-2">
            <Link href="/knowledge" className="hover:text-foreground">Knowledge</Link>
            <span aria-hidden>/</span>
            <span>{DOMAIN_LABEL[a.domain]}</span>
          </span>
        }
        title={a.title}
        description={a.summary}
      />

      {process ? (
        <div className="mb-8">
          <ProcessPlayer process={process} />
        </div>
      ) : null}
      {body.visual?.kind === "stackup" ? (
        <div className="mb-8">
          <StackupExplorer />
        </div>
      ) : null}
      {packages.length ? (
        <section className="mb-8 rounded-xl border bg-card p-5">
          <h2 className="mb-4 text-lg font-semibold tracking-tight">{body.visual?.kind === "packages" ? "Packages on our approved list" : "Examples from our catalogue"}</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
            {packages.map((p) => (
              <PackageDrawing key={p.id} pkg={p} size={96} />
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid gap-8 xl:grid-cols-[1fr_300px]">
        <ArticleBody sections={body.sections} />
        <aside className="space-y-6 xl:sticky xl:top-20 xl:self-start">
          {categories.length ? (
            <section className="rounded-xl border bg-card p-5">
              <h2 className="mb-2 text-sm font-semibold">In our catalogue</h2>
              <ul className="space-y-1 text-sm">
                {categories.map((c) => (
                  <li key={c.slug}>
                    <Link href={`/parts?category=${c.slug}`} className="flex justify-between gap-2 hover:underline">
                      <span>{c.name}</span>
                      <span className="num text-muted-foreground">{c._count.parts}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {body.standards.length ? (
            <section className="rounded-xl border bg-card p-5">
              <h2 className="mb-2 text-sm font-semibold">Standards</h2>
              <ul className="space-y-2 text-sm">
                {body.standards.map((s) => (
                  <li key={s.code}>
                    <div className="num font-medium">{s.code}</div>
                    <div className="text-xs text-muted-foreground">{s.title}</div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {related.length ? (
            <section className="rounded-xl border bg-card p-5">
              <h2 className="mb-2 text-sm font-semibold">Related</h2>
              <ul className="space-y-2 text-sm">
                {related.map((r) => (
                  <li key={r.slug}>
                    <Link href={`/knowledge/${r.slug}`} className="font-medium hover:underline">{r.title}</Link>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{r.summary}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <p className="num text-xs text-muted-foreground">Content v{a.version} · updated {a.updatedAt.toISOString().slice(0, 10)}</p>
        </aside>
      </div>
    </>
  );
}
