import { createTheme, type Theme, type ThemeOptions } from "@mui/material/styles";

declare module "@mui/material/styles" {
  interface Theme {
    gradient: {
      brand: string;
      button: string;
    };
  }
  interface ThemeOptions {
    gradient?: {
      brand: string;
      button: string;
    };
  }
}

const LIGHT_GRADIENT = {
  brand: "linear-gradient(135deg, #3D7EFF 0%, #1CC8E0 100%)",
  button: "linear-gradient(135deg, #2D6EEF 0%, #0FA9C0 100%)",
};

export function createAppTheme(mode: "light" | "dark"): Theme {
  // Only "light" is implemented today. A future dark theme adds a second
  // branch here (background/paper/text/gradient values for dark) without
  // needing to change this function's signature or any call site.
  const isLight = mode === "light";

  return createTheme({
    palette: {
      mode,
      primary: {
        main: "#2D6EEF",
        light: "#749FF4",
        dark: "#1050CF",
        contrastText: "#FFFFFF",
      },
      secondary: {
        main: "#5B63D6",
        light: "#989DE5",
        dark: "#313AC3",
      },
      background: {
        default: isLight ? "#F8F9FB" : "#F8F9FB",
        paper: isLight ? "#FFFFFF" : "#FFFFFF",
      },
      text: {
        primary: isLight ? "#1A1A2E" : "#1A1A2E",
        secondary: isLight ? "#6B7280" : "#6B7280",
      },
      error: {
        main: "#EF4444",
      },
      success: {
        main: "#10B981",
      },
    },
    gradient: LIGHT_GRADIENT,
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
      "0 2px 8px rgba(45,110,239,0.12)",
      "0 4px 16px rgba(45,110,239,0.16)",
      "0 8px 24px rgba(45,110,239,0.20)",
      "0 12px 32px rgba(45,110,239,0.24)",
      "0 16px 40px rgba(45,110,239,0.28)",
      "0 20px 48px rgba(45,110,239,0.32)",
      "0 2px 8px rgba(91,99,214,0.12)",
      "0 4px 16px rgba(91,99,214,0.16)",
      "0 8px 24px rgba(91,99,214,0.20)",
      "0 12px 32px rgba(91,99,214,0.24)",
      "0 16px 40px rgba(91,99,214,0.28)",
      "0 20px 48px rgba(91,99,214,0.32)",
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
            boxShadow: "0 2px 8px rgba(45,110,239,0.25)",
            "&:hover": {
              boxShadow: "0 4px 16px rgba(45,110,239,0.35)",
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
                borderColor: "#2D6EEF",
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
  } satisfies ThemeOptions);
}
