import { PageHeader } from "./page-header";

export function ComingSoon({ title, phase, summary, items }: { title: string; phase: number; summary: string; items: string[] }) {
  return (
    <>
      <PageHeader title={title} eyebrow={`Arrives in Phase ${phase}`} description={summary} />
      <div className="rounded-lg border bg-card">
        <ul className="divide-y">
          {items.map((item) => (
            <li key={item} className="flex items-start gap-3 px-4 py-3 text-sm">
              <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
