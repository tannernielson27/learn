-- Archiving (#107): an author archives items and case studies they no longer use, and restores them
-- later. Archiving never changes content or version: it sets status to 'archived' and remembers the
-- status it had in archived_from, and restoring puts that status back. While archived, content is
-- frozen, so restoring a published item returns exactly what was published.
--
-- The rules live in triggers, so they hold for the app's calls and for the Data API alike:
--   * an item that is a case study step cannot be archived on its own (2BP01, naming the case study);
--   * an archived item cannot be placed as a step, and an archived case study's steps cannot be
--     replaced, added to or reordered (55000);
--   * an archived item or case study cannot be edited, published or made a draft until it is
--     restored (55000).
--
-- The bank's item list (list_bank_items, #105) is replaced at the foot of this file so that it
-- leaves archived items out unless a caller asks for that status by name.

-- ---------------------------------------------------------------------------
-- The status to restore
-- ---------------------------------------------------------------------------

alter table public.items add column archived_from public.content_status;
alter table public.case_studies add column archived_from public.content_status;

-- Nothing archives before this migration, but a row archived by hand would fail the checks below.
-- It restores as a draft: publishing again is what checks it.
update public.items set archived_from = 'draft' where status = 'archived';
update public.case_studies set archived_from = 'draft' where status = 'archived';

alter table public.items
  add constraint items_archived_from_check check (
    (status = 'archived' and archived_from in ('draft', 'published'))
    or (status <> 'archived' and archived_from is null));
alter table public.case_studies
  add constraint case_studies_archived_from_check check (
    (status = 'archived' and archived_from in ('draft', 'published'))
    or (status <> 'archived' and archived_from is null));

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------

-- Security invoker (the default), so the step lookup reads only what the caller's RLS shows; a
-- step and its case study always share the item's org.
create function private.guard_archived_item() returns trigger
language plpgsql set search_path = ''
as $$
declare
  step_position smallint;
  case_title text;
begin
  if new.status = 'archived' and old.status <> 'archived' then
    select csi.position, cs.title into step_position, case_title
      from public.case_study_items csi
      join public.case_studies cs on cs.id = csi.case_study_id
     where csi.item_id = new.id
     order by cs.title, cs.id
     limit 1;
    if found then
      raise exception 'this item is step % of the case study "%"', step_position, case_title
        using errcode = '2BP01', detail = case_title, hint = step_position::text;
    end if;
    -- Restoring returns archived_from, so it must be the status the item really had: otherwise a
    -- draft could come back published without ever passing publish's checks.
    if new.archived_from is distinct from old.status then
      raise exception 'archived_from must be the status the item had' using errcode = '22023';
    end if;
    if (new.content, new.answer_key, new.rationale, new.scoring, new.version, new.type)
       is distinct from
       (old.content, old.answer_key, old.rationale, old.scoring, old.version, old.type) then
      raise exception 'archiving an item never changes its content' using errcode = '22023';
    end if;
  elsif old.status = 'archived' then
    if (new.content, new.answer_key, new.rationale, new.scoring, new.version, new.type)
         is distinct from
         (old.content, old.answer_key, old.rationale, old.scoring, old.version, old.type)
       or (new.status <> 'archived'
           and (new.status is distinct from old.archived_from or new.archived_from is not null)) then
      raise exception 'this item is archived; restore it first' using errcode = '55000';
    end if;
  end if;
  return new;
end
$$;

create trigger items_guard_archived before update on public.items
  for each row execute function private.guard_archived_item();

create function private.guard_archived_case_study() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.status = 'archived' and old.status <> 'archived' then
    if new.archived_from is distinct from old.status then
      raise exception 'archived_from must be the status the case study had' using errcode = '22023';
    end if;
    if (new.title, new.ehr) is distinct from (old.title, old.ehr) then
      raise exception 'archiving a case study never changes its content' using errcode = '22023';
    end if;
  elsif old.status = 'archived' then
    if (new.title, new.ehr) is distinct from (old.title, old.ehr)
       or (new.status <> 'archived'
           and (new.status is distinct from old.archived_from or new.archived_from is not null)) then
      raise exception 'this case study is archived; restore it first' using errcode = '55000';
    end if;
  end if;
  return new;
end
$$;

create trigger case_studies_guard_archived before update on public.case_studies
  for each row execute function private.guard_archived_case_study();

-- The item is locked for share, which waits for an archive of it in flight (archive_item locks it
-- for update) and is waited on by one: whichever commits first, the other sees it. The case study
-- is read without a lock, so this adds no lock order against start_case_study_step. Placing and
-- reordering both lock the steps first and the items second, so they take the same order as each
-- other and cannot deadlock against one another.
create function private.guard_archived_step() returns trigger
language plpgsql set search_path = ''
as $$
declare
  item_status public.content_status;
  case_status public.content_status;
begin
  select i.status into item_status from public.items i where i.id = new.item_id for share;
  if item_status = 'archived' then
    raise exception 'that item is archived; restore it before placing it as a step'
      using errcode = '55000';
  end if;
  select cs.status into case_status from public.case_studies cs where cs.id = new.case_study_id;
  if case_status = 'archived' then
    raise exception 'this case study is archived; restore it first' using errcode = '55000';
  end if;
  return new;
end
$$;

-- Every write to a step, including a reorder, which changes only positions: an archived case study
-- is frozen whole, so its steps cannot be replaced, added to or put in another order.
create trigger case_study_items_guard_archived before insert or update
  on public.case_study_items
  for each row execute function private.guard_archived_step();

-- ---------------------------------------------------------------------------
-- Archive and restore, one call each
-- ---------------------------------------------------------------------------

-- Security invoker: RLS decides what the caller may see and change, so another org's content (or
-- a student's call) reads as not found (22023). Archiving what is archived, or restoring what is
-- not, changes nothing. The row is locked first, so the step check in the trigger and a placement
-- in flight take turns.

create function public.archive_item(target uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  was public.content_status;
begin
  select i.status into was from public.items i where i.id = target for update;
  if not found then
    raise exception 'that item does not exist' using errcode = '22023';
  end if;
  if was <> 'archived' then
    update public.items set archived_from = status, status = 'archived' where id = target;
  end if;
end;
$$;

create function public.restore_item(target uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  was public.content_status;
begin
  select i.status into was from public.items i where i.id = target for update;
  if not found then
    raise exception 'that item does not exist' using errcode = '22023';
  end if;
  if was = 'archived' then
    update public.items set status = archived_from, archived_from = null where id = target;
  end if;
end;
$$;

create function public.archive_case_study(target uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  was public.content_status;
begin
  select cs.status into was from public.case_studies cs where cs.id = target for update;
  if not found then
    raise exception 'that case study does not exist' using errcode = '22023';
  end if;
  if was <> 'archived' then
    update public.case_studies set archived_from = status, status = 'archived' where id = target;
  end if;
end;
$$;

create function public.restore_case_study(target uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  was public.content_status;
begin
  select cs.status into was from public.case_studies cs where cs.id = target for update;
  if not found then
    raise exception 'that case study does not exist' using errcode = '22023';
  end if;
  if was = 'archived' then
    update public.case_studies set status = archived_from, archived_from = null where id = target;
  end if;
end;
$$;

revoke all on function public.archive_item(uuid) from public, anon;
grant execute on function public.archive_item(uuid) to authenticated;
revoke all on function public.restore_item(uuid) from public, anon;
grant execute on function public.restore_item(uuid) to authenticated;
revoke all on function public.archive_case_study(uuid) from public, anon;
grant execute on function public.archive_case_study(uuid) to authenticated;
revoke all on function public.restore_case_study(uuid) from public, anon;
grant execute on function public.restore_case_study(uuid) to authenticated;

-- The bank lists filter on status (current content by default, or the Archived view).
create index items_bank_id_status_idx on public.items (bank_id, status);
create index case_studies_bank_id_status_idx on public.case_studies (bank_id, status);

-- ---------------------------------------------------------------------------
-- Archived items leave the bank's default list
-- ---------------------------------------------------------------------------

-- The same function as the search migration (#105), with one line changed: with no status asked
-- for, archived items are left out, so the bank shows only what is current. The Archived view asks
-- for 'archived' by name and gets those alone. Everything else — the search and its ranking, the
-- type, folder, tag and step filters, and paging — is unchanged and composes with it. The
-- signature is unchanged, so the grants above it stand.
create or replace function public.list_bank_items(
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
      -- Archived items only when asked for by name.
      and (case
             when item_status is null then i.status <> 'archived'
             else i.status = item_status
           end)
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
