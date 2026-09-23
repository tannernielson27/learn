-- Bulk import (#109): an import can land in a folder of its bank, in the same single call.
-- Runs with `pnpm exec supabase test db`. Uses its own fixture ids so it never counts the seed's rows.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- ---------------------------------------------------------------------------
-- Fixtures, as the superuser
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-0000000009aa', 'impf-a@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000009bb', 'impf-b@example.test', 'authenticated', 'authenticated');

-- #204: the sign-up trigger grants no role, so make these accounts instructors in the seeded
-- org explicitly, where the trigger used to put them.
update public.profiles
  set org_id = (select id from public.orgs order by created_at, id limit 1), role = 'instructor'
  where id in ('00000000-0000-0000-0000-0000000009aa',
               '00000000-0000-0000-0000-0000000009bb');

-- B moves to a second org, to check isolation.
insert into public.orgs (id, name) values ('00000000-0000-0000-0000-0000000009f2', 'Other folder import');
update public.profiles set org_id = '00000000-0000-0000-0000-0000000009f2'
  where id = '00000000-0000-0000-0000-0000000009bb';

-- Two banks in A's org, with a Cardiac folder in the first; B's org has a bank and folder too.
insert into public.item_banks (id, org_id, name)
  select v.id, p.org_id, v.name
  from public.profiles p,
       (values ('00000000-0000-0000-0000-0000000009b1'::uuid, 'Folder import bank'),
               ('00000000-0000-0000-0000-0000000009b2'::uuid, 'Second bank')) as v(id, name)
  where p.id = '00000000-0000-0000-0000-0000000009aa';
insert into public.bank_folders (id, bank_id, org_id, name)
  select '00000000-0000-0000-0000-0000000009c1', b.id, b.org_id, 'Cardiac'
  from public.item_banks b where b.id = '00000000-0000-0000-0000-0000000009b1';
insert into public.item_banks (id, org_id, name)
  values ('00000000-0000-0000-0000-0000000009b3', '00000000-0000-0000-0000-0000000009f2', 'B bank');
insert into public.bank_folders (id, bank_id, org_id, name)
  values ('00000000-0000-0000-0000-0000000009c3', '00000000-0000-0000-0000-0000000009b3',
          '00000000-0000-0000-0000-0000000009f2', 'B folder');

create temporary table import_fixtures as
  select
    jsonb_build_object(
      'type', 'multiple_choice',
      'cjmm_step', null,
      'tags', '[]'::jsonb,
      'content', jsonb_build_object(
        'id', 'id_from_the_file',
        'stem', jsonb_build_object('kind', 'markdown', 'value', 'Which comes first?')),
      'answer_key', jsonb_build_object('correctOptionId', 'a'),
      'rationale', '{}'::jsonb,
      'scoring', jsonb_build_object('model', 'zero_one', 'maxPoints', 1)
    ) as item;
grant select on import_fixtures to authenticated, anon;

-- ---------------------------------------------------------------------------
-- As A: author in the banks' org
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000009aa","role":"authenticated"}', true);

select lives_ok(
  $$ select public.import_bank_content(
       '00000000-0000-0000-0000-0000000009b1',
       (select jsonb_build_array(item, item, item) from import_fixtures),
       null,
       '00000000-0000-0000-0000-0000000009c1') $$,
  'A can import three items into a folder of their bank'
);

select is(
  (select count(*)::int from public.items
    where bank_id = '00000000-0000-0000-0000-0000000009b1'
      and folder_id = '00000000-0000-0000-0000-0000000009c1'),
  3,
  'all three items are filed in the folder'
);

select lives_ok(
  $$ select public.import_bank_content(
       '00000000-0000-0000-0000-0000000009b1',
       null,
       (select jsonb_build_object(
          'title', 'Filed case', 'tags', '[]'::jsonb, 'ehr', '{}'::jsonb,
          'items', jsonb_build_array(item, item, item, item, item, item))
        from import_fixtures),
       '00000000-0000-0000-0000-0000000009c1') $$,
  'A can import a case study into the folder'
);

select is(
  (select count(*)::int from public.case_studies
    where bank_id = '00000000-0000-0000-0000-0000000009b1'
      and folder_id = '00000000-0000-0000-0000-0000000009c1'),
  1,
  'the case study is filed in the folder, with its steps'
);

select lives_ok(
  $$ select public.import_bank_content(
       '00000000-0000-0000-0000-0000000009b1',
       (select jsonb_build_array(item) from import_fixtures),
       null) $$,
  'an import without a folder still works, with three arguments'
);

select throws_ok(
  $$ select public.import_bank_content(
       '00000000-0000-0000-0000-0000000009b2',
       (select jsonb_build_array(item) from import_fixtures),
       null,
       '00000000-0000-0000-0000-0000000009c1') $$,
  '23503', null,
  'a folder from another bank is refused'
);

select throws_ok(
  $$ select public.import_bank_content(
       '00000000-0000-0000-0000-0000000009b1',
       (select jsonb_build_array(item) from import_fixtures),
       null,
       '00000000-0000-0000-0000-0000000009c3') $$,
  '23503', null,
  'a folder in another org is refused, and reads as not found'
);

select results_eq(
  $$ select count(*)::int, count(folder_id)::int from public.items
     where bank_id = '00000000-0000-0000-0000-0000000009b1' $$,
  $$ values (10, 9) $$,
  'refused imports wrote nothing: nine filed items (three plus six steps) and one unfiled'
);

-- ---------------------------------------------------------------------------
-- As anon
-- ---------------------------------------------------------------------------

set local role anon;
select throws_ok(
  $$ select public.import_bank_content(
       '00000000-0000-0000-0000-0000000009b1', '[]'::jsonb, null,
       '00000000-0000-0000-0000-0000000009c1') $$,
  '42501', null,
  'anon cannot call the import function'
);

select * from finish();
rollback;
