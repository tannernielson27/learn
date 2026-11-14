# Landing direction B: Lit screen (#563)

Branch `design/563-landing-b`. One of three spikes; the owner picks one on a phone.

## The direction

The landing page opens on a full-bleed navy band, like a dark lecture hall. The projector is lit inside it, always light, with students' phones standing in front of its lower edge. The headline is bold Inter with tight tracking. Below the band the page is paper on a strict 12-column grid: a heading column on the left, content on the right, a strong 2px rule over each section, and large numerals for the steps and the price. The band comes back once at the foot for the last call to action. Depth comes from overlap (phones over the projector edge, and over the band edge from 1024px), not from shadows or gradients. The serif is not used on these pages.

## Departures from docs/04

- **A brand surface that is not the accent.** docs/04 keeps blue for interactive and selected states only. The band is a deep ink-navy (`oklch(21% 0.055 258)`), near-black with a blue cast, used as a surface and never for a control. A paper landing page with one blue button reads as the inside of the app; the issue asks for a front door. Confined to marketing pages: the landing page and the (site) bar. Never in the app, the player or a live session.
- **Own buttons on the band.** The app's primary blue is 2.2:1 on navy, so the band's main action is a paper button (17:1) and the second an outlined one with a 5.3:1 edge (`brandButtonClasses`). Focus rings on the band use `--brand-focus` (10:1). The join code card is paper inside the band, so it uses the app's own field and Join button unchanged.
- **Display type.** Bold Inter at up to 64px (`--text-hero`) with -0.035em tracking, instead of the serif display heading. Numerals at up to 88px (`--text-numeral`).
- **A third radius.** Phones in the picture have 20px corners (`--radius-device`, `--radius-device-screen`). A phone drawn with 8px corners reads as a card.
- **Motion on the landing page.** The picture plays once in view (about 1.6s): phones rise, a choice settles on each, the count arrives. Transform and opacity only, never loops, no pause control needed (under 5s). Reduced motion and no JavaScript show the last frame (`scripting: enabled` guards the hidden first frame).

## Tokens added (`src/styles/tokens.css`)

Base: `--navy-14`, `-21`, `-26`, `-34`, `-64`, `-84`, `-97`. Semantic, re-lit for dark (the band goes deeper than the dark page, `--navy-14`): `--brand-surface`, `--brand-surface-raised`, `--brand-ink` (16:1), `--brand-ink-2` (10.9:1), `--brand-line`, `--brand-line-strong` (5.3:1), `--brand-focus`, `--brand-action`, `--brand-action-hover`, `--brand-action-ink`, `--device-bezel`. Component: `--text-hero`, `--text-section`, `--text-numeral`, `--tracking-display`, `--text-demo-*` (picture sizes in container units with rem floors), `--radius-device`, `--radius-device-screen`. No new font; the three loaded families are enough.

## How it carries

- **Pricing, terms, privacy:** done here. The navy bar with the wordmark, Pricing, Help and Sign in; paper below; pricing on the same grid with the price as a numeral.
- **Footer:** done here, on every public page (help, sign-in and sign-up included): wordmark, links, the fictional-patient line, under a 2px rule.
- **Help (/help):** next. Swap the AppShell bar for `SiteHeader`, keep its own nav as a second row on paper; bold Inter page headings.
- **Sign-in and sign-up:** a short navy band with the wordmark and the page heading, the form on a paper card overlapping its lower edge, as the join card does.
- **/join:** the same paper card on a navy band. The phone screen stays paper: students are in a lit classroom.
- **The app, later:** the band does not go in. The app can take the bold Inter headings, the numerals for counts and scores, and the strong section rules. The wordmark can replace the serif one in AppShell as a variant.

## Owner questions

1. Social proof: there are no quotes, school names, logos or counts, so none are shown. Is there anything true and approved to put under the hero (a pilot school, a faculty quote)?
2. Import: Import with AI is behind a flag, so step 1 says "Write a quiz" only. Is it on for every paid workspace, so the step can say "Write or import a quiz"?
3. The domain on the projector in the picture is `learnursing.app/join`. Is that the address students will type?
4. "Start your free trial" now also labels pricing's button (one `landingEntry`). A student who taps it reaches sign-up and picks "I am a student". Is that acceptable?
5. Should the navy band also frame sign-in, sign-up and /join (see above), or stay on the landing page and the site bar?

## Decisions

- The landing join form is a GET form to `/join`; `/join?code=` checks the code with the shared `checkJoinCode` and sends a good one to `/join/[code]`, where the student adds a display name. With JavaScript the same check runs in the form first.
- The code field allows 9 characters, as on /join, so "ABC DEF" copied off a screen still fits.
- The phones are hidden from assistive technology: they repeat the projector's question. The figure has a caption.
- The landing header has Pricing and Help only; Sign in is beside the main action, so there is one Sign in on the page.
- Visual baselines in `e2e/__screenshots__` for the landing, pricing and footer pages are stale and were not regenerated.
