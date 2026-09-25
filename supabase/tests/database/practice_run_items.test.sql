-- A practice run freezes its items when it starts (#271).
--
-- Opening a new run records, in play order, each item it holds and the content that was published
-- at that moment. The run then plays, reads and scores from that record, so an item an author
-- unpublishes or edits mid-run stays as it was for that run. Start over records the bank as it is
-- now. A run started before the freeze (frozen = false) keeps reading the bank's current items.
-- Stopping the share still stops every run at once. Nobody but the definer functions touches the
-- two new tables.
begin;
create extension if not exists pgtap with schema extensions;
select plan(39);

-- ---------------------------------------------------------------------------
-- Cast, as the superuser
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000002710a1', 'freeze-teacher@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002710d1', 'freeze-student-in@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002710d2', 'freeze-student-other@example.test', 'authenticated', 'authenticated');

select private.make_instructor('freeze-teacher@example.test');
update public.profiles
   set org_id = (select org_id from public.profiles where id = '00000000-0000-0000-0000-0000002710a1'),
       role = 'student'
 where id in ('00000000-0000-0000-0000-0000002710d1', '00000000-0000-0000-0000-0000002710d2');

create function pg_temp.act_as(account uuid) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', account, 'role', 'authenticated')::text, true);
$$;

-- One class; the first student is in it, the second is not.
insert into public.classes (id, org_id, name)
  select '00000000-0000-0000-0000-0000002710c1', org_id, 'NUR 310'
    from public.profiles where id = '00000000-0000-0000-0000-0000002710a1';
insert into public.class_members (class_id, profile_id) values
  ('00000000-0000-0000-0000-0000002710c1', '00000000-0000-0000-0000-0000002710d1');

-- "Cardiac week": two published standalone items, a draft, and a case study with two published
-- steps.
insert into public.item_banks (id, org_id, name)
  select '00000000-0000-0000-0000-0000002710e0', org_id, 'Cardiac week'
    from public.profiles where id = '00000000-0000-0000-0000-0000002710a1';

insert into public.items (id, bank_id, org_id, type, cjmm_step, status, content, answer_key,
                          rationale, scoring, created_at)
  select v.id::uuid, '00000000-0000-0000-0000-0000002710e0', p.org_id, 'multiple_choice', v.step,
         v.status::public.content_status, '{"stem":"as published"}',
         jsonb_build_object('correctOptionId', v.key), '{"general":"as published"}', '{}',
         now() + v.lag * interval '1 second'
    from public.profiles p,
         (values ('00000000-0000-0000-0000-0000002710f1', 1, 'published', 'key_v1_f1', 1),
                 ('00000000-0000-0000-0000-0000002710f2', 2, 'published', 'key_v1_f2', 2),
                 ('00000000-0000-0000-0000-0000002710f3', 3, 'draft', 'key_draft_f3', 3),
                 ('00000000-0000-0000-0000-0000002710f5', 1, 'published', 'key_v1_f5', 5),
                 ('00000000-0000-0000-0000-0000002710f6', 2, 'published', 'key_v1_f6', 6))
           as v(id, step, status, key, lag)
   where p.id = '00000000-0000-0000-0000-0000002710a1';

insert into public.case_studies (id, bank_id, org_id, title, ehr, status)
  select '00000000-0000-0000-0000-0000002710a5', '00000000-0000-0000-0000-0000002710e0', org_id,
         'Heart failure case', '{}', 'published'
    from public.profiles where id = '00000000-0000-0000-0000-0000002710a1';
insert into public.case_study_items (case_study_id, org_id, bank_id, position, item_id)
  select '00000000-0000-0000-0000-0000002710a5', p.org_id, '00000000-0000-0000-0000-0000002710e0',
         v.position, v.item::uuid
    from public.profiles p,
         (values (1, '00000000-0000-0000-0000-0000002710f5'),
                 (2, '00000000-0000-0000-0000-0000002710f6')) as v(position, item)
   where p.id = '00000000-0000-0000-0000-0000002710a1';

insert into public.bank_practice_shares (org_id, bank_id, class_id, shared_by)
  select org_id, '00000000-0000-0000-0000-0000002710e0', '00000000-0000-0000-0000-0000002710c1',
         '00000000-0000-0000-0000-0000002710a1'
    from public.profiles where id = '00000000-0000-0000-0000-0000002710a1';

create temporary table ids (name text primary key, id uuid);
grant all on ids to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The catalog
-- ---------------------------------------------------------------------------

select ok(
  (select relrowsecurity from pg_class where oid = 'public.practice_run_slots'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.practice_item_snapshots'::regclass),
  'both new tables have row level security on'
);
select is_empty(
  $$ select r || ' ' || t || ' ' || p
       from unnest(array['anon', 'authenticated', 'service_role']) r,
            unnest(array['public.practice_run_slots', 'public.practice_item_snapshots']) t,
            unnest(array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']) p
      where has_table_privilege(r, t, p) $$,
  'anon, authenticated and the service role hold no privilege on either table'
);
select is(
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'practice_runs' and column_name = 'frozen'),
  'false',
  'a run is unfrozen unless opened by the new code, so every earlier run keeps today''s behavior'
);
select ok(
  has_function_privilege('service_role', 'public.practice_run_item_content(uuid, uuid, uuid[])', 'execute')
  and not has_function_privilege('authenticated', 'public.practice_run_item_content(uuid, uuid, uuid[])', 'execute')
  and not has_function_privilege('anon', 'public.practice_run_item_content(uuid, uuid, uuid[])', 'execute'),
  'only the service role reads a run''s item content'
);
select ok(
  has_function_privilege('service_role', 'public.open_practice_run(uuid, uuid, boolean)', 'execute')
  and has_function_privilege('service_role', 'public.practice_run_items(uuid, uuid)', 'execute')
  and has_function_privilege('service_role',
    'public.record_practice_response(uuid, uuid, uuid, jsonb, numeric, numeric, jsonb)', 'execute')
  and has_function_privilege('authenticated', 'public.my_practice_banks()', 'execute')
  and not has_function_privilege('anon', 'public.open_practice_run(uuid, uuid, boolean)', 'execute')
  and not has_function_privilege('authenticated', 'public.open_practice_run(uuid, uuid, boolean)', 'execute')
  and not has_function_privilege('anon', 'public.my_practice_banks()', 'execute'),
  'the replaced functions keep their grants'
);
select ok(
  not has_function_privilege('service_role', 'private.practice_run_set(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.practice_run_set(uuid)', 'execute'),
  'the run-set helper is callable by no role directly'
);
select is(
  (select array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text)
     from pg_proc p
    where p.oid in ('public.practice_run_item_content(uuid, uuid, uuid[])'::regprocedure,
                    'private.practice_run_set(uuid)'::regprocedure,
                    'public.open_practice_run(uuid, uuid, boolean)'::regprocedure)
      and p.prosecdef
      and p.proconfig @> array['search_path=""']),
  array['open_practice_run(uuid,uuid,boolean)', 'practice_run_item_content(uuid,uuid,uuid[])',
        'private.practice_run_set(uuid)'],
  'the new and replaced definer functions pin an empty search_path'
);

-- ---------------------------------------------------------------------------
-- Neither a student nor the service role reaches the tables
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000002710d1');
select throws_ok($$ select * from public.practice_run_slots $$, '42501', null,
  'a student cannot select a run''s slots');
select throws_ok($$ select * from public.practice_item_snapshots $$, '42501', null,
  'a student cannot select a frozen item');
select throws_ok(
  $$ select * from public.practice_run_item_content('00000000-0000-0000-0000-0000002710d1',
       gen_random_uuid(), array['00000000-0000-0000-0000-0000002710f1'::uuid]) $$,
  '42501', null,
  'a student cannot read a frozen item''s content through the function'
);
reset role;

set local role service_role;
select throws_ok($$ select * from public.practice_item_snapshots $$, '42501', null,
  'the service role reads frozen content only through the function');
select throws_ok(
  $$ insert into public.practice_run_slots (run_id, org_id, ordinal, item_id, digest)
     values (gen_random_uuid(), gen_random_uuid(), 1, gen_random_uuid(), '\x00') $$,
  '42501', null,
  'and never writes a slot: only the function that starts a run does'
);
reset role;

-- ---------------------------------------------------------------------------
-- Starting a run records its items
-- ---------------------------------------------------------------------------

set local role service_role;
insert into ids
  select 'run1', run_id
    from public.open_practice_run('00000000-0000-0000-0000-0000002710d1',
                                  '00000000-0000-0000-0000-0000002710e0', false);
reset role;

select ok((select frozen from public.practice_runs where id = (select id from ids where name = 'run1')),
  'a run opened now is frozen');
select results_eq(
  $$ select item_id, case_study_id, step, ordinal
       from public.practice_run_slots
      where run_id = (select id from ids where name = 'run1')
      order by ordinal $$,
  $$ values ('00000000-0000-0000-0000-0000002710f1'::uuid, null::uuid, null::smallint, 1),
            ('00000000-0000-0000-0000-0000002710f2'::uuid, null::uuid, null::smallint, 2),
            ('00000000-0000-0000-0000-0000002710f5'::uuid, '00000000-0000-0000-0000-0000002710a5'::uuid, 1::smallint, 3),
            ('00000000-0000-0000-0000-0000002710f6'::uuid, '00000000-0000-0000-0000-0000002710a5'::uuid, 2::smallint, 4) $$,
  'starting a run records its items in play order; no draft'
);
select is(
  (select count(*)::integer from public.practice_item_snapshots
    where item_id in ('00000000-0000-0000-0000-0000002710f1', '00000000-0000-0000-0000-0000002710f2',
                      '00000000-0000-0000-0000-0000002710f5', '00000000-0000-0000-0000-0000002710f6')),
  4,
  'with one snapshot of each item''s published content'
);

set local role service_role;
select results_eq(
  $$ select run_id from public.open_practice_run('00000000-0000-0000-0000-0000002710d1',
       '00000000-0000-0000-0000-0000002710e0', false) $$,
  $$ select id from ids where name = 'run1' $$,
  'reopening resumes the run'
);
reset role;
select is(
  (select count(*)::integer from public.practice_run_slots
    where run_id = (select id from ids where name = 'run1')),
  4,
  'and records nothing twice'
);

-- ---------------------------------------------------------------------------
-- The author edits and unpublishes mid-run
-- ---------------------------------------------------------------------------

-- f1 is edited and published again as version 2; f2 goes back to draft with a new key; a new
-- item f9 is published.
update public.items
   set answer_key = '{"correctOptionId":"key_v2_f1"}', rationale = '{"general":"edited"}', version = 2
 where id = '00000000-0000-0000-0000-0000002710f1';
update public.items
   set status = 'draft', answer_key = '{"correctOptionId":"key_draft_f2"}'
 where id = '00000000-0000-0000-0000-0000002710f2';
insert into public.items (id, bank_id, org_id, type, status, content, answer_key, scoring, created_at)
  select '00000000-0000-0000-0000-0000002710f9', '00000000-0000-0000-0000-0000002710e0', org_id,
         'multiple_choice', 'published', '{}', '{"correctOptionId":"key_v1_f9"}', '{}',
         now() + interval '9 seconds'
    from public.profiles where id = '00000000-0000-0000-0000-0000002710a1';

set local role service_role;
select results_eq(
  $$ select item_id from public.practice_run_items('00000000-0000-0000-0000-0000002710d1',
       (select id from ids where name = 'run1')) order by ordinal $$,
  $$ values ('00000000-0000-0000-0000-0000002710f1'::uuid), ('00000000-0000-0000-0000-0000002710f2'::uuid),
            ('00000000-0000-0000-0000-0000002710f5'::uuid), ('00000000-0000-0000-0000-0000002710f6'::uuid) $$,
  'the run still holds the unpublished item, and not the one published since'
);
select results_eq(
  $$ select item_id, answer_key ->> 'correctOptionId', rationale ->> 'general', version, content ->> 'stem'
       from public.practice_run_item_content('00000000-0000-0000-0000-0000002710d1',
         (select id from ids where name = 'run1'),
         array['00000000-0000-0000-0000-0000002710f1'::uuid, '00000000-0000-0000-0000-0000002710f2'::uuid])
      order by item_id $$,
  $$ values ('00000000-0000-0000-0000-0000002710f1'::uuid, 'key_v1_f1', 'as published', 1, 'as published'),
            ('00000000-0000-0000-0000-0000002710f2'::uuid, 'key_v1_f2', 'as published', 1, 'as published') $$,
  'an edited item reads as recorded, and so does an unpublished one'
);
select is_empty(
  $$ select * from public.practice_run_item_content('00000000-0000-0000-0000-0000002710d1',
       (select id from ids where name = 'run1'), array['00000000-0000-0000-0000-0000002710f9'::uuid]) $$,
  'an item published since is not the run''s'
);
select is_empty(
  $$ select * from public.practice_run_item_content('00000000-0000-0000-0000-0000002710d2',
       (select id from ids where name = 'run1'), array['00000000-0000-0000-0000-0000002710f1'::uuid]) $$,
  'another student reads nothing of the run'
);
select is(
  public.record_practice_response('00000000-0000-0000-0000-0000002710d1',
    (select id from ids where name = 'run1'), '00000000-0000-0000-0000-0000002710f2',
    '{}', 1, 1, '{"points":1}'),
  'recorded',
  'the unpublished item is still answered in the run'
);
select is(
  public.record_practice_response('00000000-0000-0000-0000-0000002710d1',
    (select id from ids where name = 'run1'), '00000000-0000-0000-0000-0000002710f9',
    '{}', 0, 1, '{}'),
  'not_found',
  'the item published since is not'
);
select results_eq(
  $$ select item_id from public.practice_run_items('00000000-0000-0000-0000-0000002710d1',
       (select id from ids where name = 'run1')) where answered $$,
  $$ values ('00000000-0000-0000-0000-0000002710f2'::uuid) $$,
  'the run says which items are answered'
);
reset role;

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000002710d1');
select results_eq(
  $$ select item_count, answered from public.my_practice_banks() $$,
  $$ values (4, 1) $$,
  'the Practice list counts the frozen run''s items'
);
reset role;

-- ---------------------------------------------------------------------------
-- Start over records the bank as it is now
-- ---------------------------------------------------------------------------

set local role service_role;
insert into ids
  select 'run2', run_id
    from public.open_practice_run('00000000-0000-0000-0000-0000002710d1',
                                  '00000000-0000-0000-0000-0000002710e0', true);
select results_eq(
  $$ select item_id from public.practice_run_items('00000000-0000-0000-0000-0000002710d1',
       (select id from ids where name = 'run2')) order by ordinal $$,
  $$ values ('00000000-0000-0000-0000-0000002710f1'::uuid), ('00000000-0000-0000-0000-0000002710f9'::uuid),
            ('00000000-0000-0000-0000-0000002710f5'::uuid), ('00000000-0000-0000-0000-0000002710f6'::uuid) $$,
  'a new run holds the bank''s published items now'
);
select is(
  (select answer_key ->> 'correctOptionId'
     from public.practice_run_item_content('00000000-0000-0000-0000-0000002710d1',
       (select id from ids where name = 'run2'), array['00000000-0000-0000-0000-0000002710f1'::uuid])),
  'key_v2_f1',
  'with the edited item''s new version'
);
select is_empty(
  $$ select * from public.practice_run_item_content('00000000-0000-0000-0000-0000002710d1',
       (select id from ids where name = 'run1'), array['00000000-0000-0000-0000-0000002710f1'::uuid]) $$,
  'the old run no longer reads'
);
reset role;

select is(
  (select count(*)::integer from public.practice_item_snapshots
    where item_id = '00000000-0000-0000-0000-0000002710f5'),
  1,
  'content that did not change is stored once, however many runs hold it'
);
select is(
  (select count(*)::integer from public.practice_item_snapshots
    where item_id = '00000000-0000-0000-0000-0000002710f1'),
  2,
  'an edited item has one snapshot per published content'
);

-- ---------------------------------------------------------------------------
-- Stopping the share stops the frozen run at once
-- ---------------------------------------------------------------------------

delete from public.bank_practice_shares where bank_id = '00000000-0000-0000-0000-0000002710e0';

set local role service_role;
select is_empty(
  $$ select * from public.practice_run_items('00000000-0000-0000-0000-0000002710d1',
       (select id from ids where name = 'run2')) $$,
  'once the share stops, the frozen run lists nothing'
);
select is_empty(
  $$ select * from public.practice_run_item_content('00000000-0000-0000-0000-0000002710d1',
       (select id from ids where name = 'run2'), array['00000000-0000-0000-0000-0000002710f1'::uuid]) $$,
  'reads no content'
);
select is(
  public.record_practice_response('00000000-0000-0000-0000-0000002710d1',
    (select id from ids where name = 'run2'), '00000000-0000-0000-0000-0000002710f1',
    '{}', 0, 1, '{}'),
  'not_found',
  'and takes no answer'
);
reset role;

-- ---------------------------------------------------------------------------
-- A run started before the freeze keeps today's behavior
-- ---------------------------------------------------------------------------

insert into public.bank_practice_shares (org_id, bank_id, class_id, shared_by)
  select org_id, '00000000-0000-0000-0000-0000002710e0', '00000000-0000-0000-0000-0000002710c1',
         '00000000-0000-0000-0000-0000002710a1'
    from public.profiles where id = '00000000-0000-0000-0000-0000002710a1';

-- As the migration leaves an earlier run: frozen = false and no slots. Newest, so it is live.
insert into public.practice_runs (id, org_id, student_id, bank_id, started_at)
  select '00000000-0000-0000-0000-0000002710b9', org_id, '00000000-0000-0000-0000-0000002710d1',
         '00000000-0000-0000-0000-0000002710e0', clock_timestamp() + interval '1 hour'
    from public.profiles where id = '00000000-0000-0000-0000-0000002710a1';
update public.items set status = 'draft' where id = '00000000-0000-0000-0000-0000002710f9';

set local role service_role;
select results_eq(
  $$ select run_id from public.open_practice_run('00000000-0000-0000-0000-0000002710d1',
       '00000000-0000-0000-0000-0000002710e0', false) $$,
  $$ values ('00000000-0000-0000-0000-0000002710b9'::uuid) $$,
  'an earlier run resumes'
);
select results_eq(
  $$ select item_id from public.practice_run_items('00000000-0000-0000-0000-0000002710d1',
       '00000000-0000-0000-0000-0000002710b9') order by ordinal $$,
  $$ values ('00000000-0000-0000-0000-0000002710f1'::uuid),
            ('00000000-0000-0000-0000-0000002710f5'::uuid), ('00000000-0000-0000-0000-0000002710f6'::uuid) $$,
  'and reads the bank''s current published items, as before'
);
select is(
  (select answer_key ->> 'correctOptionId'
     from public.practice_run_item_content('00000000-0000-0000-0000-0000002710d1',
       '00000000-0000-0000-0000-0000002710b9', array['00000000-0000-0000-0000-0000002710f1'::uuid])),
  'key_v2_f1',
  'with each item''s current content'
);
select is_empty(
  $$ select * from public.practice_run_item_content('00000000-0000-0000-0000-0000002710d1',
       '00000000-0000-0000-0000-0000002710b9', array['00000000-0000-0000-0000-0000002710f9'::uuid]) $$,
  'and never an item that is not published now'
);
reset role;
select is(
  (select count(*)::integer from public.practice_run_slots
    where run_id = '00000000-0000-0000-0000-0000002710b9'),
  0,
  'resuming an earlier run freezes nothing'
);

-- ---------------------------------------------------------------------------
-- A step shared by two playable case studies is recorded once, where it first plays
-- ---------------------------------------------------------------------------

insert into public.case_studies (id, bank_id, org_id, title, ehr, status, created_at)
  select '00000000-0000-0000-0000-0000002710a7', '00000000-0000-0000-0000-0000002710e0', org_id,
         'Second case', '{}', 'published', now() + interval '1 day'
    from public.profiles where id = '00000000-0000-0000-0000-0000002710a1';
insert into public.case_study_items (case_study_id, org_id, bank_id, position, item_id)
  select '00000000-0000-0000-0000-0000002710a7', org_id, '00000000-0000-0000-0000-0000002710e0',
         1, '00000000-0000-0000-0000-0000002710f5'
    from public.profiles where id = '00000000-0000-0000-0000-0000002710a1';
-- The earlier run above starts an hour ahead; out of the way, so the new run is the newest.
delete from public.practice_runs where id = '00000000-0000-0000-0000-0000002710b9';

set local role service_role;
insert into ids
  select 'run3', run_id
    from public.open_practice_run('00000000-0000-0000-0000-0000002710d1',
                                  '00000000-0000-0000-0000-0000002710e0', true);
select results_eq(
  $$ select item_id, ordinal from public.practice_run_items('00000000-0000-0000-0000-0000002710d1',
       (select id from ids where name = 'run3')) order by ordinal $$,
  $$ values ('00000000-0000-0000-0000-0000002710f1'::uuid, 1::bigint),
            ('00000000-0000-0000-0000-0000002710f5'::uuid, 2::bigint),
            ('00000000-0000-0000-0000-0000002710f6'::uuid, 3::bigint) $$,
  'a run still opens, holding the shared step once, numbered without a gap'
);
reset role;

select * from finish();
rollback;
