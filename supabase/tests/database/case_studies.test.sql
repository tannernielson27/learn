-- Case study steps (#86): same-bank steps, atomic reordering, and access. Runs with
-- `pnpm exec supabase test db`. Uses its own fixture ids so it never counts the seed's rows.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- ---------------------------------------------------------------------------
-- Fixtures, as the superuser
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-0000000001aa', 'cs-a@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000001bb', 'cs-b@example.test', 'authenticated', 'authenticated');

-- B moves to a second org, to check isolation.
insert into public.orgs (id, name) values ('00000000-0000-0000-0000-0000000001f2', 'Other CS');
update public.profiles set org_id = '00000000-0000-0000-0000-0000000001f2'
  where id = '00000000-0000-0000-0000-0000000001bb';

create temporary table cs_ids as
  select (select org_id from public.profiles where id = '00000000-0000-0000-0000-0000000001aa') as org_a;
grant select on cs_ids to authenticated, anon;

-- Two banks in A's org, one case study in the first, three items in it and one in the second.
-- The ids are cast: in a UNION an untyped literal resolves to text, not the column's uuid.
insert into public.item_banks (id, org_id, name)
  select '00000000-0000-0000-0000-0000000001b1'::uuid, org_a, 'Case bank' from cs_ids
  union all
  select '00000000-0000-0000-0000-0000000001b2'::uuid, org_a, 'Other bank' from cs_ids;
insert into public.case_studies (id, bank_id, org_id, title, ehr)
  select '00000000-0000-0000-0000-0000000001c1', '00000000-0000-0000-0000-0000000001b1', org_a,
    'Case', '{}' from cs_ids;
insert into public.items (id, bank_id, org_id, type, content, answer_key, scoring)
  select v.id::uuid, v.bank::uuid, org_a, 'multiple_choice', '{}', '{}', '{}'
  from cs_ids, (values
    ('00000000-0000-0000-0000-0000000001e1', '00000000-0000-0000-0000-0000000001b1'),
    ('00000000-0000-0000-0000-0000000001e2', '00000000-0000-0000-0000-0000000001b1'),
    ('00000000-0000-0000-0000-0000000001e3', '00000000-0000-0000-0000-0000000001b1'),
    ('00000000-0000-0000-0000-0000000001e4', '00000000-0000-0000-0000-0000000001b1'),
    ('00000000-0000-0000-0000-0000000001e9', '00000000-0000-0000-0000-0000000001b2')
  ) as v(id, bank);

-- ---------------------------------------------------------------------------
-- As A: author in the case study's org
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000001aa","role":"authenticated"}', true);

select lives_ok(
  $$ insert into public.case_study_items (case_study_id, org_id, bank_id, position, item_id)
     select '00000000-0000-0000-0000-0000000001c1', org_a, '00000000-0000-0000-0000-0000000001b1',
            p.pos, p.item::uuid
     from cs_ids, (values (1, '00000000-0000-0000-0000-0000000001e1'),
                          (2, '00000000-0000-0000-0000-0000000001e2')) as p(pos, item) $$,
  'A can place items from the case study''s own bank as steps'
);

select throws_ok(
  $$ insert into public.case_study_items (case_study_id, org_id, bank_id, position, item_id)
     select '00000000-0000-0000-0000-0000000001c1', org_a, '00000000-0000-0000-0000-0000000001b1',
            3, '00000000-0000-0000-0000-0000000001e9' from cs_ids $$,
  '23503', null,
  'a step cannot use an item from another bank, even in the same org'
);

select throws_ok(
  $$ insert into public.case_study_items (case_study_id, org_id, bank_id, position, item_id)
     select '00000000-0000-0000-0000-0000000001c1', org_a, '00000000-0000-0000-0000-0000000001b2',
            3, '00000000-0000-0000-0000-0000000001e9' from cs_ids $$,
  '23503', null,
  'a step cannot claim a different bank from its case study'
);

select lives_ok(
  $$ select public.reorder_case_study_steps(
       '00000000-0000-0000-0000-0000000001c1',
       array['00000000-0000-0000-0000-0000000001e2', '00000000-0000-0000-0000-0000000001e1']::uuid[]) $$,
  'A can swap two steps in one call'
);

select results_eq(
  $$ select item_id from public.case_study_items
     where case_study_id = '00000000-0000-0000-0000-0000000001c1' order by position $$,
  $$ values ('00000000-0000-0000-0000-0000000001e2'::uuid), ('00000000-0000-0000-0000-0000000001e1'::uuid) $$,
  'the swap took effect, with no two steps ever sharing a position'
);

select results_eq(
  $$ select cjmm_step::int from public.items
     where id in ('00000000-0000-0000-0000-0000000001e2', '00000000-0000-0000-0000-0000000001e1')
     order by cjmm_step $$,
  $$ values (1), (2) $$,
  'each moved item''s CJMM step follows its new position'
);

select throws_ok(
  $$ select public.reorder_case_study_steps(
       '00000000-0000-0000-0000-0000000001c1',
       array['00000000-0000-0000-0000-0000000001e1', '00000000-0000-0000-0000-0000000001e3']::uuid[]) $$,
  '22023', null,
  'a reorder naming an item that is not a step is refused'
);

select throws_ok(
  $$ select public.reorder_case_study_steps(
       '00000000-0000-0000-0000-0000000001c1',
       array['00000000-0000-0000-0000-0000000001e1', '00000000-0000-0000-0000-0000000001e1']::uuid[]) $$,
  '22023', null,
  'a reorder naming one step twice is refused'
);

select throws_ok(
  $$ delete from public.items where id = '00000000-0000-0000-0000-0000000001e1' $$,
  '23503', null,
  'an item that is a step cannot be deleted while the case study uses it'
);

select lives_ok(
  $$ select public.place_case_study_step('00000000-0000-0000-0000-0000000001c1', 3::smallint,
       '00000000-0000-0000-0000-0000000001e3') $$,
  'A can place an item at an empty step through the function'
);

select lives_ok(
  $$ select public.place_case_study_step('00000000-0000-0000-0000-0000000001c1', 3::smallint,
       '00000000-0000-0000-0000-0000000001e4') $$,
  'A can replace the item at a step'
);

select results_eq(
  $$ select csi.item_id, i.cjmm_step::int from public.case_study_items csi
     join public.items i on i.id = csi.item_id
     where csi.case_study_id = '00000000-0000-0000-0000-0000000001c1' and csi.position = 3 $$,
  $$ values ('00000000-0000-0000-0000-0000000001e4'::uuid, 3) $$,
  'the replacement holds the step, and its CJMM step matches the position, in one call'
);

select throws_ok(
  $$ select public.place_case_study_step('00000000-0000-0000-0000-0000000001c1', 4::smallint,
       '00000000-0000-0000-0000-0000000001e9') $$,
  '23503', null,
  'the function refuses an item from another bank'
);

select throws_ok(
  $$ select public.place_case_study_step('00000000-0000-0000-0000-0000000001c1', 5::smallint,
       '00000000-0000-0000-0000-0000000001e1') $$,
  '23505', null,
  'the function refuses an item that is already another step'
);

-- ---------------------------------------------------------------------------
-- As B: author in another org
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000001bb","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.case_study_items
   where case_study_id = '00000000-0000-0000-0000-0000000001c1'),
  0,
  'B cannot see the steps of a case study in another org'
);

select throws_ok(
  $$ select public.reorder_case_study_steps(
       '00000000-0000-0000-0000-0000000001c1',
       array['00000000-0000-0000-0000-0000000001e1', '00000000-0000-0000-0000-0000000001e2']::uuid[]) $$,
  '22023', null,
  'B cannot reorder another org''s case study: its steps are invisible, so the order is refused'
);

select throws_ok(
  $$ select public.place_case_study_step('00000000-0000-0000-0000-0000000001c1', 6::smallint,
       '00000000-0000-0000-0000-0000000001e3') $$,
  '22023', null,
  'B cannot place a step in another org''s case study: it reads as not found'
);

-- ---------------------------------------------------------------------------
-- As anon
-- ---------------------------------------------------------------------------

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$ select public.reorder_case_study_steps('00000000-0000-0000-0000-0000000001c1', array[]::uuid[]) $$,
  '42501', null,
  'anon cannot call the reorder function'
);

-- ---------------------------------------------------------------------------
-- Back as the superuser: the refused reorders changed nothing
-- ---------------------------------------------------------------------------

reset role;

select results_eq(
  $$ select item_id from public.case_study_items
     where case_study_id = '00000000-0000-0000-0000-0000000001c1' order by position $$,
  $$ values ('00000000-0000-0000-0000-0000000001e2'::uuid), ('00000000-0000-0000-0000-0000000001e1'::uuid),
            ('00000000-0000-0000-0000-0000000001e4'::uuid) $$,
  'refused reorders and placements left the steps as A last set them'
);

select * from finish();
rollback;
