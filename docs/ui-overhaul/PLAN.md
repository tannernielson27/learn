# LeaRN UI/UX overhaul plan

Branch `feat/ui-overhaul`, from `origin/main` at `31f31f7`. Written 2026-10-22 and approved by the owner with the mockups in `mockups/` (Checkpoint 2, 2026-10-22). Working notes and before-screenshots stay in the gitignored `.ui-refresh/`.

## 0. Owner decisions that frame this plan (2026-10-22)

| Decision      | Choice                                                                                                                                    | What it rules out                                                                                                                                             |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| How game-like | **Clinical, responsive.** Keep the exam feel of `docs/04-DESIGN-DIRECTION.md`. Borrow the structure of live-quiz apps, not their rewards. | Confetti, sound effects, streaks, leaderboards, points-for-speed. (A top 5 podium at the end of a live session was added at the owner's request, 2026-10-24.) |
| Answer layout | **NCLEX layout for every question type.**                                                                                                 | Kahoot-style colour+shape answer tiles. Colour-blind work goes into feedback marks and the teacher's results chart instead.                                   |
| Scope         | **Whole app**: live, practice, assignments, student home, teacher library and editors, classes, workspace, reports, auth, help.           | Nothing. Gallery pages get the new tokens for free but are not redesigned.                                                                                    |

The brief's "solo mode" maps to LeaRN's **practice** (ungraded, rationale at once) and **assignments** (graded, due dates). Both already need a student account through a class; nothing in this plan changes that.

Words follow `docs/glossary.md`: Quiz, Question, Live session, Join code, Teacher, Library, In this session, Report/Results.

## 1. How Phase 0 was done, and its gaps

- Read: `CLAUDE.md`, `AGENTS.md`, `docs/04-DESIGN-DIRECTION.md`, `docs/glossary.md`, `docs/ui-polish-log.md`, `package.json`, `src/styles/tokens.css`, the Next 16.3.4 docs in `node_modules/next/dist/docs` (CSS, supported browsers, view transitions).
- Installed: Node 22.21.0, pnpm 11.9.0, Next 16.3.4, React 19.2.8, Tailwind 4, Zod 4, Vitest 5, Playwright 1.63. Browser floor from Next: Chrome/Edge/Firefox 111, Safari 16.4, so container queries and `clamp()` need no fallback.
- Screenshots: 20 routes at 375×812, 844×390 (phone landscape), 768×1024, 1280×800 and 1920×1080, with overflow and tap-target measurements per capture (`shots/before/`, `shots/before/report.json`, script `shoot.mjs`).
- **Gap (closed after Checkpoint 1):** the local Supabase stack was not started at first (about 1 GB of memory free; it needs about 1.5 GB). Everything behind sign-in (library, quiz editor, classes, reports, student home, the real host and student live screens) was audited **from code** by a read-only agent, with key claims checked by hand. After Checkpoint 1 the stack ran and `shoot-signed-in.mjs` captured 31 more screens (teacher, student, and a live session with three phones), 248 captures in all, with no horizontal overflow anywhere.
- Research notes with sources: `RESEARCH.md` (copied into §4 below where it matters).

## 2. Screen and state inventory

**Live session.**

- Teacher (`/live/[sessionId]`, `HostLobby.tsx`):
  - lobby
  - question open: count, countdown, timer controls, question strip, results
  - answer showing
  - paused
  - ended: the code is struck through and a report link appears
  - student-paced: a progress board replaces the strip
  - case study: the patient record shows with a step marker
  - first-open failure (OFFLINE)
  - error.tsx
- Student (`/play/[sessionId]`, `StudentRoom.tsx`, `StudentPacedRoom.tsx`):
  - waiting: lobby, paused, ended, revealed copy
  - answering
  - answer sent
  - time up
  - revealed: marks, or the key with "You did not answer"
  - reconnecting (one grey line)
  - student-paced navigation
  - case study with the patient record
  - error.tsx
- Join (`/join`, `/join/[code]`): field errors, unknown or ended code.

**Self-paced.**

- `/learn` home: assignments, history, clinical judgment steps, classes, practice quizzes, join a class, welcome. It has four empty states and five inline "did not load" alerts.
- `/learn/practice/[bankId]`: the practice player.
- `/learn/assignments/[id]`: start screen, attempt player, summary.
- `/learn/assignments/[id]/results`.
- No `learn/error.tsx` and no `loading.tsx` anywhere under `/learn`.

**Teacher.**

- Library `/author`.
- Quiz page `/author/banks/[bankId]` (411 lines), with order, new, assign and AI import (three pages).
- Question editor `/author/items/[itemId]` (EditorShell, 520 lines) and its preview `/play`.
- Case study builder.
- Classes and a class.
- Workspace.
- Live sessions list.
- Assignment report and live session report.
- Only `/author/sessions` and `/author/workspace` have `loading.tsx`.

**Auth and public.** Sign in, sign up, account, password, confirm, welcome, class invite `/c/[token]`, workspace invite `/w/[token]`, landing, help (3), not-found, root error.

**States missing entirely:**

- the teacher sees nothing when the connection drops after the first open
- the student can press Submit while reconnecting
- a "refused" phone gets no copy
- the student gets no end-of-session screen, only "This live session has ended."
- no late-join message
- no projector or presenter layout
- no loading states for most signed-in routes
- no theme switch outside the gallery

## 3. Diagnosis

Severity: **High** = blocks a core job or fails WCAG AA; **Medium** = clearly hurts use; **Low** = polish.

| #   | Problem                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Screen(s)                                               | Severity               | Principle broken                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------- |
| D1  | Every signed-in page is one column capped at 768 px (`author/layout.tsx:57`, `learn/layout.tsx:39`, `live/[sessionId]/page.tsx:46`, help). 1280 and 1920 captures are identical; a 1920 screen is 60% empty.                                                                                                                                                                                                                                                                      | All teacher, student, host, help                        | High                   | M3 window size classes (layout per class, not one stretched); "no huge empty areas"                       |
| D2  | The patient record's two-pane switches on **viewport** width (`EhrPanel.tsx:120`, `lg:w-[45%]`) but renders inside the 768 px cap, giving a ~330 px record beside a ~400 px question at 1024+. The quiz page and case study builder squeeze a 16 rem sidebar into the same 768 px.                                                                                                                                                                                                | Question preview, assignment player, quiz page, builder | High                   | Container-relative layout; design doc §3's 45/55 split assumes full width                                 |
| D3  | **The teacher's live screen never shows the question text** (captured at 1920 during question 1: code, QR, 21 question buttons, timer, results, roster, but no stem). It is also not a projector screen: only the join code scales (`text-5xl lg:text-8xl`); answer count is `text-sm`, countdown `text-2xl`, results and roster small, all stacked under the code in 768 px. Research puts readable projector type at ~48 px minimum and the stem at 56–72 px on a 1080p canvas. | Live lobby, question, reveal                            | High                   | Distance legibility (24–32 pt slide guidance ≈ 48–64 px at 1080p; 1 in per 10 ft); Fitts/visual hierarchy |
| D4  | Names, controls and the projected view are the same screen. A teacher mirroring a laptop shows every student's name and every control to the room.                                                                                                                                                                                                                                                                                                                                | Live (teacher)                                          | Medium                 | Pear Deck / Mentimeter pattern: public projector, private dashboard; Hick's law for the teacher           |
| D5  | Teacher sees nothing when Realtime drops after the first open (`hostTransport.ts:260`, no `onConnection` in HostLobby); the roster silently freezes.                                                                                                                                                                                                                                                                                                                              | Live (teacher)                                          | High                   | Realtime trust; visibility of system status                                                               |
| D6  | Student reconnecting is one grey `text-sm` line (`StudentRoom.tsx:318`); Submit stays enabled; a refused phone gets no copy; no end-of-session or late-join screen.                                                                                                                                                                                                                                                                                                               | Live (student)                                          | High                   | Socrative's explicit named states; Doherty threshold; error prevention                                    |
| D7  | Phone landscape (844×390) gets the tablet layout with a fixed submit bar and sticky chrome, leaving ~250 px for the question.                                                                                                                                                                                                                                                                                                                                                     | All players                                             | Medium                 | M3 height classes (compact height < 480 dp); WCAG 2.4.11 focus not obscured                               |
| D8  | The reveal on the teacher's chart is not built for colour-blind viewers at distance: correct green and incorrect red have the same lightness (L 50%, both tokens), bars have 1 px rules that vanish at 6 m+.                                                                                                                                                                                                                                                                      | Live results, reports                                   | Medium                 | WCAG 1.4.1, 1.4.11; redundant encoding (Kahoot shapes lesson, applied to the chart)                       |
| D9  | 18 editor field classes use `border-line` (1.44:1) instead of `--line-field` (3.64:1). Secondary buttons use `--line` too.                                                                                                                                                                                                                                                                                                                                                        | Question editors, assign form, search                   | High                   | WCAG 1.4.11 non-text contrast 3:1                                                                         |
| D10 | 13 bare 20 px "this is correct" checkboxes/radios in editors, ~15 standalone back/breadcrumb links without `tap-target`.                                                                                                                                                                                                                                                                                                                                                          | Editors, AI import, case study pages, help              | Medium                 | WCAG 2.5.8 (24 px floor); HIG 44 pt / M3 48 dp target                                                     |
| D11 | System and form errors use `text-incorrect` (77 `role="alert"` lines), the same red as a wrong answer.                                                                                                                                                                                                                                                                                                                                                                            | All forms, home "did not load" lines                    | Medium                 | Design doc §1/§8 (red is feedback-only); semantic colour                                                  |
| D12 | Thin, underused component kit: `Surface` unused (95 hand-written card copies), 14 copies of one link class, 4 hand-built confirm panels instead of `Dialog`, no toast, no badge, no alert, 4 separate progress bars, icons hand-copied (GripIcon twice).                                                                                                                                                                                                                          | Everywhere                                              | Medium                 | Atomic design; DRY; consistency (Jakob)                                                                   |
| D13 | Only 2 `loading.tsx` and no `learn/error.tsx`; a tap on a slow phone looks dead.                                                                                                                                                                                                                                                                                                                                                                                                  | Library, quiz, student home, players, reports           | Medium                 | Visibility of status; Doherty threshold                                                                   |
| D14 | Type scale stops at 3xl (36 px); off-scale `text-5xl`/`text-8xl`/`text-4xl` used ad hoc; no fluid type; no container-relative type for the stage.                                                                                                                                                                                                                                                                                                                                 | Landing, live lobby                                     | Low                    | 8 pt grid / token layers; MDN `clamp()` guidance                                                          |
| D15 | Glass blur on the three fixed submit bars (`bg-surface-1/95 backdrop-blur-sm`); `shadow-md` with no shadow token; dead `rounded-xs`.                                                                                                                                                                                                                                                                                                                                              | Players, order editor                                   | Low                    | Design doc §8 anti-patterns; token discipline                                                             |
| D16 | No user-facing theme control; dark mode follows the OS only.                                                                                                                                                                                                                                                                                                                                                                                                                      | All                                                     | Low                    | User control; projector needs a forced light stage                                                        |
| D17 | Files over the 400-line guide: HostLobby 558, EditorShell 520, StudentRoom 453, help/instructor 451, AiImportUpload 414, quiz page 411. The overhaul touches all of them.                                                                                                                                                                                                                                                                                                         | Code                                                    | Medium (for the build) | Small focused files; parallel agents need seams                                                           |

What already works and stays:

- No page scrolls sideways at any captured size, from 375 to 1920.
- Token discipline is strict: `--color-*: initial`, so palette classes produce nothing.
- `tap-target` is used 185 times, and every `Button` has it.
- Question players have 44 px rows.
- Feedback marks pair colour with an icon and a word.
- Motion is CSS-only and respects reduced motion.
- The QR encoder is hand-written and tested.
- Server deadlines drive the countdown.

## 4. Frameworks applied

**Touch targets and layout.**

- Apple HIG: 44×44 pt is the default hit target and 28 pt the minimum; body text defaults to 17 pt. ([HIG accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility))
- Material: 48×48 dp targets, at least 8 dp apart. ([Android a11y](https://support.google.com/accessibility/android/answer/7101858))
- LeaRN keeps `--tap-min: 44px` as the design target, with WCAG 2.5.8's 24 px as the hard floor for dense teacher tables.
- Window size classes come from M3 ([Android window size classes](https://developer.android.com/develop/ui/compose/layouts/adaptive/use-window-size-classes)):
  - width: compact < 600, medium 600–839, expanded 840–1199, large 1200–1599, extra-large ≥ 1600
  - height: compact < 480, for landscape phones

**WCAG 2.2 AA.**

- 1.4.3 contrast: 4.5:1 for text, 3:1 for large text.
- 1.4.11 non-text: 3:1 for field borders, chart bars and focus rings.
- 1.4.10 reflow at 320 px: data tables such as the matrix grid and record tables may scroll inside themselves; the page may not.
- 1.4.4 resize: no viewport-only font sizes ([F94](https://www.w3.org/WAI/WCAG22/Techniques/failures/F94)).
- 1.4.1 use of colour.
- 2.4.7 focus visible.
- 2.4.11 focus not obscured: a sticky submit bar needs `scroll-padding-bottom`.
- 2.5.8 target size, 24 px.
- 2.2.1 timing adjustable: Level A. Assignment timers must be extendable; a teacher-run live question counts as a real-time event, but extend-time stays one tap away.
- Reduced motion: `prefers-reduced-motion` collapses motion to opacity (design doc §5).
- Colour-blind safety: every correct, incorrect or missed mark keeps its icon and word (already a rule). The teacher's results chart uses one neutral bar hue, prints the option letter and count on every bar, and marks the key with a check, the word "Correct" and a 3 px outline. Red and green are never adjacent fills.

**Laws of UX** ([lawsofux.com](https://lawsofux.com/)).

- Fitts: full-width answer rows, and Submit and Next in the bottom thumb zone on phones.
- Hick: one primary action per live state, with teacher controls grouped in one bar.
- Jakob: the NCLEX/UWorld layout for questions, and the Kahoot/Mentimeter flow of a code on the big screen typed on the phone.
- Peak-end: design the reveal and the end-of-session summary deliberately, calm and informative.
- Doherty: "Answer sent" appears within 400 ms, optimistically, then confirms.
- Goal-gradient: "Question 7 of 12" progress everywhere.
- Zeigarnik: "Resume assignment, 5 left" on the student home.

**8 pt spacing grid.** The existing `--space-*` tokens (4, 8, 12, 16, 24, 32, 48) stay. Two are added: `--space-16` (64) and `--space-24` (96), for stage and section rhythm. Layout gaps use multiples of 8, and 4 and 12 are for inside components.

**Three token layers** (all in `src/styles/tokens.css`, mapped into Tailwind with `@theme` in `globals.css` as today):

1. **Base:** raw oklch ramps (`--blue-38`, `--blue-44`, `--green-50`, `--neutral-20` ... `--neutral-100`), the type ramp, space, radii, durations. Nothing in components may read these.
2. **Semantic:** what exists today (`--surface-*`, `--ink-*`, `--line*`, `--accent*`, `--correct*`, `--incorrect*`, `--flag*`), plus new ones:
   - `--notice` and `--notice-soft`: system messages, neutral ink with an icon, not feedback red
   - `--stage-*`: projector surface, ink and stroke
   - `--elevation-1`: one shadow, for dragged tokens and dialogs only
   - `--text-stage-*`: fluid projector sizes
3. **Component:** `--button-*`, `--field-border` (= `--line-field`), `--option-*`, `--submitbar-height`, `--chart-bar`, `--chart-key`, `--joincode-size`. Components read only layers 2 and 3.

**Atomic components.**

- Atoms: Button, TextLink, Field, Badge, Icon, Spinner, ProgressBar, Skeleton, Kbd.
- Molecules: Alert/Notice, Toast, Card (= `Surface`), ConfirmDialog, Sheet, EmptyState, JoinCode, CountdownBar, AnswerCount, ConnectionStatus.
- Organisms: AppShell (teacher, student), StageShell (projector), SubmitBar, ResultsChart, Roster, RecordLayout.
- Templates: list/detail, player, stage.

## 5. Lessons from live-quiz and qbank apps (structural only)

Sources are in `RESEARCH.md`. [V] means checked on the vendor's own page; [S] means a secondary source.

1. **Join panel: the code and a short URL first, the QR code second.**
   - A QR code scans from about 10× its width, so on a projector it only works for the front rows.
   - The code must read from the back of the room: at least 160 px monospace at 1080p.
   - Kahoot [V](https://support.kahoot.com/hc/en-us/articles/360000109048), Mentimeter [V](https://help.mentimeter.com/en/articles/410537-how-to-vote) and Pear Deck [V](https://docs.goguardian.com/products/pear-deck/present-a-session) all show the code and URL together.
2. **Join info stays reachable after Start**, so late students can get in.
   - Kahoot keeps the PIN up under 2-Step Join [V](https://support.kahoot.com/hc/en-us/articles/35342050693789).
   - Jackbox lets the host hide the room code [V](https://jackboxgames.com/the-jackbox-party-pack-5-streamers-guide/).
   - LeaRN: a small join strip on the stage during questions, with a one-key "Show join code" overlay.
3. **The room sees a count; only the teacher sees names.**
   - Mentimeter's "X out of Y responded" [V](https://help.mentimeter.com/en/articles/4542951-how-many-responses-have-i-received).
   - Pear Deck keeps the projector anonymous and puts names on a private dashboard [V](https://help.peardeck.com/use-the-projector-view-and-teacher-dashboard-at-the-same-time).
4. **The reveal is three states:** collecting (no chart), then closed with the distribution, then the answer key marked.
   - Poll Everywhere's activity flow [V](https://blog.polleverywhere.com/activity-flows-available).
   - Mentimeter hides results while answers come in [V](https://help.mentimeter.com/en/articles/422266-hide-results).
   - LeaRN today goes straight from collecting to the key. The plan adds a "Close answers" step only if the owner wants it (see Checkpoint 1); otherwise the chart appears with the key, as now.
5. **One option order everywhere.** Projector and phone show the same order and the same A/B/C labels. Kahoot's shuffle is one setting for the whole game, not per device [V](https://support.kahoot.com/hc/en-us/articles/27877912748051-How-to-randomize-questions-for-Kahoot-games).
6. **The phone has explicit named states, each with one sentence and at most one action:** Waiting, Answering, Answer sent, Paused, Answer showing, Ended, Reconnecting, Can't rejoin. Socrative documents exactly this [V](https://help.socrative.com/en/articles/15195950-the-student-experience-in-socrative).
7. **Reconnect by identity and resume.** Socrative does this. Kahoot's "refresh = score reset" [V](https://support.kahoot.com/hc/articles/115003198708) is the anti-pattern. While reconnecting, LeaRN disables Submit and keeps the draft answer.
8. **Timers are optional and extendable:** Kahoot [V](https://kahoot.com/accessibility/), Jackbox's extended timers, and WCAG 2.2.1. Show "0:12" as text beside the bar, never only a ring.
9. **Self-paced follows the qbank pattern students already use.** UWorld runs Tutor mode (rationale at once) and Timed mode, plus Incorrect and Marked pools [V](https://nursing.uworld.com/blog/7-tips-for-using-the-uworld-nclex-qbank/). LeaRN's practice already works like Tutor mode, and assignments like an exam. The results screen gains "Review the ones I missed", and optionally "Practise them again" (see Checkpoint 1).
10. **Progress "n of N" and a stable bottom action.** Duolingo puts Check/Continue in one fixed place [S](https://uxdesign.cc/duolingos-usability-analyzed-6bb44b0f2366).
11. **Design the end of a session.** Superseded in part on 2026-10-24: the owner asked for a top 5 podium on the projector (`StagePodium`), so the stage now shows the podium with the summary's numbers along its foot, and the summary alone when nobody scored. The phone is unchanged:
    - the teacher's stage shows a calm summary: questions run, the answer rate, and the hardest question by step
    - the student's phone shows "You answered 8 of 10. Your teacher has the report." and a link to their results if they have an account

Things the brief asked for that this plan leaves out on purpose:

- color+shape answer tiles
- confetti, sound, streaks and the leaderboard re-ranking animation (the podium was added later at the owner's request; see §5.11)

Also note there was no mobbin.com access (it needs a login), so the plan makes no Mobbin claims.

## 6. Responsive strategy (a layout per size class, not one stretched)

The size classes follow M3 widths. LeaRN's existing `sm/md/lg` Tailwind breakpoints map onto them, and the plan adds `xl` (1280) and `2xl` (1600):

| Class                            | Width                                                  | Teacher pages                                                                                                       | Student players                                                                                                  | Live (teacher)                                                                                                              | Live (student phone)                                     |
| -------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Compact                          | < 600                                                  | Top bar with a menu sheet; lists as stacked cards; primary action in a bottom bar                                   | Single column; patient record as a bottom sheet from a chip; Submit in a fixed bottom bar with the safe area     | Control view: big Start/Next/Show answer bar at the bottom, count and timer on top. Teachers can run a session from a phone | The main case: full-height states, Submit in thumb reach |
| Compact height (landscape phone) | height < 480                                           | —                                                                                                                   | Submit moves into a slim right-edge column; header collapses to one 40 px line; the record opens as a side sheet | Same as compact                                                                                                             | Same as the player                                       |
| Medium                           | 600–1023                                               | Two-pane list/detail where there is a list (quiz page: folder rail collapses to chips)                              | Record as a top drawer with tab chips (design doc §3)                                                            | Control view                                                                                                                | Same as compact with wider measure                       |
| Expanded                         | 1024–1279                                              | Content max 1200 px; quiz page and builder get their 16 rem rail beside the content                                 | Record and question split 45/55 by **container** query on the player, not viewport                               | **Two layouts on one route:** control view (full controls, names, results) or stage view (see below)                        | —                                                        |
| Large / XL                       | ≥ 1280                                                 | Content max 1200 px for reading pages; tables and reports may go to 1440; side rail 18 rem; reading text stays 68ch | Record pane gets max 640 px, question max 760 px, centred as a pair                                              | Stage view fills the screen                                                                                                 | —                                                        |
| Projector                        | Stage view at any size, designed on a 1920×1080 canvas | —                                                                                                                   | —                                                                                                                | Full-bleed, light stage theme, type in container units with rem floors                                                      | —                                                        |

**Stage view** (the projected screen) is a `container-type: size` region, so its type scales with the stage, not the window.

- Sizes on a 1080 px-tall stage:

  | Element                 | Size                                |
  | ----------------------- | ----------------------------------- |
  | join code               | `max(4rem, 15cqb)`, about 160 px    |
  | question text           | `max(2rem, 6cqb)`, about 64 px      |
  | option and row text     | `max(1.75rem, 4.5cqb)`, about 48 px |
  | count and timer numbers | `max(2.5rem, 9cqb)`                 |
  | labels                  | at least 32 px                      |

- Strokes are at least 3 px.
- Any `clamp()` keeps its max at no more than 2.5× its min (WCAG 1.4.4, per [Smashing](https://www.smashingmagazine.com/2023/11/addressing-accessibility-concerns-fluid-type/)).
- A teacher "Text size" control (S / M / L) shifts the scale, which also covers 1.4.4.
- The stage shows the question and its options, never the patient record body. For a case study it shows the patient header and the tab name, and students read the record on their phones.

**Fluid type for the app.**

- Headings use `clamp()` with rem bounds (h1: `clamp(1.75rem, 1.4rem + 1.2vw, 2.5rem)`).
- Body text stays at 16 px (`--text-base`). The question text stays at `--text-lg`, which the design doc ties to NCLEX fidelity.

**Container queries are used where a component appears at more than one width:**

- RecordLayout: 45/55 at a container width of 900 px or more
- ResultsChart: horizontal bars, or a vertical list below 480 px
- option rows and matrix (cards below 560 px of container)
- the list/detail panes
- the Roster

**Never a horizontal page scroll from 320 to 1920.** The matrix grid and record tables scroll inside their own region with a sticky first column (1.4.10's data-table exception).

## 7. Motion and sound

- **Sound: none.** This is an owner decision and design doc §8, so there is no sound toggle.
- Motion stays CSS-only (transform, opacity, clip-path) with the existing tokens. React 19.2's `<ViewTransition>` (shipped with Next's App Router, no config; see `node_modules/next/dist/docs/01-app/02-guides/view-transitions.md`) adds:
  - a crossfade with an 8 px slide between live states (lobby to question, question to answer showing)
  - a directional slide between case study steps
  - a Suspense-to-content fade for the new loading states
  - Without browser support, nothing animates and nothing breaks.
- Timer pressure stays calm:
  - the bar drains smoothly, as it does today
  - the last 10 s shift the bar to `--flag` amber with "10 s left" in text (needs owner OK, because the design doc keeps amber for feedback)
  - no pulse and no loop (design doc §5: nothing loops)
- "Answer sent": a check icon arrives with the existing `motion-arrive`, and the answer becomes read-only.
- Reveal: the marks stagger at 40 ms each, 320 ms in total, as today. The teacher's chart bars grow with `scaleX` from 0 over 320 ms, one time only.
- The results chart's bars and the roster count settle once. Nothing counts up.
- Reduced motion collapses all of this to an 80 ms opacity change. View transitions get `animation: none` under `prefers-reduced-motion`.

## 8. Libraries

Use what's installed first. Nothing is added without owner approval (see Checkpoint 1).

| Need                              | Recommendation                                                                                                | Why                                                                                                                                                                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tokens                            | **Tailwind 4 `@theme` + `tokens.css` (installed)**                                                            | Already the system; three layers fit in one file plus `@theme` mapping.                                                                                                                                                              |
| Dialog, sheet, confirm            | **Keep the native `<dialog>` primitive (installed, `ui/Dialog.tsx`)**; extend it into ConfirmDialog and Sheet | It already handles focus trap, Esc, scroll lock and reduced motion; Radix would duplicate it.                                                                                                                                        |
| Menus (account, teacher overflow) | **Native `popover` attribute + anchor positioning fallback** (no dependency)                                  | Baseline in the supported browsers; one menu pattern needed. Radix only if a combobox appears.                                                                                                                                       |
| Toasts                            | **Small in-house `Toast` on `aria-live` + the `popover` top layer**                                           | Only "Saved", "Copied", "Reconnected"; a library is more than this needs.                                                                                                                                                            |
| Layout and leaderboard animation  | **React `<ViewTransition>` (installed with Next)**, not Motion                                                | No leaderboard; state crossfades are what is needed, and they ship with React 19.2.                                                                                                                                                  |
| Confetti                          | **None**                                                                                                      | Owner decision.                                                                                                                                                                                                                      |
| Icons                             | **`lucide-react` (new dependency, needs approval)**                                                           | The design doc already names Lucide at 20 px, stroke 1.75; the app has 18 hand-copied SVGs and needs ~25 more (alert, wifi-off, check-circle, clock, users, maximize, menu). Tree-shaken per icon. Pin with `^` like the other deps. |
| QR                                | **Keep `src/lib/live/qrCode.ts` (installed, tested)**                                                         | Already renders a crisp server-side SVG.                                                                                                                                                                                             |
| Drag                              | **Keep `@dnd-kit` (installed)**                                                                               | Ordering and drag-and-drop players already use it.                                                                                                                                                                                   |

## 9. Visual direction: "Clinical Editorial, stage edition"

The current direction holds, made bolder where the old one was too timid: scale contrast, a real stage, and stronger rules instead of hairlines.

- **Character.**
  - It reads like a well-set exam paper on warm off-white.
  - Hierarchy comes from big type steps and rules, not boxes and shadows.
  - One deep clinical blue is used only for interaction.
  - Feedback colours appear only when an answer is marked.
  - The projector stage is the one place the type gets huge: a stage, like a lecture slide, not a game show.
- **Type pairing (installed fonts):**
  - Inter for the interface and question text
  - Source Serif 4 for the patient record and the large display headings: library title, stage question, end summary
  - JetBrains Mono for codes, vitals, timers and counts
  - This lets the serif carry the "editorial" voice at display sizes.
- **Icons:** Lucide at 20 px with a 1.75 stroke in the app, and 32–40 px with a 2.5 stroke on the stage.

Palette, unchanged hues, contrast measured from the current tokens (`contrast.mjs`):

| Pair                                             | Light | Dark  | Passes                                                                 |
| ------------------------------------------------ | ----- | ----- | ---------------------------------------------------------------------- |
| ink-1 on surface-0                               | 17.34 | 15.77 | AAA                                                                    |
| ink-2 on surface-0                               | 7.44  | 7.58  | AAA (normal text)                                                      |
| ink-2 on surface-2                               | 6.91  | 6.07  | AA                                                                     |
| accent on surface-1 (buttons, focus)             | 7.77  | 8.11  | AA text, UI                                                            |
| accent-contrast on accent (primary button label) | 7.55  | 9.09  | AA                                                                     |
| accent-ink on accent-soft (selected option)      | 8.36  | 7.84  | AA                                                                     |
| correct on surface-1                             | 5.65  | 8.48  | AA                                                                     |
| correct on correct-soft                          | 4.95  | 7.28  | AA                                                                     |
| incorrect on surface-1                           | 6.55  | 7.04  | AA                                                                     |
| incorrect on incorrect-soft                      | 5.57  | 6.03  | AA                                                                     |
| flag on surface-1                                | 3.72  | 8.55  | UI only in light (not for text)                                        |
| line-field on surface-1 (field borders)          | 3.64  | 3.72  | 1.4.11                                                                 |
| line-strong on surface-1                         | 2.48  | 2.65  | **fails 3:1**: decorative only; secondary buttons move to `line-field` |
| line on surface-1                                | 1.44  | 1.36  | decorative dividers only                                               |

New tokens:

- `--notice` = ink-1 with an info icon on `--surface-2`, for system messages (not red).
- `--stage-surface` = pure white.
- `--stage-ink` = oklch(15%).
- `--stage-stroke` = 3 px.
- `--chart-bar` = `--line-field`.
- `--chart-key` = `--correct`, plus an outline and the word "Correct".

The stage is always light, because projectors cannot make true black and dark slides wash out in lit rooms. That's a judgement, not a sourced claim; I'll test it in the mockups at 1920.

## 10. Roadmap

Each phase is one PR into `feat/ui-overhaul`. `feat/ui-overhaul` goes to `main` only by PR, after you say so. There are no migrations unless Checkpoint 1 adds "Practise the ones I missed" or "Close answers"; those need a data change, and I'd ask first.

| Phase                                   | Content                                                                                                                                                                                                                                                                                                                                                                                      | Depends on |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **F0 Foundation**                       | Three-layer tokens, stage tokens, fluid type, `xl`/`2xl`; atoms and molecules (Button variants, TextLink, Field, Badge, Icon via lucide, Notice/Alert, Toast, Card, ConfirmDialog, Sheet, ProgressBar, Skeleton, JoinCode, CountdownBar, AnswerCount, ConnectionStatus, ResultsChart); AppShell (teacher, student) replacing the 768 px cap; StageShell; theme menu. Gallery pages for each. | —          |
| **F1 Contracts**                        | `LiveViewState` types for teacher control, stage and student phone (pure functions from `LiveSessionState` + connection status); `useConnection` for host and participant transports; `useCountdown` shared; `sizeClass` helpers. Tests first.                                                                                                                                               | F0         |
| **A Join + lobby**                      | `/join`, `/join/[code]`, lobby control view, lobby stage, student waiting/late-join/refused/ended states                                                                                                                                                                                                                                                                                     | F1         |
| **B Live question loop**                | Control view (results, timer, strip, roster, connection banner), stage view (question, count, timer, reveal chart, end summary), student answering/sent/reconnecting/revealed; split HostLobby and StudentRoom under 400 lines                                                                                                                                                               | F1         |
| **C Players and results**               | RecordLayout by container query, landscape-phone layout, SubmitBar (no blur, focus not obscured), practice player, assignment start/attempt/summary/results, live and assignment reports with ResultsChart                                                                                                                                                                                   | F0         |
| **D Teacher area**                      | Library, quiz page (list/detail with rail), editors (field contrast, 44 px correct-answer toggles, split EditorShell), case study builder, AI import, classes, workspace, sessions                                                                                                                                                                                                           | F0         |
| **E Student home, auth, help, landing** | `/learn` home (resume first), sign in/up, account, invites, help, landing, error/not-found, all missing `loading.tsx`/`error.tsx`                                                                                                                                                                                                                                                            | F0         |
| **G Gates**                             | typecheck, lint, tests (coverage gates), build, `gallery:closed`; code and security review; visual check of every mockup screen at five sizes; live run with one teacher and three phones; keyboard-only, focus, reduced motion, colour-blind (simulated); 320–1920 overflow sweep                                                                                                           | all        |

**How the builds run on this machine.**

- 16 GB, shared with other projects. There's one local builder at a time, with no Supabase stack or dev server while builders run.
- A, B and C can run as cloud routines in parallel, each on its own branch from the F1 commit, with the base commit checked. Cloud routines can push branches; I open the PRs locally.
- D and E are large and can follow the same pattern.
- Each branch merges back into `feat/ui-overhaul`, and I resolve the conflicts.
- Screenshot regression: the 78 existing baselines will all change. The CI-generated baselines get regenerated once, at the end, per `docs/05`.
- Tests that match visible text move with the copy (`exact: true`).

## 11. Checkpoint 1 answers (owner, 2026-10-22)

1. Live: one route, control view + full-screen projector (stage) view, which can open in a second window. **Yes.**
2. Names on the stage in the lobby only; counts after Start. **Yes.**
3. No "Close answers" step; the reveal stays collecting → key. **Yes, keep it.**
4. "Review what I missed" on results **and** "Practise the ones I missed" (a new practice run of just the missed questions), **including the DB change**. The migration PR waits until the owner can run the hosted push.
5. Last 10 s: the bar turns `--flag` amber with "10 s left" in text; no pulse. **Yes** (amends design doc §1/§5).
6. Add `lucide-react`. **Yes.**
7. System / Light / Dark theme menu in the account menu; the stage is always light. **Yes.**
8. Capture the signed-in screens with the local stack (the owner OK'd stopping the Findamine dev server). Cloud agents may take any build work where it makes sense.
