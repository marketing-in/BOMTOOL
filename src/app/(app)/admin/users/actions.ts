"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hash } from "bcryptjs";
import { Prisma, type Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/rbac";
import { guardUserChange, newUserSchema, passwordSchema, roleSchema, sessionCutoff } from "@/lib/users";

export type UserActionState = { error?: string; message?: string } | undefined;

const PATH = "/admin/users";

async function loadUsers(targetId: string) {
  const users = await db.user.findMany({ select: { id: true, email: true, name: true, role: true, active: true } });
  return { users, target: users.find((u) => u.id === targetId) };
}

export async function createUser(_prev: UserActionState, form: FormData): Promise<UserActionState> {
  const admin = await requireUser("admin.users");
  const p = newUserSchema.safeParse({ name: form.get("name"), email: form.get("email"), role: form.get("role"), password: form.get("password") });
  if (!p.success) return { error: p.error.issues[0]?.message };
  try {
    const user = await db.user.create({ data: { name: p.data.name, email: p.data.email, role: p.data.role, passwordHash: await hash(p.data.password, 10) } });
    await db.auditLog.create({ data: { userId: admin.id, action: "user.create", entity: "User", entityId: user.id, data: { email: user.email, role: user.role } } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: `${p.data.email} already has an account.` };
    throw e;
  }
  revalidatePath(PATH);
  return { message: `Added ${p.data.name} as ${ROLE_LABELS[p.data.role]}. Give them their email and starting password.` };
}

export async function changeRole(userId: string, role: Role): Promise<UserActionState> {
  const admin = await requireUser("admin.users");
  const r = roleSchema.safeParse(role);
  if (!r.success) return { error: r.error.issues[0]?.message };
  const { users, target } = await loadUsers(userId);
  if (!target) return { error: "That user no longer exists." };
  if (target.role === r.data) return {};
  const blocked = guardUserChange(admin.id, target, { role: r.data }, users);
  if (blocked) return { error: blocked };
  await db.user.update({ where: { id: userId }, data: { role: r.data } });
  await db.auditLog.create({ data: { userId: admin.id, action: "user.role", entity: "User", entityId: userId, data: { email: target.email, from: target.role, to: r.data } } });
  revalidatePath(PATH);
  return { message: `${target.name} is now ${ROLE_LABELS[r.data]}.` };
}

/** Deactivating also ends the person's sessions, so reactivating later doesn't revive them. */
export async function setActive(userId: string, active: boolean): Promise<UserActionState> {
  const admin = await requireUser("admin.users");
  const { users, target } = await loadUsers(userId);
  if (!target) return { error: "That user no longer exists." };
  if (target.active === active) return {};
  const blocked = guardUserChange(admin.id, target, { active }, users);
  if (blocked) return { error: blocked };
  await db.user.update({ where: { id: userId }, data: active ? { active } : { active, sessionsValidFrom: sessionCutoff() } });
  await db.auditLog.create({ data: { userId: admin.id, action: active ? "user.activate" : "user.deactivate", entity: "User", entityId: userId, data: { email: target.email } } });
  revalidatePath(PATH);
  return { message: active ? `${target.name} can sign in again.` : `${target.name} is deactivated and signed out.` };
}

/** Sets a new password and signs the person out everywhere (including you, if it's your own). */
export async function setPassword(userId: string, password: string): Promise<UserActionState> {
  const admin = await requireUser("admin.users");
  const p = passwordSchema.safeParse(password);
  if (!p.success) return { error: p.error.issues[0]?.message };
  const { target } = await loadUsers(userId);
  if (!target) return { error: "That user no longer exists." };
  if (p.data.toLowerCase() === target.email) return { error: "The password can't be the email address" };
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hash(p.data, 10), sessionsValidFrom: sessionCutoff() } });
  await db.auditLog.create({ data: { userId: admin.id, action: "user.password", entity: "User", entityId: userId, data: { email: target.email } } });
  if (userId === admin.id) redirect("/login");
  revalidatePath(PATH);
  return { message: `New password set for ${target.name}. They've been signed out and need it to sign in.` };
}
