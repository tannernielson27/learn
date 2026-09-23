-- Bank search (#105): full-text search over item text, served by a GIN index, under RLS, one page
-- at a time, with matched words marked for the app to highlight. Runs with
-- `pnpm exec supabase test db`. Uses its own fixture ids so it never counts the seed's rows.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

-- ---------------------------------------------------------------------------
-- Fixtures, as the superuser: a 50-item bank with six items that mention lactate
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-0000000005aa', 'search-a@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000005bb', 'search-b@example.test', 'authenticated', 'authenticated');

-- #204: the sign-up trigger grants no role, so make these accounts instructors in the seeded
-- org explicitly, where the trigger used to put them.
update public.profiles
  set org_id = (select id from public.orgs order by created_at, id limit 1), role = 'instructor'
  where id in ('00000000-0000-0000-0000-0000000005aa',
               '00000000-0000-0000-0000-0000000005bb');

-- B moves to a second org.
insert into public.orgs (id, name) values ('00000000-0000-0000-0000-0000000005f2', 'Other search');
update public.profiles set org_id = '00000000-0000-0000-0000-0000000005f2'
  where id = '00000000-0000-0000-0000-0000000005bb';

insert into public.item_banks (id, org_id, name)
  select '00000000-0000-0000-0000-0000000005b1', org_id, 'Search bank'
  from public.profiles where id = '00000000-0000-0000-0000-0000000005aa';

insert into public.bank_folders (id, bank_id, org_id, name)
  select '00000000-0000-0000-0000-0000000005d1', '00000000-0000-0000-0000-0000000005b1', org_id, 'Sepsis'
  from public.profiles where id = '00000000-0000-0000-0000-0000000005aa';

-- e1: stem, matrix, published, filed, tagged. e2: stem, matrix, draft. e3: the plural in the stem.
-- e4: an option only. e5: the rationale only. e6: HTML and a planted marker character in the stem.
insert into public.items
  (id, bank_id, org_id, folder_id, type, status, tags, content, answer_key, rationale, scoring,
   updated_at)
  select item.id, '00000000-0000-0000-0000-0000000005b1', p.org_id, item.folder, item.type,
         item.status::public.content_status, item.tags, item.content::jsonb,
         '{"correctOptionId":"a"}', item.rationale::jsonb, '{"model":"zero_one","maxPoints":1}',
         now() - item.age
  from public.profiles p,
       (values
         ('00000000-0000-0000-0000-0000000005e1'::uuid, '00000000-0000-0000-0000-0000000005d1'::uuid,
          'matrix_multiple_choice', 'published', array['sepsis'],
          '{"stem":{"kind":"markdown","value":"Which findings suggest a rising lactate?"}}', '{}',
          interval '1 minute'),
         ('00000000-0000-0000-0000-0000000005e2'::uuid, null::uuid,
          'matrix_multiple_choice', 'draft', array[]::text[],
          '{"stem":{"kind":"markdown","value":"Trend the serum lactate over the shift."}}', '{}',
          interval '2 minutes'),
         ('00000000-0000-0000-0000-0000000005e3'::uuid, null::uuid,
          'multiple_choice', 'published', array[]::text[],
          '{"stem":{"kind":"markdown","value":"Two lactates were drawn an hour apart."}}', '{}',
          interval '3 minutes'),
         ('00000000-0000-0000-0000-0000000005e4'::uuid, null::uuid,
          'multiple_choice', 'published', array[]::text[],
          '{"stem":{"kind":"markdown","value":"Which action comes first?"},"options":[{"id":"a","label":"Recheck the serum lactate"},{"id":"b","label":"Call the provider"}]}',
          '{}', interval '4 minutes'),
         ('00000000-0000-0000-0000-0000000005e5'::uuid, null::uuid,
          'multiple_choice', 'draft', array[]::text[],
          '{"stem":{"kind":"markdown","value":"Which finding is the priority?"}}',
          '{"general":{"kind":"markdown","value":"A lactate above 4 signals hypoperfusion."}}',
          interval '5 minutes'),
         ('00000000-0000-0000-0000-0000000005e6'::uuid, null::uuid,
          'multiple_choice', 'draft', array[]::text[],
          '{"stem":{"kind":"markdown","value":"Watch <b>this</b> lactate \u0002 & <script>x</script>"}}',
          '{}', interval '6 minutes'))
         as item(id, folder, type, status, tags, content, rationale, age)
  where p.id = '00000000-0000-0000-0000-0000000005aa';

-- 44 more items that never mention it, older than the six.
insert into public.items (bank_id, org_id, type, content, answer_key, scoring, updated_at)
  select '00000000-0000-0000-0000-0000000005b1', p.org_id, 'multiple_choice',
         jsonb_build_object('stem', jsonb_build_object('kind', 'markdown',
           'value', 'Filler item ' || n || ' about fluid balance')),
         '{"correctOptionId":"a"}', '{"model":"zero_one","maxPoints":1}',
         now() - interval '1 hour' - n * interval '1 minute'
  from public.profiles p, generate_series(1, 44) n
  where p.id = '00000000-0000-0000-0000-0000000005aa';

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

-- How long a query takes, in milliseconds.
create function pg_temp.elapsed_ms(query text) returns numeric
language plpgsql as $$
declare
  started timestamptz := clock_timestamp();
begin
  execute query;
  return extract(epoch from clock_timestamp() - started) * 1000;
end;
$$;

-- How many marked (highlighted) words a headline holds.
create function pg_temp.marks(headline text) returns integer
language sql immutable as $$
  select (length(headline) - length(replace(headline, chr(2), '')))
$$;

-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------

select has_column('public', 'items', 'search_vector', 'items has a search vector');
select is(
  (select attgenerated::text from pg_attribute
   where attrelid = 'public.items'::regclass and attname = 'search_vector'),
  's',
  'the search vector is a stored generated column, so no write path can forget it'
);
select has_index('public', 'items', 'items_search_idx', 'items has a search index');
select is(
  (select pg_get_indexdef('public.items_search_idx'::regclass)),
  'CREATE INDEX items_search_idx ON public.items USING gin (search_vector)',
  'the search index is a GIN index on the search vector'
);

set local enable_seqscan = off;
select ok(
  pg_temp.plan_uses(
    $q$ select id from public.items
        where search_vector @@ websearch_to_tsquery('english', 'lactate') $q$,
    'items_search_idx'
  ),
  'a search is served by the search index'
);
reset enable_seqscan;

select is(
  private.item_search_text(
    '{"kind":"markdown","options":[{"id":"opt-a","label":"One"}],"value":"Hi","meta":{"author":"Bo"}}'
  ),
  'Hi One',
  'item text keeps values and labels, and leaves out ids, kinds and author notes'
);
select ok(
  pg_get_function_result('public.list_bank_items'::regproc) !~ '(answer|rationale jsonb|scoring)',
  'the list returns no answer key, no rationale text and no scoring beyond its maximum'
);

-- ---------------------------------------------------------------------------
-- As A: author in the bank's org
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000005aa","role":"authenticated"}', true);

select results_eq(
  $$ select id from public.list_bank_items('00000000-0000-0000-0000-0000000005b1', 'lactate')
     order by id $$,
  $$ values ('00000000-0000-0000-0000-0000000005e1'::uuid), ('00000000-0000-0000-0000-0000000005e2'::uuid),
            ('00000000-0000-0000-0000-0000000005e3'::uuid), ('00000000-0000-0000-0000-0000000005e4'::uuid),
            ('00000000-0000-0000-0000-0000000005e5'::uuid), ('00000000-0000-0000-0000-0000000005e6'::uuid) $$,
  'a search finds the word in the stem, an option and the rationale, and its plural'
);
select is(
  (select array_agg(distinct total_count)
   from public.list_bank_items('00000000-0000-0000-0000-0000000005b1', 'lactate')),
  array[6::bigint],
  'every row carries the total, for paging'
);
select is(
  (select stem_match from public.list_bank_items('00000000-0000-0000-0000-0000000005b1', 'lactate')
   where id = '00000000-0000-0000-0000-0000000005e1'),
  'Which findings suggest a rising ' || chr(2) || 'lactate' || chr(3) || '?',
  'a stem match comes back whole, with the matched word between markers'
);
select is(
  (select stem_match from public.list_bank_items('00000000-0000-0000-0000-0000000005b1', 'lactate')
   where id = '00000000-0000-0000-0000-0000000005e3'),
  'Two ' || chr(2) || 'lactates' || chr(3) || ' were drawn an hour apart.',
  'the plural is marked too'
);
select results_eq(
  $$ select stem_match is null, strpos(text_match, chr(2) || 'lactate' || chr(3)) > 0, rationale_match
     from public.list_bank_items('00000000-0000-0000-0000-0000000005b1', 'lactate')
     where id = '00000000-0000-0000-0000-0000000005e4' $$,
  $$ values (true, true, false) $$,
  'an option match comes back as a marked snippet of the rest of the item'
);
select results_eq(
  $$ select stem_match, text_match, rationale_match
     from public.list_bank_items('00000000-0000-0000-0000-0000000005b1', 'lactate')
     where id = '00000000-0000-0000-0000-0000000005e5' $$,
  $$ values (null::text, null::text, true) $$,
  'a rationale match is reported without any of its text'
);
select results_eq(
  $$ select pg_temp.marks(stem_match), strpos(stem_match, '<b>this</b>') > 0,
            strpos(stem_match, '<script>x</script>') > 0
     from public.list_bank_items('00000000-0000-0000-0000-0000000005b1', 'lactate')
     where id = '00000000-0000-0000-0000-0000000005e6' $$,
  $$ values (1, true, true) $$,
  'item text comes back as written, and a marker character in it is removed so only matches are marked'
);
select results_eq(
  $$ select stem_match, text_match, rationale_match
     from public.list_bank_items('00000000-0000-0000-0000-0000000005b1')
     where id = '00000000-0000-0000-0000-0000000005e1' $$,
  $$ values (null::text, null::text, false) $$,
  'without a search nothing is marked'
);
select results_eq(
  $$ select id from public.list_bank_items('00000000-0000-0000-0000-0000000005b1', 'lactate',
       item_type => 'matrix_multiple_choice', item_status => 'published') $$,
  $$ values ('00000000-0000-0000-0000-0000000005e1'::uuid) $$,
  'type and status narrow a search'
);
select results_eq(
  $$ select id from public.list_bank_items('00000000-0000-0000-0000-0000000005b1', 'lactate',
       in_folder => '00000000-0000-0000-0000-0000000005d1', with_tags => array['sepsis']) $$,
  $$ values ('00000000-0000-0000-0000-0000000005e1'::uuid) $$,
  'a search combines with a folder and a tag'
);
select is(
  (select count(*)::int from public.list_bank_items('00000000-0000-0000-0000-0000000005b1', 'lactate',
     unfiled_only => true)),
  5,
  'a search combines with Unfiled'
);
select results_eq(
  $$ select id from public.list_bank_items('00000000-0000-0000-0000-0000000005b1', '"serum lactate" -recheck') $$,
  $$ values ('00000000-0000-0000-0000-0000000005e2'::uuid) $$,
  'web search syntax: a quoted phrase, and a word left out with a minus'
);
select results_eq(
  $$ select id from public.list_bank_items('00000000-0000-0000-0000-0000000005b1', 'lactate')
     offset 4 $$,
  $$ values ('00000000-0000-0000-0000-0000000005e4'::uuid), ('00000000-0000-0000-0000-0000000005e5'::uuid) $$,
  'stem matches rank first, then the rest of the item, then the rationale'
);
select results_eq(
  $$ select count(*)::int, min(total_count)::int
     from public.list_bank_items('00000000-0000-0000-0000-0000000005b1', page_size => 20, page_offset => 40) $$,
  $$ values (10, 50) $$,
  'the third page of twenty holds the last ten of fifty'
);
select results_eq(
  $$ select id from public.list_bank_items('00000000-0000-0000-0000-0000000005b1', page_size => 2) $$,
  $$ values ('00000000-0000-0000-0000-0000000005e1'::uuid), ('00000000-0000-0000-0000-0000000005e2'::uuid) $$,
  'without a search the list runs from the most recently edited'
);
select is(
  (select count(*)::int from public.list_bank_items('00000000-0000-0000-0000-0000000005b1', 'the')),
  0,
  'a search of only common words finds nothing, without an error'
);
select cmp_ok(
  pg_temp.elapsed_ms(
    $q$ select * from public.list_bank_items('00000000-0000-0000-0000-0000000005b1', 'lactate') $q$
  ),
  '<',
  300::numeric,
  'a 50-item bank answers a search in under 300 ms'
);
update public.items
  set content = jsonb_set(content, '{stem,value}', '"Lactate clearance after fluids"')
  where id = (select id from public.items
              where bank_id = '00000000-0000-0000-0000-0000000005b1' and folder_id is null
                and content #>> '{stem,value}' like 'Filler item 1 %');
select is(
  (select count(*)::int from public.list_bank_items('00000000-0000-0000-0000-0000000005b1', 'lactate')),
  7,
  'an edited item is found by its new words'
);

-- ---------------------------------------------------------------------------
-- As B: author in another org
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000005bb","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.list_bank_items('00000000-0000-0000-0000-0000000005b1', 'lactate')),
  0,
  'another org''s author finds none of A''s items'
);

-- ---------------------------------------------------------------------------
-- As anon
-- ---------------------------------------------------------------------------

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$ select * from public.list_bank_items('00000000-0000-0000-0000-0000000005b1', 'lactate') $$,
  '42501', null,
  'anon cannot search a bank'
);

reset role;

select * from finish();
rollback;
