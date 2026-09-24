# ADR 0007 — Scheduled jobs run on pg_cron, calling the app through pg_net

- **Status:** Accepted, 2026-09-23 (#212).
- **Deciders:** product owner (kickoff decision 5 for Sprint 9), Claude (builder)

## Context

Sprint 9 needs work that happens on a clock rather than on a request:

- the reminder emails of #212: one when an assignment opens, one 24 hours before it closes;
- the submit at close of #208: an attempt still open when its window closes is submitted with what it saved. Until now that ran only when someone opened a page for that assignment, so a student who never came back stayed unsubmitted until an instructor opened the report.

Both need to run every few minutes, reliably, on the free tiers the project uses today (Vercel Hobby, Supabase free). The candidates:

1. **Vercel Cron.** On the Hobby plan a cron job runs at most once a day, and Vercel does not promise the minute within the hour it fires. A "closes tomorrow" email that can be a day late is not a reminder. Pro would allow per-minute schedules, at a monthly cost for one job.
2. **A scheduled GitHub Actions workflow.** Free now the repo is public, but GitHub documents that scheduled workflows can be delayed or dropped at busy times, and disables them after 60 days without repository activity. The Actions minutes ran out once already this project (docs/open-issues.md, 2026-09-22), which stopped every scheduled run with them.
3. **pg_cron in the Supabase database, calling the app through pg_net.** Available on every Supabase plan including free, runs on the minute, and lives next to the data it schedules. pg_net makes the HTTP call asynchronously after the job's transaction commits, so a slow app never holds a database connection.
4. **A Supabase Edge Function on a pg_cron schedule.** The same scheduler, but the sending code would live in Deno outside the app, away from `src/lib/email` (#206), the scoring code the submit at close needs (ADR 0003), and the app's tests.

## Decision

- **pg_cron runs one job every 15 minutes**: `private.call_reminder_route()`. It POSTs to the app's route `/api/cron/assignment-reminders` through pg_net with `Authorization: Bearer <secret>`.
- **The app does the work.** The route checks the secret, runs the submit at close for every assignment (`autoSubmitExpired`), asks the database what reminders are owed (`enqueue_assignment_reminders`), claims a batch, sends each through the app's Mailer and records the outcome. The database decides who is owed which email and remembers what was sent; it never sends anything itself and never scores.
- **One shared secret, in two places.** Supabase Vault holds it as `learn_cron_secret`, beside `learn_reminders_url` (the route's full URL on the deployment the project serves). Vercel holds the same value as `CRON_SECRET`, server-only. The route compares the two in constant time (both hashed to 32 bytes, then `crypto.timingSafeEqual`), refuses anything shorter than 32 characters, answers only POST, is never cached, and returns counts only.
- **The route is rate limited twice**, in memory like the sign-in limiter: wrong secrets per caller (so the secret cannot be guessed quickly) and authorised runs overall (so a leaked secret cannot drive the mailer flat out). The two budgets are separate, so a flood of bad guesses cannot lock out the real job.
- **Scheduling is an owner step, not a migration.** A migration cannot hold the URL or the secret, and a job scheduled on a project without them (a fresh replay per §7.3, the local stack, CI) would only fail every 15 minutes. So the migration creates tables and functions only, `private.call_reminder_route()` returns `not_configured` (or `no_pg_net`, `no_vault`) instead of raising when something is missing, and every reference to `net` and `vault` in it is dynamic SQL so the file replays on a database with neither. The owner enables the extensions, stores the two secrets and runs one `cron.schedule` call per project (docs/05 §7.8).

## Consequences

- **A reminder can be up to 15 minutes late**, and so can the submit at close for a student who never returns (it still happens at once for anyone who opens the assignment or its report). Accepted at kickoff.
- **Once and only once, however the job behaves.** `private.email_outbox` has one row per (assignment, student, kind), so running the job twice, or two runs racing, sends nothing twice; each send also carries an idempotency key built from the same three values (`reminder:<assignmentId>:<studentId>:<kind>`), which Resend honours for 24 hours. Nothing stale goes out: the claim reads the title, close time and address from the live rows, drops a pending reminder that is no longer owed (the student left the class or submitted, the close moved, the assignment was deleted), and a failed send is retried with backoff (at least Resend's Retry-After) and given up after five tries.
- **The app must be reachable from the database.** A deployment behind Vercel's Deployment Protection would answer pg_net with a login page. The production URL is public, so the job points there; a preview is never scheduled.
- **Until the production split (§7.3) one database serves production and previews**, so one job, pointed at the production URL, covers both. After the split each project gets its own job, secret and URL.
- **Nothing is scheduled until the owner does §7.8.** Until then no reminder is sent and the submit at close stays on-demand, exactly as before this ADR; nothing breaks.
- **Adding another scheduled job** means another route behind the same secret (or its own), and another `cron.schedule` line in §7.8. pg_cron's own history (`cron.job_run_details`) is where to look first when a job seems not to run; pg_net's replies are in `net._http_response` for six hours.
