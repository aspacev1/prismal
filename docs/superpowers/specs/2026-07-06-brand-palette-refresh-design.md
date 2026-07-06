# Brand Palette Refresh: Blue-Cyan Gradient (Light Theme, Dark-Mode-Ready)

**Goal:** Replace the app's current teal/purple brand colors with a blue-to-cyan gradient identity (matching a reference "DATANOVA" wordmark: dark navy background, bold blue→cyan gradient text), applied to the existing light theme, structured so a dark theme can be added later without restructuring the theme system.

**Context:** The app currently uses `theme.ts` with `primary.main: "#0F9D8C"` (teal) and `secondary.main: "#6C5CE7"` (purple) on a light background (`#F8F9FB`/white). These values, plus several matching hardcoded hex strings, are scattered across 11 additional component files rather than always being read from the theme.

## Scope decision: light theme now, dark theme later

Both a light and a dark theme will eventually exist. This spec covers **only the light theme** — updating its accent colors to the new palette. The reference image's dark navy background is *not* being adopted as the light theme's background; the current light background/paper/text colors (`#F8F9FB` / `#FFFFFF` / `#1A1A2E`) are unchanged. Dark theme (which will actually use that dark navy background) is an explicitly separate, future spec.

## Color tokens

- **`primary.main`: `#2D6EEF`** — a flat blue used everywhere a single solid color is needed: links, borders, focus rings, form control theming, icons. This is the same hue as the start of the brand gradient, chosen so flat and gradient elements read as one consistent brand color family.
- **`secondary.main`: `#5B63D6`** — an indigo-violet replacing the old `#6C5CE7` purple, shifted to sit naturally alongside the new blue-cyan family rather than reading as an unrelated third hue. Used everywhere the old purple was: category-row highlights in the Gantt chart, secondary badges/accents.
- **`gradient.brand`: `linear-gradient(135deg, #3D7EFF 0%, #1CC8E0 100%)`** — the bright, vivid blue-to-cyan gradient matching the reference logo as closely as possible. Used **only** for the "flowline" wordmark, where the gradient is the text fill itself (`background-clip: text`) — there's no separate foreground text sitting on top of it, so ordinary text-contrast rules don't apply the way they do for a background-plus-label combination.
- **`gradient.button`: `linear-gradient(135deg, #2D6EEF 0%, #0FA9C0 100%)`** — a deepened variant of the brand gradient, used as the background for primary buttons and other gradient-filled interactive surfaces, paired with plain white text.
- **`background.default` / `background.paper` / `text.primary` / `text.secondary`**: unchanged (`#F8F9FB` / `#FFFFFF` / `#1A1A2E` / `#6B7280`).

### Why two different gradients (`brand` vs. `button`)

The bright `gradient.brand` (`#3D7EFF → #1CC8E0`) fails white-text contrast at its cyan end (measured 2.02:1 against white, needs ≥4.5:1) — a real problem for buttons, which need legible white text drawn on top of the fill, but not for the wordmark, where the gradient itself *is* the text. Two button-text alternatives were evaluated and rejected before landing on the two-gradient approach:

1. **Dark navy text on the bright gradient** — passes contrast comfortably (5.02:1 / 9.26:1), but was rejected on pure visual-preference grounds ("black letters on blue doesn't look good").
2. **White text + a dark scrim overlay on the bright gradient** — initially proposed at 18% opacity, but recalculation showed 18% only reaches 2.98:1 at the cyan end, still failing; a true pass requires ~36% opacity, at which point the result is visually indistinguishable from simply deepening the gradient's own color stops, while being a more fragile layered-CSS technique to maintain.

The deepened `gradient.button` with plain white text was chosen instead: it passes contrast cleanly (blue end far exceeds 4.5:1; cyan end passes once deepened to `#0FA9C0`), with a single ordinary gradient value and no compositing tricks.

## Dark-mode-ready architecture

`src/theme.ts` is refactored from a single exported `theme` object into an exported function:

```ts
export function createAppTheme(mode: "light" | "dark") {
  return createTheme({
    palette: {
      mode,
      primary: { main: "#2D6EEF", ... },
      // ...
    },
    // ...
  });
}
```

Only the `mode === "light"` branch is populated with real values in this spec — the function takes the `mode` parameter and MUI's `palette.mode` is wired through, but no dark-specific color values are added yet. The one call site (wherever `ThemeProvider` currently imports the static `theme` export) changes to call `createAppTheme("light")`. This is the entire "dark-mode-ready" requirement: when a future spec adds dark theme, it adds a `mode === "dark"` branch and a way to pass `"dark"` into this same function — no restructuring of the theme system itself is needed.

## Scope: files to update

Besides `theme.ts` itself, these files currently hardcode the old teal/purple hex values (`#0F9D8C`, `#3DB8A8`, `#0B7D6F`, `#6C5CE7`, `#A29BFE`, `#4834D4`, `#DFF5F2`, `#9061F9`) rather than reading them from the theme, and need updating to the new tokens:

- `src/app/AppHeader.tsx`
- `src/app/login/page.tsx`
- `src/app/register/page.tsx`
- `src/app/register/success/page.tsx`
- `src/app/onboarding/page.tsx`
- `src/app/workspace/page.tsx`
- `src/app/projects/[id]/start/page.tsx`
- `src/app/projects/[id]/ProjectDetailsTab.tsx`
- `src/app/projects/[id]/RoadmapTab.tsx`
- `src/app/projects/[id]/gantt/GanttGrid.tsx`
- `src/app/projects/[id]/gantt/TaskDetailPanel.tsx`
- `src/app/projects/[id]/gantt/TaskSidebar.tsx`

Each hardcoded value is replaced with either a theme token reference (`theme.palette.primary.main`, etc.) where the surrounding code already has theme access, or the literal new hex value where it doesn't (matching the existing pattern in each file — this spec does not mandate a broader refactor to thread theme access into files that don't currently have it).

## Testing

This is a visual/styling change with no new business logic, matching this project's established testing convention (lib/API layers get unit tests; visual/component-level styling does not). Verification is manual: load each affected page in a browser and confirm the new colors render correctly, matching this project's existing practice of live-browser verification for UI-only changes.

## Out of scope

- Dark theme itself — explicitly deferred to a future spec, as decided above.
- Any change to `background`, `paper`, or `text` colors in the light theme.
- Broader refactoring of files that currently hardcode colors without theme access — this spec updates their hardcoded *values*, not their *access pattern*.
