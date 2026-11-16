"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { NAV } from "./nav";

export function WorkspaceLocation() {
  const pathname = usePathname();
  const item = NAV.flatMap((g) => g.items)
    .filter((i) => pathname === i.href || (i.href !== "/" && pathname.startsWith(i.href + "/")))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
      <Link href="/" className="shrink-0 hover:text-primary">Workspace</Link>
      <ChevronRight className="size-3 shrink-0" aria-hidden />
      <span className="truncate font-medium text-foreground">{item?.label ?? "Overview"}</span>
    </nav>
  );
}
