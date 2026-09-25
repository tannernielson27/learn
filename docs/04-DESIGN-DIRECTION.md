# Design Direction — "Clinical Editorial"

The player should feel like a serious, modern assessment tool: closer to a well-designed exam interface than to a quiz game. Students should build muscle memory for the real NCLEX layout while enjoying a calmer, cleaner surface than Pearson VUE.

## 1. Direction in one paragraph

Light-mode primary. Warm off-white paper surfaces, near-black ink, one deep clinical blue used **only** for interactive and selected states, and a restrained semantic set (correct green, incorrect red, flagged amber) that appears only in feedback mode. Generous line-height for reading-heavy stems and EHR notes. Hierarchy from type scale and spacing rhythm, not from boxes and shadows. Motion is short, eased, and explanatory.

## 2. Tokens (starting values; tune in Sprint 0)

```css
:root {
  --surface-0: oklch(98.5% 0.004 85); /* page */
  --surface-1: oklch(100% 0 0); /* cards, EHR panel */
  --surface-2: oklch(96% 0.006 85); /* option hover, table stripes */
  --ink-1: oklch(20% 0.01 260); /* primary text */
  --ink-2: oklch(45% 0.01 260); /* secondary text */
  --line: oklch(88% 0.006 85);
  --accent: oklch(45% 0.12 250); /* clinical blue: selection, focus, primary action */
  --accent-soft: oklch(94% 0.03 250); /* selected option fill */
  --correct: oklch(52% 0.13 150);
  --incorrect: oklch(52% 0.18 25);
  --flag: oklch(70% 0.14 75);

  --font-ui: "Inter", system-ui, sans-serif; /* UI, options, tables */
  --font-read:
    "Source Serif 4", Georgia, serif; /* case narrative, nurses' notes (optional; test with users) */
  --font-mono: "JetBrains Mono", ui-monospace, monospace; /* vitals, lab values */

  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.375rem;
  --text-2xl: 1.75rem;
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-12: 3rem;
  --radius-sm: 4px;
  --radius-md: 8px; /* two radii only */

  --duration-fast: 120ms;
  --duration-base: 200ms;
  --duration-slow: 320ms;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
}
```

Dark theme: same hues, flipped lightness; accent lightened for contrast. Both themes must pass WCAG AA (4.5:1 body, 3:1 UI).

### Three font families: a recorded exception (#57, #272)

The web performance guideline allows two font families; LeaRN loads three, on purpose. Each carries a job the other two cannot: Inter is the UI, Source Serif 4 is the reading face of EHR notes and case narratives, and JetBrains Mono sets vitals, lab values and timestamps so digits line up the way they do in a real chart. All three are in use (`font-read` and `font-mono` each appear in 39 components, including `/learn` and the case-study player), so none can be dropped without losing EHR fidelity.

**Measured cost** (local production build, 2026-09-25, Next 16.3.4). The root layout loads the three with `next/font/google`, `subsets: ["latin"]` and the default `preload: true`, so every page, `/learn` and a case study included, preloads the same three latin `woff2` files. woff2 is already compressed, so the transfer size is the file size:

| Family         | latin file, preloaded on every page |
| -------------- | ----------------------------------- |
| Inter          | 48,432 B (47.3 KiB)                 |
| Source Serif 4 | 50,924 B (49.7 KiB)                 |
| JetBrains Mono | 40,480 B (39.5 KiB)                 |
| **Total**      | **139,836 B (136.6 KiB)**           |

The third family therefore costs about 40 to 50 KiB per cold visit, once, and is cached after that. The other subsets (latin-ext, cyrillic, greek, vietnamese) are built but fetched only if a page uses a character from them. How it was measured: `pnpm build`, then the `<link rel="preload" as="font">` tags in the prerendered `/help` HTML (the same root layout as every route) matched against the `@font-face` rules in `.next/static/chunks/*.css` and the file sizes in `.next/static/media/`.

The decision: keep all three. If the cost ever matters (a failing LCP budget on a slow phone), the first lever is `preload: false` on Source Serif 4 and JetBrains Mono, so they load only on pages that use them, not dropping a family.

## 3. Layout

- **Desktop (≥1024px):** two-pane. Left 45%: EHR panel with tabs (sticky, independently scrollable). Right 55%: item. Progress bar and step indicator across the top; submit bar fixed at the bottom of the right pane.
- **Tablet (768–1023px):** EHR collapses to a top drawer with tab chips; item below.
- **Phone (<768px):** single column. EHR is a bottom sheet opened by a persistent "Patient record" chip; tab chips scroll horizontally. Item fills the screen; submit is a fixed bottom bar with safe-area padding.
- Options and table cells have a minimum 44px tap target; matrix tables on phones become row cards with segmented controls instead of a wide grid.
- Content max-width 68ch for stems and notes.

## 4. Component behaviors

| State                           | Treatment                                                                          |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| Rest                            | 1px `--line` border, `--surface-1` fill                                            |
| Hover (pointer only)            | `--surface-2` fill, 120ms                                                          |
| Selected                        | `--accent` border 2px, `--accent-soft` fill, check or radio filled, 200ms ease-out |
| Focus-visible                   | 2px `--accent` outline offset 2px; never removed                                   |
| Disabled (Select N cap reached) | 50% opacity, tooltip "You have selected N"                                         |
| Correct (feedback)              | `--correct` left rule + check icon; text unchanged                                 |
| Incorrect (feedback)            | `--incorrect` left rule + x icon                                                   |
| Missed correct (feedback)       | dashed `--correct` border                                                          |

Highlight items: selectable spans get a faint underline at rest; selected = `--accent-soft` background with 2px bottom border; feedback uses correct/incorrect backgrounds at 25% alpha.

Drag-and-drop: dragged token lifts with a 2dp shadow and 1.02 scale; valid drop targets show a dashed accent outline; drop settles with a 200ms layout animation. Tap-to-place fallback: tapping a token puts it in "armed" state (accent ring), tapping a blank places it.

## 5. Motion rules

- Only `transform`, `opacity`, `clip-path`. No animated layout properties.
- Selection: 120–200ms. Submit → feedback: staggered 40ms per element, max 320ms total. Step change in a case study: crossfade + 8px slide, 200ms.
- Nothing loops. No celebratory effects. Score reveal is a number that settles, not a counter animation.
- `prefers-reduced-motion`: all transitions collapse to opacity only, 80ms.

## 6. Typography

- Stem: `--text-lg`, 1.55 line-height, `--ink-1`.
- Instructions ("Select all that apply."): `--text-sm`, `--ink-2`, italic, below the stem.
- Options: `--text-base`, 1.5 line-height; option letters (A, B, C) only for traditional multiple choice.
- EHR notes: `--font-read` at `--text-base`, timestamps in `--font-mono` `--text-sm`.
- Vitals and labs: tabular numbers, right-aligned, abnormal values marked with a small "H"/"L" tag rather than red text (red is reserved for feedback).

## 7. Iconography and imagery

- Lucide icons at 20px, stroke 1.75. No emoji anywhere in product UI.
- No illustrations in the player. The marketing page may use restrained line illustrations.

## 8. Anti-patterns (reject in review)

- Uniform card grid of options with big shadows.
- Gradient buttons, glassmorphism, neon accents.
- Confetti, badges, streak flames, sound effects.
- Red text for abnormal vitals (collides with feedback semantics).
- Color as the only signal for correct/incorrect (always pair with icon or rule).

## 9. References to gather in Sprint 0

Pearson VUE NCLEX tutorial screenshots (layout fidelity), Socrative (session flow), UWorld and Archer NGN players (EHR panel patterns), Linear and Notion (restraint, motion). Save to `docs/design/references/` with one line each on what to borrow and what to avoid.
