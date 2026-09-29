-- The key an answer was scored with, stored beside its score (20260928000000_scored_reveal).
--
-- Both response tables gain a nullable `reveal`; record_session_response takes it as an eleventh
-- argument and record_attempt_submission inside each mark; my_assignment_result hands it back
-- after the close. Who can call and read is unchanged: the two writers stay the service role's
-- alone, no student and no anon reads either column, and a ten-argument live call still works.
-- now() is fixed for the transaction, so "closed" is made by moving closes_at into the past with
-- the guard trigger switched off, as the superuser.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

-- ---------------------------------------------------------------------------
-- The columns
-- ---------------------------------------------------------------------------

select col_type_is('public', 'session_responses', 'reveal', 'jsonb',
  'session_responses.reveal is jsonb');
select col_is_null('public', 'session_responses', 'reveal',
  'and nullable, so rows written before it stay as they were');
select col_type_is('public', 'attempt_responses', 'reveal', 'jsonb',
  'attempt_responses.reveal is jsonb');
select col_is_null('public', 'attempt_responses', 'reveal', 'and nullable too');

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

select ok(
  has_function_privilege('service_role',
    'public.record_session_response(uuid, uuid, smallint, uuid, jsonb, numeric, numeric, text, jsonb, jsonb, jsonb)',
    'execute'),
  'the service role records a live answer with its reveal'
);
select ok(
  not has_function_privilege('authenticated',
    'public.record_session_response(uuid, uuid, smallint, uuid, jsonb, numeric, numeric, text, jsonb, jsonb, jsonb)',
    'execute')
  and not has_function_privilege('anon',
    'public.record_session_response(uuid, uuid, smallint, uuid, jsonb, numeric, numeric, text, jsonb, jsonb, jsonb)',
    'execute'),
  'and nobody else can'
);
select hasnt_function('public', 'record_session_response',
  array['uuid', 'uuid', 'smallint', 'uuid', 'jsonb', 'numeric', 'numeric', 'text', 'jsonb', 'jsonb'],
  'the ten-argument version is gone, so there is one function and not two to keep in step');
select ok(
  has_function_privilege('service_role',
    'public.record_attempt_submission(uuid, uuid, integer, numeric, numeric, jsonb, boolean)', 'execute')
  and not has_function_privilege('authenticated',
    'public.record_attempt_submission(uuid, uuid, integer, numeric, numeric, jsonb, boolean)', 'execute')
  and not has_function_privilege('anon',
    'public.record_attempt_submission(uuid, uuid, integer, numeric, numeric, jsonb, boolean)', 'execute'),
  'record_attempt_submission is still the service role''s alone'
);
select ok(
  has_function_privilege('authenticated', 'public.my_assignment_result(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.my_assignment_result(uuid)', 'execute'),
  'my_assignment_result is still a signed-in caller''s, never anon''s'
);
select ok(
  not has_column_privilege('authenticated', 'public.attempt_responses', 'reveal', 'select')
  and not has_column_privilege('anon', 'public.attempt_responses', 'reveal', 'select'),
  'no student reads an attempt''s stored key: the column is not granted'
);
select ok(
  not has_column_privilege('anon', 'public.session_responses', 'reveal', 'select'),
  'and anon, which every live participant is, holds nothing on the live one'
);

-- ---------------------------------------------------------------------------
-- Cast, as the superuser
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000a17e00a1', 'reveal-teacher@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000a17e00d1', 'reveal-ada@example.test', 'authenticated', 'authenticated');

select private.make_instructor('reveal-teacher@example.test');
update public.profiles
   set org_id = (select org_id from public.profiles where id = '00000000-0000-0000-0000-0000a17e00a1'),
       role = 'student'
 where id = '00000000-0000-0000-0000-0000a17e00d1';

create function pg_temp.act_as(account uuid) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', account, 'role', 'authenticated')::text, true);
$$;

insert into public.item_banks (id, org_id, name)
  select '00000000-0000-0000-0000-0000a17e00e0', org_id, 'Reveal bank'
    from public.profiles where id = '00000000-0000-0000-0000-0000a17e00a1';
insert into public.items (id, bank_id, org_id, type, cjmm_step, status, content, answer_key, scoring)
  select '00000000-0000-0000-0000-0000a17e00f1', '00000000-0000-0000-0000-0000a17e00e0', org_id,
         'multiple_choice', 1, 'published', '{"id":"itm-reveal"}',
         '{"correctOptionId":"key_now"}', '{}'
    from public.profiles where id = '00000000-0000-0000-0000-0000a17e00a1';

insert into public.sessions (id, org_id, host_id, bank_id, title, code, item_set)
  select '00000000-0000-0000-0000-0000a17e00b1', org_id, id,
         '00000000-0000-0000-0000-0000a17e00e0', 'Reveal', 'RVL234',
         '["00000000-0000-0000-0000-0000a17e00f1"]'::jsonb
    from public.profiles where id = '00000000-0000-0000-0000-0000a17e00a1';

insert into public.classes (id, org_id, name)
  select '00000000-0000-0000-0000-0000a17e00c1', org_id, 'NUR 350'
    from public.profiles where id = '00000000-0000-0000-0000-0000a17e00a1';
insert into public.class_members (class_id, profile_id) values
  ('00000000-0000-0000-0000-0000a17e00c1', '00000000-0000-0000-0000-0000a17e00d1');
insert into public.assignments (id, org_id, class_id, bank_id, title, opens_at, closes_at, max_attempts)
  select '00000000-0000-0000-0000-0000a17e00b2', org_id, '00000000-0000-0000-0000-0000a17e00c1',
         '00000000-0000-0000-0000-0000a17e00e0', 'Reveal 350', now() - interval '1 hour',
         now() + interval '1 day', 1
    from public.profiles where id = '00000000-0000-0000-0000-0000a17e00a1';

create temporary table held (name text primary key, id uuid, n integer);
grant all on held to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- A live answer
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000a17e00a1');
update public.sessions set status = 'running', current_position = 1
 where id = '00000000-0000-0000-0000-0000a17e00b1';
reset role;

set local role service_role;
select is(
  (select r.refusal from public.record_session_response(
     '00000000-0000-0000-0000-0000a17e00b1', '00000000-0000-0000-0000-0000a17e0011',
     1::smallint, '00000000-0000-0000-0000-0000a17e00f1',
     '{"type":"multiple_choice","optionId":"key_then"}'::jsonb, 1, 1, 'zero_one', '[]'::jsonb,
     null, '{"answerKey":{"correctOptionId":"key_then"},"rationale":{},"scoring":{}}'::jsonb) r),
  null,
  'the server records a live answer with the reveal it was scored against'
);
select is(
  (select r.refusal from public.record_session_response(
     '00000000-0000-0000-0000-0000a17e00b1', '00000000-0000-0000-0000-0000a17e0022',
     1::smallint, '00000000-0000-0000-0000-0000a17e00f1',
     '{"type":"multiple_choice","optionId":"key_now"}'::jsonb, 1, 1, 'zero_one', '[]'::jsonb) r),
  null,
  'and a caller that passes no reveal, as the app before this migration does, is still taken'
);
reset role;

select is(
  (select reveal -> 'answerKey' ->> 'correctOptionId' from public.session_responses
    where participant_id = '00000000-0000-0000-0000-0000a17e0011'),
  'key_then',
  'the reveal is stored on the row, whatever the item holds now'
);
select is(
  (select reveal from public.session_responses
    where participant_id = '00000000-0000-0000-0000-0000a17e0022'),
  null,
  'a row written without one is null, and the app falls back to the item'
);

set local role service_role;
select throws_ok(
  $$ select public.record_session_response(
       '00000000-0000-0000-0000-0000a17e00b1', '00000000-0000-0000-0000-0000a17e0033',
       1::smallint, '00000000-0000-0000-0000-0000a17e00f1', '{}'::jsonb, 0, 1, 'zero_one',
       '[]'::jsonb, null, '"not an object"'::jsonb) $$,
  '23514', null,
  'a reveal that is not an object is refused by the column''s check'
);
reset role;

-- A student in the same org reads no live responses, key or not.
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000a17e00d1');
select is(
  (select count(*)::int from public.session_responses
    where session_id = '00000000-0000-0000-0000-0000a17e00b1'),
  0,
  'a student reads no live response, so no stored key'
);
reset role;

-- ---------------------------------------------------------------------------
-- An assignment answer
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000a17e00d1');
insert into held (name, id)
  select 'attempt', attempt_id
    from public.start_assignment_attempt('00000000-0000-0000-0000-0000a17e00b2');
select is(
  (select refusal from public.save_attempt_response(
     (select id from held where name = 'attempt'), '00000000-0000-0000-0000-0000a17e00f1',
     '{"type":"multiple_choice","optionId":"key_then"}')),
  null,
  'the student saves an answer'
);
insert into held (name, n)
  select 'revision', revision
    from public.begin_attempt_submission((select id from held where name = 'attempt'));
select throws_ok(
  $$ select reveal from public.attempt_responses $$,
  '42501', null,
  'and cannot select the reveal column of their own saved answers'
);
reset role;

set local role service_role;
select is(
  (select refusal from public.record_attempt_submission(
     (select id from held where name = 'attempt'), '00000000-0000-0000-0000-0000a17e00d1',
     (select n from held where name = 'revision'), 1, 1,
     '[{"item_id":"00000000-0000-0000-0000-0000a17e00f1","points":1,"max_points":1,"model":"zero_one","breakdown":[],"reveal":"not an object"}]')),
  'malformed',
  'a mark whose reveal is not an object is refused cleanly'
);
select is(
  (select refusal from public.record_attempt_submission(
     (select id from held where name = 'attempt'), '00000000-0000-0000-0000-0000a17e00d1',
     (select n from held where name = 'revision'), 1, 1,
     '[{"item_id":"00000000-0000-0000-0000-0000a17e00f1","points":1,"max_points":1,"model":"zero_one","breakdown":[],"reveal":{"answerKey":{"correctOptionId":"key_then"},"rationale":{},"scoring":{}}}]')),
  null,
  'the server records the score with each mark''s reveal'
);
reset role;

select is(
  (select reveal -> 'answerKey' ->> 'correctOptionId' from public.attempt_responses
    where attempt_id = (select id from held where name = 'attempt')),
  'key_then',
  'the reveal is stored on the answer''s row'
);

-- Before the close the student reads nothing, key or score.
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000a17e00d1');
select is(
  (select count(*)::int from public.my_assignment_result('00000000-0000-0000-0000-0000a17e00b2')),
  0,
  'before the close my_assignment_result still answers nothing'
);
reset role;

-- The assignment closes. The item's key is key_now; the answer was marked against key_then.
set local session_replication_role = replica;
update public.assignments
   set closes_at = now() - interval '1 minute'
 where id = '00000000-0000-0000-0000-0000a17e00b2';
set local session_replication_role = origin;

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000a17e00d1');
select is(
  (select marks -> 0 -> 'reveal' -> 'answerKey' ->> 'correctOptionId'
     from public.my_assignment_result('00000000-0000-0000-0000-0000a17e00b2')),
  'key_then',
  'after the close the student reads the key their answer was marked against'
);
select is(
  (select marks -> 0 ->> 'points'
     from public.my_assignment_result('00000000-0000-0000-0000-0000a17e00b2')),
  '1.00',
  'beside the points it earned'
);
reset role;

select * from finish();
rollback;
