# Sprint 11: Demo

**Goal:** an outside instructor onboards cold and runs a class without help (Demo 12).

Sprint 11 is the last Phase 4 sprint. It covers:

- a landing page;
- a first-run checklist with a sample bank;
- empty and error states;
- branded email;
- in-app help and a contributor guide;
- the Sprint 10 leftovers;
- a rehearsal of the cold-onboarding path.

**Status:** code complete 2026-09-26. Every story is merged. `main` is at da34d8c.
**Production:** https://learn-tanner-nielsons-projects.vercel.app
**Repo:** https://github.com/tannernielson27/learn

> **Hosted database:** caught up. There are two Sprint 11 migrations, and both are on `vauokqoyvewtzubqajgh` with their grants checked read-only. `main` and the hosted project agree on all 38 migrations.
>
> - **Row 37, `20260926000000_practice_run_items` (#284).** It went on 2026-09-26, about a day after the merge. The auto-mode permission classifier refused the orchestrator's push as a production deploy, so the owner ran it. Until then, student practice failed closed on the live site.
> - **Row 38, `20260926010000_sample_published` (#286).** Held until the owner could push straight after the merge, and pushed within minutes.
>
> Production and previews still share this database; the §7.3 split is still owner work.

## Demo script (5 steps)

`docs/sprints/S11-rehearsal.md` is the full walk, step for step, and `e2e/coldOnboarding.spec.ts` runs it in CI at 375, 768 and 1280 px.

**Where to run it.** On hosted, `private.make_instructor` puts every instructor in the one org, which already holds the demo banks and classes. There, Get started reads its steps as done and may not show. To see it from nothing, run it on the local stack, where the spec gives the instructor an org of their own, or show the spec's screenshots.

1. **Landing and sign-in.** Open `/` signed out. It says what LeaRN is and offers **Sign in** and **Join a live session**, with no sign-up, pricing or tracking. `/help` loads signed out. Sign in by emailed link as a new instructor (docs/05 §7.6).
2. **Get started.** The author home shows **Get started**, "0 of 3 done", above an empty bank list that says what to do next. Choose **Import the sample bank**: the Sample bank opens with every item and the case study already published.
3. **A class and a student.** Follow **Go to your classes**, make a class and choose **Copy invite link**. In a second browser, open the invite and join by email. The student home lists the class, and the Roster shows the student.
4. **Run it live.** From the Sample bank, choose **Start a live session**. On a phone, open `/`, choose **Join a live session**, enter the code and a name. Start the session, answer on the phone, and watch the console go from "0 of 1 answered" to "1 of 1 answered". Choose **Show answer** (the phone shows its score), then **End session**. Get started is gone from the author home.
5. **When things go wrong.** Open an unknown path: the designed 404 has focus on its heading. Open an expired sign-in link: it lands on the form, ready to send a new one.

## What shipped

| PR   | Issue    | What                                                                | Commit  |
| ---- | -------- | ------------------------------------------------------------------- | ------- |
| #276 | #270     | A contributor guide                                                 | 6503177 |
| #277 | #264     | A landing page that says what LeaRN is and how to get in            | a4ac710 |
| #278 | #268     | Branded email templates with plain-text parts and a preview         | 810c061 |
| #279 | #267     | Designed not-found and error pages, and clear expired-link messages | 7bece2d |
| #280 | #269     | An instructor guide and an item-authoring guide under /help         | 1bd8531 |
| #282 | #265     | A first-run checklist on the author home, with a sample bank import | f35c102 |
| #281 | #273     | An e2e for the ranked Your steps section                            | fa025dd |
| #284 | #271     | Freeze a practice run's items when it starts                        | 2912bf1 |
| #285 | #266     | Every empty list says what to do next                               | c97fe4c |
| #287 | #272 #57 | Sprint 10 leftovers: roster focus, Sentry bundle size, fonts        | 48edd95 |
| #290 | #289     | Import withSentryConfig from @sentry/nextjs/config                  | 0db4295 |
| #291 | #288     | Keep focus after Stop sharing and Delete assignment                 | ac1dc30 |
| #286 | #283     | The sample bank arrives published, ready to assign or run live      | 39a923e |
| #292 | #274     | A Demo 12 cold-onboarding rehearsal                                 | da34d8c |

- **The sample is published in one transaction.** `import_sample_bank` runs as the caller. It imports into an empty, row-locked bank and publishes only the ids its own import returned. It costs one import unit plus one `sample_publish`, capped at one a minute, so it cannot outrun the publish limit. An instructor-written bank still imports as drafts.
- **Practice runs are frozen.** A run records its items and their published content when it starts, so an unpublish or an edit mid-run no longer changes what the student sees or how it is scored. The new tables are closed to every role, and runs from before the migration keep reading the live bank.
- **A tablet bug found by a test.** The first CI run of the freeze e2e failed only at 768 px. A disabled **Next item** painted over the fixed Submit bar, because its `opacity-50` makes a stacking context. A real student could not tap Submit there either. The bar now carries `z-1`, under the EHR panel and sheet.
- **A screen-reader bug found by the rehearsal.** After a student sent an answer in an instructor-paced session, the answer sat in a second "Your answer" region, which axe flags as `landmark-unique`. The outer wrapper is now a plain `<div>`, as in the student-paced room. Nothing on screen changed.
- **Focus after a confirmed remove.** Removing a student, stopping a practice share and deleting an assignment each move focus to the section heading, not the page body (#287, #291).
- **Measured, not guessed.** Sentry adds about 170 B gzip to each route's first load. The SDK itself, about 50 KB gzip, loads separately and only when a DSN is set (docs/05 §7.9). The three font families stay; each is used, and the exception is written down in docs/04 §2 (#57).

## Owner steps

The go-live list in docs/05 §7.11 is unchanged from Sprint 10 and still comes first. Sprint 11 adds:

1. **Paste the regenerated magic-link template** (#278) into Authentication, Emails, Magic Link in every hosted project (docs/05 §7.7).
2. **Check the Roster heading's focus ring in Safari** on a preview (#287). The e2e cannot see a focus ring.
3. **Run hosted pushes from the repo root.** A `!` command runs in the session's current directory, which can be a builder's worktree. Worktrees are not `supabase link`ed and may carry unmerged migrations.
4. **Optional: let the orchestrator push hosted migrations.** The auto-mode classifier refuses `supabase db push` as a production deploy. It also refuses the orchestrator's own edits to its settings. An `autoMode.allow` entry in `.claude/settings.local.json` clears the push.
5. **Accept the demos.** Milestones 8 through 11 stay open until you run each demo.

## Known gaps

- **Get started cannot show cold on hosted**, because every hosted instructor shares one org that already has banks and classes (see "Where to run it"). A per-instructor org is v2 (roadmap §5, Phase 4).
- **The sample's live-session order is not fixed.** Its items share one `created_at`. The rehearsal reads the session's item order through the local service role to answer a known item; that is its only step not driven through the UI.
- **Weak steps (`my_practice_step_marks`) read each item's current CJMM step**, not the step frozen with the run. A step edited mid-run can move a practice mark.
- **Practice runs from before the freeze migration still read the live bank** until the student chooses Start over.
- **A bank can be assigned to the same class twice.** Nothing prevents it; #291's e2e relies on it, and says so in a comment.
- **No screen-reader announcement after a confirmed remove**, only the focus move. That is how `ConfirmSubmit` has always worked.
- **`e2e/onboarding.spec.ts` keeps its own copy of the empty-org sign-in helper**, which #292 extracted into `e2e/signIn.ts`.
- **The rehearsal had two unexplained local failures** before its final runs: one on desktop-1280 after 837 ms, and one Chromium full-page "Unable to capture screenshot" under load. Every CI run passed.

## Retro

- **A classifier can block a step the loop depends on.** The standing authorization covered hosted pushes, but the auto-mode classifier refused them. So a merged migration sat unapplied for about a day while student practice failed closed. Merging code that needs its migration at once is only safe when the push is certain to follow. After the first refusal, #286 was held until the owner could push, and its migration went on within minutes.
- **Builders can be cut off, so they push before they report.** Both first builders hit the weekly usage limit after committing but before pushing, and a third was stopped by a session end. The orchestrator verified the stranded branches, wrote up what their reviews had fixed, and opened the PRs. Later briefs said "push first, then report", and lost no work.
- **Read the snapshot, then the trace.** Three CI failures this sprint had three different causes:
  - a runner that could not start its containers;
  - a test that inserted a class through a role that cannot mint an invite token;
  - a real stacking bug at one viewport.

  The logs alone looked alike for all three.

- **Keep a docs table's widest cell stable.** Prettier re-pads a whole markdown table when its widest cell changes, and then every open docs commit conflicts. Sizing each new status cell to the old width kept rebases clean.
- **Follow-ups filed mid-sprint landed mid-sprint.** The reviewers' deferred MEDIUM (focus after Stop sharing and Delete) and a Sentry deprecation were filed as #288 and #289. Light builders merged them while the main stories waited on the owner.
