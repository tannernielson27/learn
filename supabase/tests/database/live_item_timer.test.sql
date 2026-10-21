-- The per-item timer (#182): the clock the guard trigger derives on every move, the two timer
-- functions, the late-answer refusal, and what the phones are told.
--
-- Every expectation here has a twin in src/lib/live/timer.test.ts or stateTimer.test.ts, which hold
-- the TypeScript state machine to the same moves. `now()` is fixed for the whole transaction, so
-- every end time below is exact. Moving "later" is done by putting the clock where it would be:
-- the guard trigger is disabled for that one write, as the table owner, and enabled again.
begin;
create extension if not exists pgtap with schema extensions;
select plan(50);

-- ---------------------------------------------------------------------------
-- Fixtures, as the superuser
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-0000001820aa', 'timer-host@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000001820bb', 'timer-other@example.test', 'authenticated', 'authenticated');

-- #204: the sign-up trigger grants no role, so make these accounts instructors in the seeded
-- org explicitly, where the trigger used to put them.
update public.profiles
  set org_id = (select id from public.orgs order by created_at, id limit 1), role = 'instructor'
  where id in ('00000000-0000-0000-0000-0000001820aa',
               '00000000-0000-0000-0000-0000001820bb');

insert into public.orgs (id, name) values ('00000000-0000-0000-0000-0000001820f2', 'Other timers');
update public.profiles set org_id = '00000000-0000-0000-0000-0000001820f2'
  where id = '00000000-0000-0000-0000-0000001820bb';

insert into public.item_banks (id, org_id, name)
  select '00000000-0000-0000-0000-0000001820b1', org_id, 'Timer bank'
  from public.profiles where id = '00000000-0000-0000-0000-0000001820aa';

insert into public.items (id, bank_id, org_id, type, status, content, answer_key, scoring)
  select v.id, '00000000-0000-0000-0000-0000001820b1', p.org_id, 'multiple_choice', 'published',
         jsonb_build_object('id', v.ref), '{}', '{}'
  from public.profiles p,
       (values ('00000000-0000-0000-0000-0000001820e1'::uuid, 'itm-one'),
               ('00000000-0000-0000-0000-0000001820e2'::uuid, 'itm-two'),
               ('00000000-0000-0000-0000-0000001820e3'::uuid, 'itm-three')) as v (id, ref)
  where p.id = '00000000-0000-0000-0000-0000001820aa';

insert into public.sessions (id, org_id, host_id, bank_id, title, code, item_set)
  select '00000000-0000-0000-0000-0000001820d1', p.org_id, p.id,
         '00000000-0000-0000-0000-0000001820b1', 'Timers', 'TMR234',
         '["00000000-0000-0000-0000-0000001820e1",
           "00000000-0000-0000-0000-0000001820e2",
           "00000000-0000-0000-0000-0000001820e3"]'::jsonb
  from public.profiles p where p.id = '00000000-0000-0000-0000-0000001820aa';

-- Puts the room's clock where it would be after time had passed. The owner's escape hatch, for
-- this file only: the trigger is off for exactly one write.
create function pg_temp.set_clock(ends timestamptz, frozen integer) returns void
language plpgsql as $$
begin
  alter table public.sessions disable trigger sessions_guard_change;
  update public.sessions set item_ends_at = ends, timer_remaining_ms = frozen
   where id = '00000000-0000-0000-0000-0000001820d1';
  alter table public.sessions enable trigger sessions_guard_change;
end;
$$;

create function pg_temp.clock() returns table (ends timestamptz, frozen integer)
language sql as $$
  select item_ends_at, timer_remaining_ms from public.sessions
   where id = '00000000-0000-0000-0000-0000001820d1';
$$;

select columns_are(
  'live', 'session_public_state',
  array['session_id', 'status', 'item_position', 'item_count', 'reveal', 'item_ends_at',
        'timer_seconds', 'timer_remaining_ms', 'updated_at'],
  'the public mirror gains the chosen time and the frozen remainder, and still no org, host or code'
);

-- ---------------------------------------------------------------------------
-- Choosing a time, and starting
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000001820aa","role":"authenticated"}', true);

update public.sessions set timer_seconds = 30 where id = '00000000-0000-0000-0000-0000001820d1';

select results_eq(
  $$ select ends, frozen from pg_temp.clock() $$,
  $$ values (null::timestamptz, null::integer) $$,
  'choosing a time in the lobby runs no clock'
);

reset role;
select results_eq(
  $$ select timer_seconds, item_ends_at from live.session_public_state
      where session_id = '00000000-0000-0000-0000-0000001820d1' $$,
  $$ values (30, null::timestamptz) $$,
  'the phones are told the chosen time'
);
set local role authenticated;

-- A client that sends its own end time with the move is ignored: the trigger derives it.
update public.sessions
   set status = 'running', current_position = 1, item_ends_at = now() + interval '1 hour'
 where id = '00000000-0000-0000-0000-0000001820d1';

select results_eq(
  $$ select ends, frozen from pg_temp.clock() $$,
  $$ values (now() + interval '30 seconds', null::integer) $$,
  'starting puts the whole chosen time on the first item, from the database''s clock'
);

reset role;
select results_eq(
  $$ select item_ends_at, timer_remaining_ms from live.session_public_state
      where session_id = '00000000-0000-0000-0000-0000001820d1' $$,
  $$ values (now() + interval '30 seconds', null::integer) $$,
  'and the phones are told the same end time'
);
set local role authenticated;

-- ---------------------------------------------------------------------------
-- Writes to the clock alone: extend or stop, nothing else
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ update public.sessions set item_ends_at = now() + interval '10 seconds'
      where id = '00000000-0000-0000-0000-0000001820d1' $$,
  '22023', null,
  'a clock cannot be shortened'
);

select throws_ok(
  $$ update public.sessions set item_ends_at = now() + interval '2 hours'
      where id = '00000000-0000-0000-0000-0000001820d1' $$,
  '22023', null,
  'nor run past an hour'
);

select throws_ok(
  $$ update public.sessions set timer_remaining_ms = 3000000, item_ends_at = null
      where id = '00000000-0000-0000-0000-0000001820d1' $$,
  '23514', null,
  'nor be frozen while the room is running'
);

select lives_ok(
  $$ select public.extend_item_timer('00000000-0000-0000-0000-0000001820d1') $$,
  'the host may add fifteen seconds'
);

select results_eq(
  $$ select ends from pg_temp.clock() $$,
  $$ values (now() + interval '45 seconds') $$,
  'which lands fifteen seconds after the old end'
);

reset role;
select results_eq(
  $$ select item_ends_at from live.session_public_state
      where session_id = '00000000-0000-0000-0000-0000001820d1' $$,
  $$ values (now() + interval '45 seconds') $$,
  'and reaches the phones'
);

-- After it has run out, adding time counts from now: fifteen seconds the room can use.
select pg_temp.set_clock(now() - interval '1 minute', null);
set local role authenticated;
select public.extend_item_timer('00000000-0000-0000-0000-0000001820d1');
select results_eq(
  $$ select ends from pg_temp.clock() $$,
  $$ values (now() + interval '15 seconds') $$,
  'adding time to a clock that has run out gives fifteen fresh seconds'
);

-- ---------------------------------------------------------------------------
-- The late answer
-- ---------------------------------------------------------------------------

reset role;
select pg_temp.set_clock(now() - interval '1 second', null);
set local role service_role;

select is(
  (select refusal from public.begin_session_submission(
     '00000000-0000-0000-0000-0000001820d1', '00000000-0000-0000-0000-000000182111')),
  null,
  'an answer inside the two seconds of grace is taken'
);

select is(
  (select r.refusal from public.record_session_response(
     '00000000-0000-0000-0000-0000001820d1', '00000000-0000-0000-0000-000000182111',
     1::smallint, '00000000-0000-0000-0000-0000001820e1', '{"type":"multiple_choice"}'::jsonb,
     1, 1, 'zero_one', '[]'::jsonb) r),
  null,
  'and written down'
);

reset role;
select pg_temp.set_clock(now() - interval '2 seconds 1 millisecond', null);
set local role service_role;

select results_eq(
  $$ select refusal, item_position, item_id from public.begin_session_submission(
       '00000000-0000-0000-0000-0000001820d1', '00000000-0000-0000-0000-000000182122') $$,
  $$ values ('time_up'::text, null::smallint, null::uuid) $$,
  'an answer after the grace is refused before it is scored, with its own code'
);

select is(
  (select r.refusal from public.record_session_response(
     '00000000-0000-0000-0000-0000001820d1', '00000000-0000-0000-0000-000000182122',
     1::smallint, '00000000-0000-0000-0000-0000001820e1', '{"type":"multiple_choice"}'::jsonb,
     1, 1, 'zero_one', '[]'::jsonb) r),
  'time_up',
  'and refused again at the write, which is the check that decides'
);

select is(
  (select count(*)::int from public.session_responses
    where session_id = '00000000-0000-0000-0000-0000001820d1'),
  1,
  'so only the answer in time is on record'
);

-- ---------------------------------------------------------------------------
-- Pause and resume
-- ---------------------------------------------------------------------------

reset role;
select pg_temp.set_clock(now() + interval '20 seconds', null);
set local role authenticated;

update public.sessions set status = 'paused' where id = '00000000-0000-0000-0000-0000001820d1';

select results_eq(
  $$ select ends, frozen from pg_temp.clock() $$,
  $$ values (null::timestamptz, 20000) $$,
  'pausing freezes what is left'
);

reset role;
select results_eq(
  $$ select item_ends_at, timer_remaining_ms from live.session_public_state
      where session_id = '00000000-0000-0000-0000-0000001820d1' $$,
  $$ values (null::timestamptz, 20000) $$,
  'and the phones are told the frozen remainder'
);
set local role service_role;

select is(
  (select refusal from public.begin_session_submission(
     '00000000-0000-0000-0000-0000001820d1', '00000000-0000-0000-0000-000000182133')),
  'paused',
  'a paused room says paused, not time up'
);

set local role authenticated;
select throws_ok(
  $$ update public.sessions set item_ends_at = now() + interval '40 seconds',
                                timer_remaining_ms = null
      where id = '00000000-0000-0000-0000-0000001820d1' $$,
  '22023', null,
  'a paused room''s clock cannot be set running'
);

select public.extend_item_timer('00000000-0000-0000-0000-0000001820d1');
select results_eq(
  $$ select ends, frozen from pg_temp.clock() $$,
  $$ values (null::timestamptz, 35000) $$,
  'adding time to a paused room adds it to the frozen clock without starting it'
);

update public.sessions set status = 'running' where id = '00000000-0000-0000-0000-0000001820d1';
select results_eq(
  $$ select ends, frozen from pg_temp.clock() $$,
  $$ values (now() + interval '35 seconds', null::integer) $$,
  'resuming gives back exactly what was left'
);

-- A clock that had already run out is not frozen by a pause, and so nothing is handed back.
reset role;
select pg_temp.set_clock(now() - interval '5 seconds', null);
set local role authenticated;
update public.sessions set status = 'paused' where id = '00000000-0000-0000-0000-0000001820d1';
select results_eq(
  $$ select ends, frozen from pg_temp.clock() $$,
  $$ values (now() - interval '5 seconds', null::integer) $$,
  'pausing an item whose time is up leaves it up'
);
update public.sessions set status = 'running' where id = '00000000-0000-0000-0000-0000001820d1';
select results_eq(
  $$ select ends, frozen from pg_temp.clock() $$,
  $$ values (now() - interval '5 seconds', null::integer) $$,
  'and resuming it does not give the time back'
);

-- ---------------------------------------------------------------------------
-- Reveal, advance, and a new time
-- ---------------------------------------------------------------------------

update public.sessions set reveal = true where id = '00000000-0000-0000-0000-0000001820d1';
select results_eq(
  $$ select ends, frozen from pg_temp.clock() $$,
  $$ values (null::timestamptz, null::integer) $$,
  'showing the answer stops the clock'
);

select throws_ok(
  $$ select public.extend_item_timer('00000000-0000-0000-0000-0000001820d1') $$,
  '22023', null,
  'and there is then no clock to add to'
);

update public.sessions set current_position = 2, reveal = false
 where id = '00000000-0000-0000-0000-0000001820d1';
select results_eq(
  $$ select ends, frozen from pg_temp.clock() $$,
  $$ values (now() + interval '30 seconds', null::integer) $$,
  'advancing gives the next item the whole chosen time'
);

select is(
  (select timer_seconds from public.sessions where id = '00000000-0000-0000-0000-0000001820d1'),
  30,
  'the chosen time survives the reveal'
);

update public.sessions set timer_seconds = 60 where id = '00000000-0000-0000-0000-0000001820d1';
select results_eq(
  $$ select ends from pg_temp.clock() $$,
  $$ values (now() + interval '30 seconds') $$,
  'choosing a new time leaves the clock on the item already showing alone'
);

update public.sessions set status = 'paused' where id = '00000000-0000-0000-0000-0000001820d1';
update public.sessions set current_position = 3 where id = '00000000-0000-0000-0000-0000001820d1';
select results_eq(
  $$ select ends, frozen from pg_temp.clock() $$,
  $$ values (null::timestamptz, 60000) $$,
  'an item moved to while paused gets the new time, frozen'
);

update public.sessions set status = 'running' where id = '00000000-0000-0000-0000-0000001820d1';
select results_eq(
  $$ select ends, frozen from pg_temp.clock() $$,
  $$ values (now() + interval '60 seconds', null::integer) $$,
  'and starts it when the room resumes'
);

-- ---------------------------------------------------------------------------
-- Stop, off, and end
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ select public.stop_item_timer('00000000-0000-0000-0000-0000001820d1') $$,
  'the host may stop the timer'
);
select results_eq(
  $$ select ends, frozen from pg_temp.clock() $$,
  $$ values (null::timestamptz, null::integer) $$,
  'which takes the clock off the item'
);
select lives_ok(
  $$ select public.stop_item_timer('00000000-0000-0000-0000-0000001820d1') $$,
  'and stopping twice is not an error'
);

reset role;
select is(
  (select refusal from public.begin_session_submission(
     '00000000-0000-0000-0000-0000001820d1', '00000000-0000-0000-0000-000000182144')),
  null,
  'with the timer stopped the item takes answers until the host moves on'
);
set local role authenticated;

select throws_ok(
  $$ update public.sessions set item_ends_at = now() + interval '30 seconds'
      where id = '00000000-0000-0000-0000-0000001820d1' $$,
  '22023', null,
  'a clock cannot be conjured onto an item that has none'
);

-- Back to item one's shape for the end: a running clock, then the end takes it away.
update public.sessions set timer_seconds = null where id = '00000000-0000-0000-0000-0000001820d1';
reset role;
select pg_temp.set_clock(now() + interval '10 seconds', null);
set local role authenticated;
select public.end_session('00000000-0000-0000-0000-0000001820d1');
select results_eq(
  $$ select ends, frozen from pg_temp.clock() $$,
  $$ values (null::timestamptz, null::integer) $$,
  'ending the session stops the clock'
);

select throws_ok(
  $$ select public.extend_item_timer('00000000-0000-0000-0000-0000001820d1') $$,
  '22023', null,
  'and an ended session has no timer to add to'
);

-- ---------------------------------------------------------------------------
-- A second room, for the view route and for who may press the buttons
-- ---------------------------------------------------------------------------

reset role;
insert into public.sessions (id, org_id, host_id, bank_id, title, code, item_set, timer_seconds)
  select '00000000-0000-0000-0000-0000001820d2', p.org_id, p.id,
         '00000000-0000-0000-0000-0000001820b1', 'Timers two', 'TMR235',
         '["00000000-0000-0000-0000-0000001820e1"]'::jsonb, 90
  from public.profiles p where p.id = '00000000-0000-0000-0000-0000001820aa';

set local role authenticated;
update public.sessions set status = 'running', current_position = 1
 where id = '00000000-0000-0000-0000-0000001820d2';

set local role service_role;
select results_eq(
  $$ select refusal, session_timer_seconds, session_ends_at, session_remaining_ms, server_now
       from public.begin_session_view(
         '00000000-0000-0000-0000-0000001820d2', '00000000-0000-0000-0000-000000182155') $$,
  $$ values (null::text, 90, now() + interval '90 seconds', null::integer, now()) $$,
  'the view route is told the whole clock and the database''s own time'
);

select is(
  (select session_status::text from public.begin_session_view(
     '00000000-0000-0000-0000-0000001820d2', '00000000-0000-0000-0000-000000182155')),
  'running',
  'and still the status it always was'
);

set local role authenticated;
select is(public.server_clock(), now(), 'a host console can read the database''s clock');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000001820bb","role":"authenticated"}', true);
select throws_ok(
  $$ select public.extend_item_timer('00000000-0000-0000-0000-0000001820d2') $$,
  'P0002', null,
  'a host in another org cannot add time to this room: it reads as gone'
);
select throws_ok(
  $$ select public.stop_item_timer('00000000-0000-0000-0000-0000001820d2') $$,
  'P0002', null,
  'nor stop its timer'
);

reset role;
select results_eq(
  $$ select ends, frozen from (select item_ends_at as ends, timer_remaining_ms as frozen
       from public.sessions where id = '00000000-0000-0000-0000-0000001820d2') c $$,
  $$ values (now() + interval '90 seconds', null::integer) $$,
  'so the other org''s presses changed nothing'
);

set local role anon;
select throws_ok(
  $$ select public.extend_item_timer('00000000-0000-0000-0000-0000001820d2') $$,
  '42501', null,
  'a student cannot add time'
);
select throws_ok(
  $$ select public.stop_item_timer('00000000-0000-0000-0000-0000001820d2') $$,
  '42501', null,
  'nor stop the clock'
);
select throws_ok(
  $$ select public.server_clock() $$,
  '42501', null,
  'nor call the host''s clock'
);
reset role;

select is(
  has_function_privilege('authenticated', 'public.begin_session_view(uuid, uuid)', 'execute'),
  false,
  'the view read is still the server''s alone after being recreated'
);
select is(
  has_function_privilege('service_role', 'public.begin_session_view(uuid, uuid)', 'execute'),
  true,
  'and the server still has it'
);

select * from finish();
rollback;
