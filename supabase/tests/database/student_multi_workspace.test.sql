-- One student account in classes of more than one workspace
-- (20261009000000_student_multi_workspace.sql, owner decision 2026-10-08).
--
-- A student of workspace A joins a class of workspace B with the same account. They then read
-- both classes with each one's workspace name, both workspaces' open assignments, practice shares
-- and history, while their profile keeps the org they joined first. Each author still sees only
-- their own workspace: nothing of the other reaches them through the student they share. A
-- student removed from one workspace's class stays removed there and keeps the other, and an
-- instructor is still refused as a student everywhere.
--
-- now() is fixed for the transaction, so "closed" is made by moving closes_at into the past with
-- the guard trigger switched off, as the superuser. Fixture ids of its own (…399…).
begin;
create extension if not exists pgtap with schema extensions;
select plan(47);

-- ---------------------------------------------------------------------------
-- Cast, as the superuser
-- ---------------------------------------------------------------------------

insert into public.orgs (id, name) values
  ('00000000-0000-0000-0000-0000003990a0', 'Workspace A 399'),
  ('00000000-0000-0000-0000-0000003990b0', 'Workspace B 399');

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000003990a1', 'multi-teacher-a@example.test', 'authenticated',
   'authenticated', '{"provider": "email"}', '{}'),
  ('00000000-0000-0000-0000-0000003990b1', 'multi-teacher-b@example.test', 'authenticated',
   'authenticated', '{"provider": "email"}', '{}'),
  -- Three accounts with no role yet: one joins both workspaces, one only A, and one joins both
  -- and is then removed from B.
  ('00000000-0000-0000-0000-0000003990d1', 'multi-both@example.test', 'authenticated',
   'authenticated', '{"provider": "email"}', '{}'),
  ('00000000-0000-0000-0000-0000003990d2', 'multi-only-a@example.test', 'authenticated',
   'authenticated', '{"provider": "email"}', '{}'),
  ('00000000-0000-0000-0000-0000003990d3', 'multi-removed@example.test', 'authenticated',
   'authenticated', '{"provider": "email"}', '{}');

update public.profiles set org_id = '00000000-0000-0000-0000-0000003990a0', role = 'instructor'
  where id = '00000000-0000-0000-0000-0000003990a1';
update public.profiles set org_id = '00000000-0000-0000-0000-0000003990b0', role = 'instructor'
  where id = '00000000-0000-0000-0000-0000003990b1';

-- One class in each workspace, with the same name: only the workspace tells them apart.
insert into public.classes (id, org_id, name) values
  ('00000000-0000-0000-0000-0000003990c1', '00000000-0000-0000-0000-0000003990a0', 'NUR 399'),
  ('00000000-0000-0000-0000-0000003990c2', '00000000-0000-0000-0000-0000003990b0', 'NUR 399');

insert into public.item_banks (id, org_id, name) values
  ('00000000-0000-0000-0000-0000003990e1', '00000000-0000-0000-0000-0000003990a0', 'Bank A 399'),
  ('00000000-0000-0000-0000-0000003990e2', '00000000-0000-0000-0000-0000003990b0', 'Bank B 399');

insert into public.items (id, bank_id, org_id, type, cjmm_step, status, content, answer_key, scoring)
values
  ('00000000-0000-0000-0000-0000003990f1', '00000000-0000-0000-0000-0000003990e1',
   '00000000-0000-0000-0000-0000003990a0', 'multiple_choice', 1, 'published', '{}',
   '{"correctOptionId":"secret_key_399_a"}', '{}'),
  ('00000000-0000-0000-0000-0000003990f2', '00000000-0000-0000-0000-0000003990e2',
   '00000000-0000-0000-0000-0000003990b0', 'multiple_choice', 2, 'published', '{}',
   '{"correctOptionId":"secret_key_399_b"}', '{}');

-- In each workspace: one assignment that stays open (b1 in A, b2 in B) and one that will have
-- closed (b3 in A, b4 in B). All are made open now; b3 and b4 are closed below.
insert into public.assignments (id, org_id, class_id, bank_id, title, opens_at, closes_at, max_attempts)
values
  ('00000000-0000-0000-0000-0000003990b1', '00000000-0000-0000-0000-0000003990a0',
   '00000000-0000-0000-0000-0000003990c1', '00000000-0000-0000-0000-0000003990e1',
   'Open A 399', now() - interval '2 hours', now() + interval '1 day', 2),
  ('00000000-0000-0000-0000-0000003990b2', '00000000-0000-0000-0000-0000003990b0',
   '00000000-0000-0000-0000-0000003990c2', '00000000-0000-0000-0000-0000003990e2',
   'Open B 399', now() - interval '2 hours', now() + interval '1 day', 2),
  ('00000000-0000-0000-0000-0000003990b3', '00000000-0000-0000-0000-0000003990a0',
   '00000000-0000-0000-0000-0000003990c1', '00000000-0000-0000-0000-0000003990e1',
   'Closed A 399', now() - interval '2 hours', now() + interval '1 day', 2),
  ('00000000-0000-0000-0000-0000003990b4', '00000000-0000-0000-0000-0000003990b0',
   '00000000-0000-0000-0000-0000003990c2', '00000000-0000-0000-0000-0000003990e2',
   'Closed B 399', now() - interval '2 hours', now() + interval '1 day', 2);

-- The student of both submitted each closed assignment once, written directly as the superuser.
-- Each attempt carries its assignment's org, as start_assignment_attempt writes it.
insert into public.assignment_attempts
  (id, org_id, assignment_id, student_id, number, submitted_at, score, max_score)
values
  ('00000000-0000-0000-0000-000000399a01', '00000000-0000-0000-0000-0000003990a0',
   '00000000-0000-0000-0000-0000003990b3', '00000000-0000-0000-0000-0000003990d1', 1,
   now() - interval '90 minutes', 1.50, 2.00),
  ('00000000-0000-0000-0000-000000399a02', '00000000-0000-0000-0000-0000003990b0',
   '00000000-0000-0000-0000-0000003990b4', '00000000-0000-0000-0000-0000003990d1', 1,
   now() - interval '80 minutes', 2.00, 2.00);

set local session_replication_role = replica;
update public.assignments set closes_at = now() - interval '10 minutes'
 where id in ('00000000-0000-0000-0000-0000003990b3', '00000000-0000-0000-0000-0000003990b4');
set local session_replication_role = origin;

-- Each workspace shares its own bank with its own class for practice.
insert into public.bank_practice_shares (org_id, bank_id, class_id, shared_by) values
  ('00000000-0000-0000-0000-0000003990a0', '00000000-0000-0000-0000-0000003990e1',
   '00000000-0000-0000-0000-0000003990c1', '00000000-0000-0000-0000-0000003990a1'),
  ('00000000-0000-0000-0000-0000003990b0', '00000000-0000-0000-0000-0000003990e2',
   '00000000-0000-0000-0000-0000003990c2', '00000000-0000-0000-0000-0000003990b1');

-- The codes and tokens as made, for the roles below to type.
create temporary table issued as
  select c.id, c.join_code, c.invite_token from public.classes c
   where c.id in ('00000000-0000-0000-0000-0000003990c1', '00000000-0000-0000-0000-0000003990c2');
grant select on issued to authenticated, service_role;

create function pg_temp.act_as(account uuid) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', account, 'role', 'authenticated')::text, true);
$$;

create function pg_temp.code_of(target uuid) returns text
language sql as $$ select i.join_code from issued i where i.id = target $$;

create function pg_temp.token_of(target uuid) returns text
language sql as $$ select i.invite_token from issued i where i.id = target $$;

-- How many rows of one org a caller reads across the tables an author works in.
create function pg_temp.rows_of_org(target uuid) returns integer
language sql as $$
  select (select count(*)::integer from public.classes where org_id = target)
       + (select count(*)::integer from public.item_banks where org_id = target)
       + (select count(*)::integer from public.items where org_id = target)
       + (select count(*)::integer from public.assignments where org_id = target)
       + (select count(*)::integer from public.bank_practice_shares where org_id = target);
$$;

-- ---------------------------------------------------------------------------
-- Joining a class in each of two workspaces with one account
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000003990d1');
select is(
  public.join_class_by_code(pg_temp.code_of('00000000-0000-0000-0000-0000003990c1')),
  'joined',
  'an account with no role joins a class of workspace A by its code'
);
select is(
  public.join_class(pg_temp.token_of('00000000-0000-0000-0000-0000003990c2')),
  'joined',
  'and then, as a student of A, a class of workspace B by its link'
);

select pg_temp.act_as('00000000-0000-0000-0000-0000003990d2');
select is(
  public.join_class_by_code(pg_temp.code_of('00000000-0000-0000-0000-0000003990c1')),
  'joined',
  'a second account joins only the class of A'
);

select pg_temp.act_as('00000000-0000-0000-0000-0000003990d3');
select is(
  array[
    public.join_class_by_code(pg_temp.code_of('00000000-0000-0000-0000-0000003990c1')),
    public.join_class_by_code(pg_temp.code_of('00000000-0000-0000-0000-0000003990c2'))
  ],
  array['joined', 'joined'],
  'a third joins both by code'
);

reset role;
select is(
  (select row(org_id, role)::text from public.profiles
    where id = '00000000-0000-0000-0000-0000003990d1'),
  row('00000000-0000-0000-0000-0000003990a0'::uuid, 'student'::public.org_role)::text,
  'the student of both keeps the org they joined first: joining B moved nothing'
);

-- ---------------------------------------------------------------------------
-- What the student of both reads
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000003990d1');

select results_eq(
  $$ select class_id, class_name, workspace_name from public.my_classes() $$,
  $$ values ('00000000-0000-0000-0000-0000003990c1'::uuid, 'NUR 399'::text, 'Workspace A 399'::text),
            ('00000000-0000-0000-0000-0000003990c2'::uuid, 'NUR 399'::text, 'Workspace B 399'::text) $$,
  'my_classes lists both classes, each with the name of its own workspace'
);
select is(
  (select array_agg(id order by id) from public.assignments where closes_at > now()),
  array['00000000-0000-0000-0000-0000003990b1'::uuid, '00000000-0000-0000-0000-0000003990b2'::uuid],
  'they read the open assignments of both workspaces'
);
select is(
  (select array_agg(bank_id order by bank_id) from public.bank_practice_shares),
  array['00000000-0000-0000-0000-0000003990e1'::uuid, '00000000-0000-0000-0000-0000003990e2'::uuid],
  'and the practice shares of both'
);
select results_eq(
  $$ select bank_id, bank_name from public.my_practice_banks() $$,
  $$ values ('00000000-0000-0000-0000-0000003990e1'::uuid, 'Bank A 399'::text),
            ('00000000-0000-0000-0000-0000003990e2'::uuid, 'Bank B 399'::text) $$,
  'their Practice list holds a bank from each'
);
select is(
  (select array_agg(row(assignment_id, class_id, attempt_id, score)::text order by assignment_id)
     from public.my_assignment_history()),
  array[
    row('00000000-0000-0000-0000-0000003990b3'::uuid, '00000000-0000-0000-0000-0000003990c1'::uuid,
        '00000000-0000-0000-0000-000000399a01'::uuid, 1.50)::text,
    row('00000000-0000-0000-0000-0000003990b4'::uuid, '00000000-0000-0000-0000-0000003990c2'::uuid,
        '00000000-0000-0000-0000-000000399a02'::uuid, 2.00)::text
  ],
  'their history holds the closed assignment of each workspace with their own score'
);
select is(
  (select array_agg(assignment_id order by assignment_id) from public.my_step_marks()),
  array['00000000-0000-0000-0000-0000003990b3'::uuid, '00000000-0000-0000-0000-0000003990b4'::uuid],
  'and so do their step marks'
);
select is(
  (select row(assignment_id, attempt_id, score)::text
     from public.my_assignment_result('00000000-0000-0000-0000-0000003990b4')),
  row('00000000-0000-0000-0000-0000003990b4'::uuid, '00000000-0000-0000-0000-000000399a02'::uuid,
      2.00)::text,
  'they read their own result for the second workspace''s closed assignment'
);
select ok(
  (select refusal is null and attempt_id is not null
     from public.start_assignment_attempt('00000000-0000-0000-0000-0000003990b2')),
  'and start an attempt at the second workspace''s open assignment'
);
select is(
  (select count(*)::integer from public.classes)
  + (select count(*)::integer from public.item_banks)
  + (select count(*)::integer from public.items),
  0,
  'they still read no class row, bank or item of either workspace, so no token, code or key'
);
select is(
  (select array_agg(id) from public.orgs),
  array['00000000-0000-0000-0000-0000003990a0'::uuid],
  'the only org row they read is still the first they joined; the rest is my_classes'' names'
);

reset role;
select is(
  (select org_id from public.assignment_attempts
    where assignment_id = '00000000-0000-0000-0000-0000003990b2'
      and student_id = '00000000-0000-0000-0000-0000003990d1'),
  '00000000-0000-0000-0000-0000003990b0'::uuid,
  'the attempt they started belongs to the assignment''s org, not to their profile''s'
);

-- Practice runs are opened by the app's server.
set local role service_role;
select is(
  (select count(*)::integer from public.open_practice_run(
     '00000000-0000-0000-0000-0000003990d1', '00000000-0000-0000-0000-0000003990e2', false)),
  1,
  'the student of both can practise the bank workspace B shared with their class'
);
select is(
  (select count(*)::integer from public.open_practice_run(
     '00000000-0000-0000-0000-0000003990d2', '00000000-0000-0000-0000-0000003990e2', false)),
  0,
  'the student of A alone cannot: being in A opens nothing of B'
);

reset role;
select is(
  (select org_id from public.practice_runs
    where student_id = '00000000-0000-0000-0000-0000003990d1'
      and bank_id = '00000000-0000-0000-0000-0000003990e2'),
  '00000000-0000-0000-0000-0000003990b0'::uuid,
  'and the run belongs to the bank''s org'
);
select is(
  array[pg_temp.rows_of_org('00000000-0000-0000-0000-0000003990a0'),
        pg_temp.rows_of_org('00000000-0000-0000-0000-0000003990b0')],
  array[6, 6],
  'control: each workspace holds a class, a bank, an item, two assignments and a share'
);

-- ---------------------------------------------------------------------------
-- The author of A sees nothing of B through the student they share
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000003990a1');

select is(
  (select array_agg(id) from public.classes),
  array['00000000-0000-0000-0000-0000003990c1'::uuid],
  'the author of A reads their own class and no other'
);
select is(
  (select array_agg(profile_id order by profile_id)
     from public.class_roster('00000000-0000-0000-0000-0000003990c1')),
  array['00000000-0000-0000-0000-0000003990d1'::uuid, '00000000-0000-0000-0000-0000003990d2'::uuid,
        '00000000-0000-0000-0000-0000003990d3'::uuid],
  'their roster lists their three students'
);
select is_empty(
  $$ select * from public.class_roster('00000000-0000-0000-0000-0000003990c2') $$,
  'the roster of B''s class is empty to them'
);
select is(
  (select count(*)::integer from public.class_members
    where class_id = '00000000-0000-0000-0000-0000003990c2'),
  0,
  'they read no membership of B''s class, not even their own student''s'
);
select is(
  (select count(*)::integer
     from public.assignment_report_rows('00000000-0000-0000-0000-0000003990b4'))
  + (select count(*)::integer
       from public.assignment_report_rows('00000000-0000-0000-0000-0000003990b2')),
  0,
  'B''s assignment reports answer them nothing'
);
select is(
  (select array_agg(attempt_id)
     from public.assignment_report_rows('00000000-0000-0000-0000-0000003990b3')
    where student_id = '00000000-0000-0000-0000-0000003990d1'),
  array['00000000-0000-0000-0000-000000399a01'::uuid],
  'their own report shows the shared student''s attempt at their assignment, and only that one'
);
select is(
  pg_temp.rows_of_org('00000000-0000-0000-0000-0000003990b0'),
  0,
  'they read no class, bank, item, assignment or practice share of B'
);

-- ---------------------------------------------------------------------------
-- And the reverse
-- ---------------------------------------------------------------------------

select pg_temp.act_as('00000000-0000-0000-0000-0000003990b1');

select is(
  (select array_agg(id) from public.classes),
  array['00000000-0000-0000-0000-0000003990c2'::uuid],
  'the author of B reads their own class and no other'
);
select is_empty(
  $$ select * from public.class_roster('00000000-0000-0000-0000-0000003990c1') $$,
  'the roster of A''s class is empty to them'
);
select is(
  (select count(*)::integer
     from public.assignment_report_rows('00000000-0000-0000-0000-0000003990b3'))
  + (select count(*)::integer
       from public.assignment_report_rows('00000000-0000-0000-0000-0000003990b1')),
  0,
  'A''s assignment reports answer them nothing'
);
select is(
  (select array_agg(attempt_id)
     from public.assignment_report_rows('00000000-0000-0000-0000-0000003990b4')
    where student_id = '00000000-0000-0000-0000-0000003990d1'),
  array['00000000-0000-0000-0000-000000399a02'::uuid],
  'their own report shows the shared student''s attempt at their assignment, and only that one'
);
select is(
  pg_temp.rows_of_org('00000000-0000-0000-0000-0000003990a0'),
  0,
  'they read no class, bank, item, assignment or practice share of A'
);

-- ---------------------------------------------------------------------------
-- Removed from B: stays removed there, and keeps A
-- ---------------------------------------------------------------------------

delete from public.class_members
 where class_id = '00000000-0000-0000-0000-0000003990c2'
   and profile_id = '00000000-0000-0000-0000-0000003990d3';

select is(
  (select array_agg(profile_id)
     from public.class_roster('00000000-0000-0000-0000-0000003990c2')),
  array['00000000-0000-0000-0000-0000003990d1'::uuid],
  'the author of B takes a student off their class'
);

select pg_temp.act_as('00000000-0000-0000-0000-0000003990d3');
select is(
  public.join_class_by_code(pg_temp.code_of('00000000-0000-0000-0000-0000003990c2')),
  'invalid',
  'the removed student typing B''s code is refused'
);
select is(
  public.join_class(pg_temp.token_of('00000000-0000-0000-0000-0000003990c2')),
  'invalid',
  'and so is B''s link'
);
select results_eq(
  $$ select class_id, class_name, workspace_name from public.my_classes() $$,
  $$ values ('00000000-0000-0000-0000-0000003990c1'::uuid, 'NUR 399'::text, 'Workspace A 399'::text) $$,
  'they are left with the class of A'
);
select is(
  (select array_agg(id) from public.assignments where closes_at > now()),
  array['00000000-0000-0000-0000-0000003990b1'::uuid],
  'and read A''s open assignment and no longer B''s'
);

reset role;
select ok(
  exists (select 1 from public.class_members
           where class_id = '00000000-0000-0000-0000-0000003990c1'
             and profile_id = '00000000-0000-0000-0000-0000003990d3')
  and not exists (select 1 from public.class_members
                   where class_id = '00000000-0000-0000-0000-0000003990c2'
                     and profile_id = '00000000-0000-0000-0000-0000003990d3')
  and exists (select 1 from private.class_removals
               where class_id = '00000000-0000-0000-0000-0000003990c2'
                 and profile_id = '00000000-0000-0000-0000-0000003990d3')
  and not exists (select 1 from private.class_removals
                   where class_id = '00000000-0000-0000-0000-0000003990c1'
                     and profile_id = '00000000-0000-0000-0000-0000003990d3'),
  'the removal holds in B and is recorded for B alone'
);

set local role service_role;
select is(
  (select count(*)::integer from public.open_practice_run(
     '00000000-0000-0000-0000-0000003990d3', '00000000-0000-0000-0000-0000003990e2', false)),
  0,
  'and B''s practice bank is closed to them'
);

-- ---------------------------------------------------------------------------
-- An instructor is still never a student, in any workspace
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000003990a1');
select is(
  public.join_class_by_code(pg_temp.code_of('00000000-0000-0000-0000-0000003990c2')),
  'instructor',
  'the author of A typing B''s class code is told they are an instructor'
);
select is(
  public.join_class(pg_temp.token_of('00000000-0000-0000-0000-0000003990c2')),
  'instructor',
  'and the same for B''s link'
);

reset role;
select ok(
  not exists (select 1 from public.class_members
               where profile_id = '00000000-0000-0000-0000-0000003990a1')
  and (select row(org_id, role)::text from public.profiles
        where id = '00000000-0000-0000-0000-0000003990a1')
      = row('00000000-0000-0000-0000-0000003990a0'::uuid, 'instructor'::public.org_role)::text,
  'so they are on no roster and are still an instructor of their own workspace'
);

-- ---------------------------------------------------------------------------
-- The catalog
-- ---------------------------------------------------------------------------

select ok(
  (select pg_get_function_result(p.oid) like '%workspace_name text%'
     from pg_proc p where p.oid = 'public.my_classes()'::regprocedure),
  'my_classes returns the workspace name'
);
select ok(
  (select pg_get_function_result(p.oid) not similar to '%(invite_token|join_code|org_id)%'
     from pg_proc p where p.oid = 'public.my_classes()'::regprocedure),
  'and still no token, no code and no org id'
);
select ok(
  has_function_privilege('authenticated', 'public.my_classes()', 'execute')
  and not has_function_privilege('anon', 'public.my_classes()', 'execute'),
  'a signed-in account can call my_classes and anon cannot'
);
select ok(
  not has_function_privilege('anon', 'private.admit_to_class(uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.admit_to_class(uuid, uuid)', 'execute')
  and not has_function_privilege('service_role', 'private.admit_to_class(uuid, uuid)', 'execute'),
  'no API role can call the admission helper'
);
select ok(
  (select bool_and(p.prosecdef and p.proconfig @> array['search_path=""'])
     from pg_proc p
    where p.oid in ('public.my_classes()'::regprocedure,
                    'private.admit_to_class(uuid, uuid)'::regprocedure)),
  'both run with definer rights and an empty search_path'
);

select * from finish();
rollback;
