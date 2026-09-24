-- Taking an assignment (#208): attempts, autosave, submit and the submit at close.
--
-- A current member starts (or resumes) an attempt, saves answers (last write wins), and the
-- server records a score once. Nothing is written after close (plus two seconds of grace), no
-- extra attempt past max_attempts, nobody reads or writes another student's attempt, no student
-- reads a score, and the automatic submit at close is idempotent and scores what was saved.
-- now() is fixed for the whole transaction, so "closed" is made by moving closes_at into the past
-- with the guard trigger switched off, as the superuser.
begin;
create extension if not exists pgtap with schema extensions;
select plan(48);

-- ---------------------------------------------------------------------------
-- Cast, as the superuser
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000002080a1', 'attempt-teacher@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002080d1', 'attempt-ada@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002080d2', 'attempt-grace@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002080d3', 'attempt-removed@example.test', 'authenticated', 'authenticated');

select private.make_instructor('attempt-teacher@example.test');
update public.profiles
   set org_id = (select org_id from public.profiles where id = '00000000-0000-0000-0000-0000002080a1'),
       role = 'student'
 where id in ('00000000-0000-0000-0000-0000002080d1', '00000000-0000-0000-0000-0000002080d2',
              '00000000-0000-0000-0000-0000002080d3');

create function pg_temp.act_as(account uuid) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', account, 'role', 'authenticated')::text, true);
$$;

insert into public.classes (id, org_id, name)
  select '00000000-0000-0000-0000-0000002080c1', org_id, 'NUR 310'
    from public.profiles where id = '00000000-0000-0000-0000-0000002080a1';
insert into public.class_members (class_id, profile_id) values
  ('00000000-0000-0000-0000-0000002080c1', '00000000-0000-0000-0000-0000002080d1'),
  ('00000000-0000-0000-0000-0000002080c1', '00000000-0000-0000-0000-0000002080d2'),
  ('00000000-0000-0000-0000-0000002080c1', '00000000-0000-0000-0000-0000002080d3');
-- An author takes the third student off the class: the removal is recorded by the trigger.
delete from public.class_members
 where profile_id = '00000000-0000-0000-0000-0000002080d3';

insert into public.item_banks (id, org_id, name)
  select '00000000-0000-0000-0000-0000002080e0', org_id, 'Cardiac bank'
    from public.profiles where id = '00000000-0000-0000-0000-0000002080a1';
insert into public.items (id, bank_id, org_id, type, cjmm_step, status, content, answer_key, scoring, created_at)
  select v.id::uuid, '00000000-0000-0000-0000-0000002080e0', p.org_id, 'multiple_choice', 1,
         'published', '{}', '{"correctOptionId":"secret_key_208"}', '{}', now() - v.age::interval
    from public.profiles p,
         (values ('00000000-0000-0000-0000-0000002080f1', '2 hours'),
                 ('00000000-0000-0000-0000-0000002080f2', '1 hour')) as v(id, age)
   where p.id = '00000000-0000-0000-0000-0000002080a1';

-- Open now with two attempts; open now and about to close; opening tomorrow.
insert into public.assignments (id, org_id, class_id, bank_id, title, opens_at, closes_at, max_attempts)
  select v.id::uuid, p.org_id, '00000000-0000-0000-0000-0000002080c1',
         '00000000-0000-0000-0000-0000002080e0', v.title, now() + v.opens::interval,
         now() + v.closes::interval, v.attempts
    from public.profiles p,
         (values ('00000000-0000-0000-0000-0000002080b1', 'Open 208', '-1 hour', '1 day', 2),
                 ('00000000-0000-0000-0000-0000002080b2', 'Closing 208', '-1 hour', '1 hour', 1),
                 ('00000000-0000-0000-0000-0000002080b3', 'Future 208', '1 day', '2 days', 1))
           as v(id, title, opens, closes, attempts)
   where p.id = '00000000-0000-0000-0000-0000002080a1';

create temporary table ids (name text primary key, id uuid);
grant all on ids to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Starting and resuming
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000002080d1');

insert into ids
  select 'ada1', attempt_id from public.start_assignment_attempt('00000000-0000-0000-0000-0000002080b1');
select isnt((select id from ids where name = 'ada1'), null, 'a member starts an attempt');
select is(
  (select attempt_id from public.start_assignment_attempt('00000000-0000-0000-0000-0000002080b1')),
  (select id from ids where name = 'ada1'),
  'starting again resumes the open attempt rather than opening another'
);
select is(
  (select number from public.assignment_attempts where id = (select id from ids where name = 'ada1')),
  1::smallint,
  'it is attempt 1, and the student reads its number'
);
select is(
  (select refusal from public.start_assignment_attempt('00000000-0000-0000-0000-0000002080b3')),
  'not_open',
  'an assignment that has not opened cannot be started'
);
select is(
  (select refusal from public.start_assignment_attempt('00000000-0000-0000-0000-0000002080ff')),
  'not_found',
  'nor one that does not exist'
);

select pg_temp.act_as('00000000-0000-0000-0000-0000002080d3');
select is(
  (select refusal from public.start_assignment_attempt('00000000-0000-0000-0000-0000002080b1')),
  'not_found',
  'a student taken off the class cannot start one'
);

select pg_temp.act_as('00000000-0000-0000-0000-0000002080a1');
select is(
  (select refusal from public.start_assignment_attempt('00000000-0000-0000-0000-0000002080b1')),
  'not_found',
  'nor can an instructor, who is not a member'
);

-- ---------------------------------------------------------------------------
-- Saving
-- ---------------------------------------------------------------------------

select pg_temp.act_as('00000000-0000-0000-0000-0000002080d1');
select is(
  (select refusal from public.save_attempt_response(
     (select id from ids where name = 'ada1'), '00000000-0000-0000-0000-0000002080f1',
     '{"type":"multiple_choice","selectedOptionId":"opt_b"}')),
  null,
  'a save to the open attempt is taken'
);
select is(
  (select refusal from public.save_attempt_response(
     (select id from ids where name = 'ada1'), '00000000-0000-0000-0000-0000002080f1',
     '{"type":"multiple_choice","selectedOptionId":"opt_a"}')),
  null,
  'and a second save of the same item'
);
select is(
  (select row(count(*), max(response ->> 'selectedOptionId'))::text
     from public.attempt_responses where attempt_id = (select id from ids where name = 'ada1')),
  row(1, 'opt_a')::text,
  'the last write wins, one row per item, and the student reads their own answer back'
);
select is(
  (select refusal from public.save_attempt_response(
     (select id from ids where name = 'ada1'), '00000000-0000-0000-0000-0000002080e0', '{}')),
  'wrong_item',
  'an id that is not in the assignment''s set is refused'
);
select is(
  (select refusal from public.save_attempt_response(
     (select id from ids where name = 'ada1'), '00000000-0000-0000-0000-0000002080f2', '"opt_a"')),
  'malformed',
  'an answer that is not an object is refused'
);

-- ---------------------------------------------------------------------------
-- Another student's attempt, and the columns nobody reads
-- ---------------------------------------------------------------------------

select pg_temp.act_as('00000000-0000-0000-0000-0000002080d2');
select is(
  (select refusal from public.save_attempt_response(
     (select id from ids where name = 'ada1'), '00000000-0000-0000-0000-0000002080f2',
     '{"type":"multiple_choice","selectedOptionId":"opt_c"}')),
  'not_found',
  'a student cannot save into another student''s attempt'
);
select is(
  (select refusal from public.begin_attempt_submission((select id from ids where name = 'ada1'))),
  'not_found',
  'nor begin submitting it'
);
select is(
  (select count(*)::integer from public.assignment_attempts), 0,
  'a student reads no one else''s attempts'
);
select is(
  (select count(*)::integer from public.attempt_responses), 0,
  'nor anyone else''s saved answers'
);

select pg_temp.act_as('00000000-0000-0000-0000-0000002080d1');
select throws_ok(
  $$ select score from public.assignment_attempts $$,
  '42501', null,
  'a student cannot select a score, even their own'
);
select throws_ok(
  $$ select points from public.attempt_responses $$,
  '42501', null,
  'nor a mark on their own answer'
);
select throws_ok(
  $$ insert into public.assignment_attempts (org_id, assignment_id, student_id, number)
     select org_id, id, '00000000-0000-0000-0000-0000002080d1', 2 from public.assignments
      where id = '00000000-0000-0000-0000-0000002080b1' $$,
  '42501', null,
  'a student cannot insert an attempt directly'
);
select throws_ok(
  $$ update public.attempt_responses set response = '{}' $$,
  '42501', null,
  'nor write an answer directly'
);
select throws_ok(
  $$ select * from public.record_attempt_submission(
       '00000000-0000-0000-0000-0000002080ff', '00000000-0000-0000-0000-0000002080d1', 0, 1, 1, '[]') $$,
  '42501', null,
  'nor record a score: that function is the server''s alone'
);
select throws_ok(
  $$ select * from public.expired_open_attempts() $$,
  '42501', null,
  'nor list what is due at close'
);

-- ---------------------------------------------------------------------------
-- Submitting
-- ---------------------------------------------------------------------------

select is(
  (select row(refusal, revision, answers -> '00000000-0000-0000-0000-0000002080f1' ->> 'selectedOptionId',
              jsonb_array_length(item_set))::text
     from public.begin_attempt_submission((select id from ids where name = 'ada1'))),
  row(null::text, 2, 'opt_a', 2)::text,
  'beginning a submit hands the server the set, the saved answers and the revision'
);

reset role;
set local role service_role;
select is(
  (select refusal from public.record_attempt_submission(
     (select id from ids where name = 'ada1'), '00000000-0000-0000-0000-0000002080d1', 1, 1, 2,
     '[{"item_id":"00000000-0000-0000-0000-0000002080f1","points":1,"max_points":1,"model":"zero_one","breakdown":[]}]')),
  'changed',
  'a score read at an old revision is refused, so a save in flight is never lost'
);
select is(
  (select refusal from public.record_attempt_submission(
     (select id from ids where name = 'ada1'), '00000000-0000-0000-0000-0000002080d2', 2, 1, 2, '[]')),
  'not_found',
  'the score is recorded only for the student whose attempt it is'
);
select is(
  (select refusal from public.record_attempt_submission(
     (select id from ids where name = 'ada1'), '00000000-0000-0000-0000-0000002080d1', 2, 1, 2,
     '[{"item_id":"00000000-0000-0000-0000-0000002080f1","points":1,"max_points":1,"model":"zero_one","breakdown":[]}]')),
  null,
  'the server records the score'
);
select is(
  (select row(score, max_score, auto_submitted, submitted_at is not null)::text
     from public.assignment_attempts where id = (select id from ids where name = 'ada1')),
  row(1.00, 2.00, false, true)::text,
  'the attempt is submitted with its total and its maximum'
);
select is(
  (select row(points, max_points, model)::text from public.attempt_responses
    where attempt_id = (select id from ids where name = 'ada1')),
  row(1.00, 1.00, 'zero_one')::text,
  'and the saved answer carries its mark'
);
select is(
  (select refusal from public.record_attempt_submission(
     (select id from ids where name = 'ada1'), '00000000-0000-0000-0000-0000002080d1', 2, 0, 2, '[]')),
  'already_submitted',
  'a second record changes nothing'
);
select is(
  (select score from public.assignment_attempts where id = (select id from ids where name = 'ada1')),
  1.00,
  'and the score stays as it was'
);

reset role;
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000002080d1');
select is(
  (select refusal from public.save_attempt_response(
     (select id from ids where name = 'ada1'), '00000000-0000-0000-0000-0000002080f1',
     '{"type":"multiple_choice","selectedOptionId":"opt_c"}')),
  'already_submitted',
  'a submitted attempt takes no more saves'
);
select is(
  (select submitted_at is not null from public.assignment_attempts
    where id = (select id from ids where name = 'ada1')),
  true,
  'the student reads that it was submitted'
);

-- ---------------------------------------------------------------------------
-- Attempts
-- ---------------------------------------------------------------------------

insert into ids
  select 'ada2', attempt_id from public.start_assignment_attempt('00000000-0000-0000-0000-0000002080b1');
select is(
  (select number from public.assignment_attempts where id = (select id from ids where name = 'ada2')),
  2::smallint,
  'with one submitted, the second attempt starts'
);
reset role;
set local role service_role;
select is(
  (select refusal from public.record_attempt_submission(
     (select id from ids where name = 'ada2'), '00000000-0000-0000-0000-0000002080d1', 0, 0, 2, '[]')),
  null,
  'and is submitted with nothing saved'
);
reset role;
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000002080d1');
select is(
  (select refusal from public.start_assignment_attempt('00000000-0000-0000-0000-0000002080b1')),
  'no_attempts_left',
  'an attempt past max_attempts is refused'
);

-- ---------------------------------------------------------------------------
-- Closing, and the submit at close
-- ---------------------------------------------------------------------------

insert into ids
  select 'close', attempt_id from public.start_assignment_attempt('00000000-0000-0000-0000-0000002080b2');
select is(
  (select refusal from public.save_attempt_response(
     (select id from ids where name = 'close'), '00000000-0000-0000-0000-0000002080f2',
     '{"type":"multiple_choice","selectedOptionId":"opt_d"}')),
  null,
  'an answer is saved while the assignment is open'
);

reset role;
set local role service_role;
select is(
  (select refusal from public.record_attempt_submission(
     (select id from ids where name = 'close'), '00000000-0000-0000-0000-0000002080d1', 1, 0, 2, '[]',
     true)),
  'not_closed',
  'the submit at close does not run before the close'
);

-- Close it: a minute ago, well past the two seconds of grace.
reset role;
set local session_replication_role = replica;
update public.assignments
   set closes_at = now() - interval '1 minute'
 where id = '00000000-0000-0000-0000-0000002080b2';
set local session_replication_role = origin;

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000002080d1');
select is(
  (select refusal from public.save_attempt_response(
     (select id from ids where name = 'close'), '00000000-0000-0000-0000-0000002080f2',
     '{"type":"multiple_choice","selectedOptionId":"opt_a"}')),
  'closed',
  'a save after close is refused'
);
select is(
  (select refusal from public.begin_attempt_submission((select id from ids where name = 'close'))),
  'closed',
  'and so is a submit'
);
select is(
  (select refusal from public.start_assignment_attempt('00000000-0000-0000-0000-0000002080b2')),
  'closed',
  'and a start'
);

reset role;
set local role service_role;
select is(
  (select row(count(*), max(answers -> '00000000-0000-0000-0000-0000002080f2' ->> 'selectedOptionId'),
              max(revision))::text
     from public.expired_open_attempts('00000000-0000-0000-0000-0000002080b2',
                                       '00000000-0000-0000-0000-0000002080d1')),
  row(1, 'opt_d', 1)::text,
  'the open attempt is due at close, with exactly the answer it saved'
);
select is(
  (select refusal from public.record_attempt_submission(
     (select id from ids where name = 'close'), '00000000-0000-0000-0000-0000002080d1', 1, 0, 1,
     '[{"item_id":"00000000-0000-0000-0000-0000002080f2","points":0,"max_points":1,"model":"zero_one","breakdown":[]}]')),
  'closed',
  'the student''s own submit cannot be recorded after close'
);
select is(
  (select refusal from public.record_attempt_submission(
     (select id from ids where name = 'close'), '00000000-0000-0000-0000-0000002080d1', 1, 0, 1,
     '[{"item_id":"00000000-0000-0000-0000-0000002080f2","points":0,"max_points":1,"model":"zero_one","breakdown":[]}]',
     true)),
  null,
  'the submit at close is recorded'
);
select is(
  (select row(auto_submitted, submitted_at = s.closes_at, score, max_score)::text
     from public.assignment_attempts a join public.assignments s on s.id = a.assignment_id
    where a.id = (select id from ids where name = 'close')),
  row(true, true, 0.00, 1.00)::text,
  'marked automatic, stamped at the close time, with its score'
);
select is(
  (select refusal from public.record_attempt_submission(
     (select id from ids where name = 'close'), '00000000-0000-0000-0000-0000002080d1', 1, 1, 1, '[]',
     true)),
  'already_submitted',
  'a second submit at close changes nothing: it is idempotent'
);
select is(
  (select row(score, (select count(*) from public.expired_open_attempts('00000000-0000-0000-0000-0000002080b2')))::text
     from public.assignment_attempts where id = (select id from ids where name = 'close')),
  row(0.00, 0)::text,
  'the score is the first one, and nothing is due any more'
);

-- ---------------------------------------------------------------------------
-- The save limit
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000002080d2');
insert into ids
  select 'grace', attempt_id from public.start_assignment_attempt('00000000-0000-0000-0000-0000002080b1');
select is(
  (select count(*)::integer from generate_series(1, 125) as n,
     lateral public.save_attempt_response(
       (select id from ids where name = 'grace'), '00000000-0000-0000-0000-0000002080f1',
       jsonb_build_object('type', 'multiple_choice', 'selectedOptionId', 'opt_' || n)) as s
    where s.refusal = 'rate_limited'),
  6,
  'saves past 120 a minute are refused, counting the refused save into Ada''s attempt above'
);

reset role;
select is(
  (select count(*)::integer from public.attempt_responses
    where attempt_id = (select id from ids where name = 'grace')),
  1,
  'and the ones taken still wrote one row'
);

select * from finish();
rollback;
