-- A quiz keeps one order for its questions and case studies (#468).
--
-- What is held here:
--   1. Every question and case study has a position, and new content lands at the end of its quiz
--      in the order it was written, whatever position a caller sends.
--   2. Privileges: anon reads and reorders nothing; reorder_quiz runs as the caller.
--   3. The entries are the quiz's current loose questions and case studies: no step, no archived.
--   4. A reorder writes the order given and leaves updated_at alone (an edit still moves it).
--   5. Refusals change nothing: a stale list (missing, archived, step or another workspace's
--      content, a repeat, nothing), another workspace's quiz, another workspace's teacher, a
--      student. The reorder holds the quiz's order lock, which adds and moves take too.
--   6. A whole-quiz live session and assignment run the published loose questions in quiz order;
--      a case study's step is never one of them. The quiz page lists in quiz order, steps last.
--   7. A restore, a duplicate, a JSON import, a move to another quiz (in source order) and a
--      direct change of bank_id all land at the end.
--
-- Runs with `pnpm test:db`. Fixture ids of its own (…468xxx); the closing rollback removes them.
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

-- ---------------------------------------------------------------------------
-- Fixtures, as the superuser
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-000000468aaa', 'order-a@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000468bbb', 'order-b@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000468ccc', 'order-s@example.test', 'authenticated', 'authenticated');

insert into public.orgs (id, name) values
  ('00000000-0000-0000-0000-000000468f01', 'Order workspace'),
  ('00000000-0000-0000-0000-000000468f02', 'Other workspace');
update public.profiles set org_id = '00000000-0000-0000-0000-000000468f01', role = 'instructor'
 where id = '00000000-0000-0000-0000-000000468aaa';
update public.profiles set org_id = '00000000-0000-0000-0000-000000468f02', role = 'instructor'
 where id = '00000000-0000-0000-0000-000000468bbb';
update public.profiles set org_id = '00000000-0000-0000-0000-000000468f01', role = 'student'
 where id = '00000000-0000-0000-0000-000000468ccc';

create function pg_temp.act_as(account uuid) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', account, 'role', 'authenticated')::text, true);
$$;

create function pg_temp.u(suffix text) returns uuid
language sql immutable as $$ select ('00000000-0000-0000-0000-000000468' || suffix)::uuid $$;

-- A position by id, from either table.
create function pg_temp.pos(target uuid) returns integer
language sql stable as $$
  select coalesce(
    (select quiz_position from public.items where id = target),
    (select quiz_position from public.case_studies where id = target))
$$;

-- A quiz's entries as list_quiz_entries returns them, in its order.
create function pg_temp.entries(target_bank uuid) returns uuid[]
language sql stable as $$
  select coalesce(array_agg(e.id order by e.n), '{}')
    from public.list_quiz_entries(target_bank)
         with ordinality as e(kind, id, type, status, title, stem, quiz_position, n)
$$;

insert into public.item_banks (id, org_id, name) values
  (pg_temp.u('b01'), pg_temp.u('f01'), 'Ordered'),
  (pg_temp.u('b02'), pg_temp.u('f01'), 'Target'),
  (pg_temp.u('b09'), pg_temp.u('f02'), 'Theirs');

-- In one statement, three questions; then a case study, its step, and a draft. Everything was
-- last edited in 2020, so an untouched updated_at is easy to see.
insert into public.items (id, bank_id, org_id, type, status, content, answer_key, scoring, updated_at)
values
  (pg_temp.u('101'), pg_temp.u('b01'), pg_temp.u('f01'), 'multiple_choice', 'published',
   '{"stem":{"kind":"markdown","value":"One"}}', '{}', '{}', '2020-01-01'),
  (pg_temp.u('102'), pg_temp.u('b01'), pg_temp.u('f01'), 'multiple_choice', 'published',
   '{"stem":{"kind":"markdown","value":"Two"}}', '{}', '{}', '2020-01-01'),
  (pg_temp.u('103'), pg_temp.u('b01'), pg_temp.u('f01'), 'multiple_choice', 'published',
   '{"stem":{"kind":"markdown","value":"Three"}}', '{}', '{}', '2020-01-01');
insert into public.case_studies (id, bank_id, org_id, title, ehr, status, updated_at) values
  (pg_temp.u('c01'), pg_temp.u('b01'), pg_temp.u('f01'), 'Chest pain', '{}', 'published', '2020-01-01');
insert into public.items (id, bank_id, org_id, type, status, content, answer_key, scoring, updated_at)
values
  (pg_temp.u('111'), pg_temp.u('b01'), pg_temp.u('f01'), 'multiple_choice', 'published',
   '{}', '{}', '{}', '2020-01-01');
insert into public.case_study_items (case_study_id, org_id, bank_id, position, item_id) values
  (pg_temp.u('c01'), pg_temp.u('f01'), pg_temp.u('b01'), 1, pg_temp.u('111'));
insert into public.items (id, bank_id, org_id, type, status, content, answer_key, scoring, updated_at)
values
  (pg_temp.u('104'), pg_temp.u('b01'), pg_temp.u('f01'), 'multiple_choice', 'draft',
   '{}', '{}', '{}', '2020-01-01');
-- A caller's position is not taken: this one asks for the top.
insert into public.items
    (id, bank_id, org_id, type, status, content, answer_key, scoring, updated_at, quiz_position)
values
  (pg_temp.u('105'), pg_temp.u('b01'), pg_temp.u('f01'), 'multiple_choice', 'published',
   '{}', '{}', '{}', '2020-01-01', 1);

-- The target quiz holds one question; the other workspace's quiz one of its own.
insert into public.items (id, bank_id, org_id, type, status, content, answer_key, scoring) values
  (pg_temp.u('201'), pg_temp.u('b02'), pg_temp.u('f01'), 'multiple_choice', 'published', '{}', '{}', '{}'),
  (pg_temp.u('901'), pg_temp.u('b09'), pg_temp.u('f02'), 'multiple_choice', 'published', '{}', '{}', '{}');

insert into public.classes (id, org_id, name) values
  (pg_temp.u('a01'), pg_temp.u('f01'), 'NUR 468');

create temporary table ids (name text primary key, id uuid, result jsonb);
grant all on ids to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Positions, and where new content lands
-- ---------------------------------------------------------------------------

select col_not_null('public', 'items', 'quiz_position', 'every question has a position');
select col_not_null('public', 'case_studies', 'quiz_position', 'every case study has a position');

select is(
  array[pg_temp.pos(pg_temp.u('101')), pg_temp.pos(pg_temp.u('102')), pg_temp.pos(pg_temp.u('103')),
        pg_temp.pos(pg_temp.u('c01')), pg_temp.pos(pg_temp.u('111')), pg_temp.pos(pg_temp.u('104'))],
  array[1, 2, 3, 4, 5, 6],
  'questions and case studies number together, in the order they were written, one statement or many'
);
select is(
  pg_temp.pos(pg_temp.u('105')), 7,
  'a position sent with an insert is ignored: new content goes to the end'
);

-- ---------------------------------------------------------------------------
-- 2. Privileges
-- ---------------------------------------------------------------------------

select ok(
  not has_function_privilege('anon', 'public.reorder_quiz(uuid, uuid[])', 'EXECUTE')
  and not has_function_privilege('anon', 'public.list_quiz_entries(uuid)', 'EXECUTE'),
  'anon can neither read a quiz''s order nor change it'
);
select ok(
  has_function_privilege('authenticated', 'public.reorder_quiz(uuid, uuid[])', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.list_quiz_entries(uuid)', 'EXECUTE'),
  'a signed-in user can call both'
);
select ok(
  not (select prosecdef from pg_proc where oid = 'public.reorder_quiz(uuid, uuid[])'::regprocedure)
  and not (select prosecdef from pg_proc where oid = 'public.list_quiz_entries(uuid)'::regprocedure),
  'both are security invoker, so RLS decides what a caller can see and reorder'
);

-- ---------------------------------------------------------------------------
-- 3. The entries
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as(pg_temp.u('aaa'));
select public.archive_item(pg_temp.u('103'));

select is(
  pg_temp.entries(pg_temp.u('b01')),
  array[pg_temp.u('101'), pg_temp.u('102'), pg_temp.u('c01'), pg_temp.u('104'), pg_temp.u('105')],
  'the entries are the loose questions and case studies in order; no step, nothing archived'
);

-- ---------------------------------------------------------------------------
-- 4. A reorder
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ select public.reorder_quiz(pg_temp.u('b01'),
       array[pg_temp.u('105'), pg_temp.u('c01'), pg_temp.u('104'), pg_temp.u('102'), pg_temp.u('101')]) $$,
  'a teacher reorders their quiz'
);
select is(
  pg_temp.entries(pg_temp.u('b01')),
  array[pg_temp.u('105'), pg_temp.u('c01'), pg_temp.u('104'), pg_temp.u('102'), pg_temp.u('101')],
  'the quiz lists in the new order'
);
select ok(
  (select bool_and(updated_at = '2020-01-01'::timestamptz) from (
     select updated_at from public.items where id in (pg_temp.u('101'), pg_temp.u('105'))
     union all
     select updated_at from public.case_studies where id = pg_temp.u('c01')) x),
  'a reorder is not an edit: updated_at is left as it was'
);
select ok(
  (select bool_and(locked) from (
     select exists (
       select 1 from pg_locks l
        where l.locktype = 'advisory' and l.pid = pg_backend_pid() and l.granted
          and l.classid::bigint = ((h >> 32) & 4294967295)
          and l.objid::bigint = (h & 4294967295)) as locked
       from (select hashtextextended('learn:quiz-order:' || pg_temp.u('b01')::text, 0) as h) k) x),
  'the reorder holds the quiz''s order lock, which adds and moves wait on'
);

-- ---------------------------------------------------------------------------
-- 5. Refusals
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select public.reorder_quiz(pg_temp.u('b01'),
       array[pg_temp.u('105'), pg_temp.u('c01'), pg_temp.u('104'), pg_temp.u('102')]) $$,
  '22023', null,
  'a list that misses an entry (one added since the page loaded, say) is refused'
);
select throws_ok(
  $$ select public.reorder_quiz(pg_temp.u('b01'),
       array[pg_temp.u('105'), pg_temp.u('c01'), pg_temp.u('104'), pg_temp.u('102'), pg_temp.u('101'),
             pg_temp.u('103')]) $$,
  '22023', null,
  'an archived question cannot be placed'
);
select throws_ok(
  $$ select public.reorder_quiz(pg_temp.u('b01'),
       array[pg_temp.u('105'), pg_temp.u('c01'), pg_temp.u('104'), pg_temp.u('102'), pg_temp.u('101'),
             pg_temp.u('111')]) $$,
  '22023', null,
  'nor a case study''s step'
);
select throws_ok(
  $$ select public.reorder_quiz(pg_temp.u('b01'),
       array[pg_temp.u('105'), pg_temp.u('c01'), pg_temp.u('104'), pg_temp.u('102'), pg_temp.u('101'),
             pg_temp.u('901')]) $$,
  '22023', null,
  'nor another workspace''s question'
);
select throws_ok(
  $$ select public.reorder_quiz(pg_temp.u('b01'),
       array[pg_temp.u('105'), pg_temp.u('c01'), pg_temp.u('104'), pg_temp.u('102'), pg_temp.u('102')]) $$,
  '22023', null,
  'nor one named twice'
);
select throws_ok(
  $$ select public.reorder_quiz(pg_temp.u('b01'), '{}') $$,
  '22023', null,
  'nor an empty list'
);
select throws_ok(
  $$ select public.reorder_quiz(pg_temp.u('b09'), array[pg_temp.u('901')]) $$,
  'P0002', null,
  'another workspace''s quiz reads as not found'
);

select pg_temp.act_as(pg_temp.u('bbb'));
select throws_ok(
  $$ select public.reorder_quiz(pg_temp.u('b01'),
       array[pg_temp.u('101'), pg_temp.u('102'), pg_temp.u('104'), pg_temp.u('105'), pg_temp.u('c01')]) $$,
  'P0002', null,
  'another workspace''s teacher cannot reorder this quiz'
);
select pg_temp.act_as(pg_temp.u('ccc'));
select throws_ok(
  $$ select public.reorder_quiz(pg_temp.u('b01'),
       array[pg_temp.u('101'), pg_temp.u('102'), pg_temp.u('104'), pg_temp.u('105'), pg_temp.u('c01')]) $$,
  'P0002', null,
  'nor can a student in the workspace'
);

select pg_temp.act_as(pg_temp.u('aaa'));
select is(
  pg_temp.entries(pg_temp.u('b01')),
  array[pg_temp.u('105'), pg_temp.u('c01'), pg_temp.u('104'), pg_temp.u('102'), pg_temp.u('101')],
  'every refusal left the order as it was'
);

-- ---------------------------------------------------------------------------
-- 6. What reads the order
-- ---------------------------------------------------------------------------

insert into ids (name, id) select 'session', public.start_session(pg_temp.u('b01'), null);
select is(
  (select s.item_set from public.sessions s join ids on ids.id = s.id where ids.name = 'session'),
  jsonb_build_array(pg_temp.u('105'), pg_temp.u('102'), pg_temp.u('101')),
  'a whole-quiz live session runs its published loose questions in quiz order, without the step'
);

insert into public.assignments (id, class_id, bank_id, title, opens_at, closes_at)
values (pg_temp.u('a02'), pg_temp.u('a01'), pg_temp.u('b01'), 'Ordered',
        now() - interval '1 hour', now() + interval '1 day');
select is(
  (select item_set from public.assignments where id = pg_temp.u('a02')),
  jsonb_build_array(pg_temp.u('105'), pg_temp.u('102'), pg_temp.u('101')),
  'and so does a whole-quiz assignment'
);

select is(
  (select array_agg(l.id order by l.n)
     from public.list_bank_items(pg_temp.u('b01'))
          with ordinality as l(id, type, status, updated_at, cjmm_step, tags, stem, max_points,
                               stem_match, text_match, rationale_match, total_count, n)),
  array[pg_temp.u('105'), pg_temp.u('104'), pg_temp.u('102'), pg_temp.u('101'), pg_temp.u('111')],
  'the quiz page lists its questions in quiz order, and step questions after them'
);

update public.items set tags = '{edited}' where id = pg_temp.u('105');
select ok(
  (select updated_at > '2020-01-02'::timestamptz from public.items where id = pg_temp.u('105')),
  'control: an edit still moves updated_at'
);

-- ---------------------------------------------------------------------------
-- 7. Restore, duplicate, import and move land at the end
-- ---------------------------------------------------------------------------

select public.restore_item(pg_temp.u('103'));
select is(
  (pg_temp.entries(pg_temp.u('b01')))[6], pg_temp.u('103'),
  'a restored question comes back at the end'
);

insert into ids (name, id) select 'copy', public.duplicate_item(pg_temp.u('101'));
select is(
  (pg_temp.entries(pg_temp.u('b01')))[7], (select id from ids where name = 'copy'),
  'a duplicate lands at the end'
);

insert into ids (name, result)
  select 'import', public.import_bank_content(pg_temp.u('b01'),
    '[{"type":"multiple_choice","content":{"stem":{"kind":"markdown","value":"First"}}},
      {"type":"multiple_choice","content":{"stem":{"kind":"markdown","value":"Second"}}},
      {"type":"multiple_choice","content":{"stem":{"kind":"markdown","value":"Third"}}}]'::jsonb,
    null);
select is(
  (pg_temp.entries(pg_temp.u('b01')))[8:10],
  (select array_agg(x::uuid order by n)
     from ids, jsonb_array_elements_text(ids.result -> 'item_ids') with ordinality as t(x, n)
    where ids.name = 'import'),
  'an import lands at the end, in the order of its file'
);

-- In the source quiz the case study comes before the question, so it lands first in the target.
select public.move_to_quiz(pg_temp.u('b01'), pg_temp.u('b02'),
  array[pg_temp.u('102')], array[pg_temp.u('c01')]);
select is(
  pg_temp.entries(pg_temp.u('b02')),
  array[pg_temp.u('201'), pg_temp.u('c01'), pg_temp.u('102')],
  'a move lands at the end of the other quiz, in the order it had'
);

update public.items set bank_id = pg_temp.u('b02') where id = pg_temp.u('104');
select is(
  pg_temp.entries(pg_temp.u('b02')),
  array[pg_temp.u('201'), pg_temp.u('c01'), pg_temp.u('102'), pg_temp.u('104')],
  'a question whose quiz is changed directly lands at the end too'
);

reset role;
select * from finish();
rollback;
