# test(db): fail on writable tables with no authoring charge

## Summary

#123 (PR #160) enforces the authoring rate limit at the write, with AFTER triggers on `items`, `case_studies`, `item_versions` and `case_study_items` that call `private.charge_authoring_action`. Nothing stopped a future table with an `authors manage <x>` policy and no charge trigger from being writable through PostgREST without being counted. This adds `supabase/tests/database/authoring_trigger_coverage.test.sql` (12 pgTAP assertions), which does three things:

- **Lists every (table, command) `authenticated` can write.** Both conditions PostgREST needs must hold: the privilege (table-wide, or any one column for INSERT/UPDATE, so `grant update (name)` counts) **and** RLS letting a row through (RLS off, BYPASSRLS, or a PERMISSIVE policy for that command or FOR ALL that applies to `authenticated`, a role it belongs to, or PUBLIC). Policies alone would count inert policies on revoked tables. Grants alone would count every table Supabase's default privileges open. It covers every schema except Postgres's own and the ones Supabase manages, so a new schema of ours is included automatically.
- **Detects a charge by what the trigger function does, not what it is called.** A trigger counts only when it is enabled, fires on that command (a `tgtype` bit), and its function's `prosrc` (with line comments stripped) calls `private.charge_authoring_action(`. The check is per command, so a table charged on INSERT only still fails for UPDATE and DELETE.
- **Keeps an allowlist that cannot rot.** Each entry needs a written reason. The test fails when an entry's table is gone, is no longer writable, or is now fully charged.

### The allowlist

| Table                 | Writable for           | Why it is not charged                                                                                                                                                                                         |
| --------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public.item_banks`   | INSERT, UPDATE, DELETE | Not one of the four authoring actions. #123 left it uncounted on purpose. Banks are rarely made, RLS keeps them inside the author's org, and charging `save` would spend the editor's budget on housekeeping. |
| `public.bank_folders` | INSERT, UPDATE, DELETE | Also left uncounted by #123. Only the `name` column can be updated. Moving content between folders writes `items` and `case_studies`, which are charged.                                                      |
| `public.profiles`     | UPDATE                 | Not authoring. A user can only rename their own row (`display_name`).                                                                                                                                         |
| `public.sessions`     | INSERT, UPDATE         | Live sessions, not authoring. The live path has its own limits and must not spend the author's save budget mid-class. Delete is revoked.                                                                      |

These tables are left off the list because `authenticated` cannot write them directly: `orgs`, `participants`, `session_responses`, `session_item_aggregates`, `live.session_public_state`, and `private.rate_limits`, `code_lookups`, `session_submits` and `session_views`. Security-definer functions or triggers write them. If one ever becomes directly writable, the test fails.

Known limits (also written in the file): views are not enumerated (the repo has none), and a trigger function that charges only through a helper function is not detected.

## How verified

Everything was run locally. GitHub Actions is down, so CI did not run.

- `pnpm exec supabase db reset` on the local stack, then `pnpm exec supabase test db`: 16 files, `Result: PASS`. The new file passes 12 of 12.
- The enumeration on a fresh reset returns exactly 19 (table, command) rows. The four charged tables are charged on every command they allow (`item_versions` allows INSERT only). The four allowlisted tables are uncharged.
- **Teeth, inside the test.** Inside the test's own transaction, which ends in rollback, a scratch table `public.scratch_161` is created with an `authors manage`-style FOR ALL policy, full grants and no trigger. The test asserts that:
  - the table is reported uncharged for INSERT, UPDATE and DELETE;
  - a trigger named `scratch_161_charge_authoring` whose function only mentions the charge in a comment does not count;
  - a trigger charging INSERT only leaves UPDATE and DELETE open;
  - an oddly named trigger on `private.charge_save_write` covers the table;
  - disabling that trigger uncovers the table again;
  - revoking the grants takes it out of the writable set.
- **Teeth, outside the test.** A committed table `public.oob_161` with an `authors manage oob` FOR ALL policy and no trigger was created on the local DB, and the unmodified suite was run. It failed with `Failed test 4 ... Unexpected records: (public,oob_161,DELETE) (public,oob_161,INSERT) (public,oob_161,UPDATE)` and `Result: FAIL`. The table was then dropped.
- **Stale entry.** A copy of the test was run with `public.orgs` added to the allowlist. It failed test 5 with `Unexpected records: (public,orgs)`.

Found while building this: a `rollback to savepoint` inside a pgTAP file also rolls back pgTAP's own test counter. The first draft used a savepoint and reported "planned 12 but ran 6", yet `supabase test db` still printed `ok` for the file. The test no longer uses a savepoint.

Closes #161

🤖 Generated with [Claude Code](https://claude.com/claude-code)
