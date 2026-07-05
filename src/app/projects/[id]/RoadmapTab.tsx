"use client";

import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";

export default function RoadmapTab({ projectId, projectName }: { projectId: string; projectName: string }) {
  return (
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
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 320, mx: "auto" }}>
          Task creation and timeline visualization for {projectName} will be available here.
        </Typography>
      </CardContent>
    </Card>
  );
}
