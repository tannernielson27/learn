-- Item tags (#104): a GIN index serves the bank page's tag filter, which runs under RLS.
-- Runs with `pnpm exec supabase test db`. Uses its own fixture ids so it never counts the seed's rows.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

-- ---------------------------------------------------------------------------
-- Fixtures, as the superuser
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-0000000004aa', 'tags-a@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000004bb', 'tags-b@example.test', 'authenticated', 'authenticated');

-- #204: the sign-up trigger grants no role, so make these accounts instructors in the seeded
-- org explicitly, where the trigger used to put them.
update public.profiles
  set org_id = (select id from public.orgs order by created_at, id limit 1), role = 'instructor'
  where id in ('00000000-0000-0000-0000-0000000004aa',
               '00000000-0000-0000-0000-0000000004bb');

-- B moves to a second org.
insert into public.orgs (id, name) values ('00000000-0000-0000-0000-0000000004f2', 'Other tags');
update public.profiles set org_id = '00000000-0000-0000-0000-0000000004f2'
  where id = '00000000-0000-0000-0000-0000000004bb';

insert into public.item_banks (id, org_id, name)
  select '00000000-0000-0000-0000-0000000004b1', org_id, 'Tag bank'
  from public.profiles where id = '00000000-0000-0000-0000-0000000004aa';

insert into public.items (id, bank_id, org_id, type, cjmm_step, tags, content, answer_key, scoring)
  select item.id, '00000000-0000-0000-0000-0000000004b1', p.org_id, 'multiple_choice', item.step,
         item.tags, '{"stem":{"kind":"markdown","value":"Tagged"}}', '{"correctOptionId":"a"}',
         '{"model":"zero_one","maxPoints":1}'
  from public.profiles p,
       (values
         ('00000000-0000-0000-0000-0000000004e1'::uuid, 1::smallint,
          array['Physiological Adaptation', 'sepsis']),
         ('00000000-0000-0000-0000-0000000004e2'::uuid, 3::smallint,
          array['Physiological Adaptation', 'renal']),
         ('00000000-0000-0000-0000-0000000004e3'::uuid, null::smallint,
          array['sepsis', 'Physiological Adaptation', 'Management of Care']),
         ('00000000-0000-0000-0000-0000000004e4'::uuid, 1::smallint, array['sepsis']))
         as item(id, step, tags)
  where p.id = '00000000-0000-0000-0000-0000000004aa';

-- Whether the planner reads a query through an index, with sequential scans priced out.
create function pg_temp.plan_uses(query text, index_name text) returns boolean
language plpgsql as $$
declare
  line text;
begin
  for line in execute 'explain ' || query loop
    if strpos(line, index_name) > 0 then return true; end if;
  end loop;
  return false;
end;
$$;

-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------

select has_index('public', 'items', 'items_tags_idx', 'items has a tags index');
select is(
  (select am.amname::text from pg_class c join pg_am am on am.oid = c.relam
   where c.oid = 'public.items_tags_idx'::regclass),
  'gin',
  'the tags index is a GIN index, which serves @> (contains)'
);
select is(
  (select pg_get_indexdef('public.items_tags_idx'::regclass)),
  'CREATE INDEX items_tags_idx ON public.items USING gin (tags)',
  'the tags index covers items.tags'
);

set local enable_seqscan = off;
select ok(
  pg_temp.plan_uses(
    $q$ select id from public.items where tags @> array['Physiological Adaptation', 'sepsis'] $q$,
    'items_tags_idx'
  ),
  'a filter on two tags is served by the tags index'
);
reset enable_seqscan;

select throws_ok(
  $$ update public.items
     set tags = array(select 'topic ' || n from generate_series(1, 21) n)
     where id = '00000000-0000-0000-0000-0000000004e4' $$,
  '23514', null,
  'an item cannot carry more than 20 tags'
);
select lives_ok(
  $$ update public.items
     set tags = array(select 'topic ' || n from generate_series(1, 20) n)
     where id = '00000000-0000-0000-0000-0000000004e4' $$,
  'an item can carry 20 tags'
);
update public.items set tags = array['sepsis'] where id = '00000000-0000-0000-0000-0000000004e4';

-- ---------------------------------------------------------------------------
-- As A: author in the bank's org
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000004aa","role":"authenticated"}', true);

select results_eq(
  $$ select id from public.items
     where bank_id = '00000000-0000-0000-0000-0000000004b1'
       and tags @> array['Physiological Adaptation', 'sepsis']
     order by id $$,
  $$ values ('00000000-0000-0000-0000-0000000004e1'::uuid), ('00000000-0000-0000-0000-0000000004e3'::uuid) $$,
  'two tags combine with AND: only items carrying both are listed'
);
select results_eq(
  $$ select id from public.items
     where bank_id = '00000000-0000-0000-0000-0000000004b1'
       and tags @> array['sepsis'] and cjmm_step = 1
     order by id $$,
  $$ values ('00000000-0000-0000-0000-0000000004e1'::uuid), ('00000000-0000-0000-0000-0000000004e4'::uuid) $$,
  'a tag and a CJMM step combine'
);
select is(
  (select count(*)::int from public.items
   where bank_id = '00000000-0000-0000-0000-0000000004b1' and tags @> array['sepsis', 'cardiac']),
  0,
  'a tag no item carries lists nothing'
);
select is(
  (select count(*)::int from public.items
   where bank_id = '00000000-0000-0000-0000-0000000004b1' and tags @> array['physiological adaptation']),
  0,
  'tags match exactly; the app stores and asks for one spelling'
);
select lives_ok(
  $$ update public.items set tags = array['Physiological Adaptation', 'fluids, electrolytes', 'say "hi"']
     where id = '00000000-0000-0000-0000-0000000004e4' $$,
  'A can retag an item in their org'
);
select results_eq(
  $$ select id from public.items
     where bank_id = '00000000-0000-0000-0000-0000000004b1'
       and tags @> '{"fluids, electrolytes","say \"hi\""}'::text[] $$,
  $$ values ('00000000-0000-0000-0000-0000000004e4'::uuid) $$,
  'a quoted array literal, as the app sends, keeps a comma or quote inside one tag'
);

-- ---------------------------------------------------------------------------
-- As B: author in another org
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000004bb","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.items where tags @> array['Physiological Adaptation']),
  0,
  'another org''s author filters none of A''s items'
);
select is_empty(
  $$ update public.items set tags = array['stolen']
     where id = '00000000-0000-0000-0000-0000000004e1' returning id $$,
  'another org''s author cannot retag A''s items'
);

-- ---------------------------------------------------------------------------
-- As anon
-- ---------------------------------------------------------------------------

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$ select count(*) from public.items where tags @> array['sepsis'] $$,
  '42501', null,
  'anon cannot filter items by tag'
);

reset role;

select * from finish();
rollback;
