-- The after-session report (#186) adds no migration: it reads `sessions`, `session_responses`,
-- `participants` and `items` as the signed-in author, and the policies #128, #131 and #129 put on
-- those tables are its whole access check. This file pins that down from the report's side: an
-- author in the session's org reads every row the report is built from, whether or not they
-- hosted it; an author in another org, a student and anon read none of them; and the one column
-- that could identify a participant beyond their display name is not readable at all.
-- Runs with `pnpm exec supabase test db`. Uses its own fixture ids so it never counts the seed's.
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

-- ---------------------------------------------------------------------------
-- Fixtures, as the superuser
-- ---------------------------------------------------------------------------

-- A hosts. D is a second instructor in A's org. B is an instructor in another org. C is a student
-- in A's org. New users land in the first org, so A, C and D share it until B is moved.
insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-0000000186aa', 'report-host@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000186bb', 'report-other@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000186cc', 'report-student@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000186dd', 'report-colleague@example.test', 'authenticated', 'authenticated');

-- #204: the sign-up trigger grants no role, so make these accounts instructors in the seeded
-- org explicitly, where the trigger used to put them.
update public.profiles
  set org_id = (select id from public.orgs order by created_at, id limit 1), role = 'instructor'
  where id in ('00000000-0000-0000-0000-0000000186aa',
               '00000000-0000-0000-0000-0000000186bb',
               '00000000-0000-0000-0000-0000000186cc',
               '00000000-0000-0000-0000-0000000186dd');

insert into public.orgs (id, name) values ('00000000-0000-0000-0000-0000000186f2', 'Other report');
update public.profiles set org_id = '00000000-0000-0000-0000-0000000186f2'
  where id = '00000000-0000-0000-0000-0000000186bb';
update public.profiles set role = 'student' where id = '00000000-0000-0000-0000-0000000186cc';

insert into public.item_banks (id, org_id, name)
  select '00000000-0000-0000-0000-0000000186b1', org_id, 'Report bank'
  from public.profiles where id = '00000000-0000-0000-0000-0000000186aa';

insert into public.items (id, bank_id, org_id, type, status, cjmm_step, content, answer_key, scoring)
  select '00000000-0000-0000-0000-0000000186e1', '00000000-0000-0000-0000-0000000186b1', org_id,
         'multiple_choice', 'published', 1, '{"id":"rpt-one"}', '{}', '{}'
  from public.profiles where id = '00000000-0000-0000-0000-0000000186aa';

insert into public.sessions (id, org_id, host_id, bank_id, title, code, item_set)
  select '00000000-0000-0000-0000-0000000186d1', p.org_id, p.id,
         '00000000-0000-0000-0000-0000000186b1', 'Report session', 'RPT234',
         '["00000000-0000-0000-0000-0000000186e1"]'::jsonb
  from public.profiles p where p.id = '00000000-0000-0000-0000-0000000186aa';

update public.sessions set status = 'running', current_position = 1
  where id = '00000000-0000-0000-0000-0000000186d1';

insert into public.participants (id, session_id, org_id, display_name, rejoin_hash)
  select '00000000-0000-0000-0000-000000018611', s.id, s.org_id, 'Ava', '\x00'::bytea
  from public.sessions s where s.id = '00000000-0000-0000-0000-0000000186d1';

insert into public.session_responses
  (session_id, org_id, participant_id, item_id, item_position, response, points, max_points, model)
  select s.id, s.org_id, '00000000-0000-0000-0000-000000018611',
         '00000000-0000-0000-0000-0000000186e1', 1, '{"type":"multiple_choice"}', 1, 1, 'zero_one'
  from public.sessions s where s.id = '00000000-0000-0000-0000-0000000186d1';

update public.sessions set status = 'ended' where id = '00000000-0000-0000-0000-0000000186d1';

-- ---------------------------------------------------------------------------
-- The host reads everything the report is built from
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000186aa","role":"authenticated"}', true);

select results_eq(
  $$ select title, status::text, closed_at is not null from public.sessions
      where id = '00000000-0000-0000-0000-0000000186d1' $$,
  $$ values ('Report session', 'ended', true) $$,
  'the host reads the ended session, closed'
);

select results_eq(
  $$ select participant_id, item_position, points, max_points from public.session_responses
      where session_id = '00000000-0000-0000-0000-0000000186d1' $$,
  $$ values ('00000000-0000-0000-0000-000000018611'::uuid, 1::smallint, 1::numeric(8, 2),
             1::numeric(8, 2)) $$,
  'the host reads the scores'
);

select results_eq(
  $$ select id, display_name from public.participants
      where session_id = '00000000-0000-0000-0000-0000000186d1' $$,
  $$ values ('00000000-0000-0000-0000-000000018611'::uuid, 'Ava') $$,
  'the host reads the roster by display name'
);

select results_eq(
  $$ select type, cjmm_step, content ->> 'id' from public.items
      where id = '00000000-0000-0000-0000-0000000186e1' $$,
  $$ values ('multiple_choice', 1::smallint, 'rpt-one') $$,
  'the host reads each item''s type, step and id'
);

select throws_ok(
  $$ select rejoin_hash from public.participants
      where session_id = '00000000-0000-0000-0000-0000000186d1' $$,
  '42501',
  null,
  'a participant''s rejoin hash is not readable, even by the host'
);

-- ---------------------------------------------------------------------------
-- A colleague in the same org reads it too
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000186dd","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.sessions where id = '00000000-0000-0000-0000-0000000186d1'),
  1,
  'another instructor in the org sees the session'
);

select is(
  (select count(*)::int from public.session_responses
    where session_id = '00000000-0000-0000-0000-0000000186d1'),
  1,
  'and its scores'
);

select is(
  (select count(*)::int from public.participants
    where session_id = '00000000-0000-0000-0000-0000000186d1'),
  1,
  'and its roster'
);

-- ---------------------------------------------------------------------------
-- Another org's instructor reads nothing: the report is a not-found
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000186bb","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.sessions where id = '00000000-0000-0000-0000-0000000186d1'),
  0,
  'another org''s instructor cannot see the session, so the report reads as not found'
);

select is(
  (select count(*)::int from public.session_responses
    where session_id = '00000000-0000-0000-0000-0000000186d1'),
  0,
  'nor its scores, even by naming the session'
);

select is(
  (select count(*)::int from public.participants
    where session_id = '00000000-0000-0000-0000-0000000186d1'),
  0,
  'nor its roster'
);

select is(
  (select count(*)::int from public.items where id = '00000000-0000-0000-0000-0000000186e1'),
  0,
  'nor its items'
);

select is(
  (select count(*)::int from public.session_item_aggregates
    where session_id = '00000000-0000-0000-0000-0000000186d1'),
  0,
  'nor its tallies'
);

select is(
  (select count(*)::int from public.sessions where title = 'Report session'),
  0,
  'and the session is not in their session list'
);

-- ---------------------------------------------------------------------------
-- A student in the same org reads nothing either
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000186cc","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.sessions where id = '00000000-0000-0000-0000-0000000186d1'),
  0,
  'a student in the org cannot see the session'
);

select is(
  (select count(*)::int from public.session_responses
    where session_id = '00000000-0000-0000-0000-0000000186d1'),
  0,
  'nor the class''s scores'
);

select is(
  (select count(*)::int from public.participants
    where session_id = '00000000-0000-0000-0000-0000000186d1'),
  0,
  'nor the roster'
);

-- ---------------------------------------------------------------------------
-- Anon has no privilege on any of it
-- ---------------------------------------------------------------------------

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$ select count(*) from public.sessions $$,
  '42501',
  null,
  'anon cannot read sessions'
);

select throws_ok(
  $$ select count(*) from public.session_responses $$,
  '42501',
  null,
  'anon cannot read scores'
);

select throws_ok(
  $$ select count(*) from public.participants $$,
  '42501',
  null,
  'anon cannot read a roster'
);

reset role;

-- ---------------------------------------------------------------------------
-- The report leans on no new grant
-- ---------------------------------------------------------------------------

select ok(
  not has_table_privilege('authenticated', 'public.session_responses', 'INSERT, UPDATE, DELETE'),
  'reading a report grants nobody a way to change a score'
);

select * from finish();
rollback;
