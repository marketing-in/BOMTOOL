import {
  Bell,
  Boxes,
  CalendarRange,
  ClipboardList,
  ClipboardCheck,
  Compass,
  Cpu,
  Factory,
  FilePlus2,
  FileSpreadsheet,
  FolderTree,
  Gauge,
  BookOpen,
  LayoutDashboard,
  LibraryBig,
  Microscope,
  ShieldCheck,
  ShoppingCart,
  UsersRound,
  Warehouse,
  Wrench,
  Truck,
  type LucideIcon,
} from "lucide-react";
import type { Permission } from "@/lib/rbac";

/**
 * The app has three parts, and the menu is those three on one line: 1 Engineering · 2 Supply · 3 Factory (the user
 * moved the BoM into Supply on 19 Nov 2026). A part's own pages are tabs inside that part, not menu entries: Supply
 * opens on the BoMs, then the parts catalogue, sourcing and inventory. Home, the tour, alerts and user admin sit
 * under the logo and the account menu.
 */

/** `permission` hides the page from roles that don't have it; `also` lists other paths that belong to it. */
export type NavItem = { href: string; label: string; icon: LucideIcon; permission?: Permission; also?: string[] };
export type Part = { n: 1 | 2 | 3; key: "engineering" | "supply" | "factory"; label: string; icon: LucideIcon; href: string; pages: NavItem[] };

export const PARTS: Part[] = [
  {
    n: 1,
    key: "engineering",
    label: "Engineering",
    icon: Wrench,
    href: "/viewer",
    pages: [
      { href: "/viewer", label: "PCB / PCBA viewer", icon: Boxes },
      { href: "/validation", label: "BOM validation", icon: ClipboardCheck },
      { href: "/reverse", label: "Reverse engineering", icon: Microscope },
      { href: "/directory", label: "Directory", icon: FolderTree },
      { href: "/knowledge/dictionary", label: "Component dictionary", icon: LibraryBig, also: ["/knowledge/circuits"] },
      { href: "/knowledge", label: "Knowledge", icon: BookOpen },
      { href: "/compliance", label: "Compliance", icon: ShieldCheck },
    ],
  },
  {
    n: 2,
    key: "supply",
    label: "Supply",
    icon: Truck,
    href: "/boms",
    pages: [
      { href: "/boms", label: "BoMs", icon: FileSpreadsheet },
      { href: "/boms/new", label: "Upload BoM & Gerbers", icon: FilePlus2 },
      { href: "/parts", label: "Parts catalogue", icon: Cpu },
      { href: "/sourcing", label: "Sourcing & RFQ", icon: ShoppingCart },
      { href: "/inventory", label: "Inventory", icon: Warehouse },
    ],
  },
  {
    n: 3,
    key: "factory",
    label: "Factory",
    icon: Factory,
    href: "/operations",
    pages: [
      { href: "/operations", label: "Operations", icon: Gauge },
      { href: "/operations/work-orders", label: "Work orders", icon: ClipboardList },
      { href: "/operations/schedule", label: "Schedule", icon: CalendarRange },
      { href: "/operations/lines", label: "Lines & machines", icon: Factory },
      { href: "/alerts", label: "Alerts", icon: Bell },
    ],
  },
];

/** Pages outside the three parts, reached from the logo and the account menu. */
export const OTHER: NavItem[] = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/tour", label: "App tour", icon: Compass },
  { href: "/admin/users", label: "Users", icon: UsersRound, permission: "admin.users" },
];

/** Length of the longest of the item's paths that contains this page, or -1. */
function matchLength(pathname: string, item: NavItem) {
  let best = -1;
  for (const p of [item.href, ...(item.also ?? [])]) if (pathname === p || (p !== "/" && pathname.startsWith(`${p}/`))) best = Math.max(best, p.length);
  return best;
}

/** Where a page sits: its part and the most specific page of it (/operations/lines is Lines, not Operations). */
export function locatePage(pathname: string): { part: Part | null; page: NavItem | null } {
  let best: { len: number; part: Part | null; page: NavItem | null } = { len: -1, part: null, page: null };
  for (const part of PARTS)
    for (const page of part.pages) {
      const len = matchLength(pathname, page);
      if (len > best.len) best = { len, part, page };
    }
  for (const page of OTHER) {
    const len = matchLength(pathname, page);
    if (len > best.len) best = { len, part: null, page };
  }
  return { part: best.part, page: best.page };
}
