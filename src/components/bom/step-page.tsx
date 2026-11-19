import { Suspense } from "react";
import { WORKFLOW, type SectionKey, type StepKey } from "@/lib/bom/workflow";

/**
 * One step of a BoM's process as one page: its number and name, a row of links to its sections, then each section in
 * order under a rule. Each section streams in on its own, so a slow one (the components) does not hold up the rest.
 */
export function StepPage({ step: key, sections, note }: { step: StepKey; sections: Partial<Record<SectionKey, React.ReactNode>>; /** A quiet line under the heading. */ note?: React.ReactNode }) {
  const step = WORKFLOW.find((s) => s.key === key)!;
  const shown = step.sections.filter((s) => sections[s.key] !== undefined);
  return (
    <div>
      <header className="mb-10">
        <h1 className="page-heading text-[2rem] leading-tight font-semibold tracking-tight">
          <span className="num text-muted-foreground">{step.n}.</span> {step.label}
          {step.optional ? <span className="ml-3 align-middle text-sm font-normal text-muted-foreground">optional</span> : null}
        </h1>
        {note}
        {shown.length > 1 ? (
          <nav aria-label="On this page" className="mt-4">
            <ol className="flex flex-wrap gap-2">
              {shown.map((s, i) => (
                <li key={s.key}>
                  <a
                    href={`#${s.anchor}`}
                    className="inline-flex h-10 items-center gap-2 rounded-md border bg-card px-3 text-sm outline-none transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="num text-xs text-muted-foreground">
                      {step.n}.{i + 1}
                    </span>
                    {s.label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
      </header>
      {shown.map((s, i) => (
        <section key={s.key} id={s.anchor} aria-label={s.label} className={i ? "mt-16 scroll-mt-32 border-t pt-12" : "scroll-mt-32"}>
          <Suspense fallback={<SectionLoading label={s.label} />}>{sections[s.key]}</Suspense>
        </section>
      ))}
    </div>
  );
}

function SectionLoading({ label }: { label: string }) {
  return (
    <div role="status" className="grid min-h-48 place-items-center rounded-xl border border-dashed text-sm text-muted-foreground">
      Loading {label.toLowerCase()}…
    </div>
  );
}
