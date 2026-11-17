import Link from "next/link";
import { COMPONENT_FAMILIES, COMPONENT_GROUPS } from "@/knowledge/component-families";

/** Every family of electronic component, grouped, each linked to our catalogue and the live distributor search. */
export function ComponentFamilies({ inCatalogue, q }: { inCatalogue: Map<string, number>; q: string }) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const match = (fam: (typeof COMPONENT_FAMILIES)[number]) => words.every((w) => [fam.name, fam.what, ...fam.subTypes, ...fam.packages, ...fam.makers, ...fam.uses].join(" ").toLowerCase().includes(w));
  return (
    <div className="space-y-8">
      {COMPONENT_GROUPS.map((g) => {
        const fams = COMPONENT_FAMILIES.filter((x) => x.group === g && match(x));
        if (!fams.length) return null;
        return (
          <section key={g} aria-labelledby={`fg-${g}`}>
            <h2 id={`fg-${g}`} className="mb-3 text-lg font-semibold tracking-tight">{g} <span className="num text-sm font-normal text-muted-foreground">{fams.length}</span></h2>
            <div className="space-y-2">
              {fams.map((fam) => {
                const ours = fam.category ? (inCatalogue.get(fam.category) ?? 0) : 0;
                return (
                  <details key={fam.slug} id={fam.slug} className="scroll-mt-24 rounded-xl border bg-card">
                    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{fam.name}</span>
                        <span className="block text-sm text-muted-foreground">{fam.what}</span>
                      </span>
                      <span className="text-xs text-muted-foreground">{fam.subTypes.length} kinds · {fam.makers.length} makers</span>
                      <span className="num text-xs">{ours ? `${ours} in our catalogue` : "none in catalogue"}</span>
                    </summary>
                    <div className="grid gap-4 border-t px-4 py-4 text-sm lg:grid-cols-3">
                      <div className="space-y-2">
                        <p><span className="text-muted-foreground">Kinds: </span>{fam.subTypes.join(" · ")}</p>
                        <p><span className="text-muted-foreground">Packages: </span><span className="num">{fam.packages.join(" · ")}</span></p>
                      </div>
                      <div className="space-y-2">
                        <p><span className="text-muted-foreground">Defined by: </span>{fam.keyParams.join(" · ")}</p>
                        <p><span className="text-muted-foreground">Main makers: </span>{fam.makers.join(", ")}</p>
                        <p><span className="text-muted-foreground">Used for: </span>{fam.uses.join(" · ")}</p>
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs"><span className="text-muted-foreground">On our line: </span>{fam.ems}</p>
                        <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                          {fam.category && ours ? <Link href={`/parts?category=${fam.category}`} className="hover:underline">Our catalogue →</Link> : null}
                          <Link href={`/directory/components?view=parts&q=${encodeURIComponent(fam.search.split(" ")[0])}`} className="hover:underline">Reference parts →</Link>
                          <Link href={`/parts/market?q=${encodeURIComponent(fam.search)}`} className="hover:underline">Live market search →</Link>
                        </p>
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
