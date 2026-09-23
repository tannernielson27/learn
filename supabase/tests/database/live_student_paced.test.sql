-- Student-paced mode (#185): the pacing rules `private.guard_session_change` holds since
-- 20260923080000_student_paced.sql, the two constraints beside it, and the two submission
-- functions answering any item of a student-paced set.
--
-- Every expectation here has a twin in src/lib/live/statePaced.test.ts, which holds the TypeScript
-- state machine to the same moves: start, pause, resume, show answers and end allowed; no item
-- moved and no timer once started; answers taken for any item in the set, once each, and refused
-- while paused, once shown and once ended.
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

-- ---------------------------------------------------------------------------
-- Fixtures, as the superuser
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role)
values ('00000000-0000-0000-0000-0000001850aa', 'paced-host@example.test', 'authenticated', 'authenticated');

-- #204: the sign-up trigger grants no role, so make these accounts instructors in the seeded
-- org explicitly, where the trigger used to put them.
update public.profiles
  set org_id = (select id from public.orgs order by created_at, id limit 1), role = 'instructor'
  where id in ('00000000-0000-0000-0000-0000001850aa');

insert into public.item_banks (id, org_id, name)
  select '00000000-0000-0000-0000-0000001850b1', org_id, 'Paced bank'
  from public.profiles where id = '00000000-0000-0000-0000-0000001850aa';

insert into public.items (id, bank_id, org_id, type, status, content, answer_key, scoring)
  select v.id, '00000000-0000-0000-0000-0000001850b1', p.org_id, 'multiple_choice', 'published',
         jsonb_build_object('id', v.ref), '{}', '{}'
  from public.profiles p,
       (values ('00000000-0000-0000-0000-0000001850e1'::uuid, 'itm-one'),
               ('00000000-0000-0000-0000-0000001850e2'::uuid, 'itm-two'),
               ('00000000-0000-0000-0000-0000001850e3'::uuid, 'itm-three')) as v (id, ref)
  where p.id = '00000000-0000-0000-0000-0000001850aa';

insert into public.case_studies (id, bank_id, org_id, title, ehr, status)
  select '00000000-0000-0000-0000-0000001850c1', b.id, b.org_id, 'Paced case', '{"tabs": []}'::jsonb,
         'published'::public.content_status
  from public.item_banks b where b.id = '00000000-0000-0000-0000-0000001850b1';

insert into public.sessions (id, org_id, host_id, bank_id, title, code, mode, item_set)
  select '00000000-0000-0000-0000-0000001850d1', p.org_id, p.id,
         '00000000-0000-0000-0000-0000001850b1', 'Paced', 'PCD234', 'student_paced',
         '["00000000-0000-0000-0000-0000001850e1",
           "00000000-0000-0000-0000-0000001850e2",
           "00000000-0000-0000-0000-0000001850e3"]'::jsonb
  from public.profiles p where p.id = '00000000-0000-0000-0000-0000001850aa';

-- An instructor-paced room beside it, to show its rules are what they were.
insert into public.sessions (id, org_id, host_id, bank_id, title, code, item_set)
  select '00000000-0000-0000-0000-0000001850d2', p.org_id, p.id,
         '00000000-0000-0000-0000-0000001850b1', 'Led', 'PCD235',
         '["00000000-0000-0000-0000-0000001850e1",
           "00000000-0000-0000-0000-0000001850e2"]'::jsonb
  from public.profiles p where p.id = '00000000-0000-0000-0000-0000001850aa';

create function pg_temp.room() returns table (status public.session_status, pos smallint, shown boolean)
language sql as $$
  select status, current_position, reveal from public.sessions
   where id = '00000000-0000-0000-0000-0000001850d1';
$$;

-- One participant answering one item of the paced room, both functions in turn, as the route does.
create function pg_temp.answer(who uuid, at smallint, item uuid)
returns table (opened text, written text)
language plpgsql as $$
declare
  first_refusal text;
begin
  select b.refusal into first_refusal from public.begin_session_submission(
    '00000000-0000-0000-0000-0000001850d1', who, at) b;
  return query select first_refusal, (select r.refusal from public.record_session_response(
    '00000000-0000-0000-0000-0000001850d1', who, at, item,
    '{"type":"multiple_choice"}'::jsonb, 1, 1, 'zero_one', '[]'::jsonb) r);
end;
$$;

-- ---------------------------------------------------------------------------
-- What a student-paced row may hold
-- ---------------------------------------------------------------------------

-- As the superuser, so nothing but the constraint is asked: a case study runs instructor-paced.
select throws_ok(
  $$ insert into public.sessions (org_id, host_id, case_study_id, title, code, mode, item_set)
       select p.org_id, p.id, '00000000-0000-0000-0000-0000001850c1', 'Paced case', 'PCD236',
              'student_paced', '["00000000-0000-0000-0000-0000001850e1"]'::jsonb
         from public.profiles p where p.id = '00000000-0000-0000-0000-0000001850aa' $$,
  '23514', null,
  'a case study cannot be run student-paced'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000001850aa","role":"authenticated"}', true);

select throws_ok(
  $$ update public.sessions set timer_seconds = 30
      where id = '00000000-0000-0000-0000-0000001850d1' $$,
  '23514', null,
  'a student-paced room cannot be given a timer'
);

select throws_ok(
  $$ select public.start_session('00000000-0000-0000-0000-0000001850b1', null, 'student_paced', 30) $$,
  '23514', null,
  'nor a bank started student-paced with a timer'
);

select isnt(
  public.start_session('00000000-0000-0000-0000-0000001850b1', null, 'student_paced'),
  null,
  'a bank starts student-paced'
);

-- ---------------------------------------------------------------------------
-- The host's moves
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ update public.sessions set status = 'running', current_position = 1
      where id = '00000000-0000-0000-0000-0000001850d1' $$,
  'a student-paced room starts on position 1, like any room'
);

select throws_ok(
  $$ update public.sessions set mode = 'instructor_paced'
      where id = '00000000-0000-0000-0000-0000001850d1' $$,
  '22023', null,
  'its pacing cannot change once it has started'
);

select throws_ok(
  $$ update public.sessions set current_position = 2
      where id = '00000000-0000-0000-0000-0000001850d1' $$,
  '22023', null,
  'it has no current item to advance'
);

select throws_ok(
  $$ update public.sessions set current_position = 3
      where id = '00000000-0000-0000-0000-0000001850d1' $$,
  '22023', null,
  'nor one to jump to'
);

select lives_ok(
  $$ update public.sessions set status = 'paused'
      where id = '00000000-0000-0000-0000-0000001850d1' $$,
  'it pauses'
);

-- ---------------------------------------------------------------------------
-- Answering any item
-- ---------------------------------------------------------------------------

set local role service_role;

select results_eq(
  $$ select refusal, item_position, item_id from public.begin_session_submission(
       '00000000-0000-0000-0000-0000001850d1', '00000000-0000-0000-0000-000000185111', 2::smallint) $$,
  $$ values ('paused'::text, null::smallint, null::uuid) $$,
  'a paused student-paced room takes no answer'
);

reset role;
set local role authenticated;
update public.sessions set status = 'running' where id = '00000000-0000-0000-0000-0000001850d1';
set local role service_role;

select results_eq(
  $$ select refusal, item_position, item_id from public.begin_session_submission(
       '00000000-0000-0000-0000-0000001850d1', '00000000-0000-0000-0000-000000185111', 3::smallint) $$,
  $$ values (null::text, 3::smallint, '00000000-0000-0000-0000-0000001850e3'::uuid) $$,
  'once resumed it opens the item the phone names, anywhere in the set'
);

select results_eq(
  $$ select opened, written from pg_temp.answer(
       '00000000-0000-0000-0000-000000185111', 3::smallint, '00000000-0000-0000-0000-0000001850e3') $$,
  $$ values (null::text, null::text) $$,
  'and writes an answer to the last item first'
);

select results_eq(
  $$ select opened, written from pg_temp.answer(
       '00000000-0000-0000-0000-000000185111', 1::smallint, '00000000-0000-0000-0000-0000001850e1') $$,
  $$ values (null::text, null::text) $$,
  'then one to the first'
);

select results_eq(
  $$ select opened, written from pg_temp.answer(
       '00000000-0000-0000-0000-000000185122', 2::smallint, '00000000-0000-0000-0000-0000001850e2') $$,
  $$ values (null::text, null::text) $$,
  'while another phone answers the second'
);

select results_eq(
  $$ select opened, written from pg_temp.answer(
       '00000000-0000-0000-0000-000000185111', 3::smallint, '00000000-0000-0000-0000-0000001850e3') $$,
  $$ values (null::text, 'already_answered'::text) $$,
  'an item answered once is not answered twice'
);

select results_eq(
  $$ select opened, written from pg_temp.answer(
       '00000000-0000-0000-0000-000000185111', 2::smallint, '00000000-0000-0000-0000-0000001850e3') $$,
  $$ values (null::text, 'wrong_item'::text) $$,
  'an item named at the wrong place is refused at the write'
);

select results_eq(
  $$ select refusal, item_position, item_id from public.begin_session_submission(
       '00000000-0000-0000-0000-0000001850d1', '00000000-0000-0000-0000-000000185111', 4::smallint) $$,
  $$ values ('wrong_item'::text, null::smallint, null::uuid) $$,
  'a place past the end of the set is no item of this room'
);

select results_eq(
  $$ select refusal, item_position, item_id from public.begin_session_submission(
       '00000000-0000-0000-0000-0000001850d1', '00000000-0000-0000-0000-000000185111', 0::smallint) $$,
  $$ values ('wrong_item'::text, null::smallint, null::uuid) $$,
  'nor one before the start'
);

select results_eq(
  $$ select refusal, item_position, item_id from public.begin_session_submission(
       '00000000-0000-0000-0000-0000001850d1', '00000000-0000-0000-0000-000000185111') $$,
  $$ values ('wrong_item'::text, null::smallint, null::uuid) $$,
  'and an answer that names no place at all is refused'
);

select is(
  (select r.refusal from public.record_session_response(
     '00000000-0000-0000-0000-0000001850d1', '00000000-0000-0000-0000-000000185133',
     0::smallint, '00000000-0000-0000-0000-0000001850e3', '{"type":"multiple_choice"}'::jsonb,
     1, 1, 'zero_one', '[]'::jsonb) r),
  'wrong_item',
  'the write refuses place 0 too, which jsonb would otherwise read as the last item'
);

select results_eq(
  $$ select item_position, count(*)::int from public.session_responses
      where session_id = '00000000-0000-0000-0000-0000001850d1'
      group by item_position order by item_position $$,
  $$ values (1::smallint, 1), (2::smallint, 1), (3::smallint, 1) $$,
  'three answers, one per item, at the places they were given'
);

select results_eq(
  $$ select session_mode, session_position from public.begin_session_view(
       '00000000-0000-0000-0000-0000001850d1', '00000000-0000-0000-0000-000000185111') $$,
  $$ values ('student_paced'::public.session_mode, 1::smallint) $$,
  'the view route is told the room is student-paced'
);

-- ---------------------------------------------------------------------------
-- Show answers, then the end
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;

select lives_ok(
  $$ update public.sessions set reveal = true
      where id = '00000000-0000-0000-0000-0000001850d1' $$,
  'show answers reveals the whole set with one switch'
);

select throws_ok(
  $$ update public.sessions set reveal = false
      where id = '00000000-0000-0000-0000-0000001850d1' $$,
  '22023', null,
  'and answers once shown stay shown'
);

set local role service_role;
select results_eq(
  $$ select opened, written from pg_temp.answer(
       '00000000-0000-0000-0000-000000185122', 1::smallint, '00000000-0000-0000-0000-0000001850e1') $$,
  $$ values ('already_revealed'::text, 'already_revealed'::text) $$,
  'no answer is taken once answers are showing'
);

reset role;
set local role authenticated;
select lives_ok(
  $$ update public.sessions set status = 'ended'
      where id = '00000000-0000-0000-0000-0000001850d1' $$,
  'the room ends'
);
select results_eq(
  $$ select status, pos, shown from pg_temp.room() $$,
  $$ values ('ended'::public.session_status, 1::smallint, false) $$,
  'and ending clears the reveal, as it does for any room'
);

set local role service_role;
select results_eq(
  $$ select opened, written from pg_temp.answer(
       '00000000-0000-0000-0000-000000185122', 3::smallint, '00000000-0000-0000-0000-0000001850e3') $$,
  $$ values ('not_open'::text, 'not_open'::text) $$,
  'and an ended room takes nothing'
);

-- ---------------------------------------------------------------------------
-- An instructor-paced room is unchanged
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;
update public.sessions set status = 'running', current_position = 1
 where id = '00000000-0000-0000-0000-0000001850d2';
select lives_ok(
  $$ update public.sessions set current_position = 2
      where id = '00000000-0000-0000-0000-0000001850d2' $$,
  'an instructor-paced room still advances'
);

set local role service_role;
select results_eq(
  $$ select refusal, item_position, item_id from public.begin_session_submission(
       '00000000-0000-0000-0000-0000001850d2', '00000000-0000-0000-0000-000000185144', 1::smallint) $$,
  $$ values (null::text, 2::smallint, '00000000-0000-0000-0000-0000001850e2'::uuid) $$,
  'and ignores a place a phone names: it is on the item it is on'
);

reset role;
select is(
  has_function_privilege('authenticated', 'public.begin_session_submission(uuid, uuid, smallint)', 'execute'),
  false,
  'opening a submission is still the server''s alone after being recreated'
);
select is(
  has_function_privilege('service_role', 'public.begin_session_view(uuid, uuid)', 'execute'),
  true,
  'and so is the view read, which the server still has'
);

select * from finish();
rollback;
