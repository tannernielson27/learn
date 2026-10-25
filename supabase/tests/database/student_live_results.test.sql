-- A student's own live session results (20261025010000_student_live_results.sql): only ended
-- sessions, only participant rows linked to the caller, never an anonymous participant, never a
-- question the session did not reach, and never another student's answer. Runs with
-- `pnpm exec supabase test db`. Uses its own fixture ids so it never counts the seed's rows.
begin;
create extension if not exists pgtap with schema extensions;
select plan(37);

-- ---------------------------------------------------------------------------
-- Fixtures, as the superuser
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role)
values
  -- T teaches. M and O are members of NUR 310. X is a member who joined no session.
  ('00000000-0000-0000-0000-00000025a0a1', 'live-results-t@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000025a0d1', 'live-results-m@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000025a0d2', 'live-results-o@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000025a0d3', 'live-results-x@example.test', 'authenticated', 'authenticated');

insert into public.orgs (id, name) values
  ('00000000-0000-0000-0000-00000025a0a0', 'Live results A');
update public.profiles set org_id = '00000000-0000-0000-0000-00000025a0a0', role = 'instructor'
 where id = '00000000-0000-0000-0000-00000025a0a1';
update public.profiles set org_id = '00000000-0000-0000-0000-00000025a0a0', role = 'student'
 where id in ('00000000-0000-0000-0000-00000025a0d1', '00000000-0000-0000-0000-00000025a0d2',
              '00000000-0000-0000-0000-00000025a0d3');

insert into public.item_banks (id, org_id, name) values
  ('00000000-0000-0000-0000-00000025a0b1', '00000000-0000-0000-0000-00000025a0a0', 'Live results bank');
-- Three questions, made in this order, so the session's set is e1, e2, e3.
insert into public.items (id, bank_id, org_id, type, status, cjmm_step, content, answer_key, scoring)
values
  ('00000000-0000-0000-0000-00000025a0e1', '00000000-0000-0000-0000-00000025a0b1',
   '00000000-0000-0000-0000-00000025a0a0', 'multiple_choice', 'published', 2, '{}',
   '{"correctOptionId":"a"}', '{"model":"zero_one","maxPoints":1}');
insert into public.items (id, bank_id, org_id, type, status, cjmm_step, content, answer_key, scoring)
values
  ('00000000-0000-0000-0000-00000025a0e2', '00000000-0000-0000-0000-00000025a0b1',
   '00000000-0000-0000-0000-00000025a0a0', 'multiple_choice', 'published', 4, '{}',
   '{"correctOptionId":"b"}', '{"model":"plus_minus","maxPoints":3}');
insert into public.items (id, bank_id, org_id, type, status, cjmm_step, content, answer_key, scoring)
values
  ('00000000-0000-0000-0000-00000025a0e3', '00000000-0000-0000-0000-00000025a0b1',
   '00000000-0000-0000-0000-00000025a0a0', 'multiple_choice', 'published', 5, '{}',
   '{"correctOptionId":"c"}', '{"model":"zero_one","maxPoints":2}');

insert into public.classes (id, org_id, name) values
  ('00000000-0000-0000-0000-00000025a0c1', '00000000-0000-0000-0000-00000025a0a0', 'NUR 310');
insert into public.class_members (class_id, profile_id) values
  ('00000000-0000-0000-0000-00000025a0c1', '00000000-0000-0000-0000-00000025a0d1'),
  ('00000000-0000-0000-0000-00000025a0c1', '00000000-0000-0000-0000-00000025a0d2'),
  ('00000000-0000-0000-0000-00000025a0c1', '00000000-0000-0000-0000-00000025a0d3');

create temporary table fixture (label text primary key, id uuid);
grant select, insert on fixture to anon, authenticated, service_role;

create function pg_temp.act_as(account uuid) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', account, 'role', 'authenticated')::text, true);
$$;

create function pg_temp.fx(name text) returns uuid
language sql as $$ select id from fixture where label = name $$;

-- Four sessions, started by T: "ended" and "running" for the class, teacher-paced; "paced" for the
-- class, student-paced; "quick" for no class.
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-00000025a0a1');
insert into fixture (label, id) select 'ended', public.start_session(
  source_bank => '00000000-0000-0000-0000-00000025a0b1'::uuid,
  target_class => '00000000-0000-0000-0000-00000025a0c1'::uuid);
insert into fixture (label, id) select 'running', public.start_session(
  source_bank => '00000000-0000-0000-0000-00000025a0b1'::uuid,
  target_class => '00000000-0000-0000-0000-00000025a0c1'::uuid);
insert into fixture (label, id) select 'paced', public.start_session(
  source_bank => '00000000-0000-0000-0000-00000025a0b1'::uuid,
  paced => 'student_paced',
  target_class => '00000000-0000-0000-0000-00000025a0c1'::uuid);
insert into fixture (label, id) select 'quick', public.start_session(
  source_bank => '00000000-0000-0000-0000-00000025a0b1'::uuid);
reset role;

-- Joining, through join_session as the join action calls it: linked for a member of the class,
-- anonymous otherwise. M joins "quick" too, which links nobody, under the same name.
insert into fixture (label, id)
  select 'm_ended', (select participant_id from public.join_session(pg_temp.fx('ended'), 'Mia Chen',
    '00000000-0000-0000-0000-00000025a0d1'));
insert into fixture (label, id)
  select 'o_ended', (select participant_id from public.join_session(pg_temp.fx('ended'), 'Omar Ali',
    '00000000-0000-0000-0000-00000025a0d2'));
insert into fixture (label, id)
  select 'guest_ended', (select participant_id from public.join_session(pg_temp.fx('ended'), 'Guest'));
insert into fixture (label, id)
  select 'm_running', (select participant_id from public.join_session(pg_temp.fx('running'),
    'Mia Chen', '00000000-0000-0000-0000-00000025a0d1'));
insert into fixture (label, id)
  select 'm_paced', (select participant_id from public.join_session(pg_temp.fx('paced'),
    'Mia Chen', '00000000-0000-0000-0000-00000025a0d1'));
insert into fixture (label, id)
  select 'm_quick', (select participant_id from public.join_session(pg_temp.fx('quick'),
    'Mia Chen', '00000000-0000-0000-0000-00000025a0d1'));

select ok(
  (select profile_id from public.participants where id = pg_temp.fx('m_ended'))
    = '00000000-0000-0000-0000-00000025a0d1'
  and (select profile_id from public.participants where id = pg_temp.fx('guest_ended')) is null
  and (select profile_id from public.participants where id = pg_temp.fx('m_quick')) is null,
  'fixtures: M and O are linked in the class session; the guest, and M in the quick one, are not'
);

-- The rooms move. "ended" reaches question 2 of 3 and ends; "running" stays on question 1;
-- "paced" and "quick" end.
update public.sessions set status = 'running', current_position = 1 where id = pg_temp.fx('ended');
update public.sessions set current_position = 2 where id = pg_temp.fx('ended');
update public.sessions set status = 'running', current_position = 1 where id = pg_temp.fx('running');
update public.sessions set status = 'running', current_position = 1 where id = pg_temp.fx('quick');

-- Answers, written as record_session_response writes them.
insert into public.session_responses
  (session_id, org_id, participant_id, item_id, item_position, response, points, max_points, model,
   reveal)
select pg_temp.fx(v.session), '00000000-0000-0000-0000-00000025a0a0', pg_temp.fx(v.participant),
       v.item::uuid, v.pos, v.response::jsonb, v.points, v.max_points, 'zero_one', v.reveal::jsonb
  from (values
    -- M: right on 1, one of three on 2.
    ('ended', 'm_ended', '00000000-0000-0000-0000-00000025a0e1', 1, '{"selectedOptionId":"a"}', 1, 1,
     '{"answerKey":{"correctOptionId":"a"},"rationale":"Because a.","scoring":{"model":"zero_one","maxPoints":1}}'),
    ('ended', 'm_ended', '00000000-0000-0000-0000-00000025a0e2', 2, '{"selectedOptionId":"b"}', 1, 3, null),
    -- O: wrong on 1, nothing on 2.
    ('ended', 'o_ended', '00000000-0000-0000-0000-00000025a0e1', 1, '{"selectedOptionId":"omar"}', 0, 1, null),
    -- The guest: right on 1 and on 2.
    ('ended', 'guest_ended', '00000000-0000-0000-0000-00000025a0e1', 1, '{"selectedOptionId":"a"}', 1, 1, null),
    ('ended', 'guest_ended', '00000000-0000-0000-0000-00000025a0e2', 2, '{"selectedOptionId":"b"}', 3, 3, null),
    -- M in the room still running, and M as an anonymous participant of the quick session.
    ('running', 'm_running', '00000000-0000-0000-0000-00000025a0e1', 1, '{"selectedOptionId":"a"}', 1, 1, null),
    ('quick', 'm_quick', '00000000-0000-0000-0000-00000025a0e1', 1, '{"selectedOptionId":"a"}', 1, 1, null)
  ) as v(session, participant, item, pos, response, points, max_points, reveal);

update public.sessions set status = 'ended' where id = pg_temp.fx('ended');
update public.sessions set status = 'ended' where id = pg_temp.fx('paced');
update public.sessions set status = 'ended' where id = pg_temp.fx('quick');

-- ---------------------------------------------------------------------------
-- Who may call what
-- ---------------------------------------------------------------------------

select ok(
  not has_function_privilege('anon', 'public.my_live_results()', 'execute')
  and not has_function_privilege('anon', 'public.my_live_result(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.my_live_step_marks()', 'execute'),
  'anon can call none of the three'
);

select ok(
  has_function_privilege('authenticated', 'public.my_live_results()', 'execute')
  and has_function_privilege('authenticated', 'public.my_live_result(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.my_live_step_marks()', 'execute'),
  'a signed-in account can call all three'
);

select ok(
  not has_function_privilege('authenticated', 'private.my_live_places(uuid, uuid)', 'execute')
  and not has_function_privilege('service_role', 'private.my_live_places(uuid, uuid)', 'execute')
  and not has_function_privilege('anon', 'private.my_live_places(uuid, uuid)', 'execute'),
  'the private helper, which takes an account, is callable by no API role'
);

select ok(
  (select bool_and(p.prosecdef and p.proconfig @> array['search_path=""'])
     from pg_proc p
    where p.oid in ('public.my_live_results()'::regprocedure, 'public.my_live_result(uuid)'::regprocedure,
                    'public.my_live_step_marks()'::regprocedure,
                    'private.my_live_places(uuid, uuid)'::regprocedure)),
  'all four are security definer with an empty search_path'
);

select is(
  (select count(*)::integer from private.my_live_places(null)),
  0,
  'no account, no places: an anonymous participant can never be read through here'
);

-- ---------------------------------------------------------------------------
-- As M
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-00000025a0d1');

select is(
  (select array_agg(session_id order by session_id) from public.my_live_results()),
  (select array_agg(id order by id) from fixture where label in ('ended', 'paced')),
  'M reads the two ended class sessions they were linked in: not the running one, not the quick one'
);

select results_eq(
  $$ select title, class_name, question_count, answered, points, possible
       from public.my_live_results() where session_id = pg_temp.fx('ended') $$,
  $$ values ('Live results bank'::text, 'NUR 310'::text, 2, 2, 2::numeric, 4::numeric) $$,
  'the ended session: the questions it reached (2 of 3), and M''s own points out of what they were worth'
);

select is(
  (select marks from public.my_live_results() where session_id = pg_temp.fx('ended')),
  '[{"position": 1, "points": 1, "max_points": 1}, {"position": 2, "points": 1, "max_points": 3}]'::jsonb,
  'per question, only its place and M''s own two numbers'
);

select ok(
  (select closed_at is not null from public.my_live_results() where session_id = pg_temp.fx('ended')),
  'with when it ended'
);

select ok(
  (select bool_and(r::text not like '%answerKey%' and r::text not like '%rationale%'
                   and r::text not like '%correctOptionId%' and r::text not like '%selectedOptionId%'
                   and r::text not like '%00000000-0000-0000-0000-00000025a0e%')
     from public.my_live_results() r),
  'the list carries no key, rationale, answer or item id'
);

select results_eq(
  $$ select question_count, answered, points, possible
       from public.my_live_results() where session_id = pg_temp.fx('paced') $$,
  $$ values (3, 0, 0::numeric, 6::numeric) $$,
  'a student-paced session put its whole set to every phone; unanswered questions count at their worth'
);

select is(
  (select count(*)::integer from public.my_live_result(pg_temp.fx('ended'))),
  1,
  'M opens the ended session''s results'
);

select is(
  (select jsonb_agg(q -> 'position' order by (q ->> 'position')::integer)
     from public.my_live_result(pg_temp.fx('ended')) r, jsonb_array_elements(r.questions) q),
  '[1, 2]'::jsonb,
  'with the questions it reached, and not question 3'
);

select is(
  (select q -> 'answer' -> 'response'
     from public.my_live_result(pg_temp.fx('ended')) r, jsonb_array_elements(r.questions) q
    where (q ->> 'position')::integer = 1),
  '{"selectedOptionId": "a"}'::jsonb,
  'M''s own answer, not O''s or the guest''s'
);

select is(
  (select q -> 'answer' -> 'reveal' ->> 'rationale'
     from public.my_live_result(pg_temp.fx('ended')) r, jsonb_array_elements(r.questions) q
    where (q ->> 'position')::integer = 1),
  'Because a.',
  'and the key and rationale it was scored against, now the session has ended'
);

select ok(
  (select r::text not like '%omar%' from public.my_live_result(pg_temp.fx('ended')) r),
  'nothing of another participant''s answers'
);

select is(
  (select class_name from public.my_live_result(pg_temp.fx('ended'))),
  'NUR 310',
  'the class it was for'
);

select is(
  (select count(*)::integer from public.my_live_result(pg_temp.fx('running'))),
  0,
  'a session still running is not returned, though M answered in it'
);

select is(
  (select count(*)::integer from public.my_live_result(pg_temp.fx('quick'))),
  0,
  'a quick session M joined anonymously is not returned'
);

select is(
  (select count(*)::integer from public.my_live_result(null)),
  0,
  'no session, no rows'
);

select is(
  (select count(*)::integer from public.my_live_result('00000000-0000-0000-0000-00000025afff')),
  0,
  'a session that does not exist reads the same'
);

select results_eq(
  $$ select cjmm_step, points, max_points from public.my_live_step_marks() order by cjmm_step $$,
  $$ values (2::smallint, 1::numeric, 1::numeric), (4::smallint, 1::numeric, 3::numeric) $$,
  'M''s live answers count toward their steps: from the ended class session only'
);

-- ---------------------------------------------------------------------------
-- As O: another student of the same class, in the same session
-- ---------------------------------------------------------------------------

select pg_temp.act_as('00000000-0000-0000-0000-00000025a0d2');

select results_eq(
  $$ select session_id, answered, points, possible from public.my_live_results() $$,
  $$ values (pg_temp.fx('ended'), 1, 0::numeric, 4::numeric) $$,
  'O reads only their own row: one answered, none right, a blank question counted at its worth'
);

select is(
  (select q -> 'answer'
     from public.my_live_result(pg_temp.fx('ended')) r, jsonb_array_elements(r.questions) q
    where (q ->> 'position')::integer = 2),
  'null'::jsonb,
  'O''s blank question 2 carries no answer, M''s included'
);

select ok(
  (select r::text not like '%Because a.%' from public.my_live_result(pg_temp.fx('ended')) r),
  'and no key M''s answer was scored against'
);

select is(
  (select count(*)::integer from public.my_live_result(pg_temp.fx('paced'))),
  0,
  'O cannot open a session only M was linked in'
);

-- ---------------------------------------------------------------------------
-- As X: a member of the class who joined no session
-- ---------------------------------------------------------------------------

select pg_temp.act_as('00000000-0000-0000-0000-00000025a0d3');

select is((select count(*)::integer from public.my_live_results()), 0,
  'another student sees nothing of M''s or O''s list');
select is((select count(*)::integer from public.my_live_result(pg_temp.fx('ended'))), 0,
  'nor their session''s results, though it was for X''s own class');
select is((select count(*)::integer from public.my_live_step_marks()), 0,
  'nor their marks');

-- ---------------------------------------------------------------------------
-- As T: the teacher who ran every session
-- ---------------------------------------------------------------------------

select pg_temp.act_as('00000000-0000-0000-0000-00000025a0a1');

select is((select count(*)::integer from public.my_live_results()), 0,
  'a teacher reads only their own rows, and has none');
select is((select count(*)::integer from public.my_live_result(pg_temp.fx('ended'))), 0,
  'a teacher cannot open a student''s results page for their own session');
select is((select count(*)::integer from public.my_live_step_marks()), 0,
  'and has no live step marks');

-- ---------------------------------------------------------------------------
-- No session at all
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '', true);

select is((select count(*)::integer from public.my_live_results()), 0,
  'signed in as nobody, the list is empty');
select is((select count(*)::integer from public.my_live_step_marks()), 0,
  'and so are the marks');

reset role;
set local role anon;
select throws_ok(
  $$ select * from public.my_live_results() $$,
  '42501',
  null,
  'anon is refused outright'
);
reset role;

-- A student linked in a session who is then taken off the class keeps their own record.
delete from public.class_members
 where class_id = '00000000-0000-0000-0000-00000025a0c1'
   and profile_id = '00000000-0000-0000-0000-00000025a0d1';
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-00000025a0d1');
select is((select count(*)::integer from public.my_live_results()), 2,
  'a student taken off the class still reads their own ended sessions');
reset role;

select * from finish();
rollback;
