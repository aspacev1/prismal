import Link from "next/link";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Avatar from "@mui/material/Avatar";
import AvatarGroup from "@mui/material/AvatarGroup";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import AddIcon from "@mui/icons-material/Add";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import AppHeader from "../AppHeader";

export default async function WorkspacePage() {
  const session = await auth();

  const memberships = await prisma.projectMember.findMany({
    where: { userId: session!.user.id },
    include: {
      project: {
        include: {
          _count: { select: { members: true } },
          members: { include: { user: true }, take: 5 },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  const projects = memberships.map((m) => m.project);

  function projectIconGradient(color?: string | null) {
    const c = color || "#0F9D8C";
    return `linear-gradient(135deg, ${c} 0%, ${c}88 100%)`;
  }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <AppHeader />

      <Box sx={{ p: 4, maxWidth: 720, mx: "auto" }}>
        {projects.length === 0 ? (
          <Box sx={{ textAlign: "center", py: 12 }}>
            <Box
              sx={{
                width: 80,
                height: 80,
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
              <FolderOutlinedIcon sx={{ fontSize: 40, color: "#0F9D8C" }} />
            </Box>
            <Typography variant="h5" fontWeight={700} gutterBottom>
              Start your first project
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 4, maxWidth: 320, mx: "auto" }}>
              Projects are where your roadmaps and tasks will live.
            </Typography>
            <Button
              component={Link}
              href="/projects/new"
              variant="contained"
              size="large"
              startIcon={<AddIcon />}
            >
              New project
            </Button>
          </Box>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {projects.map((project) => (
              <Card
                key={project.id}
                component={Link}
                href={`/projects/${project.id}`}
                sx={{
                  textDecoration: "none",
                  display: "block",
                  "&:hover": {
                    boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
                    transform: "translateY(-2px)",
                    borderColor: "rgba(15,157,140,0.25)",
                  },
                }}
              >
                <CardContent sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", p: 3 }}>
                  <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
                    <Box
                      sx={{
                        width: 44,
                        height: 44,
                        borderRadius: 2,
                        background: projectIconGradient(project.color),
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        border: "1px solid rgba(0,0,0,0.08)",
                      }}
                    >
                      <Typography sx={{ color: "#fff", fontWeight: 800, fontSize: 18 }}>
                        {project.name.charAt(0).toUpperCase()}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="subtitle1" fontWeight={700}>
                        {project.name}
                      </Typography>
                    </Box>
                  </Box>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                    <AvatarGroup max={3} sx={{ "& .MuiAvatar-root": { width: 28, height: 28, fontSize: 12 } }}>
                      {project.members.map((m) => (
                        <Avatar key={m.id} sx={{ bgcolor: "#DFF5F2", color: "primary.main", fontWeight: 700 }}>
                          {m.user.firstName?.[0]?.toUpperCase() ?? "?"}
                        </Avatar>
                      ))}
                    </AvatarGroup>
                    <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
                      {project._count.members} member{project._count.members === 1 ? "" : "s"}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}
