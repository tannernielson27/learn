-- JSON import (#90): everything or nothing, new ids, drafts only, the caller's own bank only.
-- Runs with `pnpm exec supabase test db`. Uses its own fixture ids so it never counts the seed's rows.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

-- ---------------------------------------------------------------------------
-- Fixtures, as the superuser
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-0000000002aa', 'imp-a@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000002bb', 'imp-b@example.test', 'authenticated', 'authenticated');

-- #204: the sign-up trigger grants no role, so make these accounts instructors in the seeded
-- org explicitly, where the trigger used to put them.
update public.profiles
  set org_id = (select id from public.orgs order by created_at, id limit 1), role = 'instructor'
  where id in ('00000000-0000-0000-0000-0000000002aa',
               '00000000-0000-0000-0000-0000000002bb');

-- B moves to a second org, to check isolation.
insert into public.orgs (id, name) values ('00000000-0000-0000-0000-0000000002f2', 'Other import');
update public.profiles set org_id = '00000000-0000-0000-0000-0000000002f2'
  where id = '00000000-0000-0000-0000-0000000002bb';

insert into public.item_banks (id, org_id, name)
  select '00000000-0000-0000-0000-0000000002b1', org_id, 'Import bank'
  from public.profiles where id = '00000000-0000-0000-0000-0000000002aa';

-- One item row as the app sends it; the file's own id inside content must never survive.
create temporary table import_fixtures as
  select
    jsonb_build_object(
      'type', 'multiple_choice',
      'cjmm_step', null,
      'tags', jsonb_build_array('imported'),
      'content', jsonb_build_object(
        'id', 'id_from_the_file',
        'stem', jsonb_build_object('kind', 'markdown', 'value', 'Which comes first?')),
      'answer_key', jsonb_build_object('correctOptionId', 'a'),
      'rationale', '{}'::jsonb,
      'scoring', jsonb_build_object('model', 'zero_one', 'maxPoints', 1)
    ) as item;
grant select on import_fixtures to authenticated, anon;

-- ---------------------------------------------------------------------------
-- As A: author in the bank's org
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000002aa","role":"authenticated"}', true);

select lives_ok(
  $$ select public.import_bank_content(
       '00000000-0000-0000-0000-0000000002b1',
       (select jsonb_build_array(item, item) from import_fixtures),
       null) $$,
  'A can import two items into their own bank'
);

select is(
  (select count(*)::int from public.items where bank_id = '00000000-0000-0000-0000-0000000002b1'),
  2,
  'both items are in the bank'
);

select is(
  (select count(*)::int from public.items
    where bank_id = '00000000-0000-0000-0000-0000000002b1'
      and status = 'draft' and version = 1
      and created_by = '00000000-0000-0000-0000-0000000002aa'
      and content->>'id' = id::text),
  2,
  'imported items are drafts at version 1, created by A, with their own new ids in content'
);

select lives_ok(
  $$ select public.import_bank_content(
       '00000000-0000-0000-0000-0000000002b1',
       null,
       (select jsonb_build_object(
          'title', 'Imported case',
          'tags', jsonb_build_array('imported'),
          'ehr', jsonb_build_object('tabs', '[]'::jsonb),
          'items', jsonb_build_array(item, item, item, item, item, item))
        from import_fixtures)) $$,
  'A can import a case study with its six steps'
);

select is(
  (select count(*)::int from public.case_studies
    where bank_id = '00000000-0000-0000-0000-0000000002b1' and status = 'draft'),
  1,
  'the case study is a draft in the bank'
);

select results_eq(
  $$ select csi.position::int, i.cjmm_step::int, (i.bank_id = csi.bank_id) as same_bank
     from public.case_study_items csi
     join public.case_studies cs on cs.id = csi.case_study_id
     join public.items i on i.id = csi.item_id
     where cs.bank_id = '00000000-0000-0000-0000-0000000002b1'
     order by csi.position $$,
  $$ values (1, 1, true), (2, 2, true), (3, 3, true), (4, 4, true), (5, 5, true), (6, 6, true) $$,
  'each step item is placed at its position, pinned to that clinical judgment step, in the same bank'
);

select throws_ok(
  $$ select public.import_bank_content(
       '00000000-0000-0000-0000-0000000002b1',
       null,
       (select jsonb_build_object(
          'title', 'Short case', 'tags', '[]'::jsonb, 'ehr', '{}'::jsonb,
          'items', jsonb_build_array(item, item, item, item, item))
        from import_fixtures)) $$,
  '22023', null,
  'a case study without exactly six steps is refused'
);

select throws_ok(
  $$ select public.import_bank_content(
       '00000000-0000-0000-0000-0000000002b1',
       (select jsonb_build_array(item, item || '{"type": "not_a_type"}'::jsonb) from import_fixtures),
       null) $$,
  '23514', null,
  'an import with one bad entry is refused'
);

select throws_ok(
  $$ select public.import_bank_content(
       '00000000-0000-0000-0000-0000000002b1',
       (select jsonb_build_array(
          jsonb_set(item, '{content,padding}', to_jsonb(repeat('x', 210000))))
        from import_fixtures),
       null) $$,
  '22023', null,
  'an item over 200 KB is refused, even when the function is called directly'
);

select is(
  (select count(*)::int from public.items where bank_id = '00000000-0000-0000-0000-0000000002b1'),
  8,
  'refused imports wrote nothing: still the two items and the six steps'
);

-- ---------------------------------------------------------------------------
-- As B: author in another org
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000002bb","role":"authenticated"}', true);

select throws_ok(
  $$ select public.import_bank_content(
       '00000000-0000-0000-0000-0000000002b1',
       (select jsonb_build_array(item) from import_fixtures),
       null) $$,
  '22023', null,
  'B cannot import into a bank in another org, which reads as not found'
);

-- ---------------------------------------------------------------------------
-- As anon, then back as the superuser
-- ---------------------------------------------------------------------------

set local role anon;
select throws_ok(
  $$ select public.import_bank_content('00000000-0000-0000-0000-0000000002b1', '[]'::jsonb, null) $$,
  '42501', null,
  'anon cannot call the import function'
);

reset role;
select is(
  (select count(*)::int from public.items where bank_id = '00000000-0000-0000-0000-0000000002b1'),
  8,
  'nothing from B or anon reached the bank'
);

select * from finish();
rollback;
