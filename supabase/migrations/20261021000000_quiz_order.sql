-- A quiz keeps one order for its questions and case studies (#468).
--
-- Before this, a quiz had no stored order. Its page listed questions last edited first, so editing
-- one moved it to the top; a live session or assignment of the whole quiz ran published questions
-- by created_at, which an AI import (one transaction, one now()) left to a random uuid; and a case
-- study's step questions showed up as loose questions in both.
--
-- ---------------------------------------------------------------------------
-- The model
-- ---------------------------------------------------------------------------
--
-- A quiz's entries are its loose questions and its case studies, in one order. A loose question is
-- an item that is no case study's step; a step question belongs to its case study, which keeps its
-- own order (case_study_items.position, 20260914000000) and is never an entry here.
--
-- Each entry carries quiz_position, an integer, on its own row: items.quiz_position and
-- case_studies.quiz_position. The order is (quiz_position, created_at, id); the last two only ever
-- break a tie, which nothing here makes on purpose. Positions need not be dense: archived entries
-- and step questions keep whatever position they had, and only the relative order of the quiz's
-- current loose entries means anything. A separate order table was considered and not taken: every
-- path that adds, moves or removes content would have had to keep a second table in step, while a
-- column moves with its row (a move to another quiz, a delete, an org's cascade) for free.
--
-- ---------------------------------------------------------------------------
-- Where a new entry goes: the end, in the order it arrived
-- ---------------------------------------------------------------------------
--
-- One BEFORE trigger on each table, so every way content enters a quiz is covered without touching
-- each function that does it: a new question or case study, a duplicate, a JSON import (and into a
-- folder), an AI import, a case study's new step, a sample load, a restore from the archive, and a
-- direct PATCH of bank_id through the Data API. Each puts the row at the end of its quiz:
--
--   * on insert, always (a position a caller sends is ignored);
--   * on a change of bank_id, unless the same statement set a new position (move_quiz_content
--     below does, so a move keeps the moved entries' order);
--   * on a restore (status leaves 'archived'), so what comes back is found at the end.
--
-- "The end" is one more than the largest position held by any item or case study in the quiz.
-- Rows written earlier in the same statement or transaction are visible to the trigger's query
-- (a row-level BEFORE trigger sees the rows its command already processed), so one import's
-- questions land in the order it wrote them: import_bank_content and import_ai_batch both insert
-- one row at a time in document order. Two transactions adding to the same quiz at once take turns
-- on a per-quiz advisory lock, held to the end of the transaction, so they never read the same end.
--
-- ---------------------------------------------------------------------------
-- Reordering, and what it does not change
-- ---------------------------------------------------------------------------
--
-- public.reorder_quiz takes the whole order: every current loose entry of the quiz, once each. It
-- locks the entries' rows, then takes the same per-quiz lock, so a reorder and an add take turns,
-- and two reorders of one quiz run one after the other with the last one standing. A list that
-- names anything else (an archived entry, a step, another quiz's or another workspace's content,
-- or that misses one added since the page loaded) changes nothing and is refused (22023, hint
-- 'stale'), so a stale page never drops or places what it did not show. It is security invoker,
-- like the authoring functions it sits beside: RLS decides what the caller can see and change, so
-- another workspace's quiz reads as not found (P0002) and a student reorders nothing. It charges
-- one `save` on the authoring limit (#123) first, as move_to_quiz does.
--
-- A reorder writes only quiz_position, so it does not count as an edit: the content updated_at
-- trigger leaves updated_at alone for that one write (see private.set_content_updated_at), and the
-- quiz page's "Edited" times stay true.
--
-- ---------------------------------------------------------------------------
-- What reads the order
-- ---------------------------------------------------------------------------
--
--   * public.list_quiz_entries: the Change order screen's list.
--   * public.list_bank_items: the quiz page's question list without a search (a search keeps its
--     relevance ranking). Step questions follow the loose ones there, still listed so a teacher
--     can open one; the case study page is their real home.
--   * public.start_session and private.snapshot_assignment, for a whole quiz: its published loose
--     questions in quiz order. Step questions no longer run as loose questions; a case study runs
--     in place in a later story (#469, #470). A quiz holding only case studies now has nothing to
--     run on its own, and says so as an empty quiz does.
--
-- Practice (practice_item_set) already plays case studies in place and is left as it is.
--
-- Deploy order: the app may reach a database without this migration. The Change order screen
-- reads a missing function as "not ready yet" (src/lib/authoring/quizOrderData.ts), and the quiz
-- page's case study list falls back to its old order when quiz_position is missing
-- (src/lib/authoring/banks.ts listCaseStudies). Safe to replay on a fresh project: four functions
-- replaced with the same signatures, two columns, two triggers swapped, the rest new.

-- ---------------------------------------------------------------------------
-- The columns, filled oldest first
-- ---------------------------------------------------------------------------

alter table public.items add column quiz_position integer;
alter table public.case_studies add column quiz_position integer;

-- ---------------------------------------------------------------------------
-- updated_at: an order write is not an edit
-- ---------------------------------------------------------------------------

-- 20260913000000's private.set_updated_at, for items and case studies only, with one test added:
-- inside a write that set learn.quiz_order_write (reorder_quiz and move_quiz_content's numbering,
-- for the one statement that writes positions), updated_at is left as it was. The setting is
-- transaction-local and reachable only by SQL running in the same transaction; the Data API gives
-- a client no way to set it (set_config lives in pg_catalog, which is not exposed), the same line
-- private.charge_authoring_action draws.
create function private.set_content_updated_at() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if coalesce(current_setting('learn.quiz_order_write', true), '') = 'on' then
    return new;
  end if;
  new.updated_at = now();
  return new;
end
$$;

revoke all on function private.set_content_updated_at() from public, anon, authenticated;

drop trigger items_updated_at on public.items;
create trigger items_updated_at before update on public.items
  for each row execute function private.set_content_updated_at();
drop trigger case_studies_updated_at on public.case_studies;
create trigger case_studies_updated_at before update on public.case_studies
  for each row execute function private.set_content_updated_at();

-- The backfill writes only quiz_position, under the flag the new updated_at trigger reads, so no
-- question or case study looks edited today. Items and case studies are numbered together, per
-- quiz, oldest first.
-- Session-wide (false), not transaction-local, so it holds however the migration is run, and is
-- cleared straight after.
select set_config('learn.quiz_order_write', 'on', false);

update public.items i
   set quiz_position = n.pos
  from (
    select e.id, e.kind,
           row_number() over (partition by e.bank_id order by e.created_at, e.id)::integer as pos
      from (select x.id, x.bank_id, x.created_at, 'item' as kind from public.items x
            union all
            select c.id, c.bank_id, c.created_at, 'case_study' from public.case_studies c) e
  ) n
 where n.kind = 'item' and n.id = i.id;

update public.case_studies cs
   set quiz_position = n.pos
  from (
    select e.id, e.kind,
           row_number() over (partition by e.bank_id order by e.created_at, e.id)::integer as pos
      from (select x.id, x.bank_id, x.created_at, 'item' as kind from public.items x
            union all
            select c.id, c.bank_id, c.created_at, 'case_study' from public.case_studies c) e
  ) n
 where n.kind = 'case_study' and n.id = cs.id;

select set_config('learn.quiz_order_write', '', false);

alter table public.items alter column quiz_position set not null;
alter table public.case_studies alter column quiz_position set not null;

create index items_bank_id_quiz_position_idx on public.items (bank_id, quiz_position);
create index case_studies_bank_id_quiz_position_idx
  on public.case_studies (bank_id, quiz_position);

-- ---------------------------------------------------------------------------
-- The per-quiz lock and the end of a quiz
-- ---------------------------------------------------------------------------

-- Held to the end of the transaction. Taken before any position is read or written, by the
-- trigger, by reorder_quiz and by move_quiz_content, so all three take turns per quiz.
create function private.lock_quiz_order(target_bank uuid) returns void
language sql set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended('learn:quiz-order:' || target_bank::text, 0));
$$;

-- One past the largest position any item or case study of the quiz holds. Security definer so the
-- answer never depends on what the caller's RLS shows: every row of a quiz is in one org, but an
-- insert by service_role or a migration must see the same end as a teacher's. Volatile (the
-- default), so inside a trigger it sees the rows its own statement wrote before this one.
create function private.next_quiz_position(target_bank uuid) returns integer
language sql security definer set search_path = ''
as $$
  select greatest(
           (select coalesce(max(i.quiz_position), 0) from public.items i
             where i.bank_id = target_bank),
           (select coalesce(max(cs.quiz_position), 0) from public.case_studies cs
             where cs.bank_id = target_bank)
         ) + 1;
$$;

revoke all on function private.lock_quiz_order(uuid) from public, anon;
revoke all on function private.next_quiz_position(uuid) from public, anon;
-- The trigger and the invoker functions below call these as the caller, whoever writes.
grant execute on function private.lock_quiz_order(uuid) to authenticated, service_role;
grant execute on function private.next_quiz_position(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- New, moved and restored entries go to the end
-- ---------------------------------------------------------------------------

create function private.place_at_quiz_end() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     or (new.bank_id is distinct from old.bank_id
         and new.quiz_position is not distinct from old.quiz_position)
     or (old.status = 'archived' and new.status <> 'archived') then
    perform private.lock_quiz_order(new.bank_id);
    new.quiz_position := private.next_quiz_position(new.bank_id);
  end if;
  return new;
end
$$;

revoke all on function private.place_at_quiz_end() from public, anon, authenticated;

create trigger items_place_at_quiz_end
  before insert or update of bank_id, status on public.items
  for each row execute function private.place_at_quiz_end();
create trigger case_studies_place_at_quiz_end
  before insert or update of bank_id, status on public.case_studies
  for each row execute function private.place_at_quiz_end();

-- ---------------------------------------------------------------------------
-- A quiz's entries, in order
-- ---------------------------------------------------------------------------

-- Every current (not archived) loose question and case study of the quiz, in quiz order. The stem
-- is the only part of a question read: never its key or rationale. Security invoker, so another
-- workspace's quiz lists nothing. At most 1000 entries, reorder_quiz's own line.
create function public.list_quiz_entries(target_bank uuid)
returns table (
  kind text,
  id uuid,
  type text,
  status public.content_status,
  title text,
  stem jsonb,
  quiz_position integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select e.kind, e.id, e.type, e.status, e.title, e.stem, e.quiz_position
    from (
      select 'item'::text as kind, i.id, i.type, i.status, null::text as title,
             i.content -> 'stem' as stem, i.quiz_position, i.created_at
        from public.items i
       where i.bank_id = target_bank
         and i.status <> 'archived'
         and not exists (select 1 from public.case_study_items csi where csi.item_id = i.id)
      union all
      select 'case_study', cs.id, null, cs.status, cs.title, null, cs.quiz_position, cs.created_at
        from public.case_studies cs
       where cs.bank_id = target_bank
         and cs.status <> 'archived'
    ) e
   order by e.quiz_position, e.created_at, e.id
   limit 1000;
$$;

revoke all on function public.list_quiz_entries(uuid) from public, anon;
grant execute on function public.list_quiz_entries(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Reordering a quiz
-- ---------------------------------------------------------------------------

-- Refusals: 22023 (no list, a repeat or a blank, more than 1000; hint 'stale' when the list is not
-- exactly the quiz's current loose entries), P0002 (a quiz the caller cannot see), 54000 (the
-- authoring limit). Archived content (55000) cannot be reached: an archived entry is never in the
-- set a list must match.
create function public.reorder_quiz(target_bank uuid, entry_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  wanted integer := coalesce(cardinality(entry_ids), 0);
  current_count integer;
  matched integer;
begin
  perform private.charge_authoring_action('save');

  perform 1 from public.item_banks b where b.id = target_bank;
  if not found then
    raise exception 'that quiz does not exist' using errcode = 'P0002';
  end if;

  if wanted = 0
     or wanted > 1000
     or array_position(entry_ids, null) is not null
     or wanted <> (select count(distinct x) from unnest(entry_ids) x) then
    raise exception 'the new order must name each question and case study once'
      using errcode = '22023';
  end if;

  -- The entries' rows first, in id order, then the quiz's lock: an archive in flight finishes
  -- first or waits, so the set compared below is the set written. Rows before the lock, as
  -- move_quiz_content takes them, because start_case_study_step and duplicate_case_study hold a
  -- case study's row while their insert takes the lock; the other order would deadlock with them.
  perform 1 from public.case_studies cs
   where cs.bank_id = target_bank and cs.status <> 'archived'
   order by cs.id
     for update of cs;
  perform 1 from public.items i
   where i.bank_id = target_bank and i.status <> 'archived'
   order by i.id
     for update of i;
  perform private.lock_quiz_order(target_bank);

  -- The quiz's current loose entries, the same set list_quiz_entries lists, without its cap.
  select count(*), count(*) filter (where e.id = any (entry_ids))
    into current_count, matched
    from (
      select i.id from public.items i
       where i.bank_id = target_bank
         and i.status <> 'archived'
         and not exists (select 1 from public.case_study_items csi where csi.item_id = i.id)
      union all
      select cs.id from public.case_studies cs
       where cs.bank_id = target_bank and cs.status <> 'archived'
    ) e;
  if current_count <> wanted or matched <> wanted then
    raise exception 'this quiz has changed since its order was read'
      using errcode = '22023', hint = 'stale';
  end if;

  perform set_config('learn.quiz_order_write', 'on', true);
  update public.items i
     set quiz_position = s.ord::integer
    from unnest(entry_ids) with ordinality as s(id, ord)
   where i.id = s.id and i.bank_id = target_bank;
  update public.case_studies cs
     set quiz_position = s.ord::integer
    from unnest(entry_ids) with ordinality as s(id, ord)
   where cs.id = s.id and cs.bank_id = target_bank;
  perform set_config('learn.quiz_order_write', '', true);
end;
$$;

revoke all on function public.reorder_quiz(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_quiz(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- A move to another quiz lands at its end, in the order it had
-- ---------------------------------------------------------------------------

-- 20261014300000's function, with the moved rows numbered: loose entries first, in the source
-- quiz's order, then the steps they carry, from one past the target quiz's end. Everything else
-- (locks, refusals, the one statement over three tables, the counts) is unchanged.
create or replace function private.move_quiz_content(
  source_bank uuid,
  target_bank uuid,
  item_ids uuid[],
  case_study_ids uuid[]
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  wanted_items uuid[] := array(
    select distinct x from unnest(coalesce(item_ids, '{}')) x where x is not null
  );
  wanted_cases uuid[] := array(
    select distinct x from unnest(coalesce(case_study_ids, '{}')) x where x is not null
  );
  step_ids uuid[];
  all_items uuid[];
  found_count integer;
  lone_position smallint;
  lone_title text;
  moved_cases integer;
  moved_items integer;
  chosen_items integer;
  target_end integer;
begin
  if source_bank is not distinct from target_bank then
    raise exception 'choose another quiz to move to' using errcode = '22023', hint = 'same';
  end if;

  perform 1 from public.case_study_items csi
   where csi.case_study_id = any (wanted_cases) and csi.bank_id = source_bank
   order by csi.case_study_id, csi.position
     for update of csi;

  select count(*) into found_count
    from (select cs.id from public.case_studies cs
           where cs.bank_id = source_bank and cs.id = any (wanted_cases)
           order by cs.id
             for update of cs) locked;
  if found_count <> cardinality(wanted_cases) then
    raise exception 'a case study chosen is no longer in this quiz'
      using errcode = 'P0002', hint = 'content';
  end if;

  select coalesce(array_agg(csi.item_id), '{}') into step_ids
    from public.case_study_items csi
   where csi.case_study_id = any (wanted_cases);

  -- A step moves only with its case study, and so does a step a moving case study shares with one
  -- that stays.
  select csi.position, cs.title into lone_position, lone_title
    from public.case_study_items csi
    join public.case_studies cs on cs.id = csi.case_study_id
   where csi.item_id = any (wanted_items || step_ids)
     and not (csi.case_study_id = any (wanted_cases))
   order by cs.title, cs.id
   limit 1;
  if found then
    raise exception 'this question is step % of the case study "%"', lone_position, lone_title
      using errcode = '2BP01', detail = lone_title, hint = lone_position::text;
  end if;

  all_items := array(select distinct x from unnest(wanted_items || step_ids) x);
  select count(*) into found_count
    from (select i.id from public.items i
           where i.bank_id = source_bank and i.id = any (all_items)
           order by i.id
             for update of i) locked;
  if found_count <> cardinality(all_items) then
    raise exception 'a question chosen is no longer in this quiz'
      using errcode = 'P0002', hint = 'content';
  end if;

  -- #468: the target quiz's end, under its order lock, so nothing lands there meanwhile.
  perform private.lock_quiz_order(target_bank);
  target_end := private.next_quiz_position(target_bank);

  -- One statement, so the composite keys between the three tables are checked once, at its end,
  -- when every row names the target quiz. Every moved row gets its new position in the same
  -- statement, so the place-at-end trigger leaves it alone.
  with moving as (
    select cs.id, false as is_step, cs.quiz_position, cs.created_at
      from public.case_studies cs
     where cs.bank_id = source_bank and cs.id = any (wanted_cases)
    union all
    select i.id, i.id = any (step_ids), i.quiz_position, i.created_at
      from public.items i
     where i.bank_id = source_bank and i.id = any (all_items)
  ),
  placed as (
    select m.id,
           (target_end - 1
             + row_number() over (order by m.is_step, m.quiz_position, m.created_at, m.id))::integer
             as pos
      from moving m
  ),
  moved_case_rows as (
    update public.case_studies cs
       set bank_id = target_bank, folder_id = null, quiz_position = p.pos
      from placed p
     where cs.bank_id = source_bank and cs.id = any (wanted_cases) and p.id = cs.id
    returning 1
  ),
  moved_item_rows as (
    update public.items i
       set bank_id = target_bank, folder_id = null, quiz_position = p.pos
      from placed p
     where i.bank_id = source_bank and i.id = any (all_items) and p.id = i.id
    returning 1
  ),
  moved_step_rows as (
    update public.case_study_items
       set bank_id = target_bank
     where bank_id = source_bank and case_study_id = any (wanted_cases)
    returning 1
  )
  select (select count(*) from moved_case_rows), (select count(*) from moved_item_rows)
    into moved_cases, moved_items
    from (select count(*) from moved_step_rows) steps_written;

  -- Questions chosen on their own, as against the steps their case studies carried.
  chosen_items := cardinality(array(select unnest(wanted_items) except select unnest(step_ids)));
  return jsonb_build_object(
    'items', chosen_items,
    'case_studies', moved_cases,
    'steps', moved_items - chosen_items
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- The quiz page's question list, in quiz order without a search
-- ---------------------------------------------------------------------------

-- 20260919160000's function with the order changed and nothing else. With no search, loose
-- questions come in quiz order and step questions after them (in their own quiz positions); with a
-- search, relevance then last edit, as before. The signature is unchanged, so the grants stand.
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
           -- #468: the quiz's order, without a search only; null (all equal) while searching.
           case when q.query is null then
             exists (select 1 from public.case_study_items csi where csi.item_id = i.id)
           end as is_step,
           case when q.query is null then i.quiz_position end as quiz_position,
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
    order by rank desc, is_step, quiz_position, i.updated_at desc, i.id
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
  order by p.rank desc, p.is_step, p.quiz_position, p.updated_at desc, p.id
$$;

-- ---------------------------------------------------------------------------
-- A whole quiz runs its loose questions in quiz order
-- ---------------------------------------------------------------------------

-- 20260919170000's function with the bank's question list changed and nothing else.
create or replace function public.start_session(
  source_bank uuid default null,
  source_case_study uuid default null,
  paced public.session_mode default 'instructor_paced',
  item_timer_seconds integer default null
) returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  source_org uuid;
  source_title text;
  chosen jsonb;
  new_id uuid;
  failed_constraint text;
begin
  if num_nonnulls(source_bank, source_case_study) <> 1 then
    raise exception 'start a session from either a bank or a case study, not both'
      using errcode = '22023';
  end if;

  if source_bank is not null then
    select b.org_id, b.name into source_org, source_title
      from public.item_banks b where b.id = source_bank;
    if not found then
      raise exception 'that bank does not exist' using errcode = 'P0002';
    end if;
    -- Published loose questions only, in the quiz's order (#468): a draft is half-written by
    -- definition, and a step question belongs to its case study, which runs in place later
    -- (#469, #470), never as a loose question.
    select coalesce(jsonb_agg(i.id order by i.quiz_position, i.created_at, i.id), '[]'::jsonb)
      into chosen
      from public.items i
     where i.bank_id = source_bank and i.status = 'published'
       and not exists (select 1 from public.case_study_items csi where csi.item_id = i.id);
  else
    select c.org_id, c.title into source_org, source_title
      from public.case_studies c
     where c.id = source_case_study and c.status = 'published';
    if not found then
      -- An unpublished case study is not "gone", but a room must not be shown one, and the two
      -- answers are told apart below rather than here so the P0002 branch keeps meaning one thing.
      if exists (select 1 from public.case_studies c where c.id = source_case_study) then
        raise exception 'that case study is not published' using errcode = '22023';
      end if;
      raise exception 'that case study does not exist' using errcode = 'P0002';
    end if;

    -- Every step, in order, and every one of them published. A case study is a sequence: silently
    -- dropping a half-written step would run the room through a different case study from the one
    -- the instructor chose, so this refuses instead.
    if exists (
      select 1 from public.case_study_items csi
        join public.items i on i.id = csi.item_id
       where csi.case_study_id = source_case_study and i.status <> 'published'
    ) then
      raise exception 'that case study has a step that is not published' using errcode = '22023';
    end if;

    select coalesce(jsonb_agg(csi.item_id order by csi.position), '[]'::jsonb) into chosen
      from public.case_study_items csi
     where csi.case_study_id = source_case_study;
  end if;

  if jsonb_array_length(chosen) = 0 then
    raise exception 'that source has no published items to run' using errcode = '22023';
  end if;

  for attempt in 1 .. 10 loop
    begin
      insert into public.sessions
        (org_id, host_id, bank_id, case_study_id, title, code, mode, item_set, timer_seconds)
      values
        (source_org, caller, source_bank, source_case_study, source_title,
         private.new_session_code(), paced, chosen, item_timer_seconds)
      returning id into new_id;
      return new_id;
    exception when unique_violation then
      -- Only a code that collided with a session still open is worth another draw.
      get stacked diagnostics failed_constraint = constraint_name;
      if failed_constraint is distinct from 'sessions_open_code_key' then
        raise;
      end if;
    end;
  end loop;

  raise exception 'could not find a free join code' using errcode = '53400';
end;
$$;

-- 20260924020000's trigger function with the bank's question list changed and nothing else.
create or replace function private.snapshot_assignment() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  source_title text;
  source_status public.content_status;
  record_snapshot jsonb;
  chosen jsonb;
begin
  if num_nonnulls(new.bank_id, new.case_study_id) <> 1 then
    raise exception 'assign either a bank or a case study' using errcode = '22023';
  end if;

  if new.bank_id is not null then
    select b.name into source_title
      from public.item_banks b where b.id = new.bank_id and b.org_id = new.org_id;
    if not found then
      raise exception 'that bank does not exist' using errcode = 'P0002';
    end if;
    -- Published loose questions in the quiz's order (#468), as start_session.
    select coalesce(jsonb_agg(i.id order by i.quiz_position, i.created_at, i.id), '[]'::jsonb)
      into chosen
      from public.items i
     where i.bank_id = new.bank_id and i.org_id = new.org_id and i.status = 'published'
       and not exists (select 1 from public.case_study_items csi where csi.item_id = i.id);
    record_snapshot := null;
  else
    select c.title, c.status, c.ehr into source_title, source_status, record_snapshot
      from public.case_studies c where c.id = new.case_study_id and c.org_id = new.org_id;
    if not found then
      raise exception 'that case study does not exist' using errcode = 'P0002';
    end if;
    if source_status <> 'published' then
      raise exception 'that case study is not published' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.case_study_items csi
        join public.items i on i.id = csi.item_id
       where csi.case_study_id = new.case_study_id and i.status <> 'published'
    ) then
      raise exception 'that case study has a step that is not published' using errcode = '22023';
    end if;
    select coalesce(jsonb_agg(csi.item_id order by csi.position), '[]'::jsonb) into chosen
      from public.case_study_items csi
     where csi.case_study_id = new.case_study_id;
    if record_snapshot is not null and jsonb_typeof(record_snapshot) <> 'object' then
      record_snapshot := null;
    end if;
  end if;

  if jsonb_array_length(chosen) = 0 then
    raise exception 'that source has no published items to assign' using errcode = '22023';
  end if;
  if new.closes_at <= now() then
    raise exception 'an assignment cannot close in the past' using errcode = '22023';
  end if;

  new.item_set := chosen;
  new.patient_record := record_snapshot;
  -- The author may name it; blank means the source's own name.
  new.title := coalesce(nullif(btrim(new.title), ''), left(source_title, 200));
  new.created_by := (select auth.uid());
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;
