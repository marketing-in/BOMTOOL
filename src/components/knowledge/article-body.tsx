import { AlertTriangle, CheckCircle2, Lightbulb } from "lucide-react";
import type { Section } from "@/knowledge/types";
import { cn } from "@/lib/utils";

const TONE = {
  risk: { icon: AlertTriangle, cls: "text-risk-red", bg: "border-risk-red/25" },
  tip: { icon: Lightbulb, cls: "text-risk-green", bg: "border-risk-green/25" },
  neutral: { icon: CheckCircle2, cls: "text-muted-foreground", bg: "" },
} as const;

/** Renders structured article sections. Prose capped at ~70ch; tables scroll inside their own box. */
export function ArticleBody({ sections }: { sections: Section[] }) {
  return (
    <div className="space-y-8">
      {sections.map((s, i) => {
        const id = s.heading.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        return (
          <section key={i} aria-labelledby={id}>
            <h2 id={id} className="mb-3 text-base font-semibold tracking-tight">
              {s.heading}
            </h2>
            {s.type === "text" ? (
              <div className="max-w-[70ch] space-y-3 text-[15px] leading-relaxed">
                {s.paragraphs.map((p, k) => (
                  <p key={k}>{p}</p>
                ))}
              </div>
            ) : s.type === "facts" ? (
              <dl className="divide-y rounded-lg border bg-card">
                {s.items.map((f, k) => (
                  <div key={k} className="grid gap-1 px-4 py-3 sm:grid-cols-[14rem_1fr] sm:gap-4">
                    <dt className="text-sm font-medium">{f.label}</dt>
                    <dd className="max-w-[70ch] text-sm leading-relaxed text-muted-foreground">{f.value}</dd>
                  </div>
                ))}
              </dl>
            ) : s.type === "list" ? (
              <ul className={cn("max-w-[75ch] space-y-2", s.tone && s.tone !== "neutral" && "rounded-lg border p-4", s.tone && TONE[s.tone].bg)}>
                {s.items.map((it, k) => {
                  const Icon = TONE[s.tone ?? "neutral"].icon;
                  return (
                    <li key={k} className="flex gap-2.5 text-sm leading-relaxed">
                      <Icon className={cn("mt-0.5 size-4 shrink-0", TONE[s.tone ?? "neutral"].cls)} aria-hidden />
                      <span>{it}</span>
                    </li>
                  );
                })}
              </ul>
            ) : s.type === "table" ? (
              <div className="rounded-lg border bg-card">
                <div className="relative overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-muted-foreground">
                      <tr className="border-b">
                        {s.columns.map((c) => (
                          <th key={c} className="px-4 py-2 font-normal whitespace-nowrap">{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {s.rows.map((r, k) => (
                        <tr key={k} className="align-top">
                          {r.map((c, j) => (
                            <td key={j} className={cn("px-4 py-2", j === 0 && "font-medium whitespace-nowrap")}>{c}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {s.note ? <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">{s.note}</p> : null}
              </div>
            ) : (
              <ol className="relative max-w-[75ch] space-y-4 border-l pl-6">
                {s.steps.map((st, k) => (
                  <li key={k} className="relative">
                    <span className="num absolute top-0 -left-[34px] grid size-5 place-items-center rounded-full border bg-card text-[10px]">{k + 1}</span>
                    <div className="text-sm font-medium">{st.title}</div>
                    <p className="text-sm leading-relaxed text-muted-foreground">{st.detail}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        );
      })}
    </div>
  );
}
