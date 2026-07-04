import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      onboardingComplete: boolean;
      companyId: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    onboardingComplete: boolean;
    companyId: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    onboardingComplete?: boolean;
    companyId?: string | null;
  }
}
