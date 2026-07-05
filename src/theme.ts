import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  palette: {
    primary: {
      main: "#0F9D8C",
      light: "#3DB8A8",
      dark: "#0B7D6F",
      contrastText: "#FFFFFF",
    },
    secondary: {
      main: "#6C5CE7",
      light: "#A29BFE",
      dark: "#4834D4",
    },
    background: {
      default: "#F8F9FB",
      paper: "#FFFFFF",
    },
    text: {
      primary: "#1A1A2E",
      secondary: "#6B7280",
    },
    error: {
      main: "#EF4444",
    },
    success: {
      main: "#10B981",
    },
  },
  shape: {
    borderRadius: 16,
  },
  shadows: [
    "none",
    "0 1px 2px rgba(0,0,0,0.04)",
    "0 2px 8px rgba(0,0,0,0.06)",
    "0 4px 12px rgba(0,0,0,0.08)",
    "0 8px 24px rgba(0,0,0,0.10)",
    "0 12px 32px rgba(0,0,0,0.12)",
    "0 16px 40px rgba(0,0,0,0.14)",
    "0 20px 48px rgba(0,0,0,0.16)",
    "0 2px 8px rgba(15,157,140,0.12)",
    "0 4px 16px rgba(15,157,140,0.16)",
    "0 8px 24px rgba(15,157,140,0.20)",
    "0 12px 32px rgba(15,157,140,0.24)",
    "0 16px 40px rgba(15,157,140,0.28)",
    "0 20px 48px rgba(15,157,140,0.32)",
    "0 2px 8px rgba(108,92,231,0.12)",
    "0 4px 16px rgba(108,92,231,0.16)",
    "0 8px 24px rgba(108,92,231,0.20)",
    "0 12px 32px rgba(108,92,231,0.24)",
    "0 16px 40px rgba(108,92,231,0.28)",
    "0 20px 48px rgba(108,92,231,0.32)",
    "0 1px 2px rgba(0,0,0,0.02)",
    "0 2px 4px rgba(0,0,0,0.03)",
    "0 4px 8px rgba(0,0,0,0.04)",
    "0 8px 16px rgba(0,0,0,0.05)",
    "0 16px 32px rgba(0,0,0,0.06)",
  ],
  typography: {
    fontFamily: [
      "Inter",
      "-apple-system",
      "BlinkMacSystemFont",
      '"Segoe UI"',
      "Roboto",
      "Helvetica",
      "Arial",
      "sans-serif",
    ].join(","),
    h4: { fontWeight: 800, letterSpacing: "-0.02em" },
    h5: { fontWeight: 700, letterSpacing: "-0.01em" },
    h6: { fontWeight: 700 },
    subtitle1: { fontWeight: 600 },
    button: { textTransform: "none", fontWeight: 600 },
    overline: { fontWeight: 700, letterSpacing: "0.06em", fontSize: "0.7rem" },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          WebkitFontSmoothing: "antialiased",
          MozOsxFontSmoothing: "grayscale",
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          padding: "10px 20px",
          transition: "all 0.2s ease",
        },
        contained: {
          boxShadow: "0 2px 8px rgba(15,157,140,0.25)",
          "&:hover": {
            boxShadow: "0 4px 16px rgba(15,157,140,0.35)",
            transform: "translateY(-1px)",
          },
        },
        outlined: {
          borderWidth: 1.5,
          "&:hover": {
            borderWidth: 1.5,
          },
        },
        sizeSmall: {
          padding: "6px 14px",
          fontSize: "0.8125rem",
        },
        sizeLarge: {
          padding: "14px 28px",
          fontSize: "1rem",
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: "outlined",
        fullWidth: true,
      },
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            borderRadius: 12,
            transition: "all 0.2s ease",
            "&:hover .MuiOutlinedInput-notchedOutline": {
              borderColor: "#0F9D8C",
            },
            "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
              borderWidth: 2,
            },
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 20,
          border: "1px solid rgba(0,0,0,0.06)",
          transition: "all 0.25s ease",
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 20,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          fontWeight: 600,
        },
      },
    },
  },
});
