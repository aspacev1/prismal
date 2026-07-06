import Link from "next/link";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";

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
        background: "linear-gradient(135deg, #F0F9F7 0%, #F8F9FB 50%, #F0F4FF 100%)",
        p: 2,
      }}
    >
      <Card
        sx={{
          width: 380,
          textAlign: "center",
          boxShadow: "0 8px 32px rgba(0,0,0,0.08)",
          border: "1px solid rgba(15,157,140,0.10)",
        }}
      >
        <CardContent sx={{ p: 5 }}>
          <Box
            sx={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #3D7EFF 0%, #1CC8E0 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              mx: "auto",
              mb: 3,
            }}
          >
            <CheckCircleOutlineIcon sx={{ color: "#fff", fontSize: 32 }} />
          </Box>
          <Typography variant="h5" fontWeight={700} gutterBottom>
            Account created
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
            Next, set up your profile and company.
          </Typography>
          <Button component={Link} href={onboardingHref} variant="contained" size="large" fullWidth>
            Continue
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}
