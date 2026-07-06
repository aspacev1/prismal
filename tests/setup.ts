import { afterEach } from "vitest";
import { prisma } from "@/lib/prisma";

afterEach(async () => {
  await prisma.taskComment.deleteMany();
  await prisma.taskHistory.deleteMany();
  await prisma.taskDependency.deleteMany();
  await prisma.task.deleteMany();
  await prisma.projectInviteLink.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();
  await prisma.company.deleteMany();
});
