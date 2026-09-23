-- Skip an item, or go back to one (#183): the position rules `private.guard_session_change` holds
-- since 20260923060000_session_goto.sql.
--
-- Every expectation here has a twin in src/lib/live/stateGoto.test.ts, which holds `goToItem` to
-- the same moves: in-range jumps accepted forwards and back while running or paused, refused in
-- the lobby, out of range and once ended; the reveal cleared on every move; the clock re-armed as
-- on `advance`; answers already given kept.
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

-- ---------------------------------------------------------------------------
-- Fixtures, as the superuser
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role)
values ('00000000-0000-0000-0000-0000001830aa', 'goto-host@example.test', 'authenticated', 'authenticated');

-- #204: the sign-up trigger grants no role, so make these accounts instructors in the seeded
-- org explicitly, where the trigger used to put them.
update public.profiles
  set org_id = (select id from public.orgs order by created_at, id limit 1), role = 'instructor'
  where id in ('00000000-0000-0000-0000-0000001830aa');

insert into public.item_banks (id, org_id, name)
  select '00000000-0000-0000-0000-0000001830b1', org_id, 'Goto bank'
  from public.profiles where id = '00000000-0000-0000-0000-0000001830aa';

insert into public.items (id, bank_id, org_id, type, status, content, answer_key, scoring)
  select v.id, '00000000-0000-0000-0000-0000001830b1', p.org_id, 'multiple_choice', 'published',
         jsonb_build_object('id', v.ref), '{}', '{}'
  from public.profiles p,
       (values ('00000000-0000-0000-0000-0000001830e1'::uuid, 'itm-one'),
               ('00000000-0000-0000-0000-0000001830e2'::uuid, 'itm-two'),
               ('00000000-0000-0000-0000-0000001830e3'::uuid, 'itm-three'),
               ('00000000-0000-0000-0000-0000001830e4'::uuid, 'itm-four')) as v (id, ref)
  where p.id = '00000000-0000-0000-0000-0000001830aa';

insert into public.sessions (id, org_id, host_id, bank_id, title, code, item_set)
  select '00000000-0000-0000-0000-0000001830d1', p.org_id, p.id,
         '00000000-0000-0000-0000-0000001830b1', 'Goto', 'GTX234',
         '["00000000-0000-0000-0000-0000001830e1",
           "00000000-0000-0000-0000-0000001830e2",
           "00000000-0000-0000-0000-0000001830e3",
           "00000000-0000-0000-0000-0000001830e4"]'::jsonb
  from public.profiles p where p.id = '00000000-0000-0000-0000-0000001830aa';

create function pg_temp.room() returns table (status public.session_status, pos smallint, shown boolean)
language sql as $$
  select status, current_position, reveal from public.sessions
   where id = '00000000-0000-0000-0000-0000001830d1';
$$;

-- ---------------------------------------------------------------------------
-- The lobby
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000001830aa","role":"authenticated"}', true);

select throws_ok(
  $$ update public.sessions set current_position = 2
      where id = '00000000-0000-0000-0000-0000001830d1' $$,
  '22023', null,
  'a room in the lobby cannot be sent to an item'
);

select throws_ok(
  $$ update public.sessions set status = 'running', current_position = 3
      where id = '00000000-0000-0000-0000-0000001830d1' $$,
  '22023', null,
  'starting puts the room on its first item and nowhere else'
);

select lives_ok(
  $$ update public.sessions set status = 'running', current_position = 1
      where id = '00000000-0000-0000-0000-0000001830d1' $$,
  'starting on the first item is still allowed'
);

-- ---------------------------------------------------------------------------
-- Jumping while running
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ update public.sessions set current_position = 3
      where id = '00000000-0000-0000-0000-0000001830d1' $$,
  'a running room can jump forwards past the next item'
);

select results_eq(
  $$ select status, pos, shown from pg_temp.room() $$,
  $$ values ('running'::public.session_status, 3::smallint, false) $$,
  'and is on the item it jumped to, still running'
);

select lives_ok(
  $$ update public.sessions set current_position = 1
      where id = '00000000-0000-0000-0000-0000001830d1' $$,
  'a running room can go back to an earlier item'
);

select lives_ok(
  $$ update public.sessions set current_position = 4
      where id = '00000000-0000-0000-0000-0000001830d1' $$,
  'and reach the last item'
);

select throws_ok(
  $$ update public.sessions set current_position = 5
      where id = '00000000-0000-0000-0000-0000001830d1' $$,
  '23514', null,
  'but not a position past the end of the set'
);

select throws_ok(
  $$ update public.sessions set current_position = 0
      where id = '00000000-0000-0000-0000-0000001830d1' $$,
  '23514', null,
  'nor one below the first'
);

select throws_ok(
  $$ update public.sessions set current_position = null
      where id = '00000000-0000-0000-0000-0000001830d1' $$,
  '22023', null,
  'nor can a started room be taken off every item'
);

-- ---------------------------------------------------------------------------
-- The reveal clears on every move
-- ---------------------------------------------------------------------------

update public.sessions set reveal = true where id = '00000000-0000-0000-0000-0000001830d1';

-- A client that sends `reveal = true` with the move is overruled: a different item is a different
-- question.
update public.sessions set current_position = 2, reveal = true
 where id = '00000000-0000-0000-0000-0000001830d1';

select results_eq(
  $$ select pos, shown from pg_temp.room() $$,
  $$ values (2::smallint, false) $$,
  'going back to an item clears the reveal, whatever the client sent'
);

update public.sessions set reveal = true where id = '00000000-0000-0000-0000-0000001830d1';
update public.sessions set current_position = 4 where id = '00000000-0000-0000-0000-0000001830d1';

select results_eq(
  $$ select pos, shown from pg_temp.room() $$,
  $$ values (4::smallint, false) $$,
  'and so does jumping forwards'
);

-- ---------------------------------------------------------------------------
-- The clock follows the jump, as on advance
-- ---------------------------------------------------------------------------

update public.sessions set timer_seconds = 30 where id = '00000000-0000-0000-0000-0000001830d1';
update public.sessions set current_position = 1 where id = '00000000-0000-0000-0000-0000001830d1';

select results_eq(
  $$ select item_ends_at, timer_remaining_ms from public.sessions
      where id = '00000000-0000-0000-0000-0000001830d1' $$,
  $$ values (now() + interval '30 seconds', null::integer) $$,
  'the item jumped back to gets the whole chosen time'
);

-- ---------------------------------------------------------------------------
-- Paused
-- ---------------------------------------------------------------------------

update public.sessions set status = 'paused' where id = '00000000-0000-0000-0000-0000001830d1';

select lives_ok(
  $$ update public.sessions set current_position = 3
      where id = '00000000-0000-0000-0000-0000001830d1' $$,
  'a paused room can jump too'
);

select results_eq(
  $$ select s.status, s.current_position, s.item_ends_at, s.timer_remaining_ms
       from public.sessions s where s.id = '00000000-0000-0000-0000-0000001830d1' $$,
  $$ values ('paused'::public.session_status, 3::smallint, null::timestamptz, 30000) $$,
  'and stays paused, with the whole time frozen on the new item'
);

select throws_ok(
  $$ update public.sessions set status = 'ended', current_position = 1
      where id = '00000000-0000-0000-0000-0000001830d1' $$,
  '22023', null,
  'a move and an end in one write is refused'
);

-- ---------------------------------------------------------------------------
-- Answers already given stay
-- ---------------------------------------------------------------------------

update public.sessions set status = 'running', current_position = 2
 where id = '00000000-0000-0000-0000-0000001830d1';

set local role service_role;
select results_eq(
  $$ select refusal from public.record_session_response(
       '00000000-0000-0000-0000-0000001830d1', '00000000-0000-0000-0000-0000001830c1', 2::smallint,
       '00000000-0000-0000-0000-0000001830e2', '{"type":"multiple_choice"}'::jsonb, 1, 1, 'zero_one', '[]'::jsonb) $$,
  $$ values (null::text) $$,
  'an answer is taken on item two'
);
set local role authenticated;

update public.sessions set current_position = 4 where id = '00000000-0000-0000-0000-0000001830d1';
update public.sessions set current_position = 2 where id = '00000000-0000-0000-0000-0000001830d1';

set local role service_role;
select results_eq(
  $$ select refusal from public.record_session_response(
       '00000000-0000-0000-0000-0000001830d1', '00000000-0000-0000-0000-0000001830c1', 2::smallint,
       '00000000-0000-0000-0000-0000001830e2', '{"type":"multiple_choice"}'::jsonb, 0, 1, 'zero_one', '[]'::jsonb) $$,
  $$ values ('already_answered'::text) $$,
  'going back to it keeps that answer, and refuses a second one'
);

select is(
  (select count(*)::integer from public.session_responses
    where session_id = '00000000-0000-0000-0000-0000001830d1' and item_position = 2),
  1,
  'with the first answer on record and nothing else'
);

reset role;
select is(
  (select responded from public.session_item_aggregates
    where session_id = '00000000-0000-0000-0000-0000001830d1' and item_position = 2),
  1,
  'and the tally pushed when the room left item two counts it'
);
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000001830aa","role":"authenticated"}', true);

-- ---------------------------------------------------------------------------
-- Ended
-- ---------------------------------------------------------------------------

update public.sessions set status = 'ended' where id = '00000000-0000-0000-0000-0000001830d1';

select throws_ok(
  $$ update public.sessions set current_position = 1
      where id = '00000000-0000-0000-0000-0000001830d1' $$,
  '22023', null,
  'an ended room cannot be sent anywhere'
);

select * from finish();
rollback;
