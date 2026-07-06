# Brand Palette Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the app's teal/purple brand colors with a blue-to-cyan gradient identity across the light theme, with `theme.ts` restructured so a dark theme can be added later without further restructuring.

**Architecture:** `theme.ts` is refactored into an exported `createAppTheme(mode)` function (only `"light"` populated); a new `gradient` theme key (added via MUI's TypeScript module augmentation) holds two gradient strings (`brand` for the wordmark, `button` for primary CTAs); 11 consumer files that currently hardcode the old hex values are updated to the new ones.

**Tech Stack:** Next.js 14, MUI v5 (`createTheme`, module augmentation for custom theme keys), TypeScript.

---

Reference spec: [docs/superpowers/specs/2026-07-06-brand-palette-refresh-design.md](../specs/2026-07-06-brand-palette-refresh-design.md)

## File Structure

```
src/theme.ts                                        - modified: createAppTheme(mode), new color tokens, gradient key
src/app/providers.tsx                                - modified: call createAppTheme("light")
src/app/AppHeader.tsx                                - modified: wordmark gradient
src/app/login/page.tsx                               - modified: wordmark gradient
src/app/register/page.tsx                            - modified: wordmark gradient, link color
src/app/register/success/page.tsx                    - modified: wordmark gradient
src/app/onboarding/page.tsx                           - modified: wordmark gradient
src/app/workspace/page.tsx                            - modified: wordmark gradient, default project color, icon color, avatar bg tint
src/app/projects/[id]/start/page.tsx                  - modified: wordmark gradient, icon color
src/app/projects/[id]/ProjectDetailsTab.tsx           - modified: preset color swatches, default color, avatar bg tint
src/app/projects/[id]/RoadmapTab.tsx                  - modified: category row border color
src/app/projects/[id]/gantt/GanttGrid.tsx             - modified: dependency arrow color, category bar border/fill
src/app/projects/[id]/gantt/TaskDetailPanel.tsx       - modified: dependency dot color
src/app/projects/[id]/gantt/TaskSidebar.tsx           - modified: category border, category progress fill
```

## Color Reference (for every task below)

| Old value | New value | Meaning |
|---|---|---|
| `#0F9D8C` (teal, primary) | `#2D6EEF` | flat primary blue |
| `#3DB8A8` (teal light) | `#749FF4` | primary light |
| `#0B7D6F` (teal dark) | `#1050CF` | primary dark |
| `#6C5CE7` (purple, secondary) | `#5B63D6` | flat secondary indigo |
| `#A29BFE` (purple light) | `#989DE5` | secondary light |
| `#4834D4` (purple dark) | `#313AC3` | secondary dark |
| `#9061F9` (category accent) | `#5B63D6` | same as secondary — category highlight reuses secondary |
| `rgba(144,97,249,0.18)` | `rgba(91,99,214,0.18)` | category bar tint (rgba of the accent above) |
| `#DFF5F2` (light teal tint) | `#E4ECFD` | light pastel tint of new primary, for avatar/icon backgrounds |
| `linear-gradient(135deg, #0F9D8C 0%, #6C5CE7 100%)` (wordmark) | `linear-gradient(135deg, #3D7EFF 0%, #1CC8E0 100%)` | wordmark brand gradient |
| N/A (new) | `linear-gradient(135deg, #2D6EEF 0%, #0FA9C0 100%)` | button gradient (white text passes contrast; brand gradient does not) |

---

### Task 1: Refactor `theme.ts` into `createAppTheme(mode)` with new tokens

**Files:**
- Modify: `src/theme.ts`
- Modify: `src/app/providers.tsx`

- [ ] **Step 1: Replace `src/theme.ts` entirely**

```ts
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
```

- [ ] **Step 2: Update `src/app/providers.tsx` to call the new function**

Replace:
```ts
import { theme } from "@/theme";
```
with:
```ts
import { createAppTheme } from "@/theme";
```

Replace:
```tsx
      <ThemeProvider theme={theme}>
```
with:
```tsx
      <ThemeProvider theme={createAppTheme("light")}>
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (confirms the `gradient` module augmentation and `createAppTheme` signature are consistent)

- [ ] **Step 4: Commit**

```bash
git add src/theme.ts src/app/providers.tsx
git commit -m "Refactor theme into createAppTheme(mode) with new blue-cyan palette"
```

---

### Task 2: `AppHeader.tsx` — wordmark gradient

**Files:**
- Modify: `src/app/AppHeader.tsx:65`

- [ ] **Step 1: Replace the hardcoded gradient**

Find:
```ts
            background: "linear-gradient(135deg, #0F9D8C 0%, #6C5CE7 100%)",
```
Replace with:
```ts
            background: "linear-gradient(135deg, #3D7EFF 0%, #1CC8E0 100%)",
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/AppHeader.tsx
git commit -m "Update AppHeader wordmark to new brand gradient"
```

---

### Task 3: `login/page.tsx` — wordmark gradient

**Files:**
- Modify: `src/app/login/page.tsx:62`

- [ ] **Step 1: Replace the hardcoded gradient**

Find:
```ts
              background: "linear-gradient(135deg, #0F9D8C 0%, #6C5CE7 100%)",
```
Replace with:
```ts
              background: "linear-gradient(135deg, #3D7EFF 0%, #1CC8E0 100%)",
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/login/page.tsx
git commit -m "Update login wordmark to new brand gradient"
```

---

### Task 4: `register/page.tsx` — wordmark gradient + link color

**Files:**
- Modify: `src/app/register/page.tsx:89,126`

- [ ] **Step 1: Replace the hardcoded gradient**

Find:
```ts
              background: "linear-gradient(135deg, #0F9D8C 0%, #6C5CE7 100%)",
```
Replace with:
```ts
              background: "linear-gradient(135deg, #3D7EFF 0%, #1CC8E0 100%)",
```

- [ ] **Step 2: Replace the link color**

Find:
```tsx
            <Link href="/login" style={{ color: "#0F9D8C", fontWeight: 600, textDecoration: "none" }}>
```
Replace with:
```tsx
            <Link href="/login" style={{ color: "#2D6EEF", fontWeight: 600, textDecoration: "none" }}>
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/app/register/page.tsx
git commit -m "Update register page wordmark and link color to new palette"
```

---

### Task 5: `register/success/page.tsx` — wordmark gradient

**Files:**
- Modify: `src/app/register/success/page.tsx:43`

- [ ] **Step 1: Replace the hardcoded gradient**

Find:
```ts
              background: "linear-gradient(135deg, #0F9D8C 0%, #6C5CE7 100%)",
```
Replace with:
```ts
              background: "linear-gradient(135deg, #3D7EFF 0%, #1CC8E0 100%)",
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/register/success/page.tsx
git commit -m "Update register success page wordmark to new brand gradient"
```

---

### Task 6: `onboarding/page.tsx` — wordmark gradient

**Files:**
- Modify: `src/app/onboarding/page.tsx:133`

- [ ] **Step 1: Replace the hardcoded gradient**

Find:
```ts
              background: "linear-gradient(135deg, #0F9D8C 0%, #6C5CE7 100%)",
```
Replace with:
```ts
              background: "linear-gradient(135deg, #3D7EFF 0%, #1CC8E0 100%)",
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/onboarding/page.tsx
git commit -m "Update onboarding page wordmark to new brand gradient"
```

---

### Task 7: `workspace/page.tsx` — wordmark, default project color, icon color, avatar tint

**Files:**
- Modify: `src/app/workspace/page.tsx:33,49,58,121`

- [ ] **Step 1: Replace the default project color fallback**

Find:
```ts
    const c = color || "#0F9D8C";
```
Replace with:
```ts
    const c = color || "#2D6EEF";
```

- [ ] **Step 2: Replace the hardcoded wordmark gradient**

Find:
```ts
                background: "linear-gradient(135deg, #0F9D8C 0%, #6C5CE7 100%)",
```
Replace with:
```ts
                background: "linear-gradient(135deg, #3D7EFF 0%, #1CC8E0 100%)",
```

- [ ] **Step 3: Replace the folder icon color**

Find:
```tsx
              <FolderOutlinedIcon sx={{ fontSize: 40, color: "#0F9D8C" }} />
```
Replace with:
```tsx
              <FolderOutlinedIcon sx={{ fontSize: 40, color: "#2D6EEF" }} />
```

- [ ] **Step 4: Replace the light-tint avatar background**

Find:
```tsx
                        <Avatar key={m.id} sx={{ bgcolor: "#DFF5F2", color: "primary.main", fontWeight: 700 }}>
```
Replace with:
```tsx
                        <Avatar key={m.id} sx={{ bgcolor: "#E4ECFD", color: "primary.main", fontWeight: 700 }}>
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/app/workspace/page.tsx
git commit -m "Update workspace page to new brand palette"
```

---

### Task 8: `projects/[id]/start/page.tsx` — wordmark gradient + icon color

**Files:**
- Modify: `src/app/projects/[id]/start/page.tsx:47,56`

- [ ] **Step 1: Replace the hardcoded gradient**

Find:
```ts
                  background: "linear-gradient(135deg, #0F9D8C 0%, #6C5CE7 100%)",
```
Replace with:
```ts
                  background: "linear-gradient(135deg, #3D7EFF 0%, #1CC8E0 100%)",
```

- [ ] **Step 2: Replace the icon color**

Find:
```tsx
                <CalendarTodayIcon sx={{ fontSize: 32, color: "#0F9D8C" }} />
```
Replace with:
```tsx
                <CalendarTodayIcon sx={{ fontSize: 32, color: "#2D6EEF" }} />
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/app/projects/[id]/start/page.tsx
git commit -m "Update project start page to new brand palette"
```

---

### Task 9: `ProjectDetailsTab.tsx` — preset colors, default color, avatar tint

**Files:**
- Modify: `src/app/projects/[id]/ProjectDetailsTab.tsx:31,50,365`

- [ ] **Step 1: Replace the brand-identity preset swatches only**

Find:
```ts
const PRESET_COLORS = [
  "#0F9D8C", "#6C5CE7", "#E17055", "#00B894",
  "#0984E3", "#FDCB6E", "#E84393", "#636E72",
  "#2D3436", "#D63031", "#00CEC9", "#A29BFE",
];
```
Replace with:
```ts
const PRESET_COLORS = [
  "#2D6EEF", "#5B63D6", "#E17055", "#00B894",
  "#0984E3", "#FDCB6E", "#E84393", "#636E72",
  "#2D3436", "#D63031", "#00CEC9", "#989DE5",
];
```

(Only the first, second, and last swatch change — those are the ones that mirrored the old brand teal/purple identity; the other 8 are unrelated generic project-color choices and stay as-is.)

- [ ] **Step 2: Replace the default color fallback**

Find:
```ts
  const [color, setColor] = useState(initialColor || "#0F9D8C");
```
Replace with:
```ts
  const [color, setColor] = useState(initialColor || "#2D6EEF");
```

- [ ] **Step 3: Replace the light-tint avatar background**

Find:
```tsx
                        bgcolor: member.blocked ? "rgba(0,0,0,0.08)" : "#DFF5F2",
```
Replace with:
```tsx
                        bgcolor: member.blocked ? "rgba(0,0,0,0.08)" : "#E4ECFD",
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/app/projects/[id]/ProjectDetailsTab.tsx
git commit -m "Update project details tab to new brand palette"
```

---

### Task 10: `RoadmapTab.tsx` — category row highlight border

**Files:**
- Modify: `src/app/projects/[id]/RoadmapTab.tsx:720`

- [ ] **Step 1: Replace the category border color**

Find:
```ts
            borderLeft: task.kind === "category" ? "3px solid #9061F9" : "3px solid transparent",
```
Replace with:
```ts
            borderLeft: task.kind === "category" ? "3px solid #5B63D6" : "3px solid transparent",
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add "src/app/projects/[id]/RoadmapTab.tsx"
git commit -m "Update List view category highlight to new secondary color"
```

---

### Task 11: `gantt/GanttGrid.tsx` — dependency arrow + category bar

**Files:**
- Modify: `src/app/projects/[id]/gantt/GanttGrid.tsx:345,352,585-586,607`

- [ ] **Step 1: Replace the dependency arrowhead fill**

Find:
```tsx
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#0F9D8C" />
```
Replace with:
```tsx
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#2D6EEF" />
```

- [ ] **Step 2: Replace the dependency line color**

Find:
```ts
              const color = "#0F9D8C";
```
Replace with:
```ts
              const color = "#2D6EEF";
```

- [ ] **Step 3: Replace the category bar tint and border**

Find:
```ts
                    bgcolor: "rgba(144,97,249,0.18)",
                    border: "1.5px solid #9061F9",
```
Replace with:
```ts
                    bgcolor: "rgba(91,99,214,0.18)",
                    border: "1.5px solid #5B63D6",
```

- [ ] **Step 4: Replace the category rollup progress fill**

Find:
```ts
                      bgcolor: "#9061F9",
```
Replace with:
```ts
                      bgcolor: "#5B63D6",
```

(This occurrence is the rollup progress fill inside the category bar, immediately after the border/bgcolor from Step 3 — distinguish it from Task 10 and Task 12's own `#9061F9` occurrences, which are in different files.)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add "src/app/projects/[id]/gantt/GanttGrid.tsx"
git commit -m "Update Gantt dependency arrows and category bar to new palette"
```

---

### Task 12: `gantt/TaskDetailPanel.tsx` — dependency dot

**Files:**
- Modify: `src/app/projects/[id]/gantt/TaskDetailPanel.tsx:521`

- [ ] **Step 1: Replace the dependency dot color**

Find:
```tsx
                        <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "#0F9D8C", flexShrink: 0 }} />
```
Replace with:
```tsx
                        <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "#2D6EEF", flexShrink: 0 }} />
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add "src/app/projects/[id]/gantt/TaskDetailPanel.tsx"
git commit -m "Update task detail panel dependency dot to new primary color"
```

---

### Task 13: `gantt/TaskSidebar.tsx` — category border + progress fill

**Files:**
- Modify: `src/app/projects/[id]/gantt/TaskSidebar.tsx:399,542`

- [ ] **Step 1: Replace the category border color**

Find:
```ts
          borderLeft: isCategory ? "3px solid #9061F9" : "3px solid transparent",
```
Replace with:
```ts
          borderLeft: isCategory ? "3px solid #5B63D6" : "3px solid transparent",
```

- [ ] **Step 2: Replace the category progress fill**

Find:
```ts
                  bgcolor: "#9061F9",
```
Replace with:
```ts
                  bgcolor: "#5B63D6",
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add "src/app/projects/[id]/gantt/TaskSidebar.tsx"
git commit -m "Update Gantt sidebar category highlight to new secondary color"
```

---

### Task 14: Final verification

- [ ] **Step 1: Confirm no old-palette hex values remain**

Run: `grep -rn "#0F9D8C\|#3DB8A8\|#0B7D6F\|#6C5CE7\|#A29BFE\|#4834D4\|#DFF5F2\|#9061F9\|144,97,249" src/`
Expected: no output (all occurrences replaced)

- [ ] **Step 2: Full type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: all tests still pass (this is a styling-only change; no test should reference color values, but confirm nothing else broke)

- [ ] **Step 4: Manual browser verification**

Using the dev server, visually confirm the new palette renders correctly on:
1. `/login` and `/register` — wordmark shows the blue→cyan gradient, "Log in"/"Create account" buttons show the button gradient with legible white text
2. `/workspace` — wordmark gradient, "+ New project" button, folder icon color, member avatar tint
3. A project's Roadmap tab, both Gantt and List views — Category row highlight is indigo (not purple), dependency arrows are blue, category progress bars are indigo
4. `/projects/[id]` → Project Details tab — color swatch picker shows the new blue/indigo as the first two options

- [ ] **Step 5: Commit if any stray changes remain**

```bash
git status
git add -A
git commit -m "Finish brand palette refresh: blue-cyan gradient identity"
```

(Skip this step if `git status` is already clean.)
