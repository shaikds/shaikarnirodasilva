import NextAuth, { type DefaultSession, type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import type { Role } from "@prisma/client";
import { checkRateLimit } from "@/lib/security/rateLimit";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & { id: string; role: Role };
  }
}

const credentialsSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(200),
});

const providers: NextAuthConfig["providers"] = [
  Credentials({
    credentials: { email: {}, password: {} },
    async authorize(credentials) {
      const parsed = credentialsSchema.safeParse(credentials);
      if (!parsed.success) return null;
      const email = parsed.data.email.toLowerCase();

      // Rate-limit login attempts per email to slow credential stuffing.
      if (!checkRateLimit(`login:${email}`, 10, 60_000)) return null;

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user?.passwordHash) return null;
      const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
      if (!valid) return null;
      return { id: user.id, email: user.email, name: user.name };
    },
  }),
];

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(Google);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    async signIn({ user, account }) {
      // First Google sign-in: create the local user as a MEMBER.
      if (account?.provider === "google" && user.email) {
        await prisma.user.upsert({
          where: { email: user.email.toLowerCase() },
          update: {},
          create: { email: user.email.toLowerCase(), name: user.name ?? "Member", role: "MEMBER" },
        });
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user?.email) {
        const dbUser = await prisma.user.findUnique({ where: { email: user.email.toLowerCase() } });
        if (dbUser) {
          token.sub = dbUser.id;
          token.role = dbUser.role;
        }
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.role = (token.role as Role) ?? "MEMBER";
      }
      return session;
    },
  },
});
