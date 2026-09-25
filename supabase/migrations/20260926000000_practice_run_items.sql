-- Freeze a practice run's items when it starts (#271).
--
-- Until now a run read the bank's published items on every request (#241, decision 8), so an item
-- an author unpublished mid-run dropped out under the student, and an item edited mid-run was
-- scored against a key the student never saw. From this migration, opening a new run records, in
-- play order, each item it holds and the content that was published at that moment. The run's
-- page and its answers then read that record, not the bank.
--
-- ---------------------------------------------------------------------------
-- What is stored
-- ---------------------------------------------------------------------------
--
--   * practice_runs.frozen: true for a run opened by this code. Every run that exists before
--     this migration is false and keeps today's behavior (the bank's current published items),
--     so no student's run changes shape under them when this ships (kickoff decision 7).
--   * practice_item_snapshots: an item's published content, keyed by the item and a sha256 of
--     that content. Many runs share one row, so storage grows with what authors publish (which
--     the authoring limit already counts), not with how often students press Start over.
--     `version` is items.version at the moment of the snapshot.
--   * practice_run_slots: a frozen run's items in play order, each naming its snapshot.
--
-- ---------------------------------------------------------------------------
-- Who may do what
-- ---------------------------------------------------------------------------
--
--   * Nobody reads or writes either new table directly: RLS is on with no policy, and anon,
--     authenticated and the service role hold no privilege. open_practice_run (security definer)
--     writes them when it opens a new run; practice_run_items, record_practice_response,
--     my_practice_banks and the new practice_run_item_content read them.
--   * practice_run_item_content is the service role's alone, like every other run call: it takes
--     the student the server verified and answers only for a live run (the student's own, their
--     newest for the bank, and the bank still shared with a class they currently belong to).
--     Stopping a share therefore still closes every run at once, frozen or not.
--   * An unpublished item stays readable only inside a run that recorded it, and only by the
--     server acting for that run's student. Its key still leaves the server only through
--     POST /api/practice/answer, after a scored, recorded answer.
--
-- Safe to replay on a fresh project: one new column with a constant default, two new tables, one
-- new helper, one new function, and four functions replaced in place with the same signatures
-- (create or replace keeps their owner and grants; the grants are restated anyway).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

alter table public.practice_runs add column frozen boolean not null default false;

comment on column public.practice_runs.frozen is
  'True when the run recorded its items at start (#271). False for runs opened before that; they '
  'keep reading the bank''s current published items.';

create table public.practice_item_snapshots (
  item_id uuid not null,
  org_id uuid not null,
  digest bytea not null check (octet_length(digest) = 32),
  type text not null,
  cjmm_step smallint,
  tags text[] not null,
  version integer not null,
  content jsonb not null,
  answer_key jsonb not null,
  rationale jsonb not null,
  scoring jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (item_id, digest),
  constraint practice_item_snapshots_item_org_fkey foreign key (item_id, org_id)
    references public.items (id, org_id) on delete cascade
);

create index practice_item_snapshots_org_id_idx on public.practice_item_snapshots (org_id);

comment on table public.practice_item_snapshots is
  'An item''s published content as a practice run recorded it (#271), shared by every run that '
  'recorded the same content. Holds keys: no role reads it directly.';

create table public.practice_run_slots (
  run_id uuid not null,
  org_id uuid not null,
  ordinal integer not null check (ordinal >= 1),
  item_id uuid not null,
  digest bytea not null,
  case_study_id uuid,
  step smallint check (step between 1 and 6),
  primary key (run_id, item_id),
  constraint practice_run_slots_ordinal_key unique (run_id, ordinal),
  constraint practice_run_slots_case_step check ((case_study_id is null) = (step is null)),
  constraint practice_run_slots_run_org_fkey foreign key (run_id, org_id)
    references public.practice_runs (id, org_id) on delete cascade,
  constraint practice_run_slots_snapshot_fkey foreign key (item_id, digest)
    references public.practice_item_snapshots (item_id, digest) on delete cascade,
  constraint practice_run_slots_case_org_fkey foreign key (case_study_id, org_id)
    references public.case_studies (id, org_id) on delete cascade
);

create index practice_run_slots_snapshot_idx on public.practice_run_slots (item_id, digest);
create index practice_run_slots_case_study_id_idx on public.practice_run_slots (case_study_id)
  where case_study_id is not null;
create index practice_run_slots_org_id_idx on public.practice_run_slots (org_id);

comment on table public.practice_run_slots is
  'A frozen practice run''s items in play order (#271). Written only by open_practice_run.';

-- Supabase's default privileges hand anon, authenticated and service_role full DML on a new
-- public table. Only the definer functions below touch these two.
revoke all on public.practice_item_snapshots from anon, authenticated, service_role;
revoke all on public.practice_run_slots from anon, authenticated, service_role;

alter table public.practice_item_snapshots enable row level security;
alter table public.practice_run_slots enable row level security;

-- ---------------------------------------------------------------------------
-- Helper (no one may call it directly)
-- ---------------------------------------------------------------------------

-- What a run holds, in play order: its recorded slots when it is frozen, otherwise the bank's
-- current published items (a run opened before #271). It does not check that the run is live;
-- every caller goes through private.live_practice_run first.
create function private.practice_run_set(target_run uuid)
returns table (item_id uuid, case_study_id uuid, step smallint, ordinal bigint)
language sql stable security definer set search_path = ''
as $$
  select s.item_id, s.case_study_id, s.step, s.ordinal::bigint
    from public.practice_runs r
    join public.practice_run_slots s on s.run_id = r.id
   where r.id = target_run and r.frozen
  union all
  select l.item_id, l.case_study_id, l.step, l.ordinal
    from public.practice_runs r
    cross join lateral private.practice_item_set(r.bank_id) l
   where r.id = target_run and not r.frozen;
$$;

revoke all on function private.practice_run_set(uuid)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The server's calls (service role only)
-- ---------------------------------------------------------------------------

-- As in #241, and a new run now records its items and their published content.
create or replace function public.open_practice_run(student uuid, target_bank uuid, fresh boolean)
returns table (run_id uuid, bank_id uuid, bank_name text, seed uuid, started_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare
  found_run public.practice_runs;
  bank_org uuid;
begin
  if student is null or target_bank is null
     or not private.practice_shared_with(student, target_bank) then
    return;
  end if;

  -- Two tabs opening the same bank at once make one run, not two.
  perform pg_advisory_xact_lock(
    hashtextextended('learn:practice-run:' || student::text || ':' || target_bank::text, 0));

  if not coalesce(fresh, false) then
    select r.* into found_run
      from public.practice_runs r
     where r.student_id = student and r.bank_id = target_bank
     order by r.started_at desc, r.id desc
     limit 1;
  end if;

  if found_run.id is null then
    select b.org_id into bank_org from public.item_banks b where b.id = target_bank;
    insert into public.practice_runs (org_id, student_id, bank_id, frozen)
    values (bank_org, student, target_bank, true)
    returning * into found_run;

    -- One statement, so the items are read once: the snapshot and the slot name the same content
    -- even if an author saves an item while the run opens.
    with source as (
      select s.item_id, s.case_study_id, s.step, s.ordinal,
             i.org_id, i.type, i.cjmm_step, i.tags, i.version,
             i.content, i.answer_key, i.rationale, i.scoring,
             sha256(convert_to(jsonb_build_array(
               i.type, i.cjmm_step, i.tags, i.version,
               i.content, i.answer_key, i.rationale, i.scoring)::text, 'UTF8')) as digest
        from private.practice_item_set(target_bank) s
        join public.items i on i.id = s.item_id
    ),
    kept as (
      insert into public.practice_item_snapshots
        (item_id, org_id, digest, type, cjmm_step, tags, version,
         content, answer_key, rationale, scoring)
      select distinct on (src.item_id, src.digest)
             src.item_id, src.org_id, src.digest, src.type, src.cjmm_step, src.tags, src.version,
             src.content, src.answer_key, src.rationale, src.scoring
        from source src
      on conflict (item_id, digest) do nothing
    )
    insert into public.practice_run_slots
      (run_id, org_id, ordinal, item_id, digest, case_study_id, step)
    select found_run.id, found_run.org_id, src.ordinal::integer, src.item_id, src.digest,
           src.case_study_id, src.step
      from source src;
  end if;

  return query
    select found_run.id, found_run.bank_id, b.name, found_run.seed, found_run.started_at
      from public.item_banks b
     where b.id = found_run.bank_id;
end;
$$;

revoke all on function public.open_practice_run(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.open_practice_run(uuid, uuid, boolean) to service_role;

-- As in #241, reading the run's own set.
create or replace function public.practice_run_items(student uuid, target_run uuid)
returns table (
  item_id uuid,
  case_study_id uuid,
  step smallint,
  ordinal bigint,
  answered boolean
)
language sql stable security definer set search_path = ''
as $$
  select s.item_id, s.case_study_id, s.step, s.ordinal,
         exists (
           select 1 from public.practice_responses p
            where p.run_id = r.id and p.item_id = s.item_id
         )
    from private.live_practice_run(student, target_run) r
    cross join lateral private.practice_run_set(r.id) s
   where r.id is not null
   order by s.ordinal;
$$;

revoke all on function public.practice_run_items(uuid, uuid) from public, anon, authenticated;
grant execute on function public.practice_run_items(uuid, uuid) to service_role;

-- The content, with keys, of some of a live run's items: as recorded for a frozen run, or the
-- item as it is now for a run opened before #271. Only items the run holds; nothing when the run
-- is not live for the student. The server strips keys before a page is built, and hands one back
-- only after a recorded answer.
create function public.practice_run_item_content(student uuid, target_run uuid, target_items uuid[])
returns table (
  item_id uuid,
  type text,
  cjmm_step smallint,
  tags text[],
  version integer,
  content jsonb,
  answer_key jsonb,
  rationale jsonb,
  scoring jsonb
)
language sql stable security definer set search_path = ''
as $$
  with live as (
    select r.id, r.bank_id, r.frozen
      from private.live_practice_run(student, target_run) r
     where r.id is not null
  )
  select p.item_id, p.type, p.cjmm_step, p.tags, p.version,
         p.content, p.answer_key, p.rationale, p.scoring
    from live r
    join public.practice_run_slots s on s.run_id = r.id
    join public.practice_item_snapshots p on p.item_id = s.item_id and p.digest = s.digest
   where r.frozen
     and s.item_id = any(target_items)
  union all
  select i.id, i.type, i.cjmm_step, i.tags, i.version,
         i.content, i.answer_key, i.rationale, i.scoring
    from live r
    join public.items i on i.bank_id = r.bank_id
   where not r.frozen
     and i.id = any(target_items)
     and exists (select 1 from private.practice_item_set(r.bank_id) l where l.item_id = i.id)
  limit 1000;
$$;

revoke all on function public.practice_run_item_content(uuid, uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.practice_run_item_content(uuid, uuid, uuid[]) to service_role;

-- As in #241, checking the item against the run's own set.
create or replace function public.record_practice_response(
  student uuid,
  target_run uuid,
  target_item uuid,
  answer jsonb,
  earned numeric,
  possible numeric,
  marks jsonb
)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  run public.practice_runs;
  inserted integer;
begin
  run := private.live_practice_run(student, target_run);
  if run.id is null then
    return 'not_found';
  end if;
  if not exists (
    select 1 from private.practice_run_set(run.id) s where s.item_id = target_item
  ) then
    return 'not_found';
  end if;

  insert into public.practice_responses (run_id, org_id, item_id, response, points, max_points, score)
  values (run.id, run.org_id, target_item, answer, earned, possible, marks)
  on conflict (run_id, item_id) do nothing;
  get diagnostics inserted = row_count;
  return case when inserted = 1 then 'recorded' else 'answered' end;
end;
$$;

revoke all on function public.record_practice_response(uuid, uuid, uuid, jsonb, numeric, numeric, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_practice_response(uuid, uuid, uuid, jsonb, numeric, numeric, jsonb)
  to service_role;

-- ---------------------------------------------------------------------------
-- The student's own read
-- ---------------------------------------------------------------------------

-- As in #241, with the item count taken from the caller's newest run when there is one, so
-- "3 of 21 done" counts the run the student is in. Before any run, the bank's current set.
create or replace function public.my_practice_banks()
returns table (bank_id uuid, bank_name text, item_count integer, answered integer)
language sql stable security definer set search_path = ''
as $$
  with caller as (
    select (select auth.uid()) as id
  ),
  banks as (
    select distinct s.bank_id, c.id as caller
      from caller c
      join public.class_members m on m.profile_id = c.id
      join public.bank_practice_shares s on s.class_id = m.class_id
     where c.id is not null
       and private.is_current_member(m.class_id, c.id)
  )
  select b.id,
         b.name,
         case
           when newest.id is null
             then (select count(*)::integer from private.practice_item_set(b.id))
           else (select count(*)::integer from private.practice_run_set(newest.id))
         end,
         coalesce((
           select count(*)::integer
             from public.practice_responses p
            where p.run_id = newest.id
         ), 0)
    from banks x
    join public.item_banks b on b.id = x.bank_id
    left join lateral (
      select r.id from public.practice_runs r
       where r.student_id = x.caller and r.bank_id = b.id
       order by r.started_at desc, r.id desc
       limit 1
    ) newest on true
   order by b.name, b.id
   limit 200;
$$;

revoke all on function public.my_practice_banks() from public, anon;
grant execute on function public.my_practice_banks() to authenticated;
