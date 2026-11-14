# Design Direction — "Clinical Editorial"

The player should feel like a serious, modern assessment tool: closer to a well-designed exam interface than to a quiz game. Students should build muscle memory for the real NCLEX layout while enjoying a calmer, cleaner surface than Pearson VUE.

The words on that surface are set in [`glossary.md`](glossary.md): one name for each thing a teacher or a student sees. This page says "item" where the glossary says "question", because it describes the NGN layout.

## 1. Direction in one paragraph

Light-mode primary. Warm off-white paper surfaces, near-black ink, one deep clinical blue used **only** for interactive and selected states, and a restrained semantic set (correct green, incorrect red, flagged amber) that appears only in feedback mode. Generous line-height for reading-heavy stems and EHR notes. Hierarchy from type scale and spacing rhythm, not from boxes and shadows. Motion is short, eased, and explanatory.

**Stage edition (owner-approved 2026-10-22, `docs/ui-overhaul/`).** The direction holds, made bolder where it was timid. A live session has a **projector view**, the stage: no controls, no names after the lobby, always light (projectors cannot make black, and dark slides wash out in a lit room), and the one place the type gets huge, like a lecture slide and not a game show. The serif carries large display headings (library title, stage question, end summary) as well as the record.

Two amendments to "feedback mode only":

- **Amber in the last 10 seconds.** A timer's bar turns `--flag` and the words "10 seconds left" appear beside it (text in `--flag-ink`). Words always, so colour is never the signal on its own; no pulse, no loop.
- **System messages are neutral.** Errors, connection trouble and other system messages use `--notice` on `--notice-soft` with an icon, never `--incorrect`: red means a marked answer, nothing else.

**Public site edition (#563).** The public pages (landing, pricing, terms, privacy) read like a well-set journal page: the serif at display size, near-black rules that open each section, and an asymmetric grid. That is the second place, after the stage, where type gets large. §10 has the rules, §11 says how they carry into the signed-in app, and §12 is the bar every UI change must meet.

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

**Three layers** (`src/styles/tokens.css` is the source; the block above is the history). Base: raw oklch ramps named by hue and lightness, which nothing in a component reads. Semantic: what a colour is for (`--surface-*`, `--ink-*`, `--accent*`, the feedback set, `--notice*`, `--stage-*`, `--elevation-1`), re-lit for dark. Component: what one component wears (`--field-border`, `--chart-key`, `--button-height-lg`), always a semantic token or a size. Components read only the last two.

**Theme.** System, Light or Dark from the account menu, stored per browser and applied before first paint; System follows the device. The projector view ignores it and stays light.

**The one shadow.** `--elevation-1`, for a dialog, a toast and a dragged token. Everything else still takes its depth from a line.

### Tokens added for the public site (#563)

Read from `src/styles/tokens.css`. Base and component tokens are the same in both themes. The Tailwind names come from `@theme` in `src/app/globals.css`.

| Token                | Layer     | Light                                      | Dark                                | Tailwind             | Used for                                            |
| -------------------- | --------- | ------------------------------------------ | ----------------------------------- | -------------------- | --------------------------------------------------- |
| `--text-hero`        | Base      | `clamp(2.375rem, 1.5rem + 2.6vw, 4.75rem)` | same                                | `text-hero`          | `.display-hero`: the landing headline and a price   |
| `--text-section`     | Base      | `clamp(1.75rem, 1.3rem + 1.8vw, 3rem)`     | same                                | `text-section`       | `.display-section`: section heads, `/pricing` title |
| `--content-site`     | Base      | `86rem`                                    | same                                | `max-w-site`         | The public site's column                            |
| `--surface-band`     | Semantic  | `--paper-94` (oklch 94% 0.005 85)          | `--neutral-15` (oklch 15% 0.01 260) | `bg-surface-band`    | One band across a page, and the footer              |
| `--rule-strong`      | Semantic  | `--neutral-20` (oklch 20% 0.01 260)        | `--paper-94` (oklch 94% 0.005 85)   | `border-rule-strong` | The rule that opens a section; the wordmark's box   |
| `--device-line`      | Semantic  | `--neutral-48` (oklch 48% 0.012 260)       | `--neutral-62` (oklch 62% 0.01 260) | `border-device-line` | The line a drawing is made of (3:1 on the page)     |
| `--radius-device`    | Component | `1.5rem`                                   | same                                | `rounded-device`     | A drawn phone's corner. Drawings only               |
| `--demo-step`        | Component | `450ms`                                    | same                                | none                 | The gap between the drawing's steps                 |
| `--text-demo-label`  | Component | `clamp(0.6875rem, 1.9cqi, 0.9375rem)`      | same                                | `text-demo-label`    | The drawn projector's labels                        |
| `--text-demo-stem`   | Component | `clamp(0.9375rem, 3.3cqi, 1.75rem)`        | same                                | `text-demo-stem`     | The drawn projector's question                      |
| `--text-demo-option` | Component | `clamp(0.75rem, 2.3cqi, 1.1875rem)`        | same                                | `text-demo-option`   | The drawn projector's choices                       |
| `--text-demo-number` | Component | `clamp(1.75rem, 6.5cqi, 3.75rem)`          | same                                | `text-demo-number`   | The drawn projector's count                         |
| `--text-demo-phone`  | Component | `0.6875rem`                                | same                                | `text-demo-phone`    | A drawn phone's words (hidden from screen readers)  |

`--radius-device` is the one radius outside the two: at 8px a phone reads as a card. Nothing that can be pressed may use it.

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
| Correct (feedback)              | 4px `--correct` left rule, `--correct-soft` fill + check icon; text unchanged      |
| Incorrect (feedback)            | 4px `--incorrect` left rule, `--incorrect-soft` fill + x icon                      |
| Missed correct (feedback)       | dashed `--correct` border + the word "Missed"; no icon (a check reads as chosen)   |
| Sent, not yet revealed          | Selected treatment, read-only; no correct/incorrect marks until the key arrives    |

One mark for every item type (#325): option rows, ordered steps, matrix cells (grid and card views), drop-down blanks and the drop-down table, and drag-and-drop and bowtie slots all draw the same three marks from `feedbackMarkClasses` (`src/components/question/feedbackMarks.ts`). Correct and incorrect take a 4px left rule in their colour over the matching soft fill (`--correct-soft`, `--incorrect-soft`), with the element's own border on the other three sides; missed takes the dashed `--correct` border. No exception was needed: a matrix grid cell is a padded chip with gaps on both sides, and every blank and slot is a bordered box, so each has a left edge that reads as a rule. A slot keeps its 2px border on the other sides; the rule is still 4px. The mark sets the element's border colour and fill and nothing else on the element may: `border-line`, `border-line-strong`, `border-transparent` and `bg-surface-1` are emitted after the mark colours and win the cascade, which used to hide the missed border on option rows and matrix cells and the soft fill on option rows, steps and selects. When the words and icons widen the matrix grid past a tablet's width, the read-only grid's scroll box becomes a tab stop so a keyboard can scroll it.

Feedback marks need the key. An answer that has been sent but whose key has not reached the browser (a live session before the host reveals) is drawn in review mode — the choices stay selected and nothing is marked — never as feedback, which would draw every choice as incorrect.

Feedback words: every marked element prints its word (Correct, Incorrect or Missed) beside its icon, on every surface, so colour is never the only signal and "Missed" is never guessed from a check mark.

Score verdict: the score panel leads with the whole answer's verdict — "All correct" (`--correct`, check icon), "Partially correct" (ink, no icon) or "Not correct" (`--incorrect`, x icon) — with a matching left rule, then the points ("3 / 4", read as "3 of 4 points"). The verdict words are deliberately not the element words (Correct, Incorrect, Missed). Per-row "x/y" marks take the same colours. The verdict is read off the server's points, never off the marks.

Highlight items: selectable spans get a faint underline at rest; selected = `--accent-soft` background with 2px bottom border; feedback uses correct/incorrect backgrounds at 25% alpha.

Drag-and-drop: dragged token lifts with a 2dp shadow and 1.02 scale; valid drop targets show a dashed accent outline; drop settles with a 200ms layout animation. Tap-to-place fallback: tapping a token puts it in "armed" state (accent ring), tapping a blank places it.

## 5. Motion rules

- Only `transform`, `opacity`, `clip-path`. No animated layout properties.
- Selection: 120–200ms. Submit → feedback: staggered 40ms per element, max 320ms total. Step change in a case study: crossfade + 8px slide, 200ms.
- Nothing loops. No celebratory effects. Score reveal is a number that settles, not a counter animation.
- One owner-approved exception (2026-10-24): the top 5 podium on the projector when a live session ends (`StagePodium`). Places rise and fade in from 5th to 1st, about 0.6s apart, done within about 3s; transform and opacity only, and under reduced motion everything is there at once with no motion. No confetti, sound or badges with it, and never on a phone.
- `prefers-reduced-motion`: all transitions collapse to opacity only, 80ms.
- A timer drains smoothly and calmly; its last 10 seconds change colour and add words (§1), and nothing pulses.

## 6. Typography

- Stem: `--text-lg`, 1.55 line-height, `--ink-1`.
- Page headings are fluid with rem bounds (`--text-display`, `--text-title`); body text stays 16px.
- The stage sets its type in container units with rem floors (`--text-stage-*`: join code about 160px, question 64px, choices 48px, numbers 96px, labels at least 32px on a 1080px stage), each `clamp()` within 2.5x of its floor so zoom still works.
- Instructions ("Select all that apply."): `--text-sm`, `--ink-2`, italic, below the stem.
- Options: `--text-base`, 1.5 line-height; option letters (A, B, C) only for traditional multiple choice.
- EHR notes: `--font-read` at `--text-base`, timestamps in `--font-mono` `--text-sm`.
- Vitals and labs: tabular numbers, right-aligned, abnormal values marked with a small "H"/"L" tag rather than red text (red is reserved for feedback).

## 7. Iconography and imagery

- Lucide icons at 20px, stroke 1.75; 32px, stroke 2.5 on the stage. `lucide-react` is installed (owner-approved 2026-10-22): use it through `Icon` (`src/components/ui/Icon.tsx`), one import per icon. No emoji anywhere in product UI.
- No illustrations in the player. The public site may use restrained line illustrations; today the drawing of a live session on the landing page is the only one (§10).

## 8. Anti-patterns (reject in review)

- Uniform card grid of options with big shadows.
- Gradient buttons, glassmorphism, neon accents.
- Confetti, badges, streak flames, sound effects.
- Red text for abnormal vitals (collides with feedback semantics).
- Color as the only signal for correct/incorrect (always pair with icon or rule).

## 9. References to gather in Sprint 0

Pearson VUE NCLEX tutorial screenshots (layout fidelity), Socrative (session flow), UWorld and Archer NGN players (EHR panel patterns), Linear and Notion (restraint, motion). Save to `docs/design/references/` with one line each on what to borrow and what to avoid.

## 10. Public site (#563)

The public pages are the landing page, `/pricing`, terms and privacy. They share `SiteHeader` (the wordmark, Pricing, Sign in) and `SiteFooter`. They do not use `AppShell`. The direction was picked from three spikes; the record is in [`design/landing-563/A.md`](design/landing-563/A.md).

**Display type.** Two sizes, both in Source Serif 4 at weight 500, both rem-bounded within 2.5x so zoom works.

- `.display-hero` (`--text-hero`, line-height 1.02): the landing headline and the price, on the landing page and `/pricing`. Nowhere else.
- `.display-section` (`--text-section`, line-height 1.1): a section head on the public site, and the page title of `/pricing`.
- Everything else keeps the app's scale: body 16px in Inter, `--text-lg` for a lead.

**Section openings.** A section opens with a 1px `--rule-strong` line (near-black in light, paper in dark). On the landing page a mono number sits above each section head (`01`, `02`, in `.eyebrow`, hidden from screen readers); `/pricing` has one section and no number. A near-black rule may also set apart one block (the join code form in the landing's first screen, the price column on `/pricing`) and closes the page above the footer. Inside a section, lines and list dividers stay `--line`.

**Grid.** Inside `max-w-site` (`--content-site`), with 16px side gutters on a phone, 24px from 640px and 40px from 1024px. From 1024px a section is a 12-column grid: the number, head and lead in a narrow left column (4 of 12), the content in the wide right one (8). The landing's first screen splits 6 and 6, then 5 and 6 from 1280px with a column of air between. `/pricing` sets its head in 6 and the price in 5, starting at column 8. Below 1024px everything is one column.

**Band.** `--surface-band`, a deeper paper, sits under one section per page (the price on the landing page) and under the footer. Never under a card or a control.

**The drawing.** The live session on the landing page is drawn in HTML and lines, not a screenshot: a projector screen with a roller line and phones in front of it. It uses `--device-line` for its outlines (3:1 against the page in both themes) and `--radius-device` for the phones' corners. It shows a gallery fixture's question and choice words only, never a key. It plays once when it scrolls into view (`[data-demo]` in `globals.css`): three steps `--demo-step` apart, done in under 1.5s, transform and opacity only. With reduced motion or no JavaScript it shows the last frame. Because it plays once and briefly, it needs no pause control.

**Clinical blue.** Only on what can be pressed (the buttons, the join code form, links) and on a drawing of a control in its selected or sent state. Never on a rule, a number, a head or a band.

**Wordmark.** `Wordmark` (`src/components/site/Wordmark.tsx`): "Lea" in the serif and "RN" in a hairline `--rule-strong` box. Styled text, not an image, so it follows the theme and reads as "LeaRN".

## 11. How the direction carries into the app

These are rules for future work (round 3 of #563, the signed-in app). They describe no page on main today.

- **Wordmark.** `AppShell` takes `Wordmark` in place of `WORDMARK_CLASSES`.
- **Titles.** The library, a quiz and other top-level page titles use `.display-section`. `.display-hero` stays on the public site.
- **Quieter lines.** Section rules in `--rule-strong` and mono section numbers stay on the public site. The app keeps `--line` dividers and takes its hierarchy from type and space (§1). No band under app content.
- **Unchanged.** The player, the stage, feedback marks and the EHR layout keep §3 to §6.
- **Primitives first.** Before any screen changes, these are designed and shown in `/gallery/primitives`, each with every state below. Each exists in `src/components/ui/` today; round 3 restyles them, it does not fork them.

| Primitive   | States it must have                                                                                      |
| ----------- | -------------------------------------------------------------------------------------------------------- |
| Button      | Primary, secondary, ghost; sm, md, lg; rest, hover, pressed, focus-visible, disabled, busy (label kept)  |
| Field       | Empty, filled, focus-visible, disabled, read-only, with hint, with error (words under the field, linked) |
| Notice      | Status and alert; with and without a title; with an action; light and dark                               |
| AppShell    | Teacher and student; signed in with the account menu open and closed; phone nav and desktop nav          |
| Page header | Title only; with a lead; with a main action; with a back link; long title wrapping at 320px              |
| Empty state | First use (nothing made yet, with the next step) and no results (a filter or search found nothing)       |
| Loading     | A skeleton in the shape of the page, labelled for screen readers, still under reduced motion             |
| Error       | Could not load (with Try again), not found, and no access; neutral `Notice` colours, never feedback red  |

## 12. Quality bar for every UI PR

A PR that changes UI meets every line, or says which line it misses and why.

- [ ] No sideways scroll at any width from 320px to 1920px.
- [ ] The page's main action is in the first screen at 375x667.
- [ ] axe reports no violations, in light and in dark.
- [ ] Focus is visible on every control (§4).
- [ ] Every target is at least 44px (`--tap-min`).
- [ ] Public pages: LCP under 2.5s, CLS under 0.1, and at most 150kb of gzipped JavaScript.
- [ ] Empty, loading and error states are designed, not left to chance (§11).
- [ ] Screenshots at 375px and 1280px, before and after, in the PR.
- [ ] One "docs/04 rules followed" line per change, naming the sections (for example, "§10 section openings, §5 motion").
