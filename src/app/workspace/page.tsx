"use client";

import { signOut } from "next-auth/react";

export default function WorkspacePage() {
  return (
    <main>
      <h1>Your workspace</h1>
      <p>Personal workspace — coming in a later phase.</p>
      <button onClick={() => signOut({ callbackUrl: "/login" })}>Log out</button>
    </main>
  );
}
