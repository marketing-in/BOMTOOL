"use client";

import { useEffect } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import type { Role } from "@prisma/client";
import { can } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { PARTS, locatePage, type NavItem } from "./nav";

function Pending() {
  const { pending } = useLinkStatus();
  return pending ? <LoaderCircle className="size-3.5 shrink-0 animate-spin text-primary" aria-hidden /> : null;
}

const PART_BG: Record<string, string> = { bom: "bg-part-bom", engineering: "bg-part-engineering", supply: "bg-part-supply", factory: "bg-part-factory" };

/** The menu: the four parts of the app on one line, each in its own colour; the page takes the current part's colour. */
export function PartMenu() {
  const pathname = usePathname();
  const { part } = locatePage(pathname);
  const key = part?.key ?? "";
  useEffect(() => {
    if (key) document.documentElement.dataset.part = key;
    else delete document.documentElement.dataset.part;
  }, [key]);
  return (
    <nav aria-label="Main menu" className="min-w-0">
      <ul className="flex items-stretch gap-1 overflow-x-auto [scrollbar-width:none]">
        {PARTS.map((p) => {
          const on = part?.key === p.key;
          return (
            <li key={p.key} className="shrink-0">
              <Link
                href={p.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "relative flex h-14 items-center gap-2 px-3 text-sm whitespace-nowrap outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                  on ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className={cn("size-2 rounded-[2px]", PART_BG[p.key], !on && "opacity-70")} aria-hidden />
                {on ? <span className={cn("absolute inset-x-3 bottom-0 h-0.5", PART_BG[p.key])} aria-hidden /> : null}
                {p.label}
                <Pending />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** The pages of the current part as quiet tabs under the menu; nothing on pages outside the four parts. */
export function PartTabs({ role }: { role: Role }) {
  const pathname = usePathname();
  const { part, page } = locatePage(pathname);
  if (!part) return null;
  const pages = part.pages.filter((i: NavItem) => !i.permission || can(role, i.permission));
  if (pages.length < 2) return null;
  return (
    <nav aria-label={`${part.label} pages`} className="border-b bg-card print:hidden">
      <ul className="mx-auto flex w-full max-w-[1600px] gap-1 overflow-x-auto px-4 [scrollbar-width:none] sm:px-6 lg:px-8">
        {pages.map((i) => {
          const on = page?.href === i.href;
          return (
            <li key={i.href} className="shrink-0">
              <Link
                href={i.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "my-1.5 flex h-8 items-center gap-2 rounded-md px-3 text-[13px] whitespace-nowrap outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring",
                  on ? "bg-part-soft font-semibold text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <i.icon className="size-4 shrink-0" aria-hidden />
                {i.label}
                <Pending />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
