import { notFound } from "next/navigation";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Avatar from "@mui/material/Avatar";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import InvitePanel from "./InvitePanel";

export default async function ProjectPage({ params }: { params: { id: string } }) {
  const session = await auth();

  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: params.id, userId: session!.user.id } },
  });
  if (!membership) notFound();

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: { members: { include: { user: true } } },
  });
  if (!project) notFound();

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default", p: 3 }}>
      <Box sx={{ maxWidth: 640, mx: "auto" }}>
        <Typography variant="h5" fontWeight={700} gutterBottom>
          {project.name}
        </Typography>
        {project.description && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {project.description}
          </Typography>
        )}

        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="overline" color="primary.main">
              Members
            </Typography>
            {project.members.map((member) => (
              <Box key={member.id} sx={{ display: "flex", alignItems: "center", gap: 1.5, mt: 1 }}>
                <Avatar sx={{ width: 30, height: 30, bgcolor: "#DFF5F2", color: "primary.main", fontSize: 13, fontWeight: 700 }}>
                  {member.user.firstName?.[0]?.toUpperCase() ?? "?"}
                </Avatar>
                <Typography variant="body2">
                  {member.user.firstName} {member.user.lastName}
                  {member.userId === session!.user.id ? " (you)" : ""}
                </Typography>
              </Box>
            ))}
          </CardContent>
        </Card>

        <InvitePanel projectId={project.id} />
      </Box>
    </Box>
  );
}
