# Landing spike A: editorial (#563)

## The direction

The public site reads like a well-set journal page. Warm paper, near-black ink, and Source Serif 4 at display size for the headline, section heads and the price; Inter for everything else. Clinical blue appears only on what can be pressed. The page runs on an asymmetric 12-column grid: a narrow column carries a mono section number and a serif head, a wide one carries the content. Each section opens with a near-black rule, and lists sit between hairlines. The live session is drawn, not photographed: a projector screen with a roller line, and three phones standing in front of its frame, all in lines and paper.

## Departures from docs/04

- **Large serif outside the projector.** docs/04 keeps huge type for the stage. The front door needs a voice, so the site gets two display sizes (`--text-hero`, `--text-section`), both rem-bounded within 2.5x.
- **A third radius, for drawing only.** A phone at 8px reads as a card. `--radius-device` is used by the drawn phones and nothing that can be pressed.
- **Near-black rules.** docs/04 takes depth from a 1.4:1 `--line`. Section openings use `--rule-strong` (ink) so the page has a spine on a wide screen. Lines inside sections stay `--line`.
- **Restrained line illustration.** docs/04 §7 allows it on the marketing page; the live session drawing is the only one.

No new font. No shadow beyond `--elevation-1` (none is used here).

## Tokens added (src/styles/tokens.css)

- Base: `--text-hero`, `--text-section`, `--content-site` (86rem).
- Semantic, re-lit for dark: `--surface-band` (a deeper paper for one band and the footer), `--rule-strong`, `--device-line` (3:1 against the page in both themes).
- Component: `--radius-device`, `--demo-step` (the drawing's step gap), and the drawing's type `--text-demo-label`, `--text-demo-stem`, `--text-demo-option`, `--text-demo-number`, `--text-demo-phone`.
- Classes in globals.css: `.display-hero`, `.display-section`, and the `[data-demo]` play-once rules.

## How it carries

- **Pricing** (done): the headline and the price side by side from 1024px, the price at hero size in a ruled column, then the button with the free trial's terms directly under it, then what the price covers; the questions under a near-black rule, each in the serif.
- **Terms and privacy** (done): the new header and footer; the title in `.display-section` and the date in the mono label style; each section opens under a near-black rule with its mono number, and its text keeps the reading width (68ch). The contents sit sticky in the narrow left column from 1024px and are a plain list above the text on a phone.
- **Offer facts**: the price, the trial, the teacher cap and "free for students" come from `src/lib/site/offer.ts`, which reads billing and the workspace's limits. The terms keep their own approved words; a test checks they still agree.
- **Help**: the same header and footer; guide titles in `.display-section`; each guide section opens with a rule and a mono number, as the landing does.
- **Sign-in and sign-up** (done, in `AuthFrame`, so the account, welcome and invitation pages share it): the wordmark over a single column on paper, a near-black rule opening the column, the heading in `.display-section`, the form unchanged, and the site footer. No site header: its Sign in would repeat the page, and the form must be in the first screen. Sign-up names the 7-day free trial under the heading unless the link is a student's. No drawing.
- **/join** (done): the wordmark swaps in for the plain one. Nothing else changes: a phone in class needs the form, not the brand. The join code and name fields carry a scroll margin, so when the phone keyboard scrolls one into view, Join comes with it.
- **Later, the app**: the wordmark in AppShell, `.display-section` for library and quiz titles. Section rules and numbers stay on the public site; the app keeps its quieter lines.

## Decisions

- The join code form posts to a Server Action (`openJoinCode`) that reads the code with the join form's own rule (`parseJoinCode`, extracted from `parseJoinForm`) and redirects to `/join/[code]`. It works without JavaScript; a refusal comes back under the field. The field takes 9 characters, as `/join` does, so "ABC DEF" pasted with its space still fits.
- `landingEntry` now labels the visitor's link "Start your free trial" (glossary, Free trial). It still goes to /sign-up, and pricing uses the same label. Signed-in labels are unchanged.
- The public header is its own component (`SiteHeader`), not an AppShell variant, so the signed-in app's bar is untouched. Signed in, the landing header drops Sign in.
- The demo uses the gallery's multiple choice fixture through `stageQuestion`, so only the question and option words reach the page. The phones pick A and C: a student's choice, never a mark.
- The drawing plays once in under 1.5s, so it needs no pause control.

## Owner questions

1. Social proof is left out. Is there anything true to show: a pilot program, a named faculty member who agrees to be quoted, a count you are happy to publish?
2. Should the free trial button say what happens next ("Card at checkout, cancel any time")? It is on /pricing today.
3. Is "For nursing faculty" the right audience line, or should it name schools and programs?
4. The wordmark boxes "RN". Keep it, or try the favicon's blue mark beside a plain wordmark?
