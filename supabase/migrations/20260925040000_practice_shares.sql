-- Sharing a bank with a class for practice (#240), and the warning when it is assigned as graded.
--
-- An author shares one of the org's banks with one of the org's classes. That is a row here and
-- nothing more: this migration opens no read path to a bank's items, keys or rationales. The
-- practice player (#241) serves items through a server route that checks this table, one item at
-- a time, and hands out a key only after that item is answered.
--
-- Owner decision 2026-09-24: practice is opt-in per bank, and assigning practice-shared items as
-- graded work only warns (`public.practice_exposure`, read by the assign form). It never blocks.
--
-- ---------------------------------------------------------------------------
-- Who may do what
-- ---------------------------------------------------------------------------
--
--   * An author (instructor or admin) of the org creates and deletes shares, for a bank and a class
--     that are both in that org. The org comes from the author's profile (column default, checked
--     again by the policy), and the composite foreign keys require the bank and the class to be in
--     that same org. So a share across orgs is refused by the database, whatever the client sends.
--     "Who owns the class" follows #205: every author of the org manages every class of the org.
--   * A student reads the share rows of the classes they are a current member of: which bank ids
--     are shared with their class, and when. Not the bank's name, not its items, not who shared it
--     (`shared_by` is not granted for select). item_banks and items stay author-only, so a bank id
--     leads nowhere. This is what lets #241 list a student's practice banks with one indexed read.
--   * Nobody updates a share. Stopping is a delete, and it takes the bank off students' lists at
--     once: the student's read is this table, not a copy of it.
--
-- Every insert and delete is charged one `save` through private.charge_save_write, the same
-- counter as the editor (#123, authoring_trigger_coverage.test.sql).
--
-- Safe to replay on a fresh project: a new table and new functions only.

create table public.bank_practice_shares (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default private.current_org_id()
    references public.orgs (id) on delete cascade,
  bank_id uuid not null,
  class_id uuid not null,
  shared_by uuid default auth.uid() references public.profiles (id) on delete set null,
  shared_at timestamptz not null default now(),
  -- One share per bank per class. Leading with class_id, it is also the index a student's list
  -- (#241) reads through: the share rows of the few classes they belong to. org_id is in the key
  -- although class_id already fixes it, so that another org's insert of the same pair is refused by
  -- the foreign keys (23503) before the unique check could answer "that share exists" (23505).
  constraint bank_practice_shares_class_bank_key unique (class_id, bank_id, org_id),
  constraint bank_practice_shares_bank_org_fkey foreign key (bank_id, org_id)
    references public.item_banks (id, org_id) on delete cascade,
  constraint bank_practice_shares_class_org_fkey foreign key (class_id, org_id)
    references public.classes (id, org_id) on delete cascade
);

-- The bank page, the bank list's badges and the assign warning all look shares up by bank.
create index bank_practice_shares_bank_id_idx on public.bank_practice_shares (bank_id);
create index bank_practice_shares_org_id_idx on public.bank_practice_shares (org_id);
create index bank_practice_shares_shared_by_idx on public.bank_practice_shares (shared_by);

comment on table public.bank_practice_shares is
  'A bank shared with a class for practice (#240). Holds ids only; never items, keys or rationales.';

-- The authoring limit at the write (#123, #161).
create trigger bank_practice_shares_charge_authoring
  after insert or delete on public.bank_practice_shares
  for each row execute function private.charge_save_write();

-- ---------------------------------------------------------------------------
-- Privileges and RLS
-- ---------------------------------------------------------------------------

-- Supabase's default privileges hand anon and authenticated full DML on a new public table.
revoke all on public.bank_practice_shares from anon, authenticated;

-- shared_by is left out of the select grant, so a student never learns which instructor shared.
grant select (id, org_id, bank_id, class_id, shared_at)
  on public.bank_practice_shares to authenticated;
-- The org, the sharer and the time come from defaults, so a client chooses only what and to whom.
grant insert (bank_id, class_id) on public.bank_practice_shares to authenticated;
grant delete on public.bank_practice_shares to authenticated;

alter table public.bank_practice_shares enable row level security;

create policy "authors read their org's practice shares" on public.bank_practice_shares
  for select to authenticated
  using ((select private.is_author()) and org_id = (select private.current_org_id()));

-- A current member only: a removed student's membership row is gone, and so is this. The
-- membership lookup runs as the student, whose class_members policy shows them their own rows.
create policy "students see the practice shares of their own classes"
  on public.bank_practice_shares
  for select to authenticated
  using (
    exists (
      select 1 from public.class_members m
       where m.class_id = bank_practice_shares.class_id
         and m.profile_id = (select auth.uid())
    )
  );

create policy "authors share their org's banks with their org's classes"
  on public.bank_practice_shares
  for insert to authenticated
  with check ((select private.is_author()) and org_id = (select private.current_org_id()));

create policy "authors stop their org's practice shares" on public.bank_practice_shares
  for delete to authenticated
  using ((select private.is_author()) and org_id = (select private.current_org_id()));

-- ---------------------------------------------------------------------------
-- The graded-reuse warning
-- ---------------------------------------------------------------------------

-- For the assign form: which classes can already see the answers to some of what is about to be
-- assigned, and to how many of its items. One row per class, ordered by name; no rows means
-- nothing is exposed and the form shows no warning.
--
-- What is counted is what the assignment would snapshot (private.snapshot_assignment): a bank's
-- published items, or a case study's steps. An item is exposed when the bank it sits in is shared
-- with any class; `exposed_items` is that count over the whole source, the same on every row.
-- Items live in exactly one bank, and a case study's steps in the case study's own bank, so today
-- this is "all of them, or none"; the count is written per item so it stays right if that changes.
--
-- Security invoker: it reads items, case studies, shares and classes under the caller's own RLS,
-- so an author sees only their org and anyone else gets no rows. One statement, however many
-- classes the bank is shared with.
create function public.practice_exposure(
  source_bank uuid default null,
  source_case_study uuid default null
)
returns table (class_id uuid, class_name text, exposed_items integer)
language sql stable security invoker set search_path = ''
as $$
  with source_items as (
    select i.id, i.bank_id
      from public.items i
     where source_bank is not null
       and i.bank_id = source_bank
       and i.status = 'published'
    union all
    select i.id, i.bank_id
      from public.case_study_items csi
      join public.items i on i.id = csi.item_id
     where source_case_study is not null
       and csi.case_study_id = source_case_study
  ),
  exposing as (
    select s.bank_id, s.class_id
      from public.bank_practice_shares s
     where s.bank_id in (select si.bank_id from source_items si)
  ),
  exposed as (
    select count(*)::integer as n
      from source_items si
     where si.bank_id in (select e.bank_id from exposing e)
  )
  select c.id, c.name, (select n from exposed)
    from public.classes c
   where c.id in (select e.class_id from exposing e)
   order by c.name, c.id;
$$;

revoke all on function public.practice_exposure(uuid, uuid) from public, anon;
grant execute on function public.practice_exposure(uuid, uuid) to authenticated;
