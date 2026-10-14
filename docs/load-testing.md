# Load testing a live session

`pnpm load:live` runs a class-sized crowd of simulated students through a live session (#187). Each
one is a phone, not a shortcut: it posts the real join form, holds only the httpOnly participant
cookie, opens its own Realtime socket on the session's private channel, reads each item from
`POST /api/live/view` (keyless, as a phone gets it) and answers through `POST /api/live/submit`.
Answers are random but valid for the item's type, so a crowd lands on a natural mix of full, partial
and no marks; `--blank` leaves a share unanswered.

Code: `scripts/load-live.mjs` and `scripts/load-live/` (the pure parts have unit tests beside them).

## Running it

It needs the app running and `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for
the sockets. `pnpm load:live` reads `.env.local` when there is one, so on a laptop that is set up for
`pnpm dev` there is nothing else to set.

```sh
# A person runs the host console; the crowd joins the code on the screen and follows the room
# until the host ends the session.
pnpm load:live --code ABC234 --participants 60

# Nobody at the console: the script signs in as an instructor, starts the seeded six-step case
# study, opens each step, waits for the crowd, reveals, moves on and ends the session.
pnpm load:live --host --participants 60

# Against another port, a bank instead of the case study, and a repeatable run.
pnpm load:live --base http://127.0.0.1:3107 --host --bank <bank id> --seed 187

# The same bank student-paced (#404): the host opens the whole set, each phone works through it,
# and the host shows the answers once every phone has answered or passed every item.
pnpm load:live --host --bank <bank id> --paced
```

`pnpm load:live --help` lists every flag: class size, think time, join ramp, blank share, lobby and
reveal pauses, step timeout, and `--out` for the JSON (default `./load-live-results.json`,
gitignored).

`--host` signs in with `LOAD_HOST_EMAIL` / `LOAD_HOST_PASSWORD`, else `DEMO_ACCOUNT_EMAIL` /
`DEMO_ACCOUNT_PASSWORD`, else — on the local stack only — the public local demo account from
`supabase/seed-demo.sql`.

## What it reports

A small table on stdout, and all of it as JSON in `--out` for comparing runs:

| Measure       | What it is                                                                                                                                    |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| joined        | participants who got a cookie and a subscribed channel, of those asked for                                                                    |
| join ms       | the join form post, p50 / p95 / max                                                                                                           |
| view ms       | `POST /api/live/view`, fired by every move that changes the item or the reveal                                                                |
| submit ms     | `POST /api/live/submit`                                                                                                                       |
| refusals      | by code; `wrong_item`, `already_revealed`, `not_started`, `paused`, `not_open`, `time_up` are expected when an answer lands as the host moves |
| unexpected    | every other refusal or HTTP error; the run fails when it is not zero                                                                          |
| stalled steps | `--host` only: steps whose answers had not all arrived when the step timed out                                                                |
| realtime msgs | `postgres_changes` plus presence syncs each participant received                                                                              |

The exit code is 1 when anyone failed to join, any refusal was unexpected, or a step stalled.

## Where it refuses to run

It writes sixty participants and hundreds of answers into the database behind the app, so:

- The production deployment's address is refused outright.
- The target's `/api/health` must name the same Supabase project the sockets would open on.
- A hosted target is refused when its project is production's, as production's own `/api/health`
  reports it, or when that cannot be confirmed. **Today every preview shares production's project,
  so every hosted run is refused** until the production split (docs/05 §7.3) gives production its
  own. `LOAD_LIVE_PRODUCTION_REFS` (comma-separated refs) adds projects to refuse.
- The local stack is never compared with anything, so a local run does not contact production.

It prints no keys, cookies or tokens, and none go into the JSON.

## Results on the local stack

A laptop (Windows 11, 16 GB), `next dev` on the local Supabase stack, 60 participants, `--host`
through the six-step sample case study, default think time (1–6 s) and ramp (5 s), seed 187
(2026-09-23). Two runs, the second with `--lobby-ms 0` while the machine was busier:

| run        | joined  | join ms p50 / p95 | view ms p50 / p95 | submit ms p50 / p95 | answers            | refusals | realtime msgs per participant (min / median / max) |
| ---------- | ------- | ----------------- | ----------------- | ------------------- | ------------------ | -------- | -------------------------------------------------- |
| default    | 60 / 60 | 1026 / 1396       | 1607 / 2230       | 52 / 96             | 322 sent, 38 blank | none     | 41 / 79 / 124                                      |
| lobby-ms 0 | 60 / 60 | 1731 / 2682       | 3067 / 6245       | 155 / 1794          | 322 sent, 38 blank | none     | 41 / 78 / 131                                      |

Every step settled (60 of 60 answered or passed) in 8–11 s, most of which is the think time. The
database agreed: 322 responses, with partial and no marks on every step and full marks on four of
the six (random answers rarely get a whole matrix or a sequence right). `view` is the
slow route because sixty phones ask for it in the same instant on every move, and this is the
development server on a shared laptop; a production build and a hosted database will differ, which
is why the JSON exists.

**Why `--host` waits in the lobby.** The very first run after `next dev` started (three
participants, no pause before Start) had its first step reach no phone: all three stayed in the
lobby until the host moved to step 2. It did not happen again in five later runs with no pause, so
the cause is not confirmed — a cold dev server, or Start landing before Realtime had finished
registering a new channel's `postgres_changes` (which completes a moment after SUBSCRIBED). A
real phone in the second case would sit in the lobby until the next move. `--host` waits
`--lobby-ms` (3 s by default) before Start, as a person at the console does, and `stalled steps`
makes it visible if it happens.

## One hundred and one hundred and fifty, on a production build (#404)

**The pass line, written before the first run.** A class of 100 passes when, on a production build
(`pnpm build`, then `next start`):

1. every participant joins (joined = asked for);
2. there are no refusals, expected or not;
3. every step reaches every phone (no stalled step, and every step settles at the full class);
4. `view` p95 is under 2 s.

**What was measured.** Commit `c0aae84d42eed58accc160c45dbce73109d2b77b` (`main` on 2026-10-13,
before #422 paged the progress board's read and before #423 stopped a join re-rendering every
student screen, so this is the "before" baseline for both). `pnpm build`, then
`pnpm exec next start -p 3107 -H 127.0.0.1`, on the local Supabase stack with migrations 1 to 49
applied. The quiz is the demo workspace's seeded "Samples" bank, 21 items, one of each kind. Default
think time (1–6 s), ramp (5 s), blank share (0.1), lobby pause (3 s) and step timeout (30 s);
seed 404.

The machine: a laptop, Windows 11 Home, 16 GB (15.7 GB visible), Intel Core i7-1360P, Docker
Desktop 28.5.2 on WSL 2. The load script, the Next server and the whole Supabase stack shared it,
with a browser, Slack and other sessions open. Only the database, PostgREST, Realtime, Auth and
the gateway containers were running; the rest of the stack was stopped to make room. Free memory
is the figure Windows reports just before and just after each run. **The numbers are indicative,
not a capacity figure**: the hosted run is #405.

```sh
# Instructor-paced: the host opens each of the 21 items, waits, reveals, moves on.
pnpm load:live --base http://127.0.0.1:3107 --host --bank 00000000-0000-4000-8000-000000000002 --participants 100 --seed 404
pnpm load:live --base http://127.0.0.1:3107 --host --bank 00000000-0000-4000-8000-000000000002 --participants 150 --seed 404

# Student-paced: the host opens the set, every phone works through it, the host shows the answers.
pnpm load:live --base http://127.0.0.1:3107 --host --bank 00000000-0000-4000-8000-000000000002 --paced --participants 100 --seed 404
pnpm load:live --base http://127.0.0.1:3107 --host --bank 00000000-0000-4000-8000-000000000002 --paced --participants 150 --seed 404
```

Each run also had `--out <a file per run>`. `--paced` is new with this run: until #404 the script
could only drive an instructor-paced room. It starts the bank with `paced => 'student_paced'`,
and each phone answers the set one item after another, naming the item's position as the real
phone does, with its own think time before each.

| run            | joined    | join ms p50 / p95 | view ms p50 / p95 (n) | submit ms p50 / p95 | answers              | refusals                                                        | stalled steps | realtime msgs per participant (min / median / max) | free GB before / after |
| -------------- | --------- | ----------------- | --------------------- | ------------------- | -------------------- | --------------------------------------------------------------- | ------------- | -------------------------------------------------- | ---------------------- |
| 100 instructor | 100 / 100 | 42 / 246          | 3731 / 9034 (4300)    | 79 / 1020           | 1837 sent, 228 blank | view: 247 × 500, 57 × 401                                       | 8 of 21       | 128 / 168 / 244                                    | 1.29 / 0.71            |
| 100 student    | 100 / 100 | 91 / 155          | 2865 / 5048 (257)     | 106 / 589           | 1872 sent, 228 blank | none                                                            | 0             | 72 / 141 / 201                                     | 2.16 / 0.72            |
| 150 instructor | 150 / 150 | 2193 / 3614       | 3562 / 8965 (6570)    | 82 / 363            | 2071 sent, 222 blank | view: 1680 × 401, 1317 × 500; submit: 1 × 500, 1 × `not_joined` | 21 of 21      | 80 / 135 / 231                                     | 1.21 / 1.99            |
| 150 student    | 150 / 150 | 559 / 830         | 576 / 1430 (553)      | 25 / 55             | 1639 sent, 188 blank | view: 92 × 401, 87 × 500                                        | the set       | 18 / 86 / 160                                      | 2.73 / 1.00            |

The first three runs ran one after another between 17:28 and 17:57 local time. The 150
student-paced run is its second attempt, 18:32 to 18:43, with the Next server restarted from the
same build. Its first attempt overlapped three other build sessions that started on the machine at
about 18:00; free memory fell to about 0.7 GB and it was stopped at ten minutes with nothing
written, so it is not in the table. No recorded run overlapped those builds, but the machine was
quieter for the last run than for the first three, and its latencies are lower for that reason as
much as any other: do not read 150 student-paced as faster than 100.

**Does 100 pass? No, in either pacing.**

- _Instructor-paced, 100._ Everyone joined, and that is the only line it meets. 304 `view` reads
  were refused (247 with a 500, 57 with a 401), 8 of the 21 steps timed out short of the full
  class (88 to 99 of 100 settled), and `view` p95 was 9.0 s against a line of 2 s. Its median was
  3.7 s.
- _Student-paced, 100._ Everyone joined, nothing was refused and all 2,100 answers or passes
  arrived, in 99 s. `view` p95 was 5.0 s, so it fails the fourth line. It reads `view` three times
  per phone rather than forty-three, which is why it holds where the other mode does not; each
  read carries all 21 items.
- _Instructor-paced, 150._ Everyone joined; every one of the 21 steps stalled (65 to 133 of 150
  settled) and 2,999 requests were refused.
- _Student-paced, 150._ Everyone joined. When the host opened the set, 87 phones read it and worked
  through all 21 items; the other 63 had that one `view` refused (92 × 401 and 87 × 500 across the
  run) and, having no later move to try again on, sat with nothing until the set timed out at
  630 s with 1,827 of 3,150 settled.

**What gave first: `POST /api/live/view`.** It was the slowest route in every run and the only
one refused at 100. Join and submit stayed quick (submit p50 79–106 ms). An instructor-paced
room sends every phone to `view` on every move, so 100 phones made 4,300 reads in seven minutes,
a hundred of them in the same instant each time.

What the refusals were, as far as these runs show: the local gateway's log has only 200s for
every database call in the 100 instructor-paced run and in the 150 student-paced run (the other
two were not checked). The route gives a refusal from the database its own name, and answers 401
when the participant check comes back empty and 500 when `begin_session_view` comes back as an
error. So these were not the database refusing: the likeliest reading is that the Next server's
own calls to Supabase failed before the gateway answered them. The route logs nothing when this
happens, so the cause (the server's outbound connections, Docker Desktop's port forwarding, or
the machine itself) is **not identified**, and whether a hosted deployment does the same is
#405's question. A phone told it is signed out in the middle of a session is the worse of the two
for a student.

**The "first step reached no phone" stall did not recur at 100.** Step 1 settled 100 of 100 in
7.7 s instructor-paced, and the student-paced set opened for all 100. At 150 step 1 settled 123
of 150, but not for that reason: Realtime delivered every move to every phone in both
instructor-paced runs (state changes received total exactly 43 per phone: 4,300 at 100 and 6,450
at 150), and all three moves to every phone in the 150 student-paced run (450). The phones that
missed a step had the move and were refused the item by `view`.

**The progress board's read is truncated at 100 × 21.** The script's host does not make that
read, so it was made by hand after the 100 student-paced run: the same two-column select
`readProgress` sends, as the signed-in host, for that session. PostgREST answered 206 with
`Content-Range: 0-999/1872`: 1,000 of the 1,872 answers. Counted from those rows, items 15 to 21
show 1, 5, 1, 0, 0, 10 and 0 answered when about 89 of 100 had answered each. That is #422's bug,
seen on this commit.

**A script fault found on the way.** The first 100 student-paced attempt sent answers without
their position and all 1,872 were refused `wrong_item`; that attempt is discarded and the row
above is the run after the fix.

**Not exercised here.** Per-IP rate limits (the limiter only runs on Vercel, and every simulated
phone shares one address anyway); hosted Realtime's connection and message limits; a real
network, real phones and a browser rendering each move; Vercel's function concurrency and cold
starts. The sample case study was not run at 100 or 150: the bank runs took the time and memory
there was. A student-paced `view` count (n = 257) is short of three per phone because reads
still in flight when the phones hang up are not counted.

## In CI

The `auth e2e` job runs a five-participant `--host` smoke against the build the e2e step made. It
proves the script and the room still work end to end; it is not a capacity number.
