import { z } from "zod";
import type { Role } from "@prisma/client";
import { ROLES } from "@/lib/rbac";

/** Length beats complexity rules (NIST 800-63B); 10 is a sensible floor for a factory tool. */
export const PASSWORD_MIN = 10;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters`)
  .max(128, "Use at most 128 characters");

export const roleSchema = z.enum(ROLES as [Role, ...Role[]], { message: "Choose a role" });

export const newUserSchema = z
  .object({
    name: z.string().trim().min(2, "Enter the person's name").max(80, "Keep the name under 80 characters"),
    email: z.string().trim().toLowerCase().email("Enter a valid email address"),
    role: roleSchema,
    password: passwordSchema,
  })
  .refine((u) => u.password.toLowerCase() !== u.email, { message: "The password can't be the email address", path: ["password"] });

export type UserState = { id: string; role: Role; active: boolean };

/**
 * Why a change to `target` isn't allowed, or null when it is. Admins can't lock themselves out, and the
 * factory always keeps at least one active administrator.
 */
export function guardUserChange(actorId: string, target: UserState, change: { role?: Role; active?: boolean }, users: UserState[]): string | null {
  const role = change.role ?? target.role;
  const active = change.active ?? target.active;
  if (target.id === actorId && !active) return "You can't deactivate your own account.";
  if (target.id === actorId && role !== "ADMIN") return "You can't remove your own administrator role. Ask another administrator.";
  const adminsAfter = users.filter((u) => (u.id === target.id ? role === "ADMIN" && active : u.role === "ADMIN" && u.active)).length;
  if (adminsAfter === 0) return "At least one active administrator is needed.";
  return null;
}

/** The moment sessions are cut off (password change, deactivation), stored to the second to match JWT `iat`. */
export function sessionCutoff(now = new Date()): Date {
  return new Date(Math.floor(now.getTime() / 1000) * 1000);
}

/** A session signed in before the user's cut-off no longer counts. `issuedAt` is the JWT `iat`, in seconds. */
export function sessionStillValid(issuedAt: number | undefined, validFrom: Date | null | undefined): boolean {
  if (!validFrom) return true;
  if (!issuedAt) return false;
  return issuedAt >= Math.floor(validFrom.getTime() / 1000);
}

/** A readable random password for handing to a new user (no 0/O, 1/l/I). */
export function generatePassword(length = 14, random: (n: number) => Uint32Array = (n) => crypto.getRandomValues(new Uint32Array(n))): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(random(length), (x) => alphabet[x % alphabet.length]).join("");
}
