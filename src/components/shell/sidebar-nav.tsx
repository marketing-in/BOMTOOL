"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { LoaderCircle, type LucideIcon } from "lucide-react";
import type { Role } from "@prisma/client";
import { can } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { NAV, type NavItem } from "./nav";

const ITEMS = NAV.flatMap((g) => g.items);

/** Length of the longest of the item's paths that contains this page, or -1. */
function matchLength(pathname: string, item: NavItem) {
  let best = -1;
  for (const p of [item.href, ...(item.also ?? [])]) if (pathname === p || (p !== "/" && pathname.startsWith(`${p}/`))) best = Math.max(best, p.length);
  return best;
}

/** The most specific entry wins: /operations/lines lights up Lines, not Operations as well. */
function isActive(pathname: string, item: NavItem) {
  const mine = matchLength(pathname, item);
  return mine >= 0 && ITEMS.every((o) => o === item || matchLength(pathname, o) <= mine);
}

/** The item's icon, or a spinner from the click until the page arrives (must render inside its Link). */
function NavIcon({ icon: Icon, active }: { icon: LucideIcon; active: boolean }) {
  const { pending } = useLinkStatus();
  if (pending) return <LoaderCircle className="size-4 shrink-0 animate-spin text-sidebar-primary" aria-hidden />;
  return <Icon className={cn("size-4 shrink-0", active ? "text-sidebar-primary" : "opacity-80")} aria-hidden />;
}

export function SidebarNav({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const pathname = usePathname();
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.permission || can(role, i.permission)) })).filter((g) => g.items.length);
  return (
    <nav aria-label="Main navigation" className="flex flex-col gap-5 px-3 py-5">
      {groups.map((group) => (
        <div key={group.label}>
          <div className="px-3 pb-2 text-[11px] font-semibold tracking-wide text-sidebar-foreground/65">
            {group.label}
          </div>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active = isActive(pathname, item);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex min-h-10 items-center gap-3 rounded-lg px-3 text-[13px] transition-colors duration-150",
                      "outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                      // The current page: brand blue on a light tint with a bar at the edge, like the site's underlined menu.
                      active
                        ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/85 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                    )}
                  >
                    <NavIcon icon={item.icon} active={active} />
                    <span className="truncate">{item.label}</span>
                    {active ? <span aria-hidden className="ml-auto size-1.5 shrink-0 rounded-full bg-sidebar-primary" /> : null}
                    {item.phase ? (
                      <span className="ml-auto text-[10px] tabular-nums text-sidebar-foreground/50">P{item.phase}</span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
