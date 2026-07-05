import { afterEach } from "vitest";
import { prisma } from "@/lib/prisma";

afterEach(async () => {
  await prisma.projectInviteLink.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();
  await prisma.company.deleteMany();
});
