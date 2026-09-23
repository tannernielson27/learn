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

## In CI

The `auth e2e` job runs a five-participant `--host` smoke against the build the e2e step made. It
proves the script and the room still work end to end; it is not a capacity number.
