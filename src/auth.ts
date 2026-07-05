import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authenticateUser } from "@/lib/authenticateUser";

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Not deployed on Vercel — Auth.js only auto-trusts the host there.
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        return authenticateUser(String(credentials?.email ?? ""), String(credentials?.password ?? ""));
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.onboardingComplete = (user as { onboardingComplete: boolean }).onboardingComplete;
        token.companyId = (user as { companyId: string | null }).companyId ?? null;
        token.firstName = (user as { firstName?: string }).firstName ?? null;
        token.lastName = (user as { lastName?: string }).lastName ?? null;
      }
      if (trigger === "update" && session) {
        if (typeof session.onboardingComplete === "boolean") {
          token.onboardingComplete = session.onboardingComplete;
        }
        if ("companyId" in session) {
          token.companyId = session.companyId;
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.sub as string;
      session.user.onboardingComplete = Boolean(token.onboardingComplete);
      session.user.companyId = (token.companyId as string | null) ?? null;
      session.user.firstName = (token.firstName as string | null) ?? null;
      session.user.lastName = (token.lastName as string | null) ?? null;
      return session;
    },
  },
});
