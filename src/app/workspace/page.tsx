"use client";

import { signOut } from "next-auth/react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";

export default function WorkspacePage() {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "background.default",
        p: 2,
      }}
    >
      <Card sx={{ width: 360, textAlign: "center" }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h5" component="h1" gutterBottom>
            Your workspace
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Personal workspace — coming in a later phase.
          </Typography>
          <Button variant="outlined" size="large" onClick={() => signOut({ callbackUrl: "/login" })}>
            Log out
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}
