-- A student's review list (20261126000400_review_entries.sql, #627).
--
-- A question enters a student's list when they answer it below full marks after its key was
-- shown: a recorded practice answer, or a released assignment's best attempt, picked up when the
-- home loads. A review run plays only that student's due questions; an answer in it moves the
-- row by ADR 0019's rules (one table of cases, shared with src/lib/practice/reviewCases.ts). A
-- review run never closes the ordinary run, never changes the Practice list or the steps. Only a
-- published question, and only while the student is in a class of its workspace, is served.
begin;
create extension if not exists pgtap with schema extensions;
select plan(66);

-- ---------------------------------------------------------------------------
-- Cast, as the superuser
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000006270a1', 'review-teacher@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000006270d1', 'review-ada@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000006270d2', 'review-grace@example.test', 'authenticated', 'authenticated');

select private.make_instructor('review-teacher@example.test');
update public.profiles
   set org_id = (select org_id from public.profiles where id = '00000000-0000-0000-0000-0000006270a1'),
       role = 'student'
 where id in ('00000000-0000-0000-0000-0000006270d1', '00000000-0000-0000-0000-0000006270d2');

create function pg_temp.act_as(account uuid) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', account, 'role', 'authenticated')::text, true);
$$;

insert into public.classes (id, org_id, name)
  select '00000000-0000-0000-0000-0000006270c1', org_id, 'NUR 627'
    from public.profiles where id = '00000000-0000-0000-0000-0000006270a1';
insert into public.class_members (class_id, profile_id) values
  ('00000000-0000-0000-0000-0000006270c1', '00000000-0000-0000-0000-0000006270d1'),
  ('00000000-0000-0000-0000-0000006270c1', '00000000-0000-0000-0000-0000006270d2');

-- "Renal": six published standalone questions, with a key and a rationale no read may carry.
insert into public.item_banks (id, org_id, name)
  select '00000000-0000-0000-0000-0000006270e0', org_id, 'Renal'
    from public.profiles where id = '00000000-0000-0000-0000-0000006270a1';
insert into public.items (id, bank_id, org_id, type, cjmm_step, status, content, answer_key,
                          rationale, scoring, created_at)
  select v.id::uuid, '00000000-0000-0000-0000-0000006270e0', p.org_id, 'multiple_choice', 1,
         'published', '{}', '{"correctOptionId":"secret_627"}',
         '{"general":"rationale_627"}', '{}', now() + v.lag * interval '1 second'
    from public.profiles p,
         (values ('00000000-0000-0000-0000-0000006270f1', 1),
                 ('00000000-0000-0000-0000-0000006270f2', 2),
                 ('00000000-0000-0000-0000-0000006270f3', 3),
                 ('00000000-0000-0000-0000-0000006270f4', 4),
                 ('00000000-0000-0000-0000-0000006270f5', 5),
                 ('00000000-0000-0000-0000-0000006270f6', 6)) as v(id, lag)
   where p.id = '00000000-0000-0000-0000-0000006270a1';

insert into public.bank_practice_shares (org_id, bank_id, class_id, shared_by)
  select org_id, '00000000-0000-0000-0000-0000006270e0', '00000000-0000-0000-0000-0000006270c1',
         '00000000-0000-0000-0000-0000006270a1'
    from public.profiles where id = '00000000-0000-0000-0000-0000006270a1';

create temporary table ids (name text primary key, id uuid);
grant all on ids to authenticated, service_role;

-- How the server's calls answer, as one text.
create function pg_temp.review(student uuid, wanted uuid[]) returns text
language sql as $$
  select outcome from public.start_review_run(student, wanted);
$$;
create function pg_temp.answer(student uuid, run_name text, item uuid, earned numeric)
returns text
language sql as $$
  select public.record_practice_response(student, (select id from ids where name = run_name),
                                         item, '{}', earned, 1, '{}');
$$;
grant execute on function pg_temp.review(uuid, uuid[]) to service_role;
grant execute on function pg_temp.answer(uuid, text, uuid, numeric) to service_role;

-- ---------------------------------------------------------------------------
-- The catalog
-- ---------------------------------------------------------------------------

select has_table('public', 'review_entries', 'the review list is a table');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.review_entries'::regclass)
  and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'review_entries')
  and not has_table_privilege('anon', 'public.review_entries', 'select')
  and not has_table_privilege('authenticated', 'public.review_entries', 'select')
  and not has_table_privilege('authenticated', 'public.review_entries', 'insert')
  and not has_table_privilege('service_role', 'public.review_entries', 'select')
  and not has_table_privilege('service_role', 'public.review_entries', 'insert')
  and not has_table_privilege('service_role', 'public.review_entries', 'update'),
  'no role reads or writes it directly, the service role included'
);
select throws_ok(
  $$ insert into public.review_entries (student_id, item_id, org_id, gap_days, due_at, last_answered_at)
     select '00000000-0000-0000-0000-0000006270d1', '00000000-0000-0000-0000-0000006270f1', org_id,
            2, now(), now()
       from public.profiles where id = '00000000-0000-0000-0000-0000006270a1' $$,
  '23514', null,
  'a gap that is not one of 1, 3, 7, 14 cannot be stored'
);
select throws_ok(
  $$ insert into public.review_entries
       (student_id, item_id, org_id, gap_days, due_at, retired_at, last_answered_at)
     select '00000000-0000-0000-0000-0000006270d1', '00000000-0000-0000-0000-0000006270f1', org_id,
            1, now(), now(), now()
       from public.profiles where id = '00000000-0000-0000-0000-0000006270a1' $$,
  '23514', null,
  'nor a row both waiting and retired'
);
select throws_ok(
  $$ insert into public.review_entries (student_id, item_id, org_id, gap_days, due_at, last_answered_at)
     select '00000000-0000-0000-0000-0000006270d1', '00000000-0000-0000-0000-0000006270f1', org_id,
            1, 'infinity', now()
       from public.profiles where id = '00000000-0000-0000-0000-0000006270a1' $$,
  '23514', null,
  'nor one due at a time that is not finite'
);
select throws_ok(
  $$ insert into public.practice_runs (org_id, student_id, bank_id, source_review)
     select org_id, '00000000-0000-0000-0000-0000006270d1', '00000000-0000-0000-0000-0000006270e0', true
       from public.profiles where id = '00000000-0000-0000-0000-0000006270a1' $$,
  '23514', null,
  'a review run has no quiz'
);
select throws_ok(
  $$ insert into public.practice_runs (org_id, student_id, bank_id)
     select org_id, '00000000-0000-0000-0000-0000006270d1', null
       from public.profiles where id = '00000000-0000-0000-0000-0000006270a1' $$,
  '23514', null,
  'and every other run still has one'
);
select ok(
  has_function_privilege('service_role', 'public.fill_review_from_assignments(uuid)', 'execute')
  and has_function_privilege('service_role', 'public.start_review_run(uuid, uuid[])', 'execute')
  and has_function_privilege('service_role', 'public.review_due_items(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.fill_review_from_assignments(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.fill_review_from_assignments(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.start_review_run(uuid, uuid[])', 'execute')
  and not has_function_privilege('anon', 'public.start_review_run(uuid, uuid[])', 'execute')
  and not has_function_privilege('authenticated', 'public.review_due_items(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.review_due_items(uuid)', 'execute'),
  'the three server calls are the service role''s alone'
);
select ok(
  has_function_privilege('authenticated', 'public.my_review_due()', 'execute')
  and not has_function_privilege('anon', 'public.my_review_due()', 'execute')
  and has_function_privilege('service_role',
    'public.record_practice_response(uuid, uuid, uuid, jsonb, numeric, numeric, jsonb)', 'execute')
  and not has_function_privilege('authenticated',
    'public.record_practice_response(uuid, uuid, uuid, jsonb, numeric, numeric, jsonb)', 'execute'),
  'a student reads their own count; the replaced answer call keeps its grants'
);
select ok(
  not has_function_privilege('service_role',
    'private.apply_review_answer(uuid, uuid, uuid, numeric, numeric, timestamptz, boolean)', 'execute')
  and not has_function_privilege('authenticated',
    'private.apply_review_answer(uuid, uuid, uuid, numeric, numeric, timestamptz, boolean)', 'execute')
  and not has_function_privilege('service_role',
    'private.review_next(smallint, timestamptz, timestamptz, boolean, numeric, numeric, timestamptz)', 'execute')
  and not has_function_privilege('service_role', 'private.review_entry_served(uuid, uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.review_entry_served(uuid, uuid, uuid)', 'execute')
  and not has_function_privilege('service_role', 'private.in_workspace_class(uuid, uuid)', 'execute')
  and not has_function_privilege('service_role',
    'private.practice_run_open_to(uuid, public.practice_runs)', 'execute'),
  'the helpers are callable by no role directly'
);
select is(
  (select count(*)::integer
     from pg_proc p
    where p.oid in ('public.fill_review_from_assignments(uuid)'::regprocedure,
                    'public.start_review_run(uuid, uuid[])'::regprocedure,
                    'public.review_due_items(uuid)'::regprocedure,
                    'public.my_review_due()'::regprocedure,
                    'public.record_practice_response(uuid, uuid, uuid, jsonb, numeric, numeric, jsonb)'::regprocedure,
                    'private.apply_review_answer(uuid, uuid, uuid, numeric, numeric, timestamptz, boolean)'::regprocedure,
                    'private.review_entry_served(uuid, uuid, uuid)'::regprocedure,
                    'private.in_workspace_class(uuid, uuid)'::regprocedure,
                    'private.practice_run_open_to(uuid, public.practice_runs)'::regprocedure)
      and p.prosecdef
      and p.proconfig @> array['search_path=""']),
  9,
  'every new and replaced definer has an empty search_path'
);
-- The response bytes: neither read a student or a review sitting is handed carries a key or a
-- rationale. The control: the content read the server scores with does, so the probe would see it.
select ok(
  pg_get_function_result('public.my_review_due()'::regprocedure) !~ '(answer_key|rationale|content|item_id)'
  and pg_get_function_result('public.review_due_items(uuid)'::regprocedure) !~ '(answer_key|rationale|content)'
  and pg_get_function_result('public.practice_run_items(uuid, uuid)'::regprocedure) !~ '(answer_key|rationale|content)'
  and pg_get_function_result('public.practice_run_item_content(uuid, uuid, uuid[])'::regprocedure)
        ~ 'answer_key'
  and pg_get_function_result('public.practice_run_item_content(uuid, uuid, uuid[])'::regprocedure)
        ~ 'rationale',
  'my_review_due and a run''s question list carry no key and no rationale; the scoring read does'
);

-- ---------------------------------------------------------------------------
-- The schedule: one table of cases, shared with src/lib/practice/reviewCases.ts
-- ---------------------------------------------------------------------------

create temporary table review_cases (
  name text, gap smallint, due_h integer, retired_h integer, in_review boolean,
  earned numeric, possible numeric, answered_h integer,
  want_gap smallint, want_due_h integer, want_retired_h integer
);
insert into review_cases values
  ('review case: a miss enters at 1 day', null, null, null, false, 0, 1, 0, 1, 24, null),
  ('review case: full marks outside review never enters', null, null, null, false, 1, 1, 0, null, null, null),
  ('review case: full marks in review on nothing stays out', null, null, null, true, 1, 1, 0, null, null, null),
  ('review case: a question worth nothing never enters', null, null, null, false, 0, 0, 0, null, null, null),
  ('review case: due at 1 day, full marks moves to 3', 1, 24, null, true, 1, 1, 24, 3, 96, null),
  ('review case: late at 3 days, the next gap counts from the answer', 3, 96, null, true, 1, 1, 100, 7, 268, null),
  ('review case: due at 7 days, full marks moves to 14', 7, 268, null, true, 2, 2, 268, 14, 604, null),
  ('review case: full marks at 14 days retires it', 14, 604, null, true, 1, 1, 610, null, null, 610),
  ('review case: a miss in review goes back to 1 day', 3, 96, null, true, 0, 1, 100, 1, 124, null),
  ('review case: partial credit in review is a miss', 1, 24, null, true, 0.5, 1, 30, 1, 54, null),
  ('review case: full marks in review before due counts for nothing', 3, 96, null, true, 1, 1, 90, 3, 96, null),
  ('review case: a miss in review before due still goes back to 1 day', 3, 96, null, true, 0, 1, 90, 1, 114, null),
  ('review case: full marks elsewhere while due changes nothing', 3, 96, null, false, 1, 1, 100, 3, 96, null),
  ('review case: a miss elsewhere brings a retired question back', null, null, 610, false, 0, 1, 700, 1, 724, null),
  ('review case: full marks in review keeps a retired question retired', null, null, 610, true, 1, 1, 700, null, null, 610),
  ('review case: a mark worth nothing leaves a waiting question', 7, 268, null, true, 0, 0, 300, 7, 268, null),
  ('review case: above the maximum is full marks', 1, 24, null, true, 2, 1, 24, 3, 96, null);

create function pg_temp.hour(h integer) returns timestamptz
language sql immutable as $$
  select case when h is null then null
              else '2026-01-01 00:00:00+00'::timestamptz + h * interval '1 hour' end;
$$;

select is(
  (select count(*)::integer from review_cases),
  17,
  'the shared table holds every case'
);
select is_empty(
  $$ select c.name
       from review_cases c
       cross join lateral private.review_next(c.gap, pg_temp.hour(c.due_h),
         pg_temp.hour(c.retired_h), c.in_review, c.earned, c.possible, pg_temp.hour(c.answered_h)) n
      where n.next_gap is distinct from c.want_gap
         or n.next_due is distinct from pg_temp.hour(c.want_due_h)
         or n.next_retired is distinct from pg_temp.hour(c.want_retired_h) $$,
  'private.review_next answers every shared case as nextReviewState does'
);

-- ---------------------------------------------------------------------------
-- Filling the list from practice
-- ---------------------------------------------------------------------------

set local role service_role;
insert into ids
  select 'run1', run_id
    from public.open_practice_run('00000000-0000-0000-0000-0000006270d1',
                                  '00000000-0000-0000-0000-0000006270e0', false);
-- Ada: f1 right, f2 wrong, f3 half right, f5 wrong; f4 and f6 not answered.
select is(
  pg_temp.answer('00000000-0000-0000-0000-0000006270d1', 'run1', '00000000-0000-0000-0000-0000006270f1', 1)
  || pg_temp.answer('00000000-0000-0000-0000-0000006270d1', 'run1', '00000000-0000-0000-0000-0000006270f2', 0)
  || pg_temp.answer('00000000-0000-0000-0000-0000006270d1', 'run1', '00000000-0000-0000-0000-0000006270f3', 0.5)
  || pg_temp.answer('00000000-0000-0000-0000-0000006270d1', 'run1', '00000000-0000-0000-0000-0000006270f5', 0),
  'recordedrecordedrecordedrecorded',
  'Ada answers four questions of her run'
);
select is(
  pg_temp.answer('00000000-0000-0000-0000-0000006270d1', 'run1', '00000000-0000-0000-0000-0000006270f2', 1),
  'answered',
  'a second answer to the same question in the run is refused'
);
reset role;

select results_eq(
  $$ select item_id from public.review_entries
      where student_id = '00000000-0000-0000-0000-0000006270d1' order by item_id $$,
  $$ values ('00000000-0000-0000-0000-0000006270f2'::uuid), ('00000000-0000-0000-0000-0000006270f3'::uuid),
            ('00000000-0000-0000-0000-0000006270f5'::uuid) $$,
  'the wrong and the half-right answers enter; full marks and unanswered questions never do'
);
select is(
  (select row(e.gap_days, e.due_at = p.answered_at + interval '24 hours', e.retired_at,
              e.last_answered_at = p.answered_at, e.org_id = p.org_id)::text
     from public.review_entries e
     join public.practice_responses p
       on p.run_id = (select id from ids where name = 'run1') and p.item_id = e.item_id
    where e.student_id = '00000000-0000-0000-0000-0000006270d1'
      and e.item_id = '00000000-0000-0000-0000-0000006270f2'),
  row(1::smallint, true, null::timestamptz, true, true)::text,
  'waiting out the 1 day gap, due exactly 24 hours after the first answer, which the refused one did not move'
);

-- Steps and the Practice list as they stand before any review run, to compare with after.
select pg_temp.act_as('00000000-0000-0000-0000-0000006270d1');
create temporary table steps_before as select * from public.my_practice_step_marks();
create temporary table banks_before as select * from public.my_practice_banks();
grant select on steps_before, banks_before to authenticated;

set local role authenticated;
select is(
  (select row(due, next_due_at is not null)::text from public.my_review_due()),
  row(0, true)::text,
  'nothing is due yet, and my_review_due says when the next one is'
);
select throws_ok(
  $$ select * from public.review_entries $$,
  '42501', null,
  'Ada cannot read the table herself'
);
select throws_ok(
  $$ select * from public.start_review_run('00000000-0000-0000-0000-0000006270d1',
       array['00000000-0000-0000-0000-0000006270f2'::uuid]) $$,
  '42501', null,
  'nor start a review run from her browser'
);
select throws_ok(
  $$ select public.fill_review_from_assignments('00000000-0000-0000-0000-0000006270d1') $$,
  '42501', null,
  'nor fill her list'
);
select throws_ok(
  $$ select * from public.review_due_items('00000000-0000-0000-0000-0000006270d1') $$,
  '42501', null,
  'nor read her due questions by id'
);
reset role;

-- The clock moves on a day for f2 and f3 (the demo step), f2 first; f5 is still waiting.
update public.review_entries
   set due_at = now() - case item_id when '00000000-0000-0000-0000-0000006270f2'
                                     then interval '2 hours' else interval '1 hour' end
 where student_id = '00000000-0000-0000-0000-0000006270d1'
   and item_id in ('00000000-0000-0000-0000-0000006270f2', '00000000-0000-0000-0000-0000006270f3');

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000006270d1');
select is(
  (select due from public.my_review_due()),
  2,
  'a day on, two are due'
);
select pg_temp.act_as('00000000-0000-0000-0000-0000006270d2');
select is(
  (select row(due, next_due_at)::text from public.my_review_due()),
  row(0, null::timestamptz)::text,
  'Grace reads none of Ada''s'
);
reset role;
set local role anon;
select throws_ok(
  $$ select * from public.my_review_due() $$,
  '42501', null,
  'and a visitor reads nothing'
);
reset role;

-- ---------------------------------------------------------------------------
-- A review run
-- ---------------------------------------------------------------------------

set local role service_role;
select results_eq(
  $$ select item_id from public.review_due_items('00000000-0000-0000-0000-0000006270d1') $$,
  $$ values ('00000000-0000-0000-0000-0000006270f2'::uuid), ('00000000-0000-0000-0000-0000006270f3'::uuid) $$,
  'the server reads Ada''s due questions, the earliest first'
);
select is_empty(
  $$ select * from public.review_due_items('00000000-0000-0000-0000-0000006270d2') $$,
  'and none for Grace'
);
select is(
  pg_temp.review('00000000-0000-0000-0000-0000006270d2', array['00000000-0000-0000-0000-0000006270f2'::uuid]),
  'invalid',
  'Grace cannot start a review of Ada''s question'
);
select is(
  pg_temp.review('00000000-0000-0000-0000-0000006270d1', array['00000000-0000-0000-0000-0000006270f1'::uuid]),
  'invalid',
  'a question not on the list is refused'
);
select is(
  pg_temp.review('00000000-0000-0000-0000-0000006270d1', array['00000000-0000-0000-0000-0000006270f5'::uuid]),
  'invalid',
  'so is one on the list that is not due'
);
select is(
  pg_temp.review('00000000-0000-0000-0000-0000006270d1',
    array['00000000-0000-0000-0000-0000006270f2'::uuid, '00000000-0000-0000-0000-0000006270f5'::uuid]),
  'invalid',
  'and the whole request with it'
);
select is(
  pg_temp.review('00000000-0000-0000-0000-0000006270d1', array[]::uuid[]),
  'empty',
  'naming nothing starts nothing'
);
select is(
  (select count(*)::integer from public.practice_runs
    where student_id = '00000000-0000-0000-0000-0000006270d1'),
  1,
  'no refused request left a run behind'
);
insert into ids
  select 'review1', run_id
    from public.start_review_run('00000000-0000-0000-0000-0000006270d1',
           array['00000000-0000-0000-0000-0000006270f3'::uuid, '00000000-0000-0000-0000-0000006270f2'::uuid]);
select results_eq(
  $$ select item_id, answered from public.practice_run_items('00000000-0000-0000-0000-0000006270d1',
       (select id from ids where name = 'review1')) order by ordinal $$,
  $$ values ('00000000-0000-0000-0000-0000006270f2'::uuid, false),
            ('00000000-0000-0000-0000-0000006270f3'::uuid, false) $$,
  'the review run holds the two due questions, the earliest due first'
);
reset role;
select is(
  (select row(source_review, bank_id, source_run, source_assignment, frozen)::text
     from public.practice_runs where id = (select id from ids where name = 'review1')),
  row(true, null::uuid, null::uuid, null::uuid, true)::text,
  'it is marked as a review run, of no quiz, frozen at start'
);

set local role service_role;
select results_eq(
  $$ select run_id from public.open_practice_run('00000000-0000-0000-0000-0000006270d1',
       '00000000-0000-0000-0000-0000006270e0', false) $$,
  $$ select id from ids where name = 'run1' $$,
  'opening the quiz still resumes the run Ada is in'
);
select is(
  (select count(*)::integer from public.practice_run_items('00000000-0000-0000-0000-0000006270d1',
     (select id from ids where name = 'run1'))),
  6,
  'which is still live'
);
select is_empty(
  $$ select * from public.practice_run_items('00000000-0000-0000-0000-0000006270d2',
       (select id from ids where name = 'review1')) $$,
  'Grace cannot read Ada''s review run'
);
select is_empty(
  $$ select * from public.practice_run_item_content('00000000-0000-0000-0000-0000006270d2',
       (select id from ids where name = 'review1'), array['00000000-0000-0000-0000-0000006270f2'::uuid]) $$,
  'nor its content'
);
select is(
  pg_temp.answer('00000000-0000-0000-0000-0000006270d2', 'review1', '00000000-0000-0000-0000-0000006270f2', 1),
  'not_found',
  'nor answer in it'
);
select is_empty(
  $$ select * from public.missed_practice_run('00000000-0000-0000-0000-0000006270d1',
       (select id from ids where name = 'review1')) $$,
  'a review run has no missed run header'
);

-- Answers in the review run move the rows.
select is(
  pg_temp.answer('00000000-0000-0000-0000-0000006270d1', 'review1', '00000000-0000-0000-0000-0000006270f2', 1)
  || pg_temp.answer('00000000-0000-0000-0000-0000006270d1', 'review1', '00000000-0000-0000-0000-0000006270f3', 0),
  'recordedrecorded',
  'Ada answers both in review: f2 right, f3 wrong'
);
reset role;
select is(
  (select row(e.gap_days, e.due_at = p.answered_at + interval '72 hours', e.retired_at)::text
     from public.review_entries e
     join public.practice_responses p
       on p.run_id = (select id from ids where name = 'review1') and p.item_id = e.item_id
    where e.student_id = '00000000-0000-0000-0000-0000006270d1'
      and e.item_id = '00000000-0000-0000-0000-0000006270f2'),
  row(3::smallint, true, null::timestamptz)::text,
  'full marks in review moves f2 to the 3 day gap, from that answer'
);
select is(
  (select row(e.gap_days, e.due_at = p.answered_at + interval '24 hours')::text
     from public.review_entries e
     join public.practice_responses p
       on p.run_id = (select id from ids where name = 'review1') and p.item_id = e.item_id
    where e.student_id = '00000000-0000-0000-0000-0000006270d1'
      and e.item_id = '00000000-0000-0000-0000-0000006270f3'),
  row(1::smallint, true)::text,
  'a miss in review sends f3 back to 1 day'
);

-- f2 at its last gap, due: full marks retires it.
update public.review_entries
   set gap_days = 14, due_at = now() - interval '1 minute'
 where student_id = '00000000-0000-0000-0000-0000006270d1'
   and item_id = '00000000-0000-0000-0000-0000006270f2';
set local role service_role;
insert into ids
  select 'review2', run_id
    from public.start_review_run('00000000-0000-0000-0000-0000006270d1',
           array['00000000-0000-0000-0000-0000006270f2'::uuid]);
select is(
  pg_temp.answer('00000000-0000-0000-0000-0000006270d1', 'review2', '00000000-0000-0000-0000-0000006270f2', 1),
  'recorded',
  'Ada answers f2 at the 14 day gap'
);
reset role;
select is(
  (select row(e.gap_days, e.due_at, e.retired_at = p.answered_at)::text
     from public.review_entries e
     join public.practice_responses p
       on p.run_id = (select id from ids where name = 'review2') and p.item_id = e.item_id
    where e.student_id = '00000000-0000-0000-0000-0000006270d1'
      and e.item_id = '00000000-0000-0000-0000-0000006270f2'),
  row(null::smallint, null::timestamptz, true)::text,
  'the last gap retires it'
);

-- A review run's misses are already back on the list: it is no source for a missed run.
set local role service_role;
select throws_ok(
  $$ select * from public.start_missed_practice_from_run('00000000-0000-0000-0000-0000006270d1',
       (select id from ids where name = 'review1'), array['00000000-0000-0000-0000-0000006270f3'::uuid]) $$,
  '23514', null,
  'a missed run cannot be made from a review run'
);
reset role;

-- ---------------------------------------------------------------------------
-- Filling the list from assignments
-- ---------------------------------------------------------------------------

select pg_temp.act_as('00000000-0000-0000-0000-0000006270a1');
insert into public.assignments (id, org_id, class_id, bank_id, title, opens_at, closes_at, max_attempts)
  select '00000000-0000-0000-0000-0000006270b1', org_id, '00000000-0000-0000-0000-0000006270c1',
         '00000000-0000-0000-0000-0000006270e0', 'Week 9', now() - interval '1 hour',
         now() + interval '1 day', 2
    from public.profiles where id = '00000000-0000-0000-0000-0000006270a1';

-- Ada's best attempt (the first): f1 right, f2 and f4 wrong, the rest blank. Her second scored
-- less and got f1 wrong, which must not count. Grace never started.
insert into public.assignment_attempts
  (id, org_id, assignment_id, student_id, number, submitted_at, score, max_score)
  select v.id::uuid, a.org_id, a.id, '00000000-0000-0000-0000-0000006270d1', v.number,
         now() - v.ago * interval '1 minute', v.score, 6
    from public.assignments a,
         (values ('00000000-0000-0000-0000-000000627a01', 1, 20, 1.00),
                 ('00000000-0000-0000-0000-000000627a02', 2, 10, 0.00)) as v(id, number, ago, score)
   where a.id = '00000000-0000-0000-0000-0000006270b1';
insert into public.attempt_responses (attempt_id, org_id, item_id, response, points, max_points)
  select v.attempt::uuid, a.org_id, v.item::uuid, '{}', v.points, 1.00
    from public.assignments a,
         (values ('00000000-0000-0000-0000-000000627a01', '00000000-0000-0000-0000-0000006270f1', 1.00),
                 ('00000000-0000-0000-0000-000000627a01', '00000000-0000-0000-0000-0000006270f2', 0.00),
                 ('00000000-0000-0000-0000-000000627a01', '00000000-0000-0000-0000-0000006270f4', 0.00),
                 ('00000000-0000-0000-0000-000000627a02', '00000000-0000-0000-0000-0000006270f1', 0.00))
           as v(attempt, item, points)
   where a.id = '00000000-0000-0000-0000-0000006270b1';

set local role service_role;
select is(
  public.fill_review_from_assignments('00000000-0000-0000-0000-0000006270d1'),
  0,
  'an open assignment adds nothing'
);
reset role;

set local session_replication_role = replica;
update public.assignments
   set closes_at = now() - interval '1 minute'
 where id = '00000000-0000-0000-0000-0000006270b1';
set local session_replication_role = origin;

set local role service_role;
select is(
  public.fill_review_from_assignments('00000000-0000-0000-0000-0000006270d1'),
  2,
  'after the close, its missed questions not on the list are added'
);
select is(
  public.fill_review_from_assignments('00000000-0000-0000-0000-0000006270d1'),
  0,
  'and loading the home again adds none again'
);
select is(
  public.fill_review_from_assignments('00000000-0000-0000-0000-0000006270d2'),
  0,
  'a member with no attempt has no best attempt to miss questions in'
);
reset role;
select results_eq(
  $$ select e.item_id, e.gap_days, e.due_at = a.submitted_at + interval '24 hours',
            e.last_answered_at = a.submitted_at
       from public.review_entries e
       join public.assignment_attempts a on a.id = '00000000-0000-0000-0000-000000627a01'
      where e.student_id = '00000000-0000-0000-0000-0000006270d1'
        and e.item_id in ('00000000-0000-0000-0000-0000006270f4', '00000000-0000-0000-0000-0000006270f6')
      order by e.item_id $$,
  $$ values ('00000000-0000-0000-0000-0000006270f4'::uuid, 1::smallint, true, true),
            ('00000000-0000-0000-0000-0000006270f6'::uuid, 1::smallint, true, true) $$,
  'the wrong and the blank question enter at 1 day from the best attempt''s submit'
);
select ok(
  not exists (select 1 from public.review_entries
               where student_id = '00000000-0000-0000-0000-0000006270d1'
                 and item_id = '00000000-0000-0000-0000-0000006270f1')
  and (select retired_at is not null from public.review_entries
        where student_id = '00000000-0000-0000-0000-0000006270d1'
          and item_id = '00000000-0000-0000-0000-0000006270f2'),
  'the worse attempt''s miss does not count, and f2, already on the list, is left as it was'
);

-- A question that came from an assignment, reviewed: the steps and the Practice list are as
-- they were before any review run.
update public.review_entries
   set due_at = now() - interval '1 minute'
 where student_id = '00000000-0000-0000-0000-0000006270d1'
   and item_id = '00000000-0000-0000-0000-0000006270f4';
set local role service_role;
insert into ids
  select 'review3', run_id
    from public.start_review_run('00000000-0000-0000-0000-0000006270d1',
           array['00000000-0000-0000-0000-0000006270f4'::uuid]);
select is(
  pg_temp.answer('00000000-0000-0000-0000-0000006270d1', 'review3', '00000000-0000-0000-0000-0000006270f4', 1),
  'recorded',
  'Ada answers f4, never answered in practice, in review'
);
reset role;

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000006270d1');
select results_eq(
  $$ select cjmm_step, points, max_points from public.my_practice_step_marks() order by 1, 2, 3 $$,
  $$ select cjmm_step, points, max_points from steps_before order by 1, 2, 3 $$,
  'a review run leaves my_practice_step_marks as it was'
);
select results_eq(
  $$ select bank_id, item_count, answered from public.my_practice_banks() order by bank_id $$,
  $$ select bank_id, item_count, answered from banks_before order by bank_id $$,
  'and the Practice list'
);
reset role;

-- ---------------------------------------------------------------------------
-- Which rows are served
-- ---------------------------------------------------------------------------

update public.review_entries
   set due_at = now() - interval '1 minute'
 where student_id = '00000000-0000-0000-0000-0000006270d1'
   and item_id = '00000000-0000-0000-0000-0000006270f6';
update public.items set status = 'archived' where id = '00000000-0000-0000-0000-0000006270f6';

set local role service_role;
select ok(
  not exists (select 1 from public.review_due_items('00000000-0000-0000-0000-0000006270d1')
               where item_id = '00000000-0000-0000-0000-0000006270f6'),
  'an archived question is not served'
);
select is(
  pg_temp.review('00000000-0000-0000-0000-0000006270d1', array['00000000-0000-0000-0000-0000006270f6'::uuid]),
  'invalid',
  'nor can it be reviewed'
);
reset role;
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000006270d1');
select is(
  (select due from public.my_review_due()),
  0,
  'nor counted as due'
);
reset role;

update public.items set status = 'published' where id = '00000000-0000-0000-0000-0000006270f6';
set local role service_role;
select results_eq(
  $$ select item_id from public.review_due_items('00000000-0000-0000-0000-0000006270d1') $$,
  $$ values ('00000000-0000-0000-0000-0000006270f6'::uuid) $$,
  'published again, it comes back'
);
reset role;

-- Ada is taken off the class, her workspace's only one.
insert into private.class_removals (class_id, profile_id)
  values ('00000000-0000-0000-0000-0000006270c1', '00000000-0000-0000-0000-0000006270d1');

set local role service_role;
select is_empty(
  $$ select * from public.review_due_items('00000000-0000-0000-0000-0000006270d1') $$,
  'a student removed from the class is served nothing'
);
select is(
  pg_temp.review('00000000-0000-0000-0000-0000006270d1', array['00000000-0000-0000-0000-0000006270f6'::uuid]),
  'invalid',
  'and can start no review'
);
select is_empty(
  $$ select * from public.practice_run_items('00000000-0000-0000-0000-0000006270d1',
       (select id from ids where name = 'review1')) $$,
  'and her review runs close'
);
reset role;
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000006270d1');
select is(
  (select row(due, next_due_at)::text from public.my_review_due()),
  row(0, null::timestamptz)::text,
  'her count is empty'
);
reset role;
select is(
  (select count(*)::integer from public.review_entries
    where student_id = '00000000-0000-0000-0000-0000006270d1'),
  5,
  'but her rows are kept'
);

select * from finish();
rollback;
