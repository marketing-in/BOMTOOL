import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { redirect } from "next/navigation";
import { cache } from "react";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { can, type Permission } from "@/lib/rbac";
import { sessionStillValid } from "@/lib/users";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const user = await db.user.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
        });
        if (!user || !user.active) return null;
        const ok = await compare(parsed.data.password, user.passwordHash);
        if (!ok) return null;
        await db.auditLog.create({
          data: { userId: user.id, action: "auth.login", entity: "User", entityId: user.id },
        });
        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id;
      session.user.role = token.role;
      session.issuedAt = typeof token.iat === "number" ? token.iat : undefined;
      return session;
    },
  },
};

export function getSession() {
  return getServerSession(authOptions);
}

/**
 * The signed-in user as the database has them now: role changes apply on the next request, and a
 * deactivated user or a session from before a password change counts as signed out.
 */
export const getCurrentUser = cache(async () => {
  const session = await getSession();
  if (!session?.user?.id) return null;
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, role: true, active: true, sessionsValidFrom: true },
  });
  if (!user?.active || !sessionStillValid(session.issuedAt, user.sessionsValidFrom)) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role };
});

/** Server-side guard: redirects to /login when signed out, throws when the role lacks the permission. */
export async function requireUser(permission?: Permission) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (permission && !can(user.role as Role, permission)) {
    throw new Error(`Forbidden: ${permission}`);
  }
  return user;
}
