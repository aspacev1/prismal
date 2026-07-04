import { afterEach } from "vitest";
import { prisma } from "@/lib/prisma";

afterEach(async () => {
  await prisma.user.deleteMany();
  await prisma.company.deleteMany();
});
