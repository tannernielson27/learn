-- Live responses and aggregates (#131): the trigger that keeps `session_item_aggregates`, the
-- functions the submission route calls, and the row level security on all three new tables.
-- Runs with `pnpm exec supabase test db`. Uses its own fixture ids so it never counts the seed's.
begin;
create extension if not exists pgtap with schema extensions;
select plan(52);

-- ---------------------------------------------------------------------------
-- Fixtures, as the superuser
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-0000000131aa', 'agg-host@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000131bb', 'agg-other@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000131cc', 'agg-student@example.test', 'authenticated', 'authenticated');

-- B is in a second org, so org isolation is exercised; C is a student in A's org, so the author
-- half of every policy is exercised too.
insert into public.orgs (id, name) values ('00000000-0000-0000-0000-0000000131f2', 'Other aggregates');
update public.profiles set org_id = '00000000-0000-0000-0000-0000000131f2'
  where id = '00000000-0000-0000-0000-0000000131bb';
update public.profiles set role = 'student' where id = '00000000-0000-0000-0000-0000000131cc';

insert into public.item_banks (id, org_id, name)
  select '00000000-0000-0000-0000-0000000131b1', org_id, 'Aggregate bank'
  from public.profiles where id = '00000000-0000-0000-0000-0000000131aa';

-- Two published items. `content` carries the item's own id, which is what the aggregate's
-- `item_ref` is copied from and what every transport payload calls the item by.
insert into public.items (id, bank_id, org_id, type, status, content, answer_key, scoring)
  select v.id, '00000000-0000-0000-0000-0000000131b1', p.org_id, 'multiple_choice', 'published',
         jsonb_build_object('id', v.ref), '{}', '{}'
  from public.profiles p,
       (values ('00000000-0000-0000-0000-0000000131e1'::uuid, 'itm-one'),
               ('00000000-0000-0000-0000-0000000131e2'::uuid, 'itm-two')) as v (id, ref)
  where p.id = '00000000-0000-0000-0000-0000000131aa';

insert into public.sessions (id, org_id, host_id, bank_id, title, code, item_set)
  select '00000000-0000-0000-0000-0000000131d1', p.org_id, p.id,
         '00000000-0000-0000-0000-0000000131b1', 'Aggregates', 'AGG234',
         '["00000000-0000-0000-0000-0000000131e1",
           "00000000-0000-0000-0000-0000000131e2"]'::jsonb
  from public.profiles p where p.id = '00000000-0000-0000-0000-0000000131aa';

-- ---------------------------------------------------------------------------
-- The session's public mirror
-- ---------------------------------------------------------------------------

select results_eq(
  $$ select status::text, item_position, item_count, reveal
     from live.session_public_state
    where session_id = '00000000-0000-0000-0000-0000000131d1' $$,
  $$ values ('lobby', null::smallint, 2, false) $$,
  'inserting a session mirrors its four public facts and nothing else'
);

select columns_are(
  'live', 'session_public_state',
  array['session_id', 'status', 'item_position', 'item_count', 'reveal', 'item_ends_at',
        'updated_at'],
  'the public mirror carries no org, no host, no code, no title and no item ids'
);

-- ---------------------------------------------------------------------------
-- The aggregate trigger, from a host who is allowed to drive the session
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000131aa","role":"authenticated"}', true);

update public.sessions set status = 'running', current_position = 1
  where id = '00000000-0000-0000-0000-0000000131d1';

select is(
  (select count(*)::int from public.session_item_aggregates
    where session_id = '00000000-0000-0000-0000-0000000131d1'),
  0,
  'starting a session writes no tally: there is no item behind it yet'
);

select results_eq(
  $$ select status::text, item_position, reveal from live.session_public_state
      where session_id = '00000000-0000-0000-0000-0000000131d1' $$,
  $$ values ('running', 1::smallint, false) $$,
  'the mirror follows the session into running'
);

reset role;

-- Two answers to item one, written the way the route handler writes them.
set local role service_role;

select results_eq(
  $$ select refusal, item_position, item_id from public.begin_session_submission(
       '00000000-0000-0000-0000-0000000131d1',
       '00000000-0000-0000-0000-000000013111') $$,
  $$ values (null::text, 1::smallint, '00000000-0000-0000-0000-0000000131e1'::uuid) $$,
  'begin_session_submission answers with the item the room is on and no refusal'
);

select is(
  (select r.refusal from public.record_session_response(
     '00000000-0000-0000-0000-0000000131d1', '00000000-0000-0000-0000-000000013111',
     1::smallint, '00000000-0000-0000-0000-0000000131e1', '{"type":"multiple_choice"}'::jsonb,
     1, 1, 'zero_one', '[]'::jsonb) r),
  null,
  'a first answer is taken'
);

select is(
  (select r.refusal from public.record_session_response(
     '00000000-0000-0000-0000-0000000131d1', '00000000-0000-0000-0000-000000013111',
     1::smallint, '00000000-0000-0000-0000-0000000131e1', '{"type":"multiple_choice"}'::jsonb,
     1, 1, 'zero_one', '[]'::jsonb) r),
  'already_answered',
  'and the same person cannot answer the same item twice'
);

select is(
  (select r.refusal from public.record_session_response(
     '00000000-0000-0000-0000-0000000131d1', '00000000-0000-0000-0000-000000013122',
     1::smallint, '00000000-0000-0000-0000-0000000131e2', '{"type":"multiple_choice"}'::jsonb,
     1, 1, 'zero_one', '[]'::jsonb) r),
  'wrong_item',
  'an answer to an item the room is not on is refused'
);

select is(
  (select r.refusal from public.record_session_response(
     '00000000-0000-0000-0000-0000000131d1', '00000000-0000-0000-0000-000000013122',
     1::smallint, '00000000-0000-0000-0000-0000000131e1', '{"type":"multiple_choice"}'::jsonb,
     0, 1, 'zero_one', '[]'::jsonb) r),
  null,
  'a second person answers the same item'
);

reset role;

select is(
  (select count(*)::int from public.session_item_aggregates
    where session_id = '00000000-0000-0000-0000-0000000131d1'),
  0,
  'two answers and still no tally: aggregates are not written per submission (ADR 0002)'
);

-- Revealing is an item change, so now there is one.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000131aa","role":"authenticated"}', true);

update public.sessions set reveal = true where id = '00000000-0000-0000-0000-0000000131d1';

select results_eq(
  $$ select item_position, item_id, item_ref, responded, full_marks, partial_marks, no_marks,
            mean_points, max_points
       from public.session_item_aggregates
      where session_id = '00000000-0000-0000-0000-0000000131d1' $$,
  $$ values (1::smallint, '00000000-0000-0000-0000-0000000131e1'::uuid, 'itm-one', 2, 1, 0, 1,
             0.50::numeric(8,2), 1.00::numeric(8,2)) $$,
  'revealing tallies the item now showing: how the marks fell, and the item''s own id'
);

select is(
  (select count(*)::int from public.session_item_aggregates
    where session_id = '00000000-0000-0000-0000-0000000131d1'),
  1,
  'one item changed, so exactly one tally exists'
);

-- Pausing and resuming change nothing about the item, so they must write nothing.
create temporary table computed_before as
  select computed_at from public.session_item_aggregates
   where session_id = '00000000-0000-0000-0000-0000000131d1' and item_position = 1;

update public.sessions set status = 'paused' where id = '00000000-0000-0000-0000-0000000131d1';
update public.sessions set status = 'running' where id = '00000000-0000-0000-0000-0000000131d1';

select results_eq(
  $$ select a.computed_at from public.session_item_aggregates a
      where a.session_id = '00000000-0000-0000-0000-0000000131d1' and a.item_position = 1 $$,
  $$ select computed_at from computed_before $$,
  'pausing and resuming rewrite no tally, so no message goes out for them'
);

-- Advancing tallies the item just left, not the one arrived at.
update public.sessions set current_position = 2, reveal = false
  where id = '00000000-0000-0000-0000-0000000131d1';

select results_eq(
  $$ select item_position from public.session_item_aggregates
      where session_id = '00000000-0000-0000-0000-0000000131d1' order by item_position $$,
  $$ values (1::smallint) $$,
  'advancing rewrites the tally for the item the room has just left, and starts none for the new one'
);

-- Ending tallies the item the room was on, even with nothing answered.
update public.sessions set status = 'ended' where id = '00000000-0000-0000-0000-0000000131d1';

select results_eq(
  $$ select item_position, item_ref, responded, mean_points from public.session_item_aggregates
      where session_id = '00000000-0000-0000-0000-0000000131d1' and item_position = 2 $$,
  $$ values (2::smallint, 'itm-two', 0, 0.00::numeric(8,2)) $$,
  'ending tallies the item the room was on, zeroes and all'
);

select results_eq(
  $$ select status::text, reveal from live.session_public_state
      where session_id = '00000000-0000-0000-0000-0000000131d1' $$,
  $$ values ('ended', false) $$,
  'the mirror follows the session to ended, with nothing left revealed'
);

-- ---------------------------------------------------------------------------
-- A session that never reached an item
-- ---------------------------------------------------------------------------

insert into public.sessions (id, org_id, host_id, bank_id, title, code, item_set)
  select '00000000-0000-0000-0000-0000000131d2', p.org_id, p.id,
         '00000000-0000-0000-0000-0000000131b1', 'Never run', 'AGG235',
         '["00000000-0000-0000-0000-0000000131e1"]'::jsonb
  from public.profiles p where p.id = '00000000-0000-0000-0000-0000000131aa';
update public.sessions set status = 'ended' where id = '00000000-0000-0000-0000-0000000131d2';

select is(
  (select count(*)::int from public.session_item_aggregates
    where session_id = '00000000-0000-0000-0000-0000000131d2'),
  0,
  'a session ended from the lobby tallies nothing at all'
);

-- ---------------------------------------------------------------------------
-- Every refusal the two submission functions can answer with
-- ---------------------------------------------------------------------------
--
-- These are the branches the route handler turns straight into the sentence `LIVE_REFUSALS`
-- holds, and they are in the same order as `canSubmit` in src/lib/live/state.ts. A flipped
-- condition here would reach a classroom as the wrong sentence, so each one is exercised.

insert into public.sessions (id, org_id, host_id, bank_id, title, code, item_set)
  select '00000000-0000-0000-0000-0000000131d3', p.org_id, p.id,
         '00000000-0000-0000-0000-0000000131b1', 'Refusals', 'AGG236',
         '["00000000-0000-0000-0000-0000000131e1",
           "00000000-0000-0000-0000-0000000131e2"]'::jsonb
  from public.profiles p where p.id = '00000000-0000-0000-0000-0000000131aa';

create function pg_temp.refusals(target uuid, who uuid)
returns table (opening text, writing text)
language sql as $$
  select (select b.refusal from public.begin_session_submission(target, who) b),
         (select r.refusal from public.record_session_response(
            target, who, 1::smallint, '00000000-0000-0000-0000-0000000131e1',
            '{"type":"multiple_choice"}'::jsonb, 1, 1, 'zero_one', '[]'::jsonb) r);
$$;
grant execute on function pg_temp.refusals(uuid, uuid) to service_role;

set local role service_role;

select results_eq(
  $$ select opening, writing from pg_temp.refusals(
       '00000000-0000-0000-0000-0000000131d3', '00000000-0000-0000-0000-000000013144') $$,
  $$ values ('not_started', 'not_started') $$,
  'a room still in the lobby is on no item, so neither function takes an answer'
);

select results_eq(
  $$ select opening, writing from pg_temp.refusals(
       '00000000-0000-0000-0000-00000000dead', '00000000-0000-0000-0000-000000013144') $$,
  $$ values ('not_open', 'not_open') $$,
  'a session that does not exist is over, as far as an answer is concerned'
);

reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000131aa","role":"authenticated"}', true);
update public.sessions set status = 'running', current_position = 1
  where id = '00000000-0000-0000-0000-0000000131d3';
update public.sessions set status = 'paused' where id = '00000000-0000-0000-0000-0000000131d3';
reset role;

set local role service_role;
select results_eq(
  $$ select opening, writing from pg_temp.refusals(
       '00000000-0000-0000-0000-0000000131d3', '00000000-0000-0000-0000-000000013144') $$,
  $$ values ('paused', 'paused') $$,
  'a paused room takes no answers'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000131aa","role":"authenticated"}', true);
update public.sessions set status = 'running' where id = '00000000-0000-0000-0000-0000000131d3';
update public.sessions set reveal = true where id = '00000000-0000-0000-0000-0000000131d3';
reset role;

set local role service_role;
select results_eq(
  $$ select opening, writing from pg_temp.refusals(
       '00000000-0000-0000-0000-0000000131d3', '00000000-0000-0000-0000-000000013144') $$,
  $$ values ('already_revealed', 'already_revealed') $$,
  'once the key is showing a submission is not an answer, it is a copy'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000131aa","role":"authenticated"}', true);
update public.sessions set status = 'ended' where id = '00000000-0000-0000-0000-0000000131d3';
reset role;

set local role service_role;
select results_eq(
  $$ select opening, writing from pg_temp.refusals(
       '00000000-0000-0000-0000-0000000131d3', '00000000-0000-0000-0000-000000013144') $$,
  $$ values ('not_open', 'not_open') $$,
  'and an ended session refuses both, for ever'
);
reset role;

-- ---------------------------------------------------------------------------
-- How often one person may answer
-- ---------------------------------------------------------------------------

select ok(
  (select bool_and(private.take_session_submission('00000000-0000-0000-0000-000000013155'))
     from generate_series(1, 120)),
  'the first hundred and twenty attempts in a window are all allowed'
);

select ok(
  not private.take_session_submission('00000000-0000-0000-0000-000000013155'),
  'and the hundred and twenty-first is not'
);

set local role service_role;
select is(
  (select b.refusal from public.begin_session_submission(
     '00000000-0000-0000-0000-0000000131d1', '00000000-0000-0000-0000-000000013155') b),
  'rate_limited',
  'so the submission route is told to back off before it scores anything'
);
reset role;

select is(
  (select count(*)::int from private.session_submits
    where participant_id = '00000000-0000-0000-0000-000000013155' and calls > 121),
  0,
  'and attempts over the limit are counted no further, so hammering does not lengthen the wait'
);

-- ---------------------------------------------------------------------------
-- Row level security: who may read a tally
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000131aa","role":"authenticated"}', true);

-- Three: two from the session above, and one from the refusals session, which ended on its first
-- item. Every one of them is this host's own org's.
select results_eq(
  $$ select count(*)::int from public.session_item_aggregates $$,
  $$ values (3) $$,
  'the host reads their own org''s tallies'
);

select results_eq(
  $$ select count(*)::int from public.session_responses $$,
  $$ values (2) $$,
  'and their own org''s responses'
);

select throws_ok(
  $$ insert into public.session_item_aggregates
       (session_id, item_position, org_id, item_id, item_ref)
     values ('00000000-0000-0000-0000-0000000131d1', 9, '00000000-0000-0000-0000-0000000131f2',
             '00000000-0000-0000-0000-0000000131e1', 'forged') $$,
  '42501', null,
  'a host cannot write a tally by hand, however much they can read'
);

select throws_ok(
  $$ update public.session_item_aggregates set responded = 99 $$,
  '42501', null,
  'nor edit one'
);

select throws_ok(
  $$ insert into public.session_responses
       (session_id, org_id, participant_id, item_id, item_position, response, points, max_points,
        model)
     select '00000000-0000-0000-0000-0000000131d1', org_id,
            '00000000-0000-0000-0000-000000013133', '00000000-0000-0000-0000-0000000131e1', 1,
            '{}'::jsonb, 99, 99, 'zero_one'
       from public.profiles where id = '00000000-0000-0000-0000-0000000131aa' $$,
  '42501', null,
  'and cannot write a response: scoring is the route handler''s, through record_session_response'
);

select throws_ok(
  $$ update live.session_public_state set reveal = true $$,
  '42501', null,
  'nobody edits the public mirror: the trigger owns every row of it'
);

select throws_ok(
  $$ select public.begin_session_submission('00000000-0000-0000-0000-0000000131d1',
                                            '00000000-0000-0000-0000-000000013111') $$,
  '42501', null,
  'a signed-in user cannot open a submission: that is the server''s alone'
);

select throws_ok(
  $$ select public.record_session_response(
       '00000000-0000-0000-0000-0000000131d1', '00000000-0000-0000-0000-000000013111',
       1::smallint, '00000000-0000-0000-0000-0000000131e1', '{}'::jsonb, 9, 9, 'zero_one',
       '[]'::jsonb) $$,
  '42501', null,
  'nor record one'
);

reset role;

-- A student in the host's own org. Reading a tally before the reveal is reading the room.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000131cc","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.session_item_aggregates), 0,
  'a student in the same org reads no tally'
);

select is(
  (select count(*)::int from public.session_responses), 0,
  'and no responses, not even their own class''s'
);

select is(
  (select count(*)::int from live.session_public_state
    where session_id = '00000000-0000-0000-0000-0000000131d1'),
  1,
  'but may read the four public facts about a session they are in'
);

reset role;

-- An author in another org.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000131bb","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.session_item_aggregates), 0,
  'another org''s author reads no tally'
);

select is(
  (select count(*)::int from public.session_responses), 0,
  'and no responses'
);

reset role;

-- Anonymous: the only thing a student's browser is, before #129 hands it a participant token.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$ select count(*) from public.session_item_aggregates $$,
  '42501', null,
  'anon has no privilege on the tallies at all, policy or no policy'
);

select throws_ok(
  $$ select count(*) from public.session_responses $$,
  '42501', null,
  'nor on the responses'
);

select is(
  (select count(*)::int from live.session_public_state
    where session_id = '00000000-0000-0000-0000-0000000131d1'),
  1,
  'anon may read the public mirror, which is how a student who is not signed in follows the room'
);

select throws_ok(
  $$ update live.session_public_state set status = 'running' $$,
  '42501', null,
  'but cannot write to it'
);

select throws_ok(
  $$ select public.resolve_session_code('AGG234') $$,
  '42501', null,
  'and still cannot resolve a code: that stays the server''s (#128)'
);

reset role;

-- ---------------------------------------------------------------------------
-- The privileges themselves, said once more where a policy cannot reach
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and table_name in
            ('session_item_aggregates', 'session_responses', 'session_public_state')
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
      and grantee in ('anon', 'authenticated', 'service_role')),
  0,
  'no role may write any of the three tables through the Data API, service role included'
);

select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'session_responses'
      and privilege_type = 'SELECT' and grantee = 'anon'),
  0,
  'and anon cannot read a response'
);

select ok(
  (select relrowsecurity from pg_class
    where oid = 'public.session_item_aggregates'::regclass),
  'row level security is on for the tallies'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.session_responses'::regclass),
  'and for the responses'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'live.session_public_state'::regclass),
  'and for the public mirror'
);

select ok(
  exists (select 1 from pg_publication_tables
           where pubname = 'supabase_realtime' and schemaname = 'live'
             and tablename = 'session_public_state'),
  'the public mirror is published to Realtime, which is how a participant hears about a move'
);

select ok(
  exists (select 1 from pg_publication_tables
           where pubname = 'supabase_realtime' and schemaname = 'public'
             and tablename = 'session_item_aggregates'),
  'and so are the tallies, for the host console'
);

select ok(
  not exists (select 1 from pg_publication_tables
               where pubname = 'supabase_realtime' and schemaname = 'public'
                 and tablename = 'sessions'),
  'the session row itself is not: its org, host, code and item set never travel over a channel'
);

select * from finish();
rollback;
