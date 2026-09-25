-- Practising a shared bank (#241).
--
-- Only the service role reads or writes a run, and every call re-checks that the bank is shared,
-- right now, with a class the student is a current member of. A run holds the bank's published
-- standalone items, then each published case study whose steps are all published. Each item is
-- answered once per run; "Start over" opens a new run and the old one stops taking answers.
-- Stopping the share, or leaving the class, stops every run at once. The student's own two reads
-- answer only about their own current shares.
begin;
create extension if not exists pgtap with schema extensions;
select plan(46);

-- ---------------------------------------------------------------------------
-- Cast, as the superuser
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000002410a1', 'practice-teacher@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002410d1', 'practice-student-in@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002410d2', 'practice-student-other@example.test', 'authenticated', 'authenticated');

select private.make_instructor('practice-teacher@example.test');
update public.profiles
   set org_id = (select org_id from public.profiles where id = '00000000-0000-0000-0000-0000002410a1'),
       role = 'student'
 where id in ('00000000-0000-0000-0000-0000002410d1', '00000000-0000-0000-0000-0000002410d2');

create function pg_temp.act_as(account uuid) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', account, 'role', 'authenticated')::text, true);
$$;

-- Two classes; the first student is in NUR 310, the second in NUR 205.
insert into public.classes (id, org_id, name)
  select v.id::uuid, p.org_id, v.name
    from public.profiles p,
         (values ('00000000-0000-0000-0000-0000002410c1', 'NUR 310'),
                 ('00000000-0000-0000-0000-0000002410c2', 'NUR 205')) as v(id, name)
   where p.id = '00000000-0000-0000-0000-0000002410a1';
insert into public.class_members (class_id, profile_id) values
  ('00000000-0000-0000-0000-0000002410c1', '00000000-0000-0000-0000-0000002410d1'),
  ('00000000-0000-0000-0000-0000002410c2', '00000000-0000-0000-0000-0000002410d2');

-- "Cardiac week": two published standalone items (steps 1 and 2), a draft, a playable case study
-- with two published steps, and a case study with a draft step (not playable). "Renal week" is
-- not shared.
insert into public.item_banks (id, org_id, name)
  select v.id::uuid, p.org_id, v.name
    from public.profiles p,
         (values ('00000000-0000-0000-0000-0000002410e0', 'Cardiac week'),
                 ('00000000-0000-0000-0000-0000002410e1', 'Renal week')) as v(id, name)
   where p.id = '00000000-0000-0000-0000-0000002410a1';

insert into public.items (id, bank_id, org_id, type, cjmm_step, status, content, answer_key, scoring, created_at)
  select v.id::uuid, v.bank::uuid, p.org_id, 'multiple_choice', v.step, v.status::public.content_status,
         '{}', '{"correctOptionId":"secret_key_241"}', '{}', now() + v.lag * interval '1 second'
    from public.profiles p,
         (values ('00000000-0000-0000-0000-0000002410f1', '00000000-0000-0000-0000-0000002410e0', 1, 'published', 1),
                 ('00000000-0000-0000-0000-0000002410f2', '00000000-0000-0000-0000-0000002410e0', 2, 'published', 2),
                 ('00000000-0000-0000-0000-0000002410f3', '00000000-0000-0000-0000-0000002410e0', 3, 'draft', 3),
                 ('00000000-0000-0000-0000-0000002410f4', '00000000-0000-0000-0000-0000002410e1', 1, 'published', 4),
                 ('00000000-0000-0000-0000-0000002410f5', '00000000-0000-0000-0000-0000002410e0', 1, 'published', 5),
                 ('00000000-0000-0000-0000-0000002410f6', '00000000-0000-0000-0000-0000002410e0', 2, 'published', 6),
                 ('00000000-0000-0000-0000-0000002410f7', '00000000-0000-0000-0000-0000002410e0', 1, 'published', 7),
                 ('00000000-0000-0000-0000-0000002410f8', '00000000-0000-0000-0000-0000002410e0', 2, 'draft', 8))
           as v(id, bank, step, status, lag)
   where p.id = '00000000-0000-0000-0000-0000002410a1';

insert into public.case_studies (id, bank_id, org_id, title, ehr, status)
  select v.id::uuid, '00000000-0000-0000-0000-0000002410e0', p.org_id, v.title, '{}', 'published'
    from public.profiles p,
         (values ('00000000-0000-0000-0000-0000002410a5', 'Heart failure case'),
                 ('00000000-0000-0000-0000-0000002410a6', 'Half-written case')) as v(id, title)
   where p.id = '00000000-0000-0000-0000-0000002410a1';
insert into public.case_study_items (case_study_id, org_id, bank_id, position, item_id)
  select v.cs::uuid, p.org_id, '00000000-0000-0000-0000-0000002410e0', v.position, v.item::uuid
    from public.profiles p,
         (values ('00000000-0000-0000-0000-0000002410a5', 1, '00000000-0000-0000-0000-0000002410f5'),
                 ('00000000-0000-0000-0000-0000002410a5', 2, '00000000-0000-0000-0000-0000002410f6'),
                 ('00000000-0000-0000-0000-0000002410a6', 1, '00000000-0000-0000-0000-0000002410f7'),
                 ('00000000-0000-0000-0000-0000002410a6', 2, '00000000-0000-0000-0000-0000002410f8'))
           as v(cs, position, item)
   where p.id = '00000000-0000-0000-0000-0000002410a1';

insert into public.bank_practice_shares (org_id, bank_id, class_id, shared_by)
  select org_id, '00000000-0000-0000-0000-0000002410e0', '00000000-0000-0000-0000-0000002410c1',
         '00000000-0000-0000-0000-0000002410a1'
    from public.profiles where id = '00000000-0000-0000-0000-0000002410a1';

create temporary table ids (name text primary key, id uuid);
grant all on ids to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The catalog
-- ---------------------------------------------------------------------------

select ok(
  (select relrowsecurity from pg_class where oid = 'public.practice_runs'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.practice_responses'::regclass),
  'both practice tables have row level security on'
);
select ok(
  not has_table_privilege('authenticated', 'public.practice_runs', 'select')
  and not has_table_privilege('authenticated', 'public.practice_runs', 'insert')
  and not has_table_privilege('authenticated', 'public.practice_responses', 'select')
  and not has_table_privilege('authenticated', 'public.practice_responses', 'insert')
  and not has_table_privilege('authenticated', 'public.practice_responses', 'update')
  and not has_table_privilege('anon', 'public.practice_runs', 'select')
  and not has_table_privilege('anon', 'public.practice_responses', 'select'),
  'neither anon nor authenticated holds a privilege on the practice tables'
);
select ok(
  not has_function_privilege('authenticated', 'public.open_practice_run(uuid, uuid, boolean)', 'execute')
  and not has_function_privilege('authenticated', 'public.practice_run_items(uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated',
    'public.record_practice_response(uuid, uuid, uuid, jsonb, numeric, numeric, jsonb)', 'execute'),
  'a signed-in browser cannot open a run, read its items or record a score'
);
select ok(
  has_function_privilege('service_role', 'public.open_practice_run(uuid, uuid, boolean)', 'execute')
  and has_function_privilege('service_role', 'public.practice_run_items(uuid, uuid)', 'execute')
  and has_function_privilege('service_role',
    'public.record_practice_response(uuid, uuid, uuid, jsonb, numeric, numeric, jsonb)', 'execute'),
  'the service role can'
);
select ok(
  has_function_privilege('authenticated', 'public.my_practice_banks()', 'execute')
  and has_function_privilege('authenticated', 'public.my_practice_step_marks()', 'execute')
  and not has_function_privilege('anon', 'public.my_practice_banks()', 'execute')
  and not has_function_privilege('anon', 'public.my_practice_step_marks()', 'execute'),
  'the student''s two reads are for signed-in callers only'
);
select ok(
  not has_function_privilege('service_role', 'private.practice_item_set(uuid)', 'execute')
  and not has_function_privilege('service_role', 'private.live_practice_run(uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.practice_shared_with(uuid, uuid)', 'execute'),
  'the helpers are callable by no role directly'
);

-- ---------------------------------------------------------------------------
-- A student cannot reach the tables
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000002410d1');
select throws_ok(
  $$ select * from public.practice_runs $$, '42501', null,
  'a student cannot select practice runs'
);
select throws_ok(
  $$ insert into public.practice_runs (org_id, student_id, bank_id)
     values (gen_random_uuid(), '00000000-0000-0000-0000-0000002410d1', '00000000-0000-0000-0000-0000002410e0') $$,
  '42501', null,
  'a student cannot insert a run'
);
select throws_ok(
  $$ select public.record_practice_response('00000000-0000-0000-0000-0000002410d1',
       gen_random_uuid(), '00000000-0000-0000-0000-0000002410f1', '{}', 1, 1, '{}') $$,
  '42501', null,
  'a student cannot record a score for themselves'
);
select is(
  (select count(*)::integer from public.my_practice_banks()),
  1,
  'before any run, the student already sees the shared bank'
);
reset role;

-- ---------------------------------------------------------------------------
-- Opening a run
-- ---------------------------------------------------------------------------

set local role service_role;

insert into ids
  select 'run1', run_id
    from public.open_practice_run('00000000-0000-0000-0000-0000002410d1',
                                  '00000000-0000-0000-0000-0000002410e0', false);
select isnt((select id from ids where name = 'run1'), null, 'a member of a shared class opens a run');
select results_eq(
  $$ select run_id, bank_name from public.open_practice_run('00000000-0000-0000-0000-0000002410d1',
       '00000000-0000-0000-0000-0000002410e0', false) $$,
  $$ select (select id from ids where name = 'run1'), 'Cardiac week'::text $$,
  'opening it again resumes the same run, with the bank''s name'
);
select is_empty(
  $$ select * from public.open_practice_run('00000000-0000-0000-0000-0000002410d2',
       '00000000-0000-0000-0000-0000002410e0', false) $$,
  'a student outside the class opens nothing'
);
select is_empty(
  $$ select * from public.open_practice_run('00000000-0000-0000-0000-0000002410d1',
       '00000000-0000-0000-0000-0000002410e1', false) $$,
  'a bank that is not shared opens nothing'
);
select is_empty(
  $$ select * from public.open_practice_run(null, '00000000-0000-0000-0000-0000002410e0', false) $$,
  'no student opens nothing'
);

-- ---------------------------------------------------------------------------
-- The run's items
-- ---------------------------------------------------------------------------

select results_eq(
  $$ select item_id, case_study_id, step, answered
       from public.practice_run_items('00000000-0000-0000-0000-0000002410d1',
                                      (select id from ids where name = 'run1'))
      order by ordinal $$,
  $$ values ('00000000-0000-0000-0000-0000002410f1'::uuid, null::uuid, null::smallint, false),
            ('00000000-0000-0000-0000-0000002410f2'::uuid, null::uuid, null::smallint, false),
            ('00000000-0000-0000-0000-0000002410f5'::uuid, '00000000-0000-0000-0000-0000002410a5'::uuid, 1::smallint, false),
            ('00000000-0000-0000-0000-0000002410f6'::uuid, '00000000-0000-0000-0000-0000002410a5'::uuid, 2::smallint, false) $$,
  'published standalone items in order, then the playable case study step by step; no draft, no half-written case'
);
select is_empty(
  $$ select * from public.practice_run_items('00000000-0000-0000-0000-0000002410d2',
       (select id from ids where name = 'run1')) $$,
  'another student reads nothing of the run'
);

-- ---------------------------------------------------------------------------
-- Recording answers
-- ---------------------------------------------------------------------------

select is(
  public.record_practice_response('00000000-0000-0000-0000-0000002410d1',
    (select id from ids where name = 'run1'), '00000000-0000-0000-0000-0000002410f1',
    '{"type":"multiple_choice","selectedOptionId":"a"}', 1, 1, '{"points":1}'),
  'recorded',
  'an answer to one of the run''s items is recorded'
);
select is(
  public.record_practice_response('00000000-0000-0000-0000-0000002410d1',
    (select id from ids where name = 'run1'), '00000000-0000-0000-0000-0000002410f1',
    '{"type":"multiple_choice","selectedOptionId":"b"}', 0, 1, '{"points":0}'),
  'answered',
  'a second answer to the same item in the same run is refused'
);
select is(
  (select points from public.practice_responses
    where item_id = '00000000-0000-0000-0000-0000002410f1'),
  1.00::numeric,
  'and the first answer stands'
);
select is(
  public.record_practice_response('00000000-0000-0000-0000-0000002410d1',
    (select id from ids where name = 'run1'), '00000000-0000-0000-0000-0000002410f3',
    '{}', 0, 1, '{}'),
  'not_found',
  'a draft item is not one of the run''s items'
);
select is(
  public.record_practice_response('00000000-0000-0000-0000-0000002410d1',
    (select id from ids where name = 'run1'), '00000000-0000-0000-0000-0000002410f4',
    '{}', 0, 1, '{}'),
  'not_found',
  'nor is an item of another bank'
);
select is(
  public.record_practice_response('00000000-0000-0000-0000-0000002410d1',
    (select id from ids where name = 'run1'), '00000000-0000-0000-0000-0000002410f7',
    '{}', 0, 1, '{}'),
  'not_found',
  'nor a step of a case study that is not playable'
);
select is(
  public.record_practice_response('00000000-0000-0000-0000-0000002410d2',
    (select id from ids where name = 'run1'), '00000000-0000-0000-0000-0000002410f2',
    '{}', 0, 1, '{}'),
  'not_found',
  'another student cannot answer into the run'
);
select throws_ok(
  $$ select public.record_practice_response('00000000-0000-0000-0000-0000002410d1',
       (select id from ids where name = 'run1'), '00000000-0000-0000-0000-0000002410f2',
       '{}', 2, 1, '{}') $$,
  '23514', null,
  'a score above what was on offer is refused'
);
select is(
  public.record_practice_response('00000000-0000-0000-0000-0000002410d1',
    (select id from ids where name = 'run1'), '00000000-0000-0000-0000-0000002410f5',
    '{}', 0, 1, '{"points":0}'),
  'recorded',
  'a case study step is answered on its own'
);
select results_eq(
  $$ select item_id from public.practice_run_items('00000000-0000-0000-0000-0000002410d1',
       (select id from ids where name = 'run1')) where answered order by ordinal $$,
  $$ values ('00000000-0000-0000-0000-0000002410f1'::uuid), ('00000000-0000-0000-0000-0000002410f5'::uuid) $$,
  'the run says which items are answered'
);
reset role;

-- ---------------------------------------------------------------------------
-- The student's own reads
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000002410d1');
select results_eq(
  $$ select bank_id, bank_name, item_count, answered from public.my_practice_banks() $$,
  $$ values ('00000000-0000-0000-0000-0000002410e0'::uuid, 'Cardiac week'::text, 4, 2) $$,
  'the Practice list: the bank, its name, what a run holds and what the newest run has answered'
);
select results_eq(
  $$ select cjmm_step, points, max_points from public.my_practice_step_marks() order by cjmm_step, points $$,
  $$ values (1::smallint, 0.00::numeric, 1.00::numeric), (1::smallint, 1.00::numeric, 1.00::numeric) $$,
  'practice marks: a step and two numbers per answered item'
);
select pg_temp.act_as('00000000-0000-0000-0000-0000002410d2');
select is_empty($$ select * from public.my_practice_banks() $$,
  'a student of another class sees no practice bank');
select is_empty($$ select * from public.my_practice_step_marks() $$,
  'and no practice marks');
select set_config('request.jwt.claims', '', true);
select is_empty($$ select * from public.my_practice_banks() $$, 'no session reads nothing');
reset role;

-- ---------------------------------------------------------------------------
-- Start over
-- ---------------------------------------------------------------------------

set local role service_role;
insert into ids
  select 'run2', run_id
    from public.open_practice_run('00000000-0000-0000-0000-0000002410d1',
                                  '00000000-0000-0000-0000-0000002410e0', true);
select isnt((select id from ids where name = 'run2'), (select id from ids where name = 'run1'),
  'starting over opens a new run');
select is_empty(
  $$ select * from public.practice_run_items('00000000-0000-0000-0000-0000002410d1',
       (select id from ids where name = 'run1')) $$,
  'the old run no longer reads'
);
select is(
  public.record_practice_response('00000000-0000-0000-0000-0000002410d1',
    (select id from ids where name = 'run1'), '00000000-0000-0000-0000-0000002410f2',
    '{}', 0, 1, '{}'),
  'not_found',
  'and no longer takes answers'
);
select is(
  public.record_practice_response('00000000-0000-0000-0000-0000002410d1',
    (select id from ids where name = 'run2'), '00000000-0000-0000-0000-0000002410f1',
    '{}', 0, 1, '{"points":0}'),
  'recorded',
  'the new run answers an item again'
);
reset role;

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000002410d1');
select is(
  (select answered from public.my_practice_banks()),
  1,
  'the Practice list counts the newest run only'
);
select results_eq(
  $$ select cjmm_step, points from public.my_practice_step_marks() order by cjmm_step, points $$,
  $$ values (1::smallint, 0.00::numeric), (1::smallint, 1.00::numeric) $$,
  'weak steps keep each item''s first practice answer, not the retry after its key was seen'
);
reset role;

-- ---------------------------------------------------------------------------
-- Stopping the share stops every run at once
-- ---------------------------------------------------------------------------

delete from public.bank_practice_shares where bank_id = '00000000-0000-0000-0000-0000002410e0';

set local role service_role;
select is_empty(
  $$ select * from public.practice_run_items('00000000-0000-0000-0000-0000002410d1',
       (select id from ids where name = 'run2')) $$,
  'once the share stops, the current run reads nothing'
);
select is(
  public.record_practice_response('00000000-0000-0000-0000-0000002410d1',
    (select id from ids where name = 'run2'), '00000000-0000-0000-0000-0000002410f2',
    '{}', 0, 1, '{}'),
  'not_found',
  'and takes no answer'
);
select is_empty(
  $$ select * from public.open_practice_run('00000000-0000-0000-0000-0000002410d1',
       '00000000-0000-0000-0000-0000002410e0', false) $$,
  'and no run opens'
);
reset role;

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000002410d1');
select is_empty($$ select * from public.my_practice_banks() $$,
  'the bank leaves the student''s Practice list');
select is_empty($$ select * from public.my_practice_step_marks() $$,
  'and its marks leave their steps');
reset role;

-- ---------------------------------------------------------------------------
-- Leaving the class does the same
-- ---------------------------------------------------------------------------

insert into public.bank_practice_shares (org_id, bank_id, class_id, shared_by)
  select org_id, '00000000-0000-0000-0000-0000002410e0', '00000000-0000-0000-0000-0000002410c1',
         '00000000-0000-0000-0000-0000002410a1'
    from public.profiles where id = '00000000-0000-0000-0000-0000002410a1';

set local role service_role;
select is(
  (select count(*)::integer from public.practice_run_items('00000000-0000-0000-0000-0000002410d1',
     (select id from ids where name = 'run2'))),
  4,
  'shared again, the run reads again'
);
reset role;

delete from public.class_members
 where class_id = '00000000-0000-0000-0000-0000002410c1'
   and profile_id = '00000000-0000-0000-0000-0000002410d1';

set local role service_role;
select is_empty(
  $$ select * from public.practice_run_items('00000000-0000-0000-0000-0000002410d1',
       (select id from ids where name = 'run2')) $$,
  'a student removed from the class reads nothing'
);
select is_empty(
  $$ select * from public.open_practice_run('00000000-0000-0000-0000-0000002410d1',
       '00000000-0000-0000-0000-0000002410e0', false) $$,
  'and opens nothing'
);
reset role;

select * from finish();
rollback;
