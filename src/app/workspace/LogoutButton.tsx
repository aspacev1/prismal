"use client";

import { signOut } from "next-auth/react";
import Button from "@mui/material/Button";

export default function LogoutButton() {
  return (
    <Button variant="outlined" onClick={() => signOut({ callbackUrl: "/login" })}>
      Log out
    </Button>
  );
}
