import { describe, expect, it } from "vitest";
import { generatePassword, guardUserChange, newUserSchema, sessionCutoff, sessionStillValid, type UserState } from "@/lib/users";
import { can, permissionsFor, PERMISSION_LABELS } from "@/lib/rbac";

describe("new user validation", () => {
  const ok = { name: "Priya Raman", email: "  Priya.Raman@EMS.local ", role: "PURCHASING", password: "reel-2026-feeder" };

  it("accepts a valid user and normalises the email", () => {
    const r = newUserSchema.safeParse(ok);
    expect(r.success).toBe(true);
    expect(r.data?.email).toBe("priya.raman@ems.local");
  });

  it("rejects short passwords, bad emails, unknown roles and the email as password", () => {
    const msg = (v: object) => newUserSchema.safeParse({ ...ok, ...v }).error?.issues[0]?.message;
    expect(msg({ password: "short1" })).toMatch(/at least 10/);
    expect(msg({ email: "not-an-email" })).toMatch(/valid email/);
    expect(msg({ role: "SUPERUSER" })).toMatch(/role/i);
    expect(msg({ name: "P" })).toMatch(/name/);
    expect(msg({ email: "a.longer@ems.local", password: "A.Longer@ems.local" })).toMatch(/email address/);
  });
});

describe("user change guard", () => {
  const admin: UserState = { id: "a", role: "ADMIN", active: true };
  const admin2: UserState = { id: "b", role: "ADMIN", active: true };
  const buyer: UserState = { id: "c", role: "PURCHASING", active: true };

  it("stops admins locking themselves out", () => {
    expect(guardUserChange("a", admin, { active: false }, [admin, admin2, buyer])).toMatch(/your own account/);
    expect(guardUserChange("a", admin, { role: "VIEWER" }, [admin, admin2, buyer])).toMatch(/your own administrator role/);
  });

  it("keeps at least one active administrator", () => {
    // Actor "x" is not in the list, so the self-guards don't fire first.
    expect(guardUserChange("x", admin, { active: false }, [admin, buyer])).toMatch(/one active administrator/);
    expect(guardUserChange("x", admin, { role: "QUALITY" }, [admin, { ...admin2, active: false }])).toMatch(/one active administrator/);
  });

  it("allows ordinary changes", () => {
    expect(guardUserChange("a", buyer, { role: "STORES" }, [admin, buyer])).toBeNull();
    expect(guardUserChange("a", buyer, { active: false }, [admin, buyer])).toBeNull();
    expect(guardUserChange("a", admin2, { active: false }, [admin, admin2])).toBeNull();
    expect(guardUserChange("a", buyer, { role: "ADMIN" }, [admin, buyer])).toBeNull();
  });
});

describe("session cut-off", () => {
  it("ends sessions signed in before a password change or deactivation", () => {
    const cut = sessionCutoff(new Date("2026-10-24T10:00:00.750Z"));
    expect(cut.toISOString()).toBe("2026-10-24T10:00:00.000Z");
    const at = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);
    expect(sessionStillValid(at("2026-10-24T09:59:59Z"), cut)).toBe(false);
    expect(sessionStillValid(at("2026-10-24T10:00:00Z"), cut)).toBe(true);
    expect(sessionStillValid(at("2026-10-24T10:05:00Z"), cut)).toBe(true);
  });

  it("leaves sessions alone when there is no cut-off, and rejects sessions without a sign-in time", () => {
    expect(sessionStillValid(123, null)).toBe(true);
    expect(sessionStillValid(undefined, new Date())).toBe(false);
  });
});

describe("roles and passwords", () => {
  it("only administrators manage users, and every permission has a label", () => {
    expect(can("ADMIN", "admin.users")).toBe(true);
    expect(can("PURCHASING", "admin.users")).toBe(false);
    for (const p of permissionsFor("ADMIN")) expect(PERMISSION_LABELS[p]).toBeTruthy();
  });

  it("generates passwords from an unambiguous alphabet", () => {
    const p = generatePassword(14, (n) => Uint32Array.from({ length: n }, (_, i) => i * 7));
    expect(p).toHaveLength(14);
    expect(p).not.toMatch(/[0O1lI]/);
    expect(newUserSchema.safeParse({ name: "Test User", email: "t@ems.local", role: "VIEWER", password: generatePassword() }).success).toBe(true);
  });
});
