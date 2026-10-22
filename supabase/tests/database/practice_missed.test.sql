-- "Practise the N I missed" (20261023020000_practice_missed.sql).
--
-- A missed run is made from one of the student's own practice runs, or from an assignment whose
-- results are released to them, and holds only questions the source played and did not mark at
-- full points. Anything else is refused whole. Missed runs never close the run a student is in,
-- never change their Practice list counts, and never count in their clinical judgment steps. Only
-- the service role calls the new functions.
begin;
create extension if not exists pgtap with schema extensions;
select plan(42);

-- ---------------------------------------------------------------------------
-- Cast, as the superuser
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000004790a1', 'missed-teacher@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000004790d1', 'missed-ada@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000004790d2', 'missed-grace@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000004790d3', 'missed-outsider@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000004790d4', 'missed-hal@example.test', 'authenticated', 'authenticated');

select private.make_instructor('missed-teacher@example.test');
update public.profiles
   set org_id = (select org_id from public.profiles where id = '00000000-0000-0000-0000-0000004790a1'),
       role = 'student'
 where id in ('00000000-0000-0000-0000-0000004790d1', '00000000-0000-0000-0000-0000004790d2',
              '00000000-0000-0000-0000-0000004790d3', '00000000-0000-0000-0000-0000004790d4');

create function pg_temp.act_as(account uuid) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', account, 'role', 'authenticated')::text, true);
$$;

insert into public.classes (id, org_id, name)
  select '00000000-0000-0000-0000-0000004790c1', org_id, 'NUR 479'
    from public.profiles where id = '00000000-0000-0000-0000-0000004790a1';
insert into public.class_members (class_id, profile_id) values
  ('00000000-0000-0000-0000-0000004790c1', '00000000-0000-0000-0000-0000004790d1'),
  ('00000000-0000-0000-0000-0000004790c1', '00000000-0000-0000-0000-0000004790d2'),
  ('00000000-0000-0000-0000-0000004790c1', '00000000-0000-0000-0000-0000004790d4');

-- "Respiratory": four published standalone questions and a draft.
insert into public.item_banks (id, org_id, name)
  select '00000000-0000-0000-0000-0000004790e0', org_id, 'Respiratory'
    from public.profiles where id = '00000000-0000-0000-0000-0000004790a1';
insert into public.items (id, bank_id, org_id, type, cjmm_step, status, content, answer_key,
                          rationale, scoring, created_at)
  select v.id::uuid, '00000000-0000-0000-0000-0000004790e0', p.org_id, 'multiple_choice', 1,
         v.status::public.content_status, '{}', '{"correctOptionId":"secret_479"}',
         '{"general":"why"}', '{}', now() + v.lag * interval '1 second'
    from public.profiles p,
         (values ('00000000-0000-0000-0000-0000004790f1', 'published', 1),
                 ('00000000-0000-0000-0000-0000004790f2', 'published', 2),
                 ('00000000-0000-0000-0000-0000004790f3', 'published', 3),
                 ('00000000-0000-0000-0000-0000004790f4', 'draft', 4),
                 ('00000000-0000-0000-0000-0000004790f5', 'published', 5)) as v(id, status, lag)
   where p.id = '00000000-0000-0000-0000-0000004790a1';

insert into public.bank_practice_shares (org_id, bank_id, class_id, shared_by)
  select org_id, '00000000-0000-0000-0000-0000004790e0', '00000000-0000-0000-0000-0000004790c1',
         '00000000-0000-0000-0000-0000004790a1'
    from public.profiles where id = '00000000-0000-0000-0000-0000004790a1';

create temporary table ids (name text primary key, id uuid);
grant all on ids to authenticated, service_role;

-- Ada's run of the quiz: f1 at full marks, f2 at none, f3 at half, f5 not answered.
set local role service_role;
insert into ids
  select 'run1', run_id
    from public.open_practice_run('00000000-0000-0000-0000-0000004790d1',
                                  '00000000-0000-0000-0000-0000004790e0', false);
reset role;
insert into public.practice_responses (run_id, org_id, item_id, response, points, max_points, score)
  select (select id from ids where name = 'run1'), p.org_id, v.item::uuid, '{}', v.points, 1, '{}'
    from public.profiles p,
         (values ('00000000-0000-0000-0000-0000004790f1', 1.00),
                 ('00000000-0000-0000-0000-0000004790f2', 0.00),
                 ('00000000-0000-0000-0000-0000004790f3', 0.50)) as v(item, points)
   where p.id = '00000000-0000-0000-0000-0000004790a1';

-- How a start call answers, as one text: 'started' or the refusal.
create function pg_temp.from_run(student uuid, source uuid, wanted uuid[]) returns text
language sql as $$
  select outcome from public.start_missed_practice_from_run(student, source, wanted);
$$;
create function pg_temp.from_assignment(student uuid, attempt uuid, wanted uuid[]) returns text
language sql as $$
  select outcome from public.start_missed_practice_from_assignment(
    student, '00000000-0000-0000-0000-0000004790b1', wanted, attempt);
$$;
grant execute on function pg_temp.from_run(uuid, uuid, uuid[]) to service_role;
grant execute on function pg_temp.from_assignment(uuid, uuid, uuid[]) to service_role;

-- ---------------------------------------------------------------------------
-- The catalog
-- ---------------------------------------------------------------------------

select has_column('public', 'practice_runs', 'source_run', 'a run can name the run it came from');
select has_column('public', 'practice_runs', 'source_assignment',
  'or the assignment it came from');
select throws_ok(
  $$ insert into public.practice_runs (org_id, student_id, bank_id, source_run, source_assignment)
     select org_id, '00000000-0000-0000-0000-0000004790d1', '00000000-0000-0000-0000-0000004790e0',
            gen_random_uuid(), gen_random_uuid()
       from public.profiles where id = '00000000-0000-0000-0000-0000004790a1' $$,
  '23514', null,
  'but never both'
);
select ok(
  has_function_privilege('service_role', 'public.start_missed_practice_from_run(uuid, uuid, uuid[])', 'execute')
  and has_function_privilege('service_role',
    'public.start_missed_practice_from_assignment(uuid, uuid, uuid[], uuid)', 'execute')
  and has_function_privilege('service_role', 'public.missed_practice_run(uuid, uuid)', 'execute'),
  'the service role calls the three new functions'
);
select ok(
  not has_function_privilege('authenticated', 'public.start_missed_practice_from_run(uuid, uuid, uuid[])', 'execute')
  and not has_function_privilege('anon', 'public.start_missed_practice_from_run(uuid, uuid, uuid[])', 'execute')
  and not has_function_privilege('authenticated',
    'public.start_missed_practice_from_assignment(uuid, uuid, uuid[], uuid)', 'execute')
  and not has_function_privilege('anon',
    'public.start_missed_practice_from_assignment(uuid, uuid, uuid[], uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.missed_practice_run(uuid, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.missed_practice_run(uuid, uuid)', 'execute'),
  'no student and no visitor calls them'
);
select ok(
  not has_function_privilege('service_role', 'private.assignment_results_released(uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.assignment_results_released(uuid, uuid)', 'execute')
  and not has_function_privilege('service_role',
    'private.practice_run_open_to(uuid, public.practice_runs)', 'execute')
  and not has_function_privilege('authenticated',
    'private.practice_run_open_to(uuid, public.practice_runs)', 'execute'),
  'the two helpers are callable by no role directly'
);
select is(
  (select count(*)::integer
     from pg_proc p
    where p.oid in ('public.start_missed_practice_from_run(uuid, uuid, uuid[])'::regprocedure,
                    'public.start_missed_practice_from_assignment(uuid, uuid, uuid[], uuid)'::regprocedure,
                    'public.missed_practice_run(uuid, uuid)'::regprocedure,
                    'private.live_practice_run(uuid, uuid)'::regprocedure,
                    'public.open_practice_run(uuid, uuid, boolean)'::regprocedure,
                    'public.my_practice_banks()'::regprocedure,
                    'public.my_practice_step_marks()'::regprocedure)
      and p.prosecdef
      and p.proconfig @> array['search_path=""']),
  7,
  'every new and replaced function is a definer with an empty search_path'
);
select ok(
  has_function_privilege('service_role', 'public.open_practice_run(uuid, uuid, boolean)', 'execute')
  and not has_function_privilege('authenticated', 'public.open_practice_run(uuid, uuid, boolean)', 'execute')
  and has_function_privilege('authenticated', 'public.my_practice_banks()', 'execute')
  and not has_function_privilege('anon', 'public.my_practice_banks()', 'execute')
  and has_function_privilege('authenticated', 'public.my_practice_step_marks()', 'execute')
  and not has_function_privilege('anon', 'public.my_practice_step_marks()', 'execute'),
  'the replaced functions keep their grants'
);

-- ---------------------------------------------------------------------------
-- From a practice run
-- ---------------------------------------------------------------------------

set local role service_role;
select is(
  pg_temp.from_run('00000000-0000-0000-0000-0000004790d2', (select id from ids where name = 'run1'),
    array['00000000-0000-0000-0000-0000004790f2'::uuid]),
  'not_found',
  'another student cannot start from Ada''s run'
);
select is(
  pg_temp.from_run('00000000-0000-0000-0000-0000004790d1', (select id from ids where name = 'run1'),
    array['00000000-0000-0000-0000-0000004790f1'::uuid, '00000000-0000-0000-0000-0000004790f2'::uuid]),
  'invalid',
  'a question answered at full marks is refused, and the whole request with it'
);
select is(
  pg_temp.from_run('00000000-0000-0000-0000-0000004790d1', (select id from ids where name = 'run1'),
    array['00000000-0000-0000-0000-0000004790f4'::uuid]),
  'invalid',
  'a question the run did not play is refused'
);
select is(
  pg_temp.from_run('00000000-0000-0000-0000-0000004790d1', (select id from ids where name = 'run1'),
    array['00000000-0000-0000-0000-0000004790f5'::uuid]),
  'invalid',
  'so is one the run has not answered: its key has not been shown'
);
select is(
  pg_temp.from_run('00000000-0000-0000-0000-0000004790d1', (select id from ids where name = 'run1'),
    array[]::uuid[]),
  'empty',
  'naming nothing starts nothing'
);
insert into ids
  select 'missed1', run_id
    from public.start_missed_practice_from_run('00000000-0000-0000-0000-0000004790d1',
           (select id from ids where name = 'run1'),
           array['00000000-0000-0000-0000-0000004790f3'::uuid, '00000000-0000-0000-0000-0000004790f2'::uuid]);
reset role;

select results_eq(
  $$ select m.item_id, m.ordinal, m.digest = s.digest
       from public.practice_run_slots m
       join public.practice_run_slots s
         on s.run_id = (select id from ids where name = 'run1') and s.item_id = m.item_id
      where m.run_id = (select id from ids where name = 'missed1')
      order by m.ordinal $$,
  $$ values ('00000000-0000-0000-0000-0000004790f2'::uuid, 1, true),
            ('00000000-0000-0000-0000-0000004790f3'::uuid, 2, true) $$,
  'the missed run holds the wrong and the half-right question, in the run''s order, as it recorded them'
);
select is(
  (select row(source_run, source_assignment, frozen, bank_id)::text from public.practice_runs
    where id = (select id from ids where name = 'missed1')),
  row((select id from ids where name = 'run1'), null::uuid, true,
      '00000000-0000-0000-0000-0000004790e0'::uuid)::text,
  'and names the run it came from'
);

set local role service_role;
select results_eq(
  $$ select run_id from public.open_practice_run('00000000-0000-0000-0000-0000004790d1',
       '00000000-0000-0000-0000-0000004790e0', false) $$,
  $$ select id from ids where name = 'run1' $$,
  'opening the quiz still resumes the run Ada is in'
);
select is(
  (select count(*)::integer from public.practice_run_items('00000000-0000-0000-0000-0000004790d1',
     (select id from ids where name = 'run1'))),
  4,
  'which is still live'
);
select results_eq(
  $$ select item_id, answered from public.practice_run_items('00000000-0000-0000-0000-0000004790d1',
       (select id from ids where name = 'missed1')) order by ordinal $$,
  $$ values ('00000000-0000-0000-0000-0000004790f2'::uuid, false),
            ('00000000-0000-0000-0000-0000004790f3'::uuid, false) $$,
  'and the missed run is live beside it, with nothing answered'
);
select is(
  public.record_practice_response('00000000-0000-0000-0000-0000004790d1',
    (select id from ids where name = 'missed1'), '00000000-0000-0000-0000-0000004790f1',
    '{}', 1, 1, '{}'),
  'not_found',
  'a question outside the missed run cannot be answered in it'
);
select is(
  public.record_practice_response('00000000-0000-0000-0000-0000004790d1',
    (select id from ids where name = 'missed1'), '00000000-0000-0000-0000-0000004790f3',
    '{}', 1, 1, '{}'),
  'recorded',
  'one inside it can'
);
select is(
  (select row(title, source_kind, source_id)::text
     from public.missed_practice_run('00000000-0000-0000-0000-0000004790d1',
       (select id from ids where name = 'missed1'))),
  row('Respiratory', 'practice', (select id from ids where name = 'run1'))::text,
  'the missed run''s header names the quiz and its source'
);
select is_empty(
  $$ select * from public.missed_practice_run('00000000-0000-0000-0000-0000004790d1',
       (select id from ids where name = 'run1')) $$,
  'an ordinary run has no missed header'
);
select is_empty(
  $$ select * from public.missed_practice_run('00000000-0000-0000-0000-0000004790d2',
       (select id from ids where name = 'missed1')) $$,
  'and another student reads nothing of Ada''s'
);
reset role;

-- ---------------------------------------------------------------------------
-- From an assignment
-- ---------------------------------------------------------------------------

insert into public.assignments (id, org_id, class_id, bank_id, title, opens_at, closes_at, max_attempts)
  select '00000000-0000-0000-0000-0000004790b1', org_id, '00000000-0000-0000-0000-0000004790c1',
         '00000000-0000-0000-0000-0000004790e0', 'Week 7', now() - interval '1 hour',
         now() + interval '1 day', 2
    from public.profiles where id = '00000000-0000-0000-0000-0000004790a1';

-- Ada submitted once: f1 right, f2 wrong, f3 and f5 blank. Hal submitted too. Grace never
-- started.
insert into public.assignment_attempts
  (id, org_id, assignment_id, student_id, number, submitted_at, score, max_score)
  select v.id::uuid, a.org_id, a.id, v.student::uuid, 1, now() - interval '10 minutes', v.score, 4
    from public.assignments a,
         (values ('00000000-0000-0000-0000-000000479a01', '00000000-0000-0000-0000-0000004790d1', 1.00),
                 ('00000000-0000-0000-0000-000000479a04', '00000000-0000-0000-0000-0000004790d4', 4.00))
           as v(id, student, score)
   where a.id = '00000000-0000-0000-0000-0000004790b1';
insert into public.attempt_responses (attempt_id, org_id, item_id, response, points, max_points)
  select '00000000-0000-0000-0000-000000479a01', a.org_id, v.item::uuid, '{}', v.points, 1.00
    from public.assignments a,
         (values ('00000000-0000-0000-0000-0000004790f1', 1.00),
                 ('00000000-0000-0000-0000-0000004790f2', 0.00)) as v(item, points)
   where a.id = '00000000-0000-0000-0000-0000004790b1';

set local role service_role;
select is(
  pg_temp.from_assignment('00000000-0000-0000-0000-0000004790d1',
    '00000000-0000-0000-0000-000000479a01', array['00000000-0000-0000-0000-0000004790f2'::uuid]),
  'not_found',
  'before the close there is no missed run of an assignment'
);
reset role;

set local session_replication_role = replica;
update public.assignments
   set closes_at = now() - interval '1 minute'
 where id = '00000000-0000-0000-0000-0000004790b1';
set local session_replication_role = origin;

set local role service_role;
select is(
  pg_temp.from_assignment('00000000-0000-0000-0000-0000004790d3', null,
    array['00000000-0000-0000-0000-0000004790f2'::uuid]),
  'not_found',
  'a student outside the class gets nothing, closed or not'
);
select is(
  pg_temp.from_assignment('00000000-0000-0000-0000-0000004790d1',
    '00000000-0000-0000-0000-000000479a01', array['00000000-0000-0000-0000-0000004790f1'::uuid]),
  'invalid',
  'a question marked at full points in the attempt is refused'
);
select is(
  pg_temp.from_assignment('00000000-0000-0000-0000-0000004790d1', null,
    array['00000000-0000-0000-0000-0000004790f2'::uuid]),
  'invalid',
  'naming no attempt is refused for a student who submitted one'
);
select is(
  pg_temp.from_assignment('00000000-0000-0000-0000-0000004790d1',
    '00000000-0000-0000-0000-000000479a04', array['00000000-0000-0000-0000-0000004790f2'::uuid]),
  'invalid',
  'so is naming someone else''s attempt'
);
select is(
  pg_temp.from_assignment('00000000-0000-0000-0000-0000004790d1',
    '00000000-0000-0000-0000-000000479a01', array['00000000-0000-0000-0000-0000004790f4'::uuid]),
  'invalid',
  'and a question the assignment did not hold'
);
insert into ids
  select 'missedA', run_id
    from public.start_missed_practice_from_assignment('00000000-0000-0000-0000-0000004790d1',
           '00000000-0000-0000-0000-0000004790b1',
           array['00000000-0000-0000-0000-0000004790f5'::uuid, '00000000-0000-0000-0000-0000004790f2'::uuid],
           '00000000-0000-0000-0000-000000479a01');
select results_eq(
  $$ select item_id from public.practice_run_items('00000000-0000-0000-0000-0000004790d1',
       (select id from ids where name = 'missedA')) order by ordinal $$,
  $$ values ('00000000-0000-0000-0000-0000004790f2'::uuid), ('00000000-0000-0000-0000-0000004790f5'::uuid) $$,
  'the wrong and the blank question play in the assignment''s order'
);
select is(
  (select row(title, source_kind, source_id)::text
     from public.missed_practice_run('00000000-0000-0000-0000-0000004790d1',
       (select id from ids where name = 'missedA'))),
  row('Week 7', 'assignment', '00000000-0000-0000-0000-0000004790b1'::uuid)::text,
  'its header is the assignment''s title'
);
select is(
  public.record_practice_response('00000000-0000-0000-0000-0000004790d1',
    (select id from ids where name = 'missedA'), '00000000-0000-0000-0000-0000004790f5',
    '{}', 0, 1, '{}'),
  'recorded',
  'Ada answers the blank question in it'
);
select is(
  pg_temp.from_assignment('00000000-0000-0000-0000-0000004790d2', null,
    array['00000000-0000-0000-0000-0000004790f1'::uuid, '00000000-0000-0000-0000-0000004790f2'::uuid]),
  'started',
  'a member who submitted nothing missed every question'
);
reset role;

-- A question unpublished since is left out; with nothing left, no run is kept.
update public.items set status = 'draft' where id = '00000000-0000-0000-0000-0000004790f3';
set local role service_role;
select is(
  pg_temp.from_assignment('00000000-0000-0000-0000-0000004790d2', null,
    array['00000000-0000-0000-0000-0000004790f3'::uuid]),
  'empty',
  'a run of only unpublished questions is not started'
);
reset role;
select is(
  (select count(*)::integer from public.practice_runs
    where student_id = '00000000-0000-0000-0000-0000004790d2'),
  1,
  'and leaves no row behind'
);

-- A missed run of a missed run keeps the assignment as its source.
set local role service_role;
select is(
  pg_temp.from_run('00000000-0000-0000-0000-0000004790d1', (select id from ids where name = 'missedA'),
    array['00000000-0000-0000-0000-0000004790f2'::uuid]),
  'invalid',
  'a missed run''s question not yet answered in it is not missed there'
);
insert into ids
  select 'missedB', run_id
    from public.start_missed_practice_from_run('00000000-0000-0000-0000-0000004790d1',
           (select id from ids where name = 'missedA'),
           array['00000000-0000-0000-0000-0000004790f5'::uuid]);
reset role;
select is(
  (select row(source_run, source_assignment)::text from public.practice_runs
    where id = (select id from ids where name = 'missedB')),
  row(null::uuid, '00000000-0000-0000-0000-0000004790b1'::uuid)::text,
  'a run of an assignment''s misses passes the assignment on'
);

-- ---------------------------------------------------------------------------
-- What the student home reads
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000004790d1');
select is(
  (select row(item_count, answered)::text from public.my_practice_banks()
    where bank_id = '00000000-0000-0000-0000-0000004790e0'),
  row(4, 3)::text,
  'the Practice list still counts the run Ada is in'
);
select is(
  (select count(*)::integer from public.my_practice_step_marks()),
  3,
  'and her steps leave out every answer given in a missed run'
);
select throws_ok(
  $$ select * from public.start_missed_practice_from_assignment(
       '00000000-0000-0000-0000-0000004790d1', '00000000-0000-0000-0000-0000004790b1',
       array['00000000-0000-0000-0000-0000004790f2'::uuid]) $$,
  '42501', null,
  'a student cannot start a missed run from their own browser'
);
reset role;

-- ---------------------------------------------------------------------------
-- Stopping the share
-- ---------------------------------------------------------------------------

delete from public.bank_practice_shares where bank_id = '00000000-0000-0000-0000-0000004790e0';
set local role service_role;
select is_empty(
  $$ select * from public.practice_run_items('00000000-0000-0000-0000-0000004790d1',
       (select id from ids where name = 'missed1')) $$,
  'closes a missed run of a practice run, as it closes the run itself'
);
select is(
  (select count(*)::integer from public.practice_run_items('00000000-0000-0000-0000-0000004790d1',
     (select id from ids where name = 'missedA'))),
  2,
  'and leaves a missed run of a released assignment open: it never needed the share'
);
reset role;

select * from finish();
rollback;
