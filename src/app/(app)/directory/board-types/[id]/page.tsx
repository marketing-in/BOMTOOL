import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/data/page-header";
import { BOARD_CATEGORY, BOARD_TYPES, supplyByMpn } from "@/server/directory";
import { normaliseMpn } from "@/lib/normalise";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: BOARD_TYPES.find((t) => t.id === id)?.name ?? "Board type" };
}

const k = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}k` : n.toLocaleString("en-IN"));

export default async function BoardTypePage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const t = BOARD_TYPES.find((x) => x.id === id);
  if (!t) notFound();
  const examples = t.sections.flatMap((s) => s.parts.map((p) => p.example)).filter(Boolean);
  const supply = await supplyByMpn(examples);
  return (
    <>
      <PageHeader eyebrow={<Link href="/directory/board-types" className="hover:text-foreground">Board types · {BOARD_CATEGORY[t.category] ?? t.category}</Link>} title={t.name} description={t.description} />
      <p className="mb-5 text-sm text-muted-foreground">Examples: {t.examples.join(" · ")}</p>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          {t.sections.map((s) => (
            <section key={s.name} className="rounded-lg border bg-card" aria-label={s.name}>
              <div className="border-b px-4 py-3">
                <h2 className="text-base font-medium">{s.name}</h2>
                <p className="text-xs text-muted-foreground">{s.purpose}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="px-4 py-2 font-normal">Role</th>
                      <th className="px-3 py-2 font-normal">Value · package</th>
                      <th className="px-3 py-2 font-normal">Example part</th>
                      <th className="px-3 py-2 text-right font-normal" title="Our inventory / channel partners / distributors">Ours · partners · distributors</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {s.parts.map((p, i) => {
                      const sup = p.example ? supply.get(normaliseMpn(p.example)) : undefined;
                      return (
                        <tr key={i}>
                          <td className="px-4 py-2">{p.role}{p.qty && p.qty !== "1" ? <span className="num text-muted-foreground"> ×{p.qty}</span> : null}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{[p.value, p.package].filter(Boolean).join(" · ")}</td>
                          <td className="num px-3 py-2">{sup ? <Link href={`/parts/${sup.partId}`} className="hover:underline">{p.example}</Link> : p.example ? <Link href={`/parts/market?q=${encodeURIComponent(p.example)}`} className="hover:underline" title="Search distributors">{p.example}</Link> : "—"}</td>
                          <td className="num px-3 py-2 text-right text-xs">{sup ? `${k(sup.ours)} · ${k(sup.partners)} · ${k(sup.distributors)}` : <span className="font-sans text-muted-foreground">not in catalogue</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
        <aside className="space-y-4">
          <section className="rounded-lg border bg-card p-4" aria-labelledby="checks">
            <h2 id="checks" className="text-base font-medium">Review checks</h2>
            <ul className="mt-2 space-y-2 text-sm">
              {t.checks.map((c) => (
                <li key={c} className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />{c}</li>
              ))}
            </ul>
          </section>
          <section className="rounded-lg border bg-card p-4 text-sm">
            <div className="text-xs text-muted-foreground">How we recognise it</div>
            <p className="mt-1">{t.signals.layers ? `${t.signals.layers[0]}–${t.signals.layers[1]} layers · ` : ""}{t.signals.partCount ? `${t.signals.partCount[0]}–${t.signals.partCount[1]} parts · ` : ""}{t.signals.sizeMm ? `${t.signals.sizeMm[0]}–${t.signals.sizeMm[1]} mm` : ""}</p>
            {t.signals.connectors?.length ? <p className="mt-1 text-muted-foreground">Connectors: {t.signals.connectors.join(", ")}</p> : null}
          </section>
          <p className="text-xs text-muted-foreground">From circuitflow&apos;s board-type knowledge base (reviewed: {String((t as { reviewed?: boolean }).reviewed ?? false)}).</p>
        </aside>
      </div>
    </>
  );
}
