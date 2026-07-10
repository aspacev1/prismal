import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { normalizeEmail } from "@/lib/validation";

export type AuthenticatedUser = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  onboardingComplete: boolean;
  companyId: string | null;
};

export async function authenticateUser(email: string, password: string): Promise<AuthenticatedUser | null> {
  const normalized = normalizeEmail(email);
  if (!normalized || !password) return null;

  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user) return null;

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return null;

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    onboardingComplete: user.onboardingComplete,
    companyId: user.companyId,
  };
}
