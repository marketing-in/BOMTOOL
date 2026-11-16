import type { Role } from "@prisma/client";

export const ROLES: Role[] = [
  "ADMIN",
  "PURCHASING",
  "ENGINEERING",
  "PLANNING",
  "STORES",
  "QUALITY",
  "VIEWER",
];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrator",
  PURCHASING: "Purchasing / Sourcing",
  ENGINEERING: "NPI / Engineering",
  PLANNING: "Production Planning",
  STORES: "Stores",
  QUALITY: "Quality",
  VIEWER: "Viewer",
};

export type Permission =
  | "bom.write"
  | "sourcing.buy"
  | "rfq.send"
  | "inventory.write"
  | "lines.write"
  | "workorder.write"
  | "compliance.write"
  | "knowledge.write"
  | "admin.users";

const MATRIX: Record<Role, Permission[]> = {
  ADMIN: [
    "bom.write",
    "sourcing.buy",
    "rfq.send",
    "inventory.write",
    "lines.write",
    "workorder.write",
    "compliance.write",
    "knowledge.write",
    "admin.users",
  ],
  PURCHASING: ["bom.write", "sourcing.buy", "rfq.send"],
  ENGINEERING: ["bom.write", "knowledge.write", "compliance.write"],
  PLANNING: ["workorder.write", "lines.write"],
  STORES: ["inventory.write"],
  QUALITY: ["compliance.write", "knowledge.write"],
  VIEWER: [],
};

export const PERMISSION_LABELS: Record<Permission, string> = {
  "bom.write": "Upload and edit BoMs",
  "sourcing.buy": "Carts, quotes and PO drafts",
  "rfq.send": "Create and send RFQs",
  "inventory.write": "Receive, adjust and issue stock",
  "lines.write": "Edit assembly lines",
  "workorder.write": "Create and schedule work orders",
  "compliance.write": "Edit compliance data and duty rates",
  "knowledge.write": "Edit knowledge articles",
  "admin.users": "Manage users",
};

export function permissionsFor(role: Role): Permission[] {
  return MATRIX[role];
}

export function can(role: Role | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  return MATRIX[role].includes(permission);
}
