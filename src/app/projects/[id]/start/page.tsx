import Link from "next/link";
import { notFound } from "next/navigation";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import AppHeader from "../../../AppHeader";

export default async function ProjectStartPage({ params }: { params: { id: string } }) {
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
            {project.name} — Tasks
          </Typography>

          <Card
            sx={{
              textAlign: "center",
              py: 8,
              boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
              border: "1px solid rgba(0,0,0,0.06)",
            }}
          >
            <CardContent>
              <Box
                sx={{
                  width: 72,
                  height: 72,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #0F9D8C 0%, #6C5CE7 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  mx: "auto",
                  mb: 3,
                  opacity: 0.15,
                }}
              >
                <CalendarTodayIcon sx={{ fontSize: 32, color: "#0F9D8C" }} />
              </Box>
              <Typography variant="h6" fontWeight={700} gutterBottom>
                Gantt chart coming soon
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 4, maxWidth: 320, mx: "auto" }}>
                Task creation and timeline visualization will be available here.
              </Typography>
              <Button component={Link} href={`/projects/${project.id}`} variant="outlined">
                Back to project
              </Button>
            </CardContent>
          </Card>
        </Box>
      </Box>
    </Box>
  );
}
