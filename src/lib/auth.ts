import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./prisma";

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    GitHub({
      clientId: process.env.GITHUB_ID!,
      clientSecret: process.env.GITHUB_SECRET!,
    }),
    Credentials({
      name: "Demo Login",
      credentials: {
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (credentials?.password === process.env.DEMO_PASSWORD) {
          // Find or create demo user
          let user = await prisma.user.findFirst({
            where: { email: "demo@clawqa.ai" },
          });
          if (!user) {
            user = await prisma.user.create({
              data: {
                email: "demo@clawqa.ai",
                name: "ClawQA Demo",
                role: "admin",
              },
            });
          }
          return { id: user.id, name: user.name, email: user.email };
        }
        return null;
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token, user }) {
      if (session.user) {
        // JWT mode (credentials) uses token, DB mode (github) uses user
        const userId = (token?.id as string) || user?.id;
        if (userId) {
          session.user.id = userId;
          const dbUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { role: true },
          });
          (session.user as any).role = dbUser?.role || "tester";
        }
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
