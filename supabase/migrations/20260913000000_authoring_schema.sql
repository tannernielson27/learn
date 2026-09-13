-- Authoring schema (#65): orgs, profiles, item banks, items, versions and case studies.
-- Everything is org-scoped for RLS from day one, even with one org.
--
-- Owner decision 2026-09-12: sign-up is open and every new account joins the single org as an
-- instructor. Revisit before real students arrive (Sprint 7). Tightening it is a change to
-- private.handle_new_user(), not to the tables.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Orgs and profiles
-- ---------------------------------------------------------------------------

create table public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  created_at timestamptz not null default now()
);

create type public.org_role as enum ('instructor', 'student', 'admin');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  org_id uuid references public.orgs (id) on delete set null,
  role public.org_role,
  display_name text check (length(display_name) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_org_and_role_together check ((org_id is null) = (role is null))
);
create index profiles_org_id_idx on public.profiles (org_id);

-- ---------------------------------------------------------------------------
-- Helpers. The private schema is not exposed through the Data API.
-- ---------------------------------------------------------------------------

create function private.current_org_id() returns uuid
language sql stable security definer set search_path = ''
as $$ select org_id from public.profiles where id = (select auth.uid()) $$;

create function private.is_author() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role in ('instructor', 'admin')
  )
$$;

grant usage on schema private to authenticated;
grant execute on function private.current_org_id() to authenticated;
grant execute on function private.is_author() to authenticated;

create function private.set_updated_at() returns trigger
language plpgsql set search_path = ''
as $$ begin new.updated_at = now(); return new; end $$;

create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  target_org uuid;
begin
  -- Serialize first sign-ins so two at once cannot each create an org.
  perform pg_advisory_xact_lock(hashtext('learn.default_org'));
  select id into target_org from public.orgs order by created_at, id limit 1;
  if target_org is null then
    insert into public.orgs (name) values ('LeaRN') returning id into target_org;
  end if;
  insert into public.profiles (id, org_id, role) values (new.id, target_org, 'instructor');
  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Banks, items, versions, case studies
-- ---------------------------------------------------------------------------

create type public.content_status as enum ('draft', 'published', 'archived');

create table public.item_banks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  folder_path text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint item_banks_id_org_key unique (id, org_id)
);
create index item_banks_org_id_idx on public.item_banks (org_id);
create index item_banks_created_by_idx on public.item_banks (created_by);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  bank_id uuid not null,
  org_id uuid not null,
  type text not null check (type in (
    'multiple_choice', 'multiple_response', 'multiple_response_grouping',
    'matrix_multiple_choice', 'matrix_multiple_response', 'dropdown_cloze',
    'dropdown_rationale', 'dropdown_table', 'highlight_text', 'highlight_table',
    'dragdrop_cloze', 'dragdrop_rationale', 'ordered_response', 'bowtie')),
  cjmm_step smallint check (cjmm_step between 1 and 6),
  tags text[] not null default '{}',
  version integer not null default 1 check (version >= 1),
  status public.content_status not null default 'draft',
  -- The item without answerKey and rationale, so a keyless read never has to strip JSON.
  content jsonb not null,
  answer_key jsonb not null,
  rationale jsonb not null default '{}',
  scoring jsonb not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Lets versions and case study slots require the item's own org.
  constraint items_id_org_key unique (id, org_id),
  -- An item's org is always its bank's org; RLS can then filter on org_id without a join.
  constraint items_bank_org_fkey foreign key (bank_id, org_id)
    references public.item_banks (id, org_id) on delete cascade
);
create index items_bank_id_type_idx on public.items (bank_id, type);
create index items_org_id_idx on public.items (org_id);
create index items_created_by_idx on public.items (created_by);

create table public.item_versions (
  item_id uuid not null,
  version integer not null check (version >= 1),
  org_id uuid not null references public.orgs (id) on delete cascade,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  primary key (item_id, version),
  -- A version belongs to an item in the same org; RLS alone checks only the row's own org_id.
  constraint item_versions_item_org_fkey foreign key (item_id, org_id)
    references public.items (id, org_id) on delete cascade
);
create index item_versions_org_id_idx on public.item_versions (org_id);

create table public.case_studies (
  id uuid primary key default gen_random_uuid(),
  bank_id uuid not null,
  org_id uuid not null,
  title text not null check (length(title) between 1 and 200),
  ehr jsonb not null,
  tags text[] not null default '{}',
  status public.content_status not null default 'draft',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint case_studies_id_org_key unique (id, org_id),
  constraint case_studies_bank_org_fkey foreign key (bank_id, org_id)
    references public.item_banks (id, org_id) on delete cascade
);
create index case_studies_bank_id_idx on public.case_studies (bank_id);
create index case_studies_org_id_idx on public.case_studies (org_id);
create index case_studies_created_by_idx on public.case_studies (created_by);

create table public.case_study_items (
  case_study_id uuid not null,
  org_id uuid not null,
  position smallint not null check (position between 1 and 6),
  item_id uuid not null,
  primary key (case_study_id, position),
  constraint case_study_items_item_once unique (case_study_id, item_id),
  constraint case_study_items_item_org_fkey foreign key (item_id, org_id)
    references public.items (id, org_id) on delete restrict,
  constraint case_study_items_case_org_fkey foreign key (case_study_id, org_id)
    references public.case_studies (id, org_id) on delete cascade
);
create index case_study_items_item_id_idx on public.case_study_items (item_id);
create index case_study_items_org_id_idx on public.case_study_items (org_id);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger item_banks_updated_at before update on public.item_banks
  for each row execute function private.set_updated_at();
create trigger items_updated_at before update on public.items
  for each row execute function private.set_updated_at();
create trigger case_studies_updated_at before update on public.case_studies
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Privileges and RLS. Authors (instructor, admin) work inside their own org. Students have no
-- table access in Phase 2; keyless play goes through a server route that strips keys (#72).
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;

-- Supabase grants ALL on public tables to authenticated. RLS does not apply to TRUNCATE, so a
-- signed-in user could otherwise empty every org's tables. Also covers tables made later.
revoke truncate, references, trigger on all tables in schema public from authenticated;
alter default privileges in schema public
  revoke truncate, references, trigger on tables from anon, authenticated;

alter table public.orgs enable row level security;
alter table public.profiles enable row level security;
alter table public.item_banks enable row level security;
alter table public.items enable row level security;
alter table public.item_versions enable row level security;
alter table public.case_studies enable row level security;
alter table public.case_study_items enable row level security;

create policy "members read their org" on public.orgs
  for select to authenticated
  using (id = (select private.current_org_id()));

create policy "users read their own profile" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy "users rename themselves" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Only display_name is user-editable; role and org come from the trigger or an admin.
revoke insert, update, delete on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;
revoke insert, update, delete on public.orgs from authenticated;

create policy "authors manage banks" on public.item_banks
  for all to authenticated
  using ((select private.is_author()) and org_id = (select private.current_org_id()))
  with check ((select private.is_author()) and org_id = (select private.current_org_id()));

create policy "authors manage items" on public.items
  for all to authenticated
  using ((select private.is_author()) and org_id = (select private.current_org_id()))
  with check ((select private.is_author()) and org_id = (select private.current_org_id()));

create policy "authors read versions" on public.item_versions
  for select to authenticated
  using ((select private.is_author()) and org_id = (select private.current_org_id()));

create policy "authors append versions" on public.item_versions
  for insert to authenticated
  with check ((select private.is_author()) and org_id = (select private.current_org_id()));

revoke update, delete on public.item_versions from authenticated;

create policy "authors manage case studies" on public.case_studies
  for all to authenticated
  using ((select private.is_author()) and org_id = (select private.current_org_id()))
  with check ((select private.is_author()) and org_id = (select private.current_org_id()));

create policy "authors manage case study items" on public.case_study_items
  for all to authenticated
  using ((select private.is_author()) and org_id = (select private.current_org_id()))
  with check ((select private.is_author()) and org_id = (select private.current_org_id()));
