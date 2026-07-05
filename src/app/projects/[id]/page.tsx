import { notFound } from "next/navigation";
import Box from "@mui/material/Box";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import AppHeader from "../../AppHeader";
import ProjectTabs from "./ProjectTabs";

export default async function ProjectPage({ params }: { params: { id: string } }) {
  const session = await auth();

  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: params.id, userId: session!.user.id } },
  });
  if (!membership) notFound();

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      members: {
        include: { user: true },
        orderBy: { createdAt: "asc" },
      },
      inviteLink: true,
    },
  });
  if (!project) notFound();

  const members = project.members.map((m) => ({
    id: m.id,
    userId: m.userId,
    blocked: m.blocked,
    firstName: m.user.firstName ?? "",
    lastName: m.user.lastName ?? "",
    email: m.user.email,
    department: m.user.department ?? "",
    position: m.user.position ?? "",
    isCurrentUser: m.userId === session!.user.id,
  }));

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <AppHeader projectName={project.name} projectId={project.id} projectColor={project.color ?? undefined} />
      <Box sx={{ p: 4 }}>
        <Box sx={{ maxWidth: 800, mx: "auto" }}>
          <ProjectTabs
            projectId={project.id}
            projectName={project.name}
            projectColor={project.color ?? ""}
            inviteUrl={project.inviteLink ? `/invite/${project.inviteLink.token}` : null}
            members={members}
          />
        </Box>
      </Box>
    </Box>
  );
}
