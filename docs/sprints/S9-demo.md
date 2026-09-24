# Sprint 9 — Demo

**Goal:** take-home assignments. An instructor makes a class and shares one invite link. They assign a bank or a case study with an open and close time and up to three attempts. Students answer on a phone, with autosave and resume on any device. After the close they see their best attempt with every key and rationale, and the instructor gets a report and a CSV. Reminder emails go out when an assignment opens and a day before it closes.
**Status:** code complete 2026-09-23. Stories #204–#212 and #217 are merged; `main` at 3c3b1e2.
**Production:** https://learn-tanner-nielsons-projects.vercel.app
**Repo:** https://github.com/tannernielson27/learn

> **Hosted database:** caught up. Every Sprint 9 migration was pushed to `vauokqoyvewtzubqajgh` straight after its PR merged, with a dry run first and a read-only check afterwards. `main` and the hosted project agree on all 28 migrations. The separate production project (§7.3) still does not exist, so production and previews share this database, and **real students must not be invited until it does** (owner decision, 2026-09-23).

## Demo script (5 steps)

The instructor uses **Use the demo account**. The student needs a phone and an email inbox. On hosted that means the Resend owner steps (docs/05 §7.7) are done; until then, run it locally, where the email lands in Mailpit.

1. **Make a class.** Author home → **Classes** → create "NUR 310 — Fall". The class page shows an invite link and its QR code. Scan it on the phone, type an email address, and open the link that arrives. The phone lands on **Your classes**, and the roster on the laptop shows the student.
2. **Assign.** Open the sample bank → **Assign**. Pick NUR 310, open now, close in about ten minutes, 2 attempts, **Shuffle answer options** on. On the phone, **/learn** now lists it under **Open assignments**.
3. **Take it on the phone.** Open it and press **Start**. Answer two items and watch **Saved** after each. Close the tab, open the assignment on the laptop as the student: both answers are there. Press **Submit assignment**. The phone says **Submitted** and nothing about right or wrong. The instructor's **View progress** shows the student as Submitted, with no scores.
4. **After the close.** Once the close time passes, open **Results for …** on the phone. It shows the best attempt's total, then each item with the student's answer, the key, the rationale, and **Correct**, **Incorrect** or **Missed** printed beside each option.
5. **The report.** On the class page, **View report**. Switch between Students, Items and CJMM steps, then **Download CSV**.

Reminders: with the scheduler set up (docs/05 §7.8), each student gets "Week 5 is open" and, a day before the close, "Week 5 closes tomorrow at 17:00". Anyone who has already submitted is skipped. Locally, POST `/api/cron/assignment-reminders` with `Authorization: Bearer $CRON_SECRET` and read the two emails in Mailpit.

## What shipped

| PR   | Issue | What                                                                | Commit  |
| ---- | ----- | ------------------------------------------------------------------- | ------- |
| #214 | #204  | Invite-only sign-up, so no new account becomes an instructor        | 7eacc22 |
| #216 | #206  | Send email through Resend from info.tannernielson.com               | 9cfb97e |
| #218 | #209  | A seeded shuffle per item type (wired into assignments in #224)     | 0aa1854 |
| #220 | #205  | A class with an invite link students join                           | ff259f5 |
| #222 | #207  | Assign a bank or case study to a class with a window and attempts   | 0307887 |
| #224 | #208  | Take an assignment on a phone with autosave and resume              | 75a88ee |
| #226 | #211  | An assignment report by student, item and step, with CSV            | 84c8242 |
| #228 | #210  | Student results with keys and rationales after close                | be88d28 |
| #230 | #212  | Reminder emails when an assignment opens and a day before it closes | 5150057 |
| #231 | #217  | Let a class behind one campus IP through its invite link            | 3c3b1e2 |

- **Nobody becomes an instructor by accident.** A new account gets no role. A class invite, and only a class invite, makes a student: the server creates the account with `app_metadata`, which the browser cannot write. `private.make_instructor` is the owner's one-line promote, and it refuses students.
- **Keys wait for the close, in the database.** Scores and marks are hidden from every signed-in role by column grants. Students read only their own, through `my_assignment_result`, and only once the database's own clock says the assignment has closed. Instructors read theirs through `assignment_report_rows`, which returns no score before the close. Every student path has a wire-bytes test with a control, and so do the Start and Submit Server Action responses.
- **Closed is final.** A closed assignment's close time cannot move, because its keys may already be in front of students.
- **Autosave and one scoring path.** Each answer saves on change. A save racing a submit is caught by a revision counter and scored again. Scoring runs on the server through `submit.ts`, and an attempt left open at the close is submitted with what it saved.
- **Removals stick.** Removing a student records it, so the invite link they still hold does not let them back in.
- **Email and scheduling.** A `Mailer` over Resend's HTTP API, with a 10-second deadline per send. An outbox that sends each reminder once. pg_cron calls the app every 15 minutes through pg_net with a Vault secret (ADR 0007). The same run submits attempts left open at the close for every assignment.
- **Migrations:** `invite_only_signup`, `classes`, `assignments`, `assignment_attempts`, `assignment_report`, `my_assignment_result`, `assignment_reminders`.

## Owner steps before real students

1. **Split production onto its own Supabase project** (docs/05 §7.3), then replay all 28 migrations. Student emails are in the database now.
2. **Resend** (docs/05 §7.7): confirm info.tannernielson.com is verified. Set Supabase custom SMTP to Resend and raise the Auth email limit. Set the Site URL and redirect URLs. Add `RESEND_API_KEY` and `EMAIL_FROM` in Vercel.
3. **Reminders** (docs/05 §7.8): set `CRON_SECRET` in Vercel. Enable pg_cron and pg_net. Add the two Vault secrets once. Run the `cron.schedule` call.
4. **Adding an instructor is now two steps** (docs/05 §7.6): Add user, then `select private.make_instructor('<address>');`.
5. **Still open from before:** turn off Realtime "Allow public access" (#178), and accept the Sprint 8 demo.

## Known gaps

- **No real inbox yet.** Magic links and reminders have been tested against Mailpit and in-memory mailers, not in Gmail or Outlook.
- **A mistyped student email joins the class.** The account is created confirmed when the invite form is submitted. The roster shows it as "Has not signed in yet", so the instructor can remove it.
- **Editing an item mid-assignment changes its scoring.** Attempts are scored against the current item, as in live sessions.
- **Ordered-response items start in the author's order** (#219), which is often the answer. That is true in live sessions and take-home alike.
- **Class time zone has no UI.** It defaults to America/Denver and is changed in SQL (§7.8).
- **The report lists current members only.** A removed student's attempts are kept but not shown.
- **Rate limits are per server instance, in memory,** as sign-in's are. The invite trade-off (#217) is written up in `SIGN_IN_INVITE_LIMIT`. A holder of a shared link can reach up to 150 addresses per network per five minutes, each still capped per inbox, until the link is rotated.
- **Two e2e specs wait out a real 60-second window.** No test-only way to close an assignment exists, on purpose. They carry a guard and a three-minute timeout.

## Retro

- **The review loop earned its cost again.** Reviews caught:
  - #204's invite seam could never fire, because the admin API writes `app_metadata` in a second update. The builder of #205 found it by probing.
  - A removed student could rejoin with the old link.
  - A closed assignment could be reopened after its keys were out.
  - Invite budgets stacked across classes.
  - The feedback words were invisible to sighted students.

  Each was one or two small commits before merge.

- **Specs that wait for time need a timeout budget.** #211's e2e waited 90 seconds inside a 90-second test and could never pass. The fix was a shorter window, an explicit timeout and a guard that fails loudly if setup runs long.
- **Streamed responses are gone before you read them.** Reading a Server Action's body after the page consumed it failed in Chromium. Routing the request through the test and fulfilling it with the same bytes works.
- **Parallel builders, carefully.** Two builders at once worked when neither ran Docker and nothing else was holding memory. Stopping another project's idle Supabase stack freed 1.1 GB. The cloud "remote" option fell back to local, and scheduled cloud routines work but cannot push until the Claude GitHub App has write access.
- **Number migrations at merge time.** Telling each builder its migration number up front, based on what was already open, avoided every renumbering this sprint.
