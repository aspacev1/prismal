import Link from "next/link";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import CheckIcon from "@mui/icons-material/Check";

export default function RegisterSuccessPage({
  searchParams,
}: {
  searchParams: { inviteToken?: string };
}) {
  const onboardingHref = searchParams.inviteToken
    ? `/onboarding?inviteToken=${searchParams.inviteToken}`
    : "/onboarding";

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
          <Box
            sx={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              bgcolor: "#DFF5F2",
              color: "primary.main",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              mx: "auto",
              mb: 2,
            }}
          >
            <CheckIcon />
          </Box>
          <Typography variant="h6" component="h1" gutterBottom>
            Account created
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Next, set up your profile and company.
          </Typography>
          <Button component={Link} href={onboardingHref} variant="contained" size="large">
            Continue
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}
