# Landing spike C: patient record (#563)

## The direction

The patient record is the brand. Pages read like a well-kept flowsheet: section time stamps in JetBrains Mono ("0900 In class"), small-capital labels, tabular numbers, hairline rules and faint grid paper behind pictures. The live session is shown as an annotated specimen: the projector view and two or three phones answering one question, with four numbered callouts (join code, answer count, NCLEX layout, reveal) and a legend that says what each one is. One signature hue, record ink, marks the brand. The tone is calm, exact and sure of itself, not loud.

## Departures from docs/04

- **A signature hue, record ink** (`--brand`). docs/04 allows one clinical blue, for interaction only. Record ink is a separate blue-black (hue 264, near indigo) used only for marks that are never controls: the wordmark's RN, time stamps, callouts, step numbers. It is never green, red or amber, so it cannot read as feedback, and never on a button or link, so it cannot read as the accent.
- **Grid paper** (`grid-paper` utility). docs/04 takes depth from lines, not texture. The grid is a flowsheet's rules at about 1.1:1, used only behind the specimen, never behind running text.
- **A larger headline** (`--text-hero`, 28px to 56px). `--text-display` stops at 40px, which is small for a front door on a 1280px screen.
- **Mono as a voice, not only for numbers.** docs/04 keeps mono for vitals, labs and time stamps. Here it also sets section markers and small labels. That is the same job, a time stamp, used as structure.
- **Phones in the specimen are light**, like the projector, so the picture reads as one exhibit in either theme. The page around them follows the theme.

## Tokens added (src/styles/tokens.css)

- Base: `--inkblue-34`, `--inkblue-80`, `--inkblue-96`, `--inkblue-25`, `--grid-93`, `--grid-90`, `--grid-23`, `--grid-27`, `--text-hero`.
- Semantic, set again for dark: `--brand` (record ink), `--brand-soft`, `--grid-minor`, `--grid-major`.
- Component: `--grid-step`, `--grid-major-step`, `--callout-line`, `--specimen-phone`.
- Utilities in globals.css: `grid-paper`, `text-hero`, `text-brand`/`bg-brand`, and the specimen's `data-cue` motion (transform and opacity, once, done in about 2.4 seconds; reduced motion shows the finished picture).

No new font and no new dependency: Source Serif 4, Inter and JetBrains Mono already load.

## How it carries

- **Pricing** (done here): the time stamp over the heading, the price on a ruled card with numbered lines, the questions on rules. The main action reads "Start your free trial" for a visitor (`trialEntry`); a signed-in visitor keeps their own home and its label.
- **Site shell** (done here): `SiteHeader` (record-ink top rule, wordmark, one mono line, Pricing and Sign in) and the restyled `SiteFooter`. `AppShell` is unchanged.
- **Help guides**: put `SiteHeader` in the help layout; a time stamp over each guide's sections; the question guide's format list as the ruled table on the landing page.
- **Sign in and sign up**: `SiteHeader` above the form frame; the form on a ruled card like the join door. No grid paper behind fields.
- **/join**: the wordmark becomes `Wordmark`; the join code field is already mono. A small "Join a live session" label in record ink, as on the landing door.
- **Later, the app**: record ink for the wordmark and section stamps only; the accent stays the one interactive colour. Grid paper never enters the player or the projector.

## Decisions

- The landing join field is a plain GET form to `/join`. `/join?code=` now sends a good code on to `/join/[code]` and shows the join form's own message for any other (`readJoinCode` in `src/lib/live/joinForm.ts`, shared with the field's JavaScript check).
- The specimen plays only if it starts below the fold. If it is already on screen when the page arrives, it stays as the finished picture, so nothing is blanked and redrawn.
- The specimen's words come from the multiple choice fixture. Only the stem, the choices and the step label are read; a test checks the rendered page for the key, ids and rationale, with a control.
- `public/landing/sample-case-study.png` is no longer used. It is left in place.

## Owner questions

1. Social proof: there is none on the page. Do you have a quote, school or number you can stand behind? It would sit between the specimen and "How it works".
2. Is record ink right as the brand colour, or should the brand stay in the clinical blue?
3. Should "Start your free trial" go to sign-up (today) or straight to setting up a workspace and Billing?
4. Is `learnursing.app/join` the address students will see on the projector in production?
5. The header keeps Sign in although the hero has it too. Keep both, or drop the header one on the landing page?
