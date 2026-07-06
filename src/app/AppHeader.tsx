"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Avatar from "@mui/material/Avatar";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Divider from "@mui/material/Divider";
import AddIcon from "@mui/icons-material/Add";
import BusinessIcon from "@mui/icons-material/Business";
import LockIcon from "@mui/icons-material/Lock";
import LogoutIcon from "@mui/icons-material/Logout";

export default function AppHeader({
  projectName,
  projectId,
  projectColor,
}: {
  projectName?: string;
  projectId?: string;
  projectColor?: string;
}) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  const firstName = session?.user?.firstName ?? "";
  const lastName = session?.user?.lastName ?? "";
  const initial = (firstName?.[0] ?? session?.user?.email?.[0] ?? "?").toUpperCase();
  const displayName = [firstName, lastName].filter(Boolean).join(" ") || session?.user?.email || "User";

  return (
    <Box
      sx={{
        position: "sticky",
        top: 0,
        zIndex: 1100,
        bgcolor: "rgba(255,255,255,0.85)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(0,0,0,0.06)",
        px: 4,
        py: 1.5,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
        <Typography
          variant="h6"
          fontWeight={800}
          sx={{
            mr: 2,
            background: "linear-gradient(135deg, #3D7EFF 0%, #1CC8E0 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          flowline
        </Typography>

        <Button
          component={Link}
          href="/workspace"
          sx={{
            color: isActive("/workspace") ? "primary.main" : "text.secondary",
            fontWeight: isActive("/workspace") ? 700 : 500,
            bgcolor: isActive("/workspace") ? "rgba(45,110,239,0.08)" : "transparent",
            "&:hover": { bgcolor: "rgba(45,110,239,0.06)" },
          }}
        >
          My Projects
        </Button>

        {projectName && projectId && (
          <Button
            component={Link}
            href={`/projects/${projectId}/start`}
            sx={{
              ml: 1,
              color: isActive(`/projects/${projectId}`) ? "primary.main" : "text.secondary",
              fontWeight: isActive(`/projects/${projectId}`) ? 700 : 500,
              bgcolor: isActive(`/projects/${projectId}`) ? "rgba(45,110,239,0.08)" : "transparent",
              "&:hover": { bgcolor: "rgba(45,110,239,0.06)" },
            }}
            startIcon={
              projectColor ? (
                <Box
                  sx={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    bgcolor: projectColor,
                    border: "1px solid rgba(0,0,0,0.12)",
                  }}
                />
              ) : null
            }
          >
            {projectName}
          </Button>
        )}
      </Box>

      <Box sx={{ display: "flex", gap: 1.5, alignItems: "center" }}>
        <Button
          component={Link}
          href="/projects/new"
          variant="contained"
          size="small"
          startIcon={<AddIcon />}
        >
          New project
        </Button>

        <IconButton onClick={(e) => setMenuAnchor(e.currentTarget)} size="small" sx={{ p: 0 }}>
          <Avatar
            sx={{
              width: 36,
              height: 36,
              bgcolor: "primary.main",
              color: "#fff",
              fontWeight: 700,
              fontSize: 15,
            }}
          >
            {initial}
          </Avatar>
        </IconButton>

        <Menu
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={() => setMenuAnchor(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
          PaperProps={{ sx: { mt: 1, minWidth: 200, borderRadius: 3 } }}
        >
          <Box sx={{ px: 2, py: 1 }}>
            <Typography variant="body2" fontWeight={700}>
              {displayName}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              {session?.user?.email}
            </Typography>
          </Box>
          <Divider />
          <MenuItem component={Link} href="/company" onClick={() => setMenuAnchor(null)} dense>
            <BusinessIcon sx={{ mr: 1.5, fontSize: 18, color: "text.secondary" }} />
            Company management
          </MenuItem>
          <MenuItem component={Link} href="/account/password" onClick={() => setMenuAnchor(null)} dense>
            <LockIcon sx={{ mr: 1.5, fontSize: 18, color: "text.secondary" }} />
            Change password
          </MenuItem>
          <Divider />
          <MenuItem
            onClick={() => {
              setMenuAnchor(null);
              signOut({ callbackUrl: "/login" });
            }}
            dense
          >
            <LogoutIcon sx={{ mr: 1.5, fontSize: 18, color: "text.secondary" }} />
            Log out
          </MenuItem>
        </Menu>
      </Box>
    </Box>
  );
}
