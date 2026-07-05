import Link from "next/link";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import AcceptInviteButton from "./AcceptInviteButton";

export default async function InvitePage({ params }: { params: { token: string } }) {
  const link = await prisma.projectInviteLink.findUnique({
    where: { token: params.token },
    include: { project: { include: { createdBy: true } } },
  });

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
          {!link ? (
            <>
              <Typography variant="h6" gutterBottom>
                This invite link isn&apos;t valid.
              </Typography>
              <Button component={Link} href="/login" variant="contained" size="large">
                Go to login
              </Button>
            </>
          ) : (
            <InviteAccept
              token={params.token}
              projectId={link.projectId}
              projectName={link.project.name}
              inviterName={`${link.project.createdBy.firstName} ${link.project.createdBy.lastName}`}
            />
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

async function InviteAccept({
  token,
  projectId,
  projectName,
  inviterName,
}: {
  token: string;
  projectId: string;
  projectName: string;
  inviterName: string;
}) {
  const session = await auth();

  return (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
        {inviterName} invited you to
      </Typography>
      <Typography variant="h6" fontWeight={700} sx={{ mb: 3 }}>
        {projectName}
      </Typography>
      {!session ? (
        <Button component={Link} href={`/register?inviteToken=${token}`} variant="contained" size="large">
          Accept &amp; continue
        </Button>
      ) : !session.user.onboardingComplete ? (
        <Button component={Link} href={`/onboarding?inviteToken=${token}`} variant="contained" size="large">
          Accept &amp; continue
        </Button>
      ) : (
        <AcceptInviteButton token={token} projectId={projectId} />
      )}
    </>
  );
}
