-- Bank search (#105): Postgres full-text search over an item's words (stem, options and the rest
-- of its content, and its rationale), with type, status, folder and tag filters and paging. It runs
-- under the items RLS already in place; the list reads no answer key and no rationale text.

-- An item document's prose: rich text and token values, labels, titles and instructions, and the
-- strings of table columns and rows. Ids, kinds, author notes and numbers are left out, so a
-- search for "text" or "markdown" does not match every item. Strict mode, so arrays are not
-- unwrapped twice and no string is repeated.
create function private.item_search_text(doc jsonb) returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(string_agg(part #>> '{}', ' '), '')
  from jsonb_array_elements(
    jsonb_path_query_array(doc, 'strict $.**.value ? (@.type() == "string")')
    || jsonb_path_query_array(doc, 'strict $.**.label ? (@.type() == "string")')
    || jsonb_path_query_array(doc, 'strict $.**.title ? (@.type() == "string")')
    || jsonb_path_query_array(doc, 'strict $.**.instructions ? (@.type() == "string")')
    || jsonb_path_query_array(doc, 'strict $.**.columns[*] ? (@.type() == "string")')
    || jsonb_path_query_array(
         doc, 'strict $.**.rows[*] ? (@.type() == "array")[*] ? (@.type() == "string")')
  ) as part
$$;
revoke all on function private.item_search_text(jsonb) from public;
-- Inserting or updating an item computes the generated column below as the caller.
grant execute on function private.item_search_text(jsonb) to authenticated, service_role;

-- English stemming, so "lactate" also finds "lactates". Weighted so a stem match ranks first:
-- A the stem, B the rest of the content, C the rationale.
alter table public.items
  add column search_vector tsvector generated always as (
    setweight(to_tsvector('english'::regconfig, coalesce(content #>> '{stem,value}', '')), 'A')
    || setweight(to_tsvector('english'::regconfig, private.item_search_text(content - 'stem')), 'B')
    || setweight(to_tsvector('english'::regconfig, private.item_search_text(rationale)), 'C')
  ) stored;

create index items_search_idx on public.items using gin (search_vector);

-- The bank page's item list, one page at a time. Security invoker, so RLS decides what is read.
-- With a search, results rank by relevance, then by last edit; without one, by last edit. Matched
-- words come back between U+0002 and U+0003, which are removed from the text first, so the app can
-- split them into highlighted segments without reading any of it as HTML. A match only in the
-- rationale is reported as such; its text is never returned, and neither is the answer key.
create function public.list_bank_items(
  target_bank uuid,
  search text default null,
  item_type text default null,
  item_status public.content_status default null,
  in_folder uuid default null,
  unfiled_only boolean default false,
  with_tags text[] default '{}',
  with_step smallint default null,
  page_size integer default 50,
  page_offset integer default 0
)
returns table (
  id uuid,
  type text,
  status public.content_status,
  updated_at timestamptz,
  cjmm_step smallint,
  tags text[],
  stem jsonb,
  max_points jsonb,
  stem_match text,
  text_match text,
  rationale_match boolean,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    select case
             when nullif(btrim(search), '') is null then null
             -- The app caps a search at 200 characters; the function holds the same line.
             else websearch_to_tsquery('english'::regconfig, left(search, 200))
           end as query
  ),
  page as (
    select i.id, i.type, i.status, i.updated_at, i.cjmm_step, i.tags, i.content, i.rationale,
           i.scoring -> 'maxPoints' as max_points, i.search_vector,
           case when q.query is null then 0 else ts_rank(i.search_vector, q.query) end as rank,
           count(*) over () as total_count
    from public.items i
    cross join q
    where i.bank_id = target_bank
      and (q.query is null or i.search_vector @@ q.query)
      and (item_type is null or i.type = item_type)
      and (item_status is null or i.status = item_status)
      and (in_folder is null or i.folder_id = in_folder)
      and (not coalesce(unfiled_only, false) or i.folder_id is null)
      and (coalesce(cardinality(with_tags), 0) = 0 or i.tags @> with_tags)
      and (with_step is null or i.cjmm_step = with_step)
    order by rank desc, i.updated_at desc, i.id
    limit least(greatest(coalesce(page_size, 50), 1), 200)
    offset least(greatest(coalesce(page_offset, 0), 0), 100000)
  )
  select p.id, p.type, p.status, p.updated_at, p.cjmm_step, p.tags,
         p.content -> 'stem' as stem,
         p.max_points,
         case when strpos(s.headline, chr(2)) > 0 then s.headline end as stem_match,
         case when strpos(t.headline, chr(2)) > 0 then t.headline end as text_match,
         coalesce(r.matched, false) as rationale_match,
         p.total_count
  from page p
  cross join q
  -- Only this page's rows are highlighted, and the rest of the item only when the stem shows no
  -- match.
  left join lateral (
    select ts_headline('english'::regconfig,
             translate(coalesce(p.content #>> '{stem,value}', ''), chr(2) || chr(3), ''),
             q.query,
             format('StartSel=%s, StopSel=%s, HighlightAll=true', chr(2), chr(3))) as headline
    where q.query is not null
  ) s on true
  left join lateral (
    select ts_headline('english'::regconfig,
             translate(private.item_search_text(p.content - 'stem'), chr(2) || chr(3), ''),
             q.query,
             format('StartSel=%s, StopSel=%s, MaxWords=16, MinWords=6, MaxFragments=2, '
                    'FragmentDelimiter=" … "', chr(2), chr(3))) as headline
    where q.query is not null and coalesce(strpos(s.headline, chr(2)), 0) = 0
  ) t on true
  -- No word shows in the stem or the rest: say whether one is in the rationale, without its text.
  left join lateral (
    select strpos(ts_headline('english'::regconfig, private.item_search_text(p.rationale), q.query,
             format('StartSel=%s, StopSel=%s', chr(2), chr(3))), chr(2)) > 0 as matched
    where q.query is not null
      and coalesce(strpos(s.headline, chr(2)), 0) = 0
      and coalesce(strpos(t.headline, chr(2)), 0) = 0
  ) r on true
  order by p.rank desc, p.updated_at desc, p.id
$$;
revoke all on function public.list_bank_items(
  uuid, text, text, public.content_status, uuid, boolean, text[], smallint, integer, integer
) from public, anon;
grant execute on function public.list_bank_items(
  uuid, text, text, public.content_status, uuid, boolean, text[], smallint, integer, integer
) to authenticated;
