"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Box, Cpu, Layers, LayoutGrid, ListTree, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The product, in the order it is built: bare board → board type → components → box.
 */
const TABS: { href: string; label: string; step?: number; icon: LucideIcon; exact?: boolean }[] = [
  { href: "/directory", label: "Overview", icon: LayoutGrid, exact: true },
  { href: "/directory/pcb", label: "PCB technologies", step: 1, icon: Layers },
  { href: "/directory/board-types", label: "Board types", step: 2, icon: ListTree },
  { href: "/directory/components", label: "Components", step: 3, icon: Cpu },
  { href: "/directory/boxes", label: "Box types", step: 4, icon: Box },
];

export function DirectoryTabs() {
  const pathname = usePathname();
  const isActive = (t: (typeof TABS)[number]) => (t.exact ? pathname === t.href : pathname.startsWith(t.href));
  return (
    <nav aria-label="Directory" className="-mt-2 mb-8 flex max-w-full gap-1 overflow-x-auto rounded-lg border bg-card p-1 sm:inline-flex">
      {TABS.map((t) => {
        const active = isActive(t);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-10 shrink-0 items-center gap-2 rounded-md px-3.5 text-sm outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring",
              active ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {t.step ? <span className="num text-xs opacity-70">{t.step}</span> : <t.icon className="size-4" aria-hidden />}
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
