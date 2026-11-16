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
/** `n` numbers the four parts of the app (1 BoM · 2 Engineering · 3 Supply · 4 Factory); the overview and admin have none. */
export type NavGroup = { label: string; n?: number; items: NavItem[] };

/**
 * The app in four parts, in the order a customer's product goes through it: the BoM (files, compare, mismatches,
 * line fit, board, estimate, quote), engineering, supply (our stock first, then the market), and the factory.
 */
export const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/", label: "Home", icon: LayoutDashboard },
      { href: "/tour", label: "App tour", icon: Compass },
    ],
  },
  {
    label: "BoM",
    n: 1,
    items: [
      { href: "/boms", label: "BoMs", icon: FileSpreadsheet, also: ["/boms/new"] },
    ],
  },
  {
    label: "Engineering",
    n: 2,
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
    label: "Supply",
    n: 3,
    items: [
      { href: "/parts", label: "Parts catalogue", icon: Cpu },
      { href: "/sourcing", label: "Sourcing & RFQ", icon: ShoppingCart },
      { href: "/inventory", label: "Inventory", icon: Warehouse },
    ],
  },
  {
    label: "Factory",
    n: 4,
    items: [
      { href: "/operations", label: "Operations", icon: Gauge },
      { href: "/operations/work-orders", label: "Work orders", icon: ClipboardList },
      { href: "/operations/schedule", label: "Schedule", icon: CalendarRange },
      { href: "/operations/lines", label: "Lines & machines", icon: Factory },
    ],
  },
  {
    label: "Admin",
    items: [{ href: "/admin/users", label: "Users", icon: UsersRound, permission: "admin.users" }],
  },
];
