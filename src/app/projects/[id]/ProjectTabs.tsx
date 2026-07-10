"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import ProjectDetailsTab from "./ProjectDetailsTab";
import RoadmapTab from "./RoadmapTab";

export type MemberData = {
  id: string;
  userId: string;
  blocked: boolean;
  firstName: string;
  lastName: string;
  email: string;
  department: string;
  position: string;
  avatarColor: string | null;
  isCurrentUser: boolean;
};

export default function ProjectTabs({
  projectId,
  projectName,
  projectColor,
  projectStartDate,
  inviteUrl,
  members,
  currentUserRole,
}: {
  projectId: string;
  projectName: string;
  projectColor: string;
  projectStartDate: string | null;
  inviteUrl: string | null;
  members: MemberData[];
  currentUserRole: string;
}) {
  const [tab, setTab] = useState(0);

  return (
    <Box>
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{
          mb: 3,
          "& .MuiTabs-indicator": { height: 3, borderRadius: "3px 3px 0 0" },
          "& .MuiTab-root": { textTransform: "none", fontWeight: 600, fontSize: "0.9rem", px: 3 },
        }}
      >
        <Tab label="Roadmap" />
        <Tab label="Project Details" />
      </Tabs>

      {tab === 0 && <RoadmapTab projectId={projectId} projectName={projectName} projectStartDate={projectStartDate} members={members} />}
      {tab === 1 && (
        <ProjectDetailsTab
          projectId={projectId}
          projectName={projectName}
          projectColor={projectColor}
          inviteUrl={inviteUrl}
          members={members}
          currentUserRole={currentUserRole}
        />
      )}
    </Box>
  );
}
