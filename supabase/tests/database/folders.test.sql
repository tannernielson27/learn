-- Bank folders (#103): nested folders per bank, content filed by folder, org-scoped by RLS.
-- Runs with `pnpm exec supabase test db`. Uses its own fixture ids so it never counts the seed's rows.
begin;
create extension if not exists pgtap with schema extensions;
select plan(47);

-- ---------------------------------------------------------------------------
-- Fixtures, as the superuser
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-0000000003aa', 'fold-a@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000003bb', 'fold-b@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000003cc', 'fold-c@example.test', 'authenticated', 'authenticated');

-- B moves to a second org; C is a student in A's org.
insert into public.orgs (id, name) values ('00000000-0000-0000-0000-0000000003f2', 'Other folders');
update public.profiles set org_id = '00000000-0000-0000-0000-0000000003f2'
  where id = '00000000-0000-0000-0000-0000000003bb';
update public.profiles set role = 'student'
  where id = '00000000-0000-0000-0000-0000000003cc';

insert into public.item_banks (id, org_id, name)
  select bank.id, p.org_id, bank.name
  from public.profiles p,
       (values ('00000000-0000-0000-0000-0000000003b1'::uuid, 'Folder bank'),
               ('00000000-0000-0000-0000-0000000003b2'::uuid, 'Second bank')) as bank(id, name)
  where p.id = '00000000-0000-0000-0000-0000000003aa';

insert into public.items (id, bank_id, org_id, type, version, status, content, answer_key, scoring)
  select item.id, item.bank_id, p.org_id, 'multiple_choice', 3, 'published',
         '{"stem":{"kind":"markdown","value":"Filed"}}', '{"correctOptionId":"a"}',
         '{"model":"zero_one","maxPoints":1}'
  from public.profiles p,
       (values ('00000000-0000-0000-0000-0000000003e1'::uuid, '00000000-0000-0000-0000-0000000003b1'::uuid),
               ('00000000-0000-0000-0000-0000000003e2'::uuid, '00000000-0000-0000-0000-0000000003b2'::uuid))
         as item(id, bank_id)
  where p.id = '00000000-0000-0000-0000-0000000003aa';

insert into public.case_studies (id, bank_id, org_id, title, ehr)
  select '00000000-0000-0000-0000-0000000003c1', '00000000-0000-0000-0000-0000000003b1', org_id,
         'Filed case', '{}'
  from public.profiles where id = '00000000-0000-0000-0000-0000000003aa';

create temporary table fold_ids as
  select org_id as org_a from public.profiles where id = '00000000-0000-0000-0000-0000000003aa';
grant select on fold_ids to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Structure and privileges
-- ---------------------------------------------------------------------------

select has_table('public', 'bank_folders', 'bank_folders exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.bank_folders'::regclass),
  'RLS is enabled on bank_folders'
);
select ok(
  not has_table_privilege('authenticated', 'public.bank_folders', 'TRUNCATE')
  and not has_table_privilege('authenticated', 'public.bank_folders', 'REFERENCES')
  and not has_table_privilege('authenticated', 'public.bank_folders', 'TRIGGER'),
  'signed-in users have no truncate, references or trigger privilege on bank_folders'
);
select is(
  (select prosecdef from pg_proc where oid = 'public.move_to_folder(uuid, uuid[], uuid[], uuid)'::regprocedure),
  false,
  'move_to_folder runs as the caller, under their RLS'
);

-- ---------------------------------------------------------------------------
-- As A: author in the banks' org
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000003aa","role":"authenticated"}', true);

select lives_ok(
  $$ insert into public.bank_folders (id, bank_id, org_id, name)
     select '00000000-0000-0000-0000-0000000003d1', '00000000-0000-0000-0000-0000000003b1', org_a, 'Cardiac'
     from fold_ids $$,
  'A can create a top-level folder in their bank'
);
select lives_ok(
  $$ insert into public.bank_folders (id, bank_id, org_id, parent_id, name)
     select '00000000-0000-0000-0000-0000000003d2', '00000000-0000-0000-0000-0000000003b1', org_a,
            '00000000-0000-0000-0000-0000000003d1', 'Heart failure'
     from fold_ids $$,
  'A can create a folder inside a folder'
);
select is(
  (select depth::int from public.bank_folders where id = '00000000-0000-0000-0000-0000000003d2'),
  2,
  'a nested folder''s depth is set from its parent'
);
select throws_ok(
  $$ insert into public.bank_folders (bank_id, org_id, name)
     select '00000000-0000-0000-0000-0000000003b1', org_a, 'cardiac' from fold_ids $$,
  '23505', null,
  'two sibling folders cannot share a name, whatever its case'
);
select lives_ok(
  $$ insert into public.bank_folders (id, bank_id, org_id, name)
     select '00000000-0000-0000-0000-0000000003d5', '00000000-0000-0000-0000-0000000003b2', org_a,
            'Cardiac' from fold_ids $$,
  'another bank can have a folder of the same name'
);
select throws_ok(
  $$ insert into public.bank_folders (bank_id, org_id, name)
     select '00000000-0000-0000-0000-0000000003b1', org_a, 'Cardiac/Renal' from fold_ids $$,
  '23514', null,
  'a folder name cannot contain a slash'
);
select throws_ok(
  $$ insert into public.bank_folders (bank_id, org_id, name)
     select '00000000-0000-0000-0000-0000000003b1', org_a, '   ' from fold_ids $$,
  '23514', null,
  'a folder name cannot be blank'
);
select throws_ok(
  $$ insert into public.bank_folders (bank_id, org_id, name)
     select '00000000-0000-0000-0000-0000000003b1', org_a, repeat('x', 81) from fold_ids $$,
  '23514', null,
  'a folder name is at most 80 characters'
);
select lives_ok(
  $$ insert into public.bank_folders (id, bank_id, org_id, name, depth)
     select '00000000-0000-0000-0000-0000000003d6', '00000000-0000-0000-0000-0000000003b1', org_a,
            'Given depth', 4 from fold_ids $$,
  'A can create a folder while sending a depth'
);
select is(
  (select depth::int from public.bank_folders where id = '00000000-0000-0000-0000-0000000003d6'),
  1,
  'a depth sent on insert is replaced by the one worked out from the parent'
);
select lives_ok(
  $$ insert into public.bank_folders (id, bank_id, org_id, parent_id, name)
     select '00000000-0000-0000-0000-0000000003d3', '00000000-0000-0000-0000-0000000003b1', org_a,
            '00000000-0000-0000-0000-0000000003d2', 'Level three' from fold_ids $$,
  'folders nest three levels deep'
);
select lives_ok(
  $$ insert into public.bank_folders (id, bank_id, org_id, parent_id, name)
     select '00000000-0000-0000-0000-0000000003d4', '00000000-0000-0000-0000-0000000003b1', org_a,
            '00000000-0000-0000-0000-0000000003d3', 'Level four' from fold_ids $$,
  'folders nest four levels deep'
);
select throws_ok(
  $$ insert into public.bank_folders (bank_id, org_id, parent_id, name)
     select '00000000-0000-0000-0000-0000000003b1', org_a, '00000000-0000-0000-0000-0000000003d4',
            'Level five' from fold_ids $$,
  '23514', null,
  'a fifth level is refused'
);
select throws_ok(
  $$ insert into public.bank_folders (bank_id, org_id, parent_id, name)
     select '00000000-0000-0000-0000-0000000003b2', org_a, '00000000-0000-0000-0000-0000000003d1',
            'Crossed' from fold_ids $$,
  '23503', null,
  'a folder''s parent must be in the same bank'
);

select lives_ok(
  $$ update public.items set folder_id = '00000000-0000-0000-0000-0000000003d1'
     where id = '00000000-0000-0000-0000-0000000003e1' $$,
  'A can move an item into a folder in its bank'
);
select results_eq(
  $$ select status::text, version, content->'stem'->>'value', folder_id
     from public.items where id = '00000000-0000-0000-0000-0000000003e1' $$,
  $$ values ('published'::text, 3, 'Filed'::text, '00000000-0000-0000-0000-0000000003d1'::uuid) $$,
  'moving an item changes only its folder, never its status, version or content'
);
select throws_ok(
  $$ update public.items set folder_id = '00000000-0000-0000-0000-0000000003d1'
     where id = '00000000-0000-0000-0000-0000000003e2' $$,
  '23503', null,
  'an item cannot be filed in another bank''s folder'
);
select lives_ok(
  $$ update public.case_studies set folder_id = '00000000-0000-0000-0000-0000000003d2'
     where id = '00000000-0000-0000-0000-0000000003c1' $$,
  'A can move a case study into a folder in its bank'
);

select throws_ok(
  $$ delete from public.bank_folders where id = '00000000-0000-0000-0000-0000000003d2' $$,
  '23503', null,
  'a folder holding a case study or a folder cannot be deleted'
);
select throws_ok(
  $$ delete from public.bank_folders where id = '00000000-0000-0000-0000-0000000003d1' $$,
  '23503', null,
  'a folder holding an item cannot be deleted'
);
select lives_ok(
  $$ delete from public.bank_folders where id = '00000000-0000-0000-0000-0000000003d4' $$,
  'an empty folder can be deleted'
);

select throws_ok(
  $$ update public.bank_folders set parent_id = null
     where id = '00000000-0000-0000-0000-0000000003d2' $$,
  '42501', null,
  'a folder cannot be moved under another parent, so it can never contain itself'
);
select throws_ok(
  $$ update public.bank_folders set bank_id = '00000000-0000-0000-0000-0000000003b2'
     where id = '00000000-0000-0000-0000-0000000003d1' $$,
  '42501', null,
  'a folder cannot be moved to another bank'
);
select lives_ok(
  $$ update public.bank_folders set name = 'Cardiology'
     where id = '00000000-0000-0000-0000-0000000003d1' $$,
  'A can rename a folder'
);
select throws_ok(
  $$ update public.bank_folders set name = 'CARDIOLOGY'
     where id = '00000000-0000-0000-0000-0000000003d6' $$,
  '23505', null,
  'a rename cannot take a sibling''s name, whatever its case'
);

select is(
  public.move_to_folder(
    '00000000-0000-0000-0000-0000000003b1',
    array['00000000-0000-0000-0000-0000000003e1']::uuid[],
    array['00000000-0000-0000-0000-0000000003c1']::uuid[]),
  '{"items": 1, "case_studies": 1}'::jsonb,
  'A moves an item and a case study to Unfiled in one call'
);
select is(
  (select count(*)::int from public.items
    where id = '00000000-0000-0000-0000-0000000003e1' and folder_id is null)
  + (select count(*)::int from public.case_studies
    where id = '00000000-0000-0000-0000-0000000003c1' and folder_id is null),
  2,
  'both are unfiled after the move'
);
select is(
  public.move_to_folder(
    '00000000-0000-0000-0000-0000000003b1',
    array['00000000-0000-0000-0000-0000000003e1']::uuid[],
    '{}'::uuid[],
    '00000000-0000-0000-0000-0000000003d1'),
  '{"items": 1, "case_studies": 0}'::jsonb,
  'A files the item back in its folder'
);
select throws_ok(
  $$ select public.move_to_folder(
       '00000000-0000-0000-0000-0000000003b1',
       array['00000000-0000-0000-0000-0000000003e1']::uuid[],
       '{}'::uuid[],
       '00000000-0000-0000-0000-0000000003d5') $$,
  '22023', null,
  'a move to another bank''s folder is refused before anything moves'
);
select throws_ok(
  $$ select public.move_to_folder(
       '00000000-0000-0000-0000-0000000003b1',
       array(select gen_random_uuid() from generate_series(1, 201)),
       '{}'::uuid[]) $$,
  '22023', null,
  'a move of more than 200 is refused, even when the function is called directly'
);

-- ---------------------------------------------------------------------------
-- As B: author in another org
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000003bb","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.bank_folders
    where bank_id in ('00000000-0000-0000-0000-0000000003b1', '00000000-0000-0000-0000-0000000003b2')),
  0,
  'B cannot see folders in another org'
);
select throws_ok(
  $$ insert into public.bank_folders (bank_id, org_id, name)
     select '00000000-0000-0000-0000-0000000003b1', org_a, 'Sneaky' from fold_ids $$,
  '42501', null,
  'B cannot create a folder in another org''s bank'
);
select lives_ok(
  $$ update public.bank_folders set name = 'Hijacked'
     where id = '00000000-0000-0000-0000-0000000003d1' $$,
  'B renaming a folder in another org matches no rows'
);
select is(
  public.move_to_folder(
    '00000000-0000-0000-0000-0000000003b1',
    array['00000000-0000-0000-0000-0000000003e1']::uuid[],
    array['00000000-0000-0000-0000-0000000003c1']::uuid[]),
  '{"items": 0, "case_studies": 0}'::jsonb,
  'B moving another org''s content matches nothing'
);

-- ---------------------------------------------------------------------------
-- As C: student in A's org
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000003cc","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.bank_folders
    where bank_id = '00000000-0000-0000-0000-0000000003b1'),
  0,
  'a student cannot see folders'
);

-- ---------------------------------------------------------------------------
-- As anon, then back as the superuser
-- ---------------------------------------------------------------------------

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$ select count(*) from public.bank_folders $$,
  '42501', null,
  'anon has no access to folders'
);
select throws_ok(
  $$ select public.move_to_folder('00000000-0000-0000-0000-0000000003b1', '{}'::uuid[], '{}'::uuid[]) $$,
  '42501', null,
  'anon cannot call move_to_folder'
);

reset role;

select is(
  (select name from public.bank_folders where id = '00000000-0000-0000-0000-0000000003d1'),
  'Cardiology',
  'the folder B tried to rename is unchanged'
);
select is(
  (select folder_id from public.items where id = '00000000-0000-0000-0000-0000000003e1'),
  '00000000-0000-0000-0000-0000000003d1'::uuid,
  'the item B tried to move is still in its folder'
);
select throws_ok(
  $$ update public.bank_folders set parent_id = null
     where id = '00000000-0000-0000-0000-0000000003d2' $$,
  '22023', null,
  'no role can move a folder to another parent, not even one that bypasses column grants'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000003aa","role":"authenticated"}', true);

select lives_ok(
  $$ delete from public.item_banks where id = '00000000-0000-0000-0000-0000000003b1' $$,
  'deleting a bank takes its folders and filed content with it'
);
select is(
  (select count(*)::int from public.bank_folders
    where bank_id = '00000000-0000-0000-0000-0000000003b1'),
  0,
  'no folders remain for the deleted bank'
);

-- Last, because a TRUNCATE that wrongly succeeds would empty the table for any later test.
select throws_ok(
  $$ truncate public.bank_folders cascade $$,
  '42501', null,
  'a signed-in user cannot truncate folders'
);
reset role;

select * from finish();
rollback;
