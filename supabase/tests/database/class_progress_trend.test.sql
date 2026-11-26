-- A class's results over time (20261126000200_class_progress_trend.sql, #618):
-- public.class_progress_trend answers only an author of the class's own workspace, gives one row
-- per ended class live session or closed class assignment per clinical judgment step and per
-- client needs category, and one all-term row per category, by ADR 0014's rules: linked
-- participants only, the best attempt, current members only, never practice. Runs with
-- `pnpm test:db`. Uses its own fixture ids so it never counts the seed's rows.
--
-- Every call of a function that writes is made with scalar subqueries as its arguments rather
-- than through a LATERAL join, for the reason session_participants.test.sql gives.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

-- ---------------------------------------------------------------------------
-- Cast, as the superuser
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role)
values
  -- T teaches in workspace A, U in workspace B.
  ('00000000-0000-0000-0000-0000c618a001', 'trend-t@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000c618b001', 'trend-u@example.test', 'authenticated', 'authenticated'),
  -- M and N are members of class C throughout. R answers in s1 and is then taken off the class.
  ('00000000-0000-0000-0000-0000c618d001', 'trend-m@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000c618d002', 'trend-n@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000c618d003', 'trend-r@example.test', 'authenticated', 'authenticated');

insert into public.orgs (id, name) values
  ('00000000-0000-0000-0000-0000c61800a0', 'Trend A'),
  ('00000000-0000-0000-0000-0000c61800b0', 'Trend B');

update public.profiles set org_id = '00000000-0000-0000-0000-0000c61800a0', role = 'instructor'
 where id = '00000000-0000-0000-0000-0000c618a001';
update public.profiles set org_id = '00000000-0000-0000-0000-0000c61800b0', role = 'instructor'
 where id = '00000000-0000-0000-0000-0000c618b001';
update public.profiles set org_id = '00000000-0000-0000-0000-0000c61800a0', role = 'student'
 where id in ('00000000-0000-0000-0000-0000c618d001', '00000000-0000-0000-0000-0000c618d002',
              '00000000-0000-0000-0000-0000c618d003');

insert into public.item_banks (id, org_id, name) values
  ('00000000-0000-0000-0000-0000c61800e0', '00000000-0000-0000-0000-0000c61800a0', 'Trend bank');
-- i1: step 3, Management of Care and a topic. i2: step 3, Management of Care and Physiological
-- Adaptation. i3: step 1, no tags at all.
insert into public.items (id, bank_id, org_id, type, cjmm_step, status, tags, content, answer_key, scoring) values
  ('00000000-0000-0000-0000-0000c61800e1', '00000000-0000-0000-0000-0000c61800e0',
   '00000000-0000-0000-0000-0000c61800a0', 'multiple_choice', 3, 'published',
   array['Management of Care', 'sepsis'], '{}', '{}', '{}'),
  ('00000000-0000-0000-0000-0000c61800e2', '00000000-0000-0000-0000-0000c61800e0',
   '00000000-0000-0000-0000-0000c61800a0', 'multiple_choice', 3, 'published',
   array['Management of Care', 'Physiological Adaptation'], '{}', '{}', '{}'),
  ('00000000-0000-0000-0000-0000c61800e3', '00000000-0000-0000-0000-0000c61800e0',
   '00000000-0000-0000-0000-0000c61800a0', 'multiple_choice', 1, 'published',
   '{}', '{}', '{}', '{}');

insert into public.classes (id, org_id, name) values
  ('00000000-0000-0000-0000-0000c6180ca1', '00000000-0000-0000-0000-0000c61800a0', 'NUR 340');

insert into public.class_members (class_id, profile_id) values
  ('00000000-0000-0000-0000-0000c6180ca1', '00000000-0000-0000-0000-0000c618d001'),
  ('00000000-0000-0000-0000-0000c6180ca1', '00000000-0000-0000-0000-0000c618d002'),
  ('00000000-0000-0000-0000-0000c6180ca1', '00000000-0000-0000-0000-0000c618d003');

create temporary table fixture (label text primary key, id uuid);
grant select, insert, update on fixture to anon, authenticated, service_role;

create function pg_temp.act_as(account uuid) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', account, 'role', 'authenticated')::text, true);
$$;

create function pg_temp.trend_rows() returns integer
language sql as $$
  select count(*)::integer
    from public.class_progress_trend('00000000-0000-0000-0000-0000c6180ca1');
$$;

-- One activity's figure for one group, as "students, answers, percent".
create function pg_temp.figure(activity text, kind text, key text) returns text
language sql as $$
  select row(t.students, t.answers, t.percent)::text
    from public.class_progress_trend('00000000-0000-0000-0000-0000c6180ca1') t
   where t.activity_id = (select id from fixture where label = activity)
     and t.group_kind = kind and t.group_key = key;
$$;

-- ---------------------------------------------------------------------------
-- Three class live sessions: s1 and s2 end, s3 stays running
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000c618a001');
insert into fixture (label, id)
  select 's1', public.start_session(
    source_bank => '00000000-0000-0000-0000-0000c61800e0'::uuid,
    target_class => '00000000-0000-0000-0000-0000c6180ca1'::uuid);
insert into fixture (label, id)
  select 's2', public.start_session(
    source_bank => '00000000-0000-0000-0000-0000c61800e0'::uuid,
    target_class => '00000000-0000-0000-0000-0000c6180ca1'::uuid);
insert into fixture (label, id)
  select 's3', public.start_session(
    source_bank => '00000000-0000-0000-0000-0000c61800e0'::uuid,
    target_class => '00000000-0000-0000-0000-0000c6180ca1'::uuid);

set local role service_role;
insert into fixture (label, id)
  select 'p1-m', j.participant_id
  from public.join_session((select id from fixture where label = 's1'), 'Mia',
                           '00000000-0000-0000-0000-0000c618d001') as j;
insert into fixture (label, id)
  select 'p1-n', j.participant_id
  from public.join_session((select id from fixture where label = 's1'), 'Noor',
                           '00000000-0000-0000-0000-0000c618d002') as j;
insert into fixture (label, id)
  select 'p1-r', j.participant_id
  from public.join_session((select id from fixture where label = 's1'), 'Rae',
                           '00000000-0000-0000-0000-0000c618d003') as j;
insert into fixture (label, id)
  select 'p1-guest', j.participant_id
  from public.join_session((select id from fixture where label = 's1'), 'Guest') as j;
insert into fixture (label, id)
  select 'p2-m', j.participant_id
  from public.join_session((select id from fixture where label = 's2'), 'Mia',
                           '00000000-0000-0000-0000-0000c618d001') as j;
insert into fixture (label, id)
  select 'p2-n', j.participant_id
  from public.join_session((select id from fixture where label = 's2'), 'Noor',
                           '00000000-0000-0000-0000-0000c618d002') as j;
insert into fixture (label, id)
  select 'p3-m', j.participant_id
  from public.join_session((select id from fixture where label = 's3'), 'Mia',
                           '00000000-0000-0000-0000-0000c618d001') as j;

reset role;

-- Every question is worth 1. s1: M 1 0 1 on i1 i2 i3, N 0 on i1, R 1 on i1, the guest 1 1 on i1
-- i2. s2: M 0 on i2, N 1 1 on i1 i2. s3 (running): M 0 on i1.
insert into public.session_responses
  (session_id, org_id, participant_id, item_id, item_position, response, points, max_points, model)
select (select id from fixture where label = v.s), '00000000-0000-0000-0000-0000c61800a0',
       (select id from fixture where label = v.p), v.item::uuid, v.pos, '{}', v.pts, 1, 'test'
  from (values
    ('s1', 'p1-m', '00000000-0000-0000-0000-0000c61800e1', 1, 1),
    ('s1', 'p1-m', '00000000-0000-0000-0000-0000c61800e2', 2, 0),
    ('s1', 'p1-m', '00000000-0000-0000-0000-0000c61800e3', 3, 1),
    ('s1', 'p1-n', '00000000-0000-0000-0000-0000c61800e1', 1, 0),
    ('s1', 'p1-r', '00000000-0000-0000-0000-0000c61800e1', 1, 1),
    ('s1', 'p1-guest', '00000000-0000-0000-0000-0000c61800e1', 1, 1),
    ('s1', 'p1-guest', '00000000-0000-0000-0000-0000c61800e2', 2, 1),
    ('s2', 'p2-m', '00000000-0000-0000-0000-0000c61800e2', 2, 0),
    ('s2', 'p2-n', '00000000-0000-0000-0000-0000c61800e1', 1, 1),
    ('s2', 'p2-n', '00000000-0000-0000-0000-0000c61800e2', 2, 1),
    ('s3', 'p3-m', '00000000-0000-0000-0000-0000c61800e1', 1, 0)
  ) as v(s, p, item, pos, pts);

update public.sessions set status = 'ended'
 where id in (select id from fixture where label in ('s1', 's2'));
update public.sessions set status = 'running', current_position = 1
 where id = (select id from fixture where label = 's3');

-- ---------------------------------------------------------------------------
-- Two assignments: a1 closes between s1 and s2, a2 stays open
-- ---------------------------------------------------------------------------

insert into public.assignments (id, org_id, class_id, bank_id, title, opens_at, closes_at, max_attempts)
values
  ('00000000-0000-0000-0000-0000c61800f1', '00000000-0000-0000-0000-0000c61800a0',
   '00000000-0000-0000-0000-0000c6180ca1', '00000000-0000-0000-0000-0000c61800e0', 'Week 1',
   now() - interval '5 days', now() + interval '1 day', 2),
  ('00000000-0000-0000-0000-0000c61800f2', '00000000-0000-0000-0000-0000c61800a0',
   '00000000-0000-0000-0000-0000c6180ca1', '00000000-0000-0000-0000-0000c61800e0', 'Week 2',
   now() - interval '5 days', now() + interval '1 day', 1);

-- a1: M's first attempt scores 1 of 3, the second 3 of 3 (the best); N's one attempt 1 of 3.
-- a2 (open): M scores 0 of 1.
insert into public.assignment_attempts
  (id, org_id, assignment_id, student_id, number, submitted_at, score, max_score)
values
  ('00000000-0000-0000-0000-0000c618aa01', '00000000-0000-0000-0000-0000c61800a0',
   '00000000-0000-0000-0000-0000c61800f1', '00000000-0000-0000-0000-0000c618d001', 1,
   now() - interval '4 days', 1, 3),
  ('00000000-0000-0000-0000-0000c618aa02', '00000000-0000-0000-0000-0000c61800a0',
   '00000000-0000-0000-0000-0000c61800f1', '00000000-0000-0000-0000-0000c618d001', 2,
   now() - interval '3 days', 3, 3),
  ('00000000-0000-0000-0000-0000c618aa03', '00000000-0000-0000-0000-0000c61800a0',
   '00000000-0000-0000-0000-0000c61800f1', '00000000-0000-0000-0000-0000c618d002', 1,
   now() - interval '3 days', 1, 3),
  ('00000000-0000-0000-0000-0000c618aa04', '00000000-0000-0000-0000-0000c61800a0',
   '00000000-0000-0000-0000-0000c61800f2', '00000000-0000-0000-0000-0000c618d001', 1,
   now() - interval '1 day', 0, 1);
-- M's best attempt also holds an answer to a question deleted since (attempt_responses has no
-- foreign key to items): it counts nowhere, not even under 'none'.
insert into public.attempt_responses (attempt_id, org_id, item_id, response, points, max_points)
select v.attempt::uuid, '00000000-0000-0000-0000-0000c61800a0', v.item::uuid, '{}', v.pts, 1
  from (values
    ('00000000-0000-0000-0000-0000c618aa01', '00000000-0000-0000-0000-0000c61800e1', 0),
    ('00000000-0000-0000-0000-0000c618aa01', '00000000-0000-0000-0000-0000c61800e2', 0),
    ('00000000-0000-0000-0000-0000c618aa01', '00000000-0000-0000-0000-0000c61800e3', 1),
    ('00000000-0000-0000-0000-0000c618aa02', '00000000-0000-0000-0000-0000c61800e1', 1),
    ('00000000-0000-0000-0000-0000c618aa02', '00000000-0000-0000-0000-0000c61800e2', 1),
    ('00000000-0000-0000-0000-0000c618aa02', '00000000-0000-0000-0000-0000c61800e3', 1),
    ('00000000-0000-0000-0000-0000c618aa02', '00000000-0000-0000-0000-0000c61800e9', 0),
    ('00000000-0000-0000-0000-0000c618aa03', '00000000-0000-0000-0000-0000c61800e1', 1),
    ('00000000-0000-0000-0000-0000c618aa03', '00000000-0000-0000-0000-0000c61800e2', 0),
    ('00000000-0000-0000-0000-0000c618aa03', '00000000-0000-0000-0000-0000c61800e3', 0),
    ('00000000-0000-0000-0000-0000c618aa04', '00000000-0000-0000-0000-0000c61800e1', 0)
  ) as v(attempt, item, pts);

insert into fixture (label, id) values ('a1', '00000000-0000-0000-0000-0000c61800f1');

-- Dates, written past the guards as the class_progress test closes its assignment: s1 three
-- days ago, a1 closes two days ago, s2 one day ago.
set local session_replication_role = replica;
update public.assignments set closes_at = now() - interval '2 days'
 where id = '00000000-0000-0000-0000-0000c61800f1';
update public.sessions set opened_at = now() - interval '3 days'
 where id = (select id from fixture where label = 's1');
update public.sessions set opened_at = now() - interval '1 day'
 where id = (select id from fixture where label = 's2');
set local session_replication_role = origin;

-- ---------------------------------------------------------------------------
-- As T, the class's teacher, while R is still a member
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000c618a001');

-- Control: R is a member, so R's 100 on i1 counts in s1's step 3 (M 50, N 0, R 100).
select is(
  pg_temp.figure('s1', 'step', '3'),
  row(3, 4, 50.00)::text,
  'control: while R is a member, R counts in s1''s step 3'
);

reset role;
-- R is taken off the class; M practises i1 and gets it wrong.
delete from public.class_members
 where class_id = '00000000-0000-0000-0000-0000c6180ca1'
   and profile_id = '00000000-0000-0000-0000-0000c618d003';
insert into public.practice_runs (id, org_id, student_id, bank_id)
values ('00000000-0000-0000-0000-0000c618bb01', '00000000-0000-0000-0000-0000c61800a0',
        '00000000-0000-0000-0000-0000c618d001', '00000000-0000-0000-0000-0000c61800e0');
insert into public.practice_responses (run_id, org_id, item_id, response, points, max_points, score)
values ('00000000-0000-0000-0000-0000c618bb01', '00000000-0000-0000-0000-0000c61800a0',
        '00000000-0000-0000-0000-0000c61800e1', '{}', 0, 1, '{}');

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000c618a001');

-- ---------------------------------------------------------------------------
-- Which activities and groups have rows
-- ---------------------------------------------------------------------------

select results_eq(
  $$ select distinct activity_kind, activity_id, title
       from public.class_progress_trend('00000000-0000-0000-0000-0000c6180ca1')
      where activity_kind <> 'term' order by activity_id $$,
  $$ select v.kind, f.id, v.title
       from (values ('s1', 'session', 'Trend bank'), ('a1', 'assignment', 'Week 1'),
                    ('s2', 'session', 'Trend bank')) as v(label, kind, title)
       join fixture f on f.label = v.label
      order by f.id $$,
  'the two ended sessions and the closed assignment, each with its title'
);

select is(
  (select count(*)::integer
     from public.class_progress_trend('00000000-0000-0000-0000-0000c6180ca1')
    where activity_id = (select id from fixture where label = 's3')
       or activity_id = '00000000-0000-0000-0000-0000c61800f2'),
  0,
  'a running live session and an open assignment add no rows'
);

select results_eq(
  $$ select activity_kind, group_kind, group_key
       from public.class_progress_trend('00000000-0000-0000-0000-0000c6180ca1') $$,
  $$ values
       ('session', 'step', '1'), ('session', 'step', '3'),
       ('session', 'category', 'Management of Care'),
       ('session', 'category', 'Physiological Adaptation'), ('session', 'category', 'none'),
       ('assignment', 'step', '1'), ('assignment', 'step', '3'),
       ('assignment', 'category', 'Management of Care'),
       ('assignment', 'category', 'Physiological Adaptation'), ('assignment', 'category', 'none'),
       ('session', 'step', '3'),
       ('session', 'category', 'Management of Care'),
       ('session', 'category', 'Physiological Adaptation'),
       ('term', 'category', 'Management of Care'),
       ('term', 'category', 'Physiological Adaptation'), ('term', 'category', 'none') $$,
  'oldest activity first, steps before categories in test plan order, the term rows last'
);

select is(
  (select array_agg(occurred_at order by occurred_at)
     from (select distinct occurred_at
             from public.class_progress_trend('00000000-0000-0000-0000-0000c6180ca1')
            where activity_kind <> 'term') d),
  array[now() - interval '3 days', now() - interval '2 days', now() - interval '1 day'],
  'a session occurs at its start and an assignment at its close'
);

select is(
  (select count(*)::integer
     from public.class_progress_trend('00000000-0000-0000-0000-0000c6180ca1')
    where activity_kind = 'term'
      and (activity_id is not null or title is not null or occurred_at is not null)),
  0,
  'a term row has no activity'
);

-- ---------------------------------------------------------------------------
-- Step 3 by hand, in date order
-- ---------------------------------------------------------------------------

-- s1: M (i1 1, i2 0) 50, N (i1 0) 0: 25.00 over 2 students and 3 answers. Not R (removed), not
-- the guest, both of whom scored 1 on i1.
select is(pg_temp.figure('s1', 'step', '3'), row(2, 3, 25.00)::text,
  'step 3 in s1: the members'' mean, without the removed student or the guest');
-- a1: M's best attempt (i1 1, i2 1) 100, N (i1 1, i2 0) 50: 75.00. Not M's first attempt.
select is(pg_temp.figure('a1', 'step', '3'), row(2, 4, 75.00)::text,
  'step 3 in a1: the best attempt of each member');
-- s2: M (i2 0) 0, N (i1 1, i2 1) 100: 50.00, each member once though N answered twice.
select is(pg_temp.figure('s2', 'step', '3'), row(2, 3, 50.00)::text,
  'step 3 in s2: the mean of the members'' percents, each member once');

-- ---------------------------------------------------------------------------
-- Physiological Adaptation (i2 only) by hand
-- ---------------------------------------------------------------------------

select is(pg_temp.figure('s1', 'category', 'Physiological Adaptation'), row(1, 1, 0.00)::text,
  'Physiological Adaptation in s1: M alone answered i2, wrongly');
select is(pg_temp.figure('a1', 'category', 'Physiological Adaptation'), row(2, 2, 50.00)::text,
  'Physiological Adaptation in a1: M 100, N 0');
select is(pg_temp.figure('s2', 'category', 'Physiological Adaptation'), row(2, 2, 50.00)::text,
  'Physiological Adaptation in s2: M 0, N 100');

-- ---------------------------------------------------------------------------
-- Two categories, and none
-- ---------------------------------------------------------------------------

-- i2 is under both Management of Care and Physiological Adaptation; i1's topic is no category.
select is(pg_temp.figure('s1', 'category', 'Management of Care'), row(2, 3, 25.00)::text,
  'a question with two categories counts under the first');
select is(
  (select count(*)::integer
     from public.class_progress_trend('00000000-0000-0000-0000-0000c6180ca1')
    where group_kind = 'category' and activity_kind <> 'term' and group_key = 'Physiological Adaptation'),
  3,
  'and under the second, in every activity that answered it'
);
select is(pg_temp.figure('s1', 'category', 'none'), row(1, 1, 100.00)::text,
  'an untagged question counts under none, and a topic-tagged one does not');
-- a1: M's best attempt 1 on i3 (the deleted question's 0 left out), N 0 on i3.
select is(pg_temp.figure('a1', 'category', 'none'), row(2, 2, 50.00)::text,
  'a question deleted since is in no group, not even none');
select is(pg_temp.figure('a1', 'step', '1'), row(2, 2, 50.00)::text,
  'and in no step');

-- ---------------------------------------------------------------------------
-- The all-term figure per category
-- ---------------------------------------------------------------------------

-- Management of Care: M 1 0 (s1), 1 1 (a1), 0 (s2) = 60; N 0 (s1), 1 0 (a1), 1 1 (s2) = 60. M's
-- practice 0 on i1 would make M 3 of 6, 50.
-- Physiological Adaptation: M 0, 1, 0 = 33.33; N 0, 1 = 50; the mean 41.67 (41.665 rounded).
-- none: M 1 (s1), 1 (a1) = 100; N 0 (a1) = 0.
select results_eq(
  $$ select group_key, students, answers, percent
       from public.class_progress_trend('00000000-0000-0000-0000-0000c6180ca1')
      where activity_kind = 'term' $$,
  $$ values ('Management of Care', 2, 10, 60.00), ('Physiological Adaptation', 2, 5, 41.67),
            ('none', 2, 3, 50.00) $$,
  'the term figure per category: each member''s mean, then the class''s, practice never'
);

-- ---------------------------------------------------------------------------
-- class_progress_steps is untouched by the new function
-- ---------------------------------------------------------------------------

-- M: step 1 is i3 in s1 and a1 (2 of 2); step 3 is 1 0 (s1), 1 1 (a1), 0 (s2). N: step 1 is i3 in
-- a1 (0 of 1); step 3 is 0 (s1), 1 0 (a1), 1 1 (s2). R, removed, keeps their own step 3 (1 of 1),
-- as ADR 0014 lists a removed student apart. The deleted question has no step.
select results_eq(
  $$ select profile_id, step, answered, points, possible, mean_percent
       from public.class_progress_steps('00000000-0000-0000-0000-0000c6180ca1')
      order by profile_id, step $$,
  $$ values
       ('00000000-0000-0000-0000-0000c618d001'::uuid, 1::smallint, 2, 2.00, 2.00, 100.00),
       ('00000000-0000-0000-0000-0000c618d001'::uuid, 3::smallint, 5, 3.00, 5.00, 60.00),
       ('00000000-0000-0000-0000-0000c618d002'::uuid, 1::smallint, 1, 0.00, 1.00, 0.00),
       ('00000000-0000-0000-0000-0000c618d002'::uuid, 3::smallint, 5, 3.00, 5.00, 60.00),
       ('00000000-0000-0000-0000-0000c618d003'::uuid, 3::smallint, 1, 1.00, 1.00, 100.00) $$,
  'class_progress_steps returns what it returned before, on the same seed'
);

-- ---------------------------------------------------------------------------
-- As everyone else
-- ---------------------------------------------------------------------------

select pg_temp.act_as('00000000-0000-0000-0000-0000c618b001');
select is(pg_temp.trend_rows(), 0, 'a teacher of another workspace reads no trend');

select pg_temp.act_as('00000000-0000-0000-0000-0000c618d001');
select is(pg_temp.trend_rows(), 0, 'a student of the class reads no trend');

select pg_temp.act_as('00000000-0000-0000-0000-0000c618a001');
select is(
  (select count(*)::integer
     from public.class_progress_trend('00000000-0000-0000-0000-0000c6180fff')),
  0,
  'a class that does not exist reads as nothing'
);

reset role;
set local role anon;
select throws_ok(
  $$ select * from public.class_progress_trend('00000000-0000-0000-0000-0000c6180ca1') $$,
  '42501',
  null,
  'anon cannot call class_progress_trend'
);

reset role;
select ok(
  not has_function_privilege('anon', 'public.class_progress_trend(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.class_progress_trend(uuid)', 'EXECUTE'),
  'class_progress_trend is granted to authenticated and not to anon'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.class_progress_trend(uuid)'::regprocedure)
  and (select proconfig @> array['search_path=""'] from pg_proc
        where oid = 'public.class_progress_trend(uuid)'::regprocedure),
  'class_progress_trend is security definer with an empty search path'
);

select * from finish();
rollback;
