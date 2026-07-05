import Link from "next/link";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import LogoutButton from "./LogoutButton";

export default async function WorkspacePage() {
  const session = await auth();

  const memberships = await prisma.projectMember.findMany({
    where: { userId: session!.user.id },
    include: { project: { include: { _count: { select: { members: true } } } } },
    orderBy: { createdAt: "desc" },
  });
  const projects = memberships.map((m) => m.project);

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <Box
        sx={{
          bgcolor: "background.paper",
          px: 3,
          py: 2,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid rgba(0,0,0,0.08)",
        }}
      >
        <Typography variant="h6" component="span" fontWeight={700}>
          flowline
        </Typography>
        <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
          <Button component={Link} href="/projects/new" variant="contained">
            + New project
          </Button>
          <LogoutButton />
        </Box>
      </Box>

      <Box sx={{ p: 3, maxWidth: 640, mx: "auto" }}>
        {projects.length === 0 ? (
          <Box sx={{ textAlign: "center", py: 8 }}>
            <Typography variant="h6" fontWeight={700} gutterBottom>
              Start your first project
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Projects are where your roadmaps and tasks will live.
            </Typography>
            <Button component={Link} href="/projects/new" variant="contained" size="large">
              + New project
            </Button>
          </Box>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {projects.map((project) => (
              <Card
                key={project.id}
                component={Link}
                href={`/projects/${project.id}`}
                sx={{ textDecoration: "none", display: "block" }}
              >
                <CardContent sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Box>
                    <Typography variant="subtitle1" fontWeight={700}>
                      {project.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {project.description || "No description"}
                    </Typography>
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    {project._count.members} member{project._count.members === 1 ? "" : "s"}
                  </Typography>
                </CardContent>
              </Card>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}
