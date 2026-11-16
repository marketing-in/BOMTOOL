"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Box, Cpu, Layers, LayoutGrid, ListTree, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The product, in the order it is built: bare board → board type → components → box.
 * Each step has its own colour and icon, so the four sections do not read as one page.
 */
const TABS: { href: string; label: string; step?: number; icon: LucideIcon; tone: string; line: string; exact?: boolean }[] = [
  { href: "/directory", label: "Overview", icon: LayoutGrid, tone: "var(--foreground)", line: "Everything a product is made of, in build order.", exact: true },
  { href: "/directory/pcb", label: "PCB technologies", step: 1, icon: Layers, tone: "var(--risk-green)", line: "The bare board: technologies, laminates, finishes and the fabs that build them." },
  { href: "/directory/board-types", label: "Board types", step: 2, icon: ListTree, tone: "var(--dir-blue)", line: "What kind of PCBA it is: its sections, typical parts and review checks." },
  { href: "/directory/components", label: "Components", step: 3, icon: Cpu, tone: "var(--primary)", line: "Every component family, the reference list and a live distributor search." },
  { href: "/directory/boxes", label: "Box types", step: 4, icon: Box, tone: "var(--dir-slate)", line: "The housing: box types, materials, finishes and the makers." },
];

export function DirectoryTabs() {
  const pathname = usePathname();
  const isActive = (t: (typeof TABS)[number]) => (t.exact ? pathname === t.href : pathname.startsWith(t.href));
  const current = TABS.find(isActive) ?? TABS[0];
  return (
    <div className="-mt-2 mb-6">
      <nav aria-label="Directory" className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => {
          const active = isActive(t);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              style={{ "--tone": t.tone } as React.CSSProperties}
              className={cn(
                "inline-flex h-11 shrink-0 items-center gap-2.5 rounded-full border px-4 text-sm transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active ? "border-[var(--tone)] bg-[color-mix(in_oklab,var(--tone)_12%,transparent)] font-medium text-foreground" : "bg-card text-muted-foreground hover:border-foreground/20 hover:text-foreground",
              )}
            >
              <span className={cn("grid size-6 place-items-center rounded-full text-[11px] font-semibold", active ? "bg-[var(--tone)] text-background" : "bg-muted text-muted-foreground")}>
                {t.step ?? <t.icon className="size-3.5" aria-hidden />}
              </span>
              {t.label}
            </Link>
          );
        })}
      </nav>
      {/* The section's own banner: colour, icon and where it sits in the build. */}
      <div
        style={{ "--tone": current.tone } as React.CSSProperties}
        className="mt-4 flex items-center gap-4 rounded-xl border border-[color-mix(in_oklab,var(--tone)_35%,transparent)] bg-[color-mix(in_oklab,var(--tone)_8%,var(--card))] px-5 py-4"
      >
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-[var(--tone)] text-background">
          <current.icon className="size-6" aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold tracking-[0.2em] text-[var(--tone)] uppercase">{current.step ? `Step ${current.step} of 4` : "Directory"}</div>
          <p className="mt-0.5 text-sm text-foreground/80">{current.line}</p>
        </div>
        {current.step ? (
          <div aria-hidden className="ml-auto hidden items-center gap-1.5 sm:flex">
            {[1, 2, 3, 4].map((n) => (
              <span key={n} className={cn("h-1.5 w-8 rounded-full", n <= current.step! ? "bg-[var(--tone)]" : "bg-border")} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
