# Sprint 4 — Demo

**Goal:** Supabase auth and a data model with RLS, an authoring shell with live preview, editors for the eight Sprint 1 item types, and playing an item from the bank with the answer scored on the server.
**Status:** complete 2026-09-13. Stories #64 to #66 and #68 to #72 merged; `main` at 7c734a4. #67 (Google sign-in) moved out of the milestone by owner decision; it stays open, blocked on the owner's Google Cloud OAuth client.
**Production:** https://learn-tanner-nielsons-projects.vercel.app
**Repo:** https://github.com/tannernielson27/learn

## Demo script (5 steps)

1. Open `/author` signed out: it sends you to sign in. Enter an email, open the link from the inbox, and land back on **Item banks**.
2. Create a bank named "Cardiac". Choose **New item → Extended Multiple Response**. Write the stem and five options, and mark three correct. The preview beside the form updates as you type, and **Problems to fix** empties as the item becomes valid. Publish.
3. Choose **New item → Matrix Multiple Choice**. Name two columns (Improved, Declined), add two findings, and mark one column per row. Watch the preview, then publish.
4. Back in the bank, both items read **Published**. Press **Play** on the SATA. View the page source: there is no answer key in it.
5. Choose answers and press Submit. "Checking your answer" shows while the server scores it, then focus lands on the server's score, the breakdown and the rationale.

## What shipped

| PR  | Issue | What                                                                                   |
| --- | ----- | -------------------------------------------------------------------------------------- |
| #73 | #64   | Supabase project, typed clients, health route, ADR 0005 (8c62e3f)                      |
| #74 | #65   | Banks and items per org under RLS, keys in their own columns, pgTAP tests (0d84b15)    |
| #75 | #66   | Magic-link sign-in with a session-refreshing proxy (f31b70d)                           |
| #76 | #68   | Bank list, rename, and a new-item picker grouped by format (fffa2fc)                   |
| #77 | #69   | Editor shell beside the live player preview, starting with multiple choice (058e07d)   |
| #78 | #70   | Multiple response and grouping editors; 200 KB cap on every save and publish (d8b1aea) |
| #79 | #71   | Matrix, drop-down table and cloze editors for the remaining Sprint 1 types (f35c894)   |
| #80 | #72   | Play a published item from the bank, scored on the server (7c734a4)                    |

- **Data:** banks, items, case studies and version history live per org. Answer keys, rationale and scoring have their own columns, and RLS decides every row. `TRUNCATE`, `REFERENCES` and `TRIGGER` are revoked from signed-in users, because RLS doesn't cover them. Composite foreign keys keep child rows in their parent's org.
- **Auth:** email magic link via `token_hash`, a `next` path that refuses open redirects, and a proxy that refreshes the session and only redirects optimistically. Every page, Server Action and route handler checks access itself.
- **Authoring:** one `EditorShell` for every editor. It holds the preview (the same `ItemPlayer` students see), plain-language problems that focus their field, Save draft and Publish, and dirty tracking that survives in-flight edits. Scoring is derived from the answers the author marks. Drafts are strict and size-bounded, and stored drafts reopen safely even if their JSON is old or broken. Publishing sets the version on the server and appends to history.
- **Play from the bank:** the page sends a keyless item, and the score route reads the key under RLS, scores with the same engine as the gallery, and only then reveals the key and rationale (ADR 0003). Parity tests hold the server score to the gallery's score for every Sprint 1 fixture.
- **Checks:** 766 unit tests at ~89% lines, pgTAP RLS tests, and CI jobs for the database (types diff included) and for auth and authoring e2e against a local Supabase stack. Axe runs in every authoring journey.

## Known gaps

- **Anyone who signs in joins the one org as an instructor**, by owner decision. Revisit before students arrive in Sprint 7 (invite-only was the recommended option).
- **Hosted setup is still the owner's:** Vercel needs `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for Preview and Production, and the Supabase dashboard needs the site URL, redirect URLs and the magic-link template. Until then, sign-in and authoring work locally and in CI, but not on Vercel.
- #67 Google sign-in is blocked on the owner's OAuth client.
- Hosted migration history is recorded by MCP apply timestamps, not file names, so `supabase db push` would try to re-run them. Apply new migrations the same way, or repair the history first.
- If a session expires mid-play, the player says the answer could not be checked rather than asking the user to sign in again.
- The score route has no CSRF token; it relies on JSON-only requests and CORS, which is enough while it writes nothing. Saving responses (Phase 3) needs a real check.
- Editors cover the eight Sprint 1 types; the other six arrive in Sprint 5, and so does playing a case study from the bank.
- Carried from Sprint 3: #46 (a case study's keys reach the client), #49, #50, #54 to #61.

## Retro

- Reviewer agents kept finding what tests alone would not: TRUNCATE outside RLS, a client-chosen publish version, unbounded draft fields, a stale answer after removing a choice, and an answer that could change while the server scored it. Each got a failing test before its fix.
- A local Supabase stack in CI made sign-in and authoring e2e real without a secret key in the repo; Mailpit stands in for the inbox.
- Shared helpers paid off: once `saveDraft` and `publish` held the size cap, type pinning and server-set versions, five more editor types inherited them for free.
- Playwright matches accessible names by substring. "Play <stem>" links made stem lookups ambiguous, and a matrix's hidden grid answered text queries on phones; anchor names and filter for visible text.
- A test's own assumption can be the bug: "rationale" is also a scoring model's name, so a leak check has to look for keys, not words.
- Merging when green kept the sprint moving; the background watch squash-merged each PR as soon as every check passed.
