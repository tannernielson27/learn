# Sprint 10: Demo

**Goal:** get production ready for real students, and give students a home worth opening.

Hardening is:

- a security audit with a database guard;
- rate limits shared across server instances;
- Sentry;
- a nightly encrypted backup;
- a go-live check.

The student home gains assignment history, weakest clinical judgment steps, and practice on banks an instructor shares, with instant feedback.

**Status:** code complete 2026-09-24. Every story is merged except #178, which is blocked on an owner step. `main` is at e26e8e6.
**Production:** https://learn-tanner-nielsons-projects.vercel.app
**Repo:** https://github.com/tannernielson27/learn

> **Hosted database:** caught up. Each Sprint 10 migration went to `vauokqoyvewtzubqajgh` straight after its PR merged: a dry run, then the push, then a read-only check of its grants. `main` and the hosted project agree on all 36 migrations. #247 (shared rate limits) was pushed within a minute of merging, because sign-in fails closed until its function exists. Production and previews still share this database, and the §7.3 split is still owner work.

## Demo script (5 steps)

The instructor uses **Use the demo account**. The student needs a phone with a class invite, as in the Sprint 9 demo.

1. **Go-live check.** Run the command below. Every automated line passes or names the docs/05 step that turns it green. The remaining FAILs are owner steps.

   ```
   pnpm golive:check -- --url https://learn-tanner-nielsons-projects.vercel.app --project-ref vauokqoyvewtzubqajgh
   ```

   Set `GOLIVE_HEALTH_TOKEN` to the deployment's `CRON_SECRET` first, and the check names each missing variable.

2. **Share a bank for practice.** Open the sample bank, go to **Practice**, choose **Share for practice**, and pick NUR 310. The bank list shows "Shared for practice with NUR 310". Now open **Assign** on the same bank: the form warns "Students in NUR 310 can see the answers to N of these items in practice."
3. **Practice on the phone.** On **/learn**, the **Practice** section lists the bank. Open it and answer a select-all-that-apply item wrong. The correct options and the rationale appear straight away. Reload: the answered item still shows its feedback and the next one is still keyless.
4. **History and steps.** On the same home, **History** lists each closed assignment with its best score and attempts used. **Your steps** ranks the six CJMM steps weakest first. Assignment and practice counts are shown separately, and a step with fewer than 5 items reads "Not enough answers yet".
5. **Time zone.** On the class page, change the time zone to America/New_York. The due times on the student home move two hours later and carry the zone's name.

## What shipped

| PR   | Issue | What                                                                  | Commit  |
| ---- | ----- | --------------------------------------------------------------------- | ------- |
| #245 | #233  | Audit RLS, security-definer functions and routes before real students | e180a48 |
| #246 | #235  | Report client and server errors to Sentry with student data scrubbed  | 028c872 |
| #247 | #234  | Keep rate limits in Postgres so they hold across server instances     | d3c0421 |
| #249 | #219  | An ordered-response item no longer starts in its key's order          | 9288d33 |
| #250 | #236  | A nightly encrypted database dump, with restore steps                 | 12cf2e7 |
| #251 | #242  | A class time zone setting, and removed students in the report         | 09c2dea |
| #252 | #237  | A go-live check that proves production is ready for students          | 085ad5c |
| #253 | #237  | Let the go-live check query a hosted project                          | 85013bc |
| #254 | #238  | A history of my assignments and best scores                           | 0ae3d48 |
| #255 | #240  | Share a bank with a class for practice, and warn on graded reuse      | 3769ee1 |
| #257 | #248  | Sweep expired rate-limit rows on a schedule                           | 635d1e0 |
| #258 | #239  | My weakest clinical judgment steps                                    | 7ba45ec |
| #259 | #256  | Show an error when a confirmed remove or stop-sharing fails           | f78a925 |
| #260 | #244  | Check live play and a second student on the real response bytes       | 13760c5 |
| #261 | #241  | Practice a shared bank with instant feedback                          | e26e8e6 |

- **A guard keeps the audit true.** `docs/audits/S10-security.md` has one row for every table, definer function, route and Server Action, each naming the line that enforces it. `security_guard.test.sql` fails the build in three cases:
  - a table loses RLS;
  - a definer function has no fixed `search_path`;
  - `anon` can execute anything.

  It found and fixed:
  - one table without RLS;
  - seven functions `anon` could execute;
  - a trigger that stopped a class with members, or a student in a class, from being deleted.

- **Ordered response gave the answer away.** The server sent the steps in the author's order, which is usually the key, and only the browser scrambled them. Now the server scrambles them, seeded with a server secret, and the start order never equals the key.
- **Practice keys, one at a time.** Students cannot read the practice tables at all. The answer route follows a fixed order:
  1. the verified student;
  2. the limit;
  3. the run is live and the bank still shared;
  4. the item is unanswered;
  5. score;
  6. record;
  7. only then return that one item's key.

  Stopping a share makes the page and the route 404 at once, including runs already started.

- **Byte tests you can trust.** #244 found that the `"score":` marker the earlier "no score before close" tests grepped for could never match a page, because the page escapes the quotes. The matcher now unescapes them, and a control proves it matches after the close. The earlier tests passed but proved less than they claimed. No leak was found once the marker worked.
- **Nothing emails, reports or backs up yet.** Resend, the reminder schedule, Sentry and the backup secrets are all owner steps (below). The go-live check says which are missing.

## Owner steps before real students

In the order of docs/05 §7.11 ("Go-live"):

1. **Split production onto its own Supabase project** (§7.3) and replay all 36 migrations. Choose Pro or free-plus-backup for it (owner decision 2026-09-24: decide at go-live).
2. **Delete `DEMO_ACCOUNT_*` from Vercel Production.** `/api/health` reports not ready while they are set.
3. **Resend** (§7.7): SMTP, the Auth rate limit, Site and redirect URLs, and `RESEND_API_KEY` and `EMAIL_FROM` in Vercel.
4. **Scheduled jobs** (§7.8): set `CRON_SECRET`, enable pg_cron and pg_net, add the Vault secrets, schedule the reminders, then `select private.schedule_rate_limit_sweep();`.
5. **Sentry** (§7.9): create the project, add `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` and `SENTRY_AUTH_TOKEN` to Vercel, turn on Sentry's own scrubbers, and set alert rules. Open `/gallery/sentry-check` on a preview to see a scrubbed test error arrive.
6. **Backups** (§7.10): run `age-keygen` and keep the private key off GitHub. Add the repo secrets `BACKUP_AGE_RECIPIENT` and `PROD_DB_URL`, then run the workflow by hand once. Then **restore it into a scratch hosted project**: this has only been tested against the local stack.
7. **Turn off Realtime "Allow public access"**, which unblocks #178.
8. Run `pnpm golive:check` until every automated line passes.

## Known gaps

- **#178 is still open**, blocked on step 7 above. The go-live check fails on it by design.
- **The backup restore has never run against a hosted project**, where `postgres` is not a superuser. The docs make that drill the demo step for #236.
- **The go-live check has one hosted run.** The first run exposed the `--project-ref` bug fixed in #253. The permission settings on this machine blocked re-running it against production afterwards, so the three database lines are unverified on hosted.
- **Practice reads the bank's current items on each request.** An item unpublished mid-run drops out, and the student sees "no longer available". Freezing items per run would be a small follow-up.
- **Weak steps count only a practice item's first answer**, since later answers come after the key was shown. A student who guesses first and learns second is ranked on the guess.
- **The ranked "Your steps" path (5 or more items) is covered by unit tests only.** The e2e seed produces one step-tagged answer.
- **The Sentry bundle-size change was never measured.** With no DSN the SDK is not loaded; with one it loads as a separate chunk after the page.
- **The auth e2e job now takes most of 30 minutes.** Three specs each wait out a real assignment window. It was raised from 20 minutes after #254's run hit the limit.

## Retro

- **Read the failure before calling it a bug.** A failed "remove student" e2e looked like a real defect: I reported one, and I was wrong. The CI snapshot showed the student had been removed, and the empty roster had replaced the list the assertion searched. The snapshot answered it in one step; guessing from the log took three.
- **A grep can't fail if its marker can't match.** #244's controls found that a whole class of "no score before close" checks had never been able to fail. A control that proves the grep can match is what catches this. It is already the rule (the #146 lesson), but the older specs had been written without one.
- **Test tools against the environment they will run in.** The go-live check passed every local test and failed three of its lines on its first hosted run, because the CLI flag it used only works with `--linked`.
- **Docs lists are the new merge conflict.** Migration numbering held all sprint, because builders were given numbers up front. But the docs/05 §7.2 row numbers, the ci.yml e2e list and the audit's coverage table conflicted on most rebases. Each took a minute; there were six.
- **Two builders at a time held up.** One builder used Docker while a second lighter one did not. Nothing ran out of memory this sprint. One builder stalled with no output and one session restart stopped two builders. Resuming them from their worktrees lost no work.
