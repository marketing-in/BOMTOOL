import {
  Boxes,
  CalendarRange,
  ClipboardList,
  Compass,
  Gauge,
  BookOpen,
  LibraryBig,
  Cpu,
  Factory,
  FileSpreadsheet,
  FolderTree,
  LayoutDashboard,
  Microscope,
  ShieldCheck,
  ShoppingCart,
  UsersRound,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import type { Permission } from "@/lib/rbac";

/** `permission` hides the item from roles that don't have it; `also` lists other paths that belong to it. */
export type NavItem = { href: string; label: string; icon: LucideIcon; phase?: number; permission?: Permission; also?: string[] };
export type NavGroup = { label: string; items: NavItem[] };

/** `phase` marks modules that are still placeholders; shown as a quiet hint in the sidebar. */
export const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/", label: "Home", icon: LayoutDashboard },
      { href: "/tour", label: "App tour", icon: Compass },
    ],
  },
  {
    label: "Sourcing",
    items: [
      { href: "/boms", label: "BoMs", icon: FileSpreadsheet },
      { href: "/parts", label: "Parts catalogue", icon: Cpu },
      { href: "/sourcing", label: "Sourcing & RFQ", icon: ShoppingCart },
    ],
  },
  {
    label: "Factory",
    items: [
      { href: "/operations", label: "Operations", icon: Gauge },
      { href: "/operations/work-orders", label: "Work orders", icon: ClipboardList },
      { href: "/operations/schedule", label: "Schedule", icon: CalendarRange },
      { href: "/operations/lines", label: "Lines", icon: Factory },
      { href: "/inventory", label: "Inventory", icon: Warehouse },
    ],
  },
  {
    label: "Engineering",
    items: [
      { href: "/viewer", label: "PCB / PCBA viewer", icon: Boxes },
      { href: "/reverse", label: "Reverse engineering", icon: Microscope },
      { href: "/directory", label: "Directory", icon: FolderTree },
      { href: "/knowledge/dictionary", label: "Component dictionary", icon: LibraryBig, also: ["/knowledge/circuits"] },
      { href: "/knowledge", label: "Knowledge", icon: BookOpen },
      { href: "/compliance", label: "Compliance", icon: ShieldCheck },
    ],
  },
  {
    label: "Admin",
    items: [{ href: "/admin/users", label: "Users", icon: UsersRound, permission: "admin.users" }],
  },
];
