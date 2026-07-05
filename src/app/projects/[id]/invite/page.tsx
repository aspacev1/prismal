import Link from "next/link";
import { notFound } from "next/navigation";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import AppHeader from "../../../AppHeader";
import InvitePanel from "../InvitePanel";

export default async function ProjectInvitePage({ params }: { params: { id: string } }) {
  const session = await auth();

  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: params.id, userId: session!.user.id } },
  });
  if (!membership) notFound();

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) notFound();

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <AppHeader projectName={project.name} projectId={project.id} />
      <Box sx={{ p: 4 }}>
        <Box sx={{ maxWidth: 720, mx: "auto" }}>
          <Typography variant="h4" fontWeight={800} gutterBottom>
            Invite teammates to {project.name}
          </Typography>

          <InvitePanel projectId={project.id} />

          <Box sx={{ mt: 4 }}>
            <Button
              component={Link}
              href={`/projects/${project.id}/start`}
              variant="contained"
              size="large"
              fullWidth
            >
              Start project
            </Button>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
