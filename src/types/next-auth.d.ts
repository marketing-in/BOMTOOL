import type { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    id: string;
    role: Role;
  }
  interface Session {
    user: { id: string; role: Role } & DefaultSession["user"];
    /** JWT `iat` (seconds): when this session signed in, checked against User.sessionsValidFrom. */
    issuedAt?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
  }
}
