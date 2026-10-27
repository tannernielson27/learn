-- Billing state, free-access grants and the access check (#517, milestone S15: Billing, ADR 0016).
-- Owner decisions 2026-10-27: a flat monthly price per workspace, a 7-day trial through Stripe
-- Checkout, beta passes and grandfathering that grant free access until revoked, and the shared
-- workspace exempt.
--
-- NOTHING HERE IS ENFORCED. No existing policy, function or page reads any of it. It adds the
-- tables the webhook (#518) writes, the read the billing page (#519) makes, and the check #521
-- will add to the write policies. Pushing it changes nothing a teacher or student can do, and an
-- app deployed before it is pushed does not call it.
--
-- ---------------------------------------------------------------------------
-- What each object is
-- ---------------------------------------------------------------------------
--
--   public.workspace_billing   One row per workspace that has a Stripe customer: the customer,
--                              the subscription (null until Checkout completes), its status as
--                              Stripe last reported it, the price's lookup key, the period and
--                              trial ends, cancel-at-period-end, the billing email and livemode.
--                              Written only by the server with the secret key (the webhook
--                              re-fetches the subscription and writes it whole). A teacher of the
--                              workspace reads the status columns and nothing that names Stripe
--                              or an email; a student, another workspace's teacher and anon read
--                              nothing.
--   public.access_grants       Free access that does not come from Stripe: `exempt` (the shared
--                              workspace), `grandfathered` (every self-registered workspace that
--                              exists when this is pushed) and `beta` (an owner-issued beta pass,
--                              #520). A grant counts while `revoked_at` is null and `expires_at`
--                              is null or in the future. A grant is revoked, never deleted, so the
--                              history stays. At most one unrevoked grant per workspace and kind
--                              (an expired one must be revoked before the same kind is granted
--                              again). Written only by the server and the owner. A teacher of the
--                              workspace reads its kind and dates, never `reason` or `granted_by`.
--   private.trial_uses         One row per free trial started. Stripe does not dedupe trials, and
--                              a person can be in several workspaces over time (sign-up,
--                              `remove_org_member`, a move by invitation), so a trial is
--                              remembered by person, by the address they signed in with, and by
--                              workspace. A row outlives the profile and the workspace (set null)
--                              so a deleted and re-made account at the same address is still
--                              recognised.
--   private.stripe_events      Every Stripe event id the webhook has claimed, so a redelivered
--                              event is not processed twice.
--   private.billing_config     One row. `livemode` is the Stripe mode this database belongs to:
--                              false (the sandbox) until the production split (ADR 0006,
--                              docs/05 §7.3); the owner sets it to true on the production project
--                              only, after the split and before live keys are on Vercel. A
--                              subscription grants access only when its row's livemode matches.
--                              `enforced` is read by #521, by nothing here.
--
-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------
--
-- private.org_has_access(p_org uuid) returns boolean                             OWNER ONLY
--   True when the workspace has a grant that counts, or a workspace_billing row whose status is
--   trialing, active or past_due (a failed payment keeps access while Stripe retries) and whose
--   livemode is billing_config's. Everything else, including no row, is false.
-- private.current_org_has_access() returns boolean                  authenticated, service_role
--   org_has_access for the caller's own workspace; false for an account with none. For #521's
--   policies. Nothing calls it yet.
-- public.workspace_access()                                                    authenticated
--   One row for a teacher of a workspace, about their own workspace, for the billing page:
--   has_access, source ('grant', 'subscription' or 'none'), grant_kind (the counting grant, in
--   the order exempt, grandfathered, beta), and the subscription's status, trial_end,
--   current_period_end and cancel_at_period_end when its livemode matches (null otherwise), and
--   is_founder (the caller founded the workspace: only they manage billing). A grant wins over a
--   subscription for `source`; the subscription's columns are filled either way. A student or an
--   account with no role gets no row, as `org_members()` answers them; anon cannot call it.
-- public.may_start_trial(p_profile uuid, p_org uuid) returns boolean       SERVICE ROLE ONLY
--   False when a trial was started by this person, at this person's current sign-in address
--   (lower, trimmed), or for this workspace. The Checkout route (#518) asks before offering a
--   trial and sends no trial when it is false.
-- public.record_trial_use(p_profile uuid, p_org uuid, p_subscription text)  SERVICE ROLE ONLY
--   Records a trial once Stripe reports one started. Raises P0002 when no account has that id.
-- public.claim_stripe_event(p_id text, p_type text, p_livemode boolean) returns boolean
--                                                                          SERVICE ROLE ONLY
--   True when the event id is new (and now recorded), false when it was claimed before.
-- private.grant_existing_workspaces(p_created_before timestamptz)          OWNER ONLY
--   The backfill below: an `exempt` grant for every workspace that is not self-registered and a
--   `grandfathered` one for every self-registered workspace, each made before the cutoff and
--   without an unrevoked grant of that kind. Called once by this migration with no cutoff
--   ('infinity': everything that exists then). Kept so the pgTAP file can test the backfill
--   itself, with a cutoff; nobody else may call it.
--
-- ---------------------------------------------------------------------------
-- The backfill
-- ---------------------------------------------------------------------------
--
-- Runs once: only in the run that creates `public.access_grants` (the same guard as the
-- founder_id backfill in 20261011000000). A workspace made after that run is not grandfathered,
-- and a second run adds nothing. On a fresh database (local, CI) no workspace exists yet when
-- this runs, because seed.sql comes after the migrations, so the seeded shared workspace has no
-- grant there; that matters only once #521 enforces.
--
-- ---------------------------------------------------------------------------
-- Left for #521 (it must do these before `enforced` means anything)
-- ---------------------------------------------------------------------------
--
--   * The write policies and SECURITY INVOKER functions (start_session and the rest) check
--     `private.current_org_has_access()` when `billing_config.enforced` is true.
--   * `sweep_abandoned_workspaces` (20261012000000, ADR 0012) never deletes a workspace with a
--     workspace_billing row or any access grant.
--   * `accept_org_invite` (ADR 0011) refuses to move a founder whose workspace has a
--     subscription that is trialing, active or past_due until it is cancelled.
--   * `remove_org_member` makes a new workspace for the removed teacher; that workspace gets no
--     grant and, per private.trial_uses, no second trial for that teacher.
--   None of these is changed here.
--
-- Safe to replay: tables and indexes are made only if missing, policies are dropped and remade,
-- functions are `create or replace` with their grants restated, the config row is inserted on
-- conflict do nothing, and the backfill runs only in the run that made access_grants.

-- Whether this run is the one that makes access_grants, for the backfill at the end. A session
-- setting, so it holds whether or not the CLI wraps this file in one transaction.
select set_config(
  'learn.billing_first_run',
  (to_regclass('public.access_grants') is null)::text,
  false
);

-- ---------------------------------------------------------------------------
-- Config
-- ---------------------------------------------------------------------------

create table if not exists private.billing_config (
  id boolean primary key default true,
  livemode boolean not null default false,
  enforced boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint billing_config_single_row check (id)
);

insert into private.billing_config (id) values (true) on conflict do nothing;

alter table private.billing_config enable row level security;
revoke all on private.billing_config from public, anon, authenticated, service_role;

drop trigger if exists billing_config_updated_at on private.billing_config;
create trigger billing_config_updated_at before update on private.billing_config
  for each row execute function private.set_updated_at();

comment on table private.billing_config is
  'One row. livemode: the Stripe mode this database belongs to; the owner sets it true on the '
  'production project only, after the split (docs/05 §7.3). enforced: read by #521, by nothing '
  'in 20261027000000_billing.sql.';

-- ---------------------------------------------------------------------------
-- Workspace billing
-- ---------------------------------------------------------------------------

create table if not exists public.workspace_billing (
  org_id uuid primary key references public.orgs (id) on delete cascade,
  stripe_customer_id text not null,
  stripe_subscription_id text,
  -- Null: a customer was made, no subscription yet.
  status text,
  price_lookup_key text,
  current_period_end timestamptz,
  trial_end timestamptz,
  cancel_at_period_end boolean not null default false,
  billing_email text,
  livemode boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_billing_stripe_customer_id_key unique (stripe_customer_id),
  constraint workspace_billing_stripe_subscription_id_key unique (stripe_subscription_id),
  constraint workspace_billing_status_check check (status in (
    'trialing', 'active', 'past_due', 'unpaid', 'canceled', 'incomplete', 'incomplete_expired',
    'paused'))
);

drop trigger if exists workspace_billing_updated_at on public.workspace_billing;
create trigger workspace_billing_updated_at before update on public.workspace_billing
  for each row execute function private.set_updated_at();

alter table public.workspace_billing enable row level security;
revoke all on public.workspace_billing from public, anon, authenticated;
grant select, insert, update, delete on public.workspace_billing to service_role;
-- A list: a column added later is not readable by a teacher until a migration grants it.
grant select (
  org_id,
  status,
  current_period_end,
  trial_end,
  cancel_at_period_end,
  price_lookup_key,
  livemode,
  updated_at
) on public.workspace_billing to authenticated;

drop policy if exists "authors read their workspace billing" on public.workspace_billing;
create policy "authors read their workspace billing" on public.workspace_billing
  for select to authenticated
  using ((select private.is_author()) and org_id = (select private.current_org_id()));

comment on table public.workspace_billing is
  'The workspace''s Stripe customer and subscription as the webhook last synced them (#517). '
  'Written by the server only. Teachers of the workspace read the status columns, never the '
  'Stripe ids or billing_email.';
comment on column public.workspace_billing.status is
  'Stripe subscription status, or null for a customer with no subscription yet. trialing, active '
  'and past_due grant access when livemode matches private.billing_config.';
comment on column public.workspace_billing.livemode is
  'Stripe livemode of the customer and subscription. A row from the other mode grants nothing.';

-- ---------------------------------------------------------------------------
-- Access grants
-- ---------------------------------------------------------------------------

create table if not exists public.access_grants (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  kind text not null,
  reason text,
  -- 'migration', 'owner', or a beta pass reference.
  granted_by text not null,
  -- Null: until revoked.
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint access_grants_kind_check check (kind in ('exempt', 'grandfathered', 'beta'))
);

create index if not exists access_grants_org_id_idx on public.access_grants (org_id);
-- At most one unrevoked grant per workspace and kind. Also what the backfill's
-- `on conflict do nothing` leans on.
create unique index if not exists access_grants_org_kind_open_key
  on public.access_grants (org_id, kind) where revoked_at is null;

alter table public.access_grants enable row level security;
revoke all on public.access_grants from public, anon, authenticated;
grant select, insert, update, delete on public.access_grants to service_role;
grant select (org_id, kind, expires_at, revoked_at, created_at)
  on public.access_grants to authenticated;

drop policy if exists "authors read their workspace grants" on public.access_grants;
create policy "authors read their workspace grants" on public.access_grants
  for select to authenticated
  using ((select private.is_author()) and org_id = (select private.current_org_id()));

comment on table public.access_grants is
  'Free access that does not come from Stripe: exempt, grandfathered or beta (#517). Counts while '
  'revoked_at is null and expires_at is null or in the future. Revoke, never delete. Teachers of '
  'the workspace read kind and dates, never reason or granted_by.';

-- ---------------------------------------------------------------------------
-- Trials
-- ---------------------------------------------------------------------------

create table if not exists private.trial_uses (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id) on delete set null,
  email_normalized text not null,
  org_id uuid references public.orgs (id) on delete set null,
  stripe_subscription_id text,
  started_at timestamptz not null default now()
);

create index if not exists trial_uses_email_normalized_idx on private.trial_uses (email_normalized);
create index if not exists trial_uses_profile_id_idx on private.trial_uses (profile_id);
create index if not exists trial_uses_org_id_idx on private.trial_uses (org_id);

alter table private.trial_uses enable row level security;
revoke all on private.trial_uses from public, anon, authenticated, service_role;

comment on table private.trial_uses is
  'One row per free trial started, by person, address and workspace (#517). Read and written only '
  'by may_start_trial and record_trial_use.';

-- ---------------------------------------------------------------------------
-- Stripe events
-- ---------------------------------------------------------------------------

create table if not exists private.stripe_events (
  id text primary key,
  type text not null,
  livemode boolean not null,
  received_at timestamptz not null default now()
);

alter table private.stripe_events enable row level security;
revoke all on private.stripe_events from public, anon, authenticated, service_role;

comment on table private.stripe_events is
  'Every Stripe event id the webhook has claimed (#517), so a redelivery is processed once.';

-- ---------------------------------------------------------------------------
-- The access check
-- ---------------------------------------------------------------------------

create or replace function private.org_has_access(p_org uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
           select 1 from public.access_grants g
            where g.org_id = p_org
              and g.revoked_at is null
              and (g.expires_at is null or g.expires_at > now())
         )
      or exists (
           select 1 from public.workspace_billing b
            where b.org_id = p_org
              and b.status in ('trialing', 'active', 'past_due')
              and b.livemode = (select c.livemode from private.billing_config c where c.id)
         );
$$;

-- Owner only. Callers reach it through current_org_has_access (a definer) or, from #521, a policy
-- or definer function; service_role has no USAGE on `private` anyway.
revoke all on function private.org_has_access(uuid)
  from public, anon, authenticated, service_role;

create or replace function private.current_org_has_access() returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(private.org_has_access((select private.current_org_id())), false);
$$;

revoke all on function private.current_org_has_access() from public, anon;
grant execute on function private.current_org_has_access() to authenticated, service_role;

create or replace function public.workspace_access()
returns table (
  has_access boolean,
  source text,
  grant_kind text,
  status text,
  trial_end timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean,
  is_founder boolean
)
language sql stable security definer set search_path = ''
as $$
  with me as (
    select o.id as org_id, o.founder_id
      from public.orgs o
     where (select private.is_author())
       and o.id = (select private.current_org_id())
  ),
  counting_grant as (
    select g.kind
      from public.access_grants g, me
     where g.org_id = me.org_id
       and g.revoked_at is null
       and (g.expires_at is null or g.expires_at > now())
     order by array_position(array['exempt', 'grandfathered', 'beta'], g.kind)
     limit 1
  ),
  subscription as (
    select b.status, b.trial_end, b.current_period_end, b.cancel_at_period_end
      from public.workspace_billing b, me
     where b.org_id = me.org_id
       and b.livemode = (select c.livemode from private.billing_config c where c.id)
  )
  select (cg.kind is not null or s.status in ('trialing', 'active', 'past_due')) as has_access,
         case
           when cg.kind is not null then 'grant'
           when s.status in ('trialing', 'active', 'past_due') then 'subscription'
           else 'none'
         end as source,
         cg.kind as grant_kind,
         s.status,
         s.trial_end,
         s.current_period_end,
         coalesce(s.cancel_at_period_end, false) as cancel_at_period_end,
         coalesce(me.founder_id = (select auth.uid()), false) as is_founder
    from me
    left join counting_grant cg on true
    left join subscription s on true;
$$;

revoke all on function public.workspace_access() from public, anon;
grant execute on function public.workspace_access() to authenticated;

-- ---------------------------------------------------------------------------
-- Trials: may one start, and record one
-- ---------------------------------------------------------------------------

create or replace function public.may_start_trial(p_profile uuid, p_org uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select not exists (
    select 1 from private.trial_uses t
     where t.profile_id = p_profile
        or t.org_id = p_org
        or t.email_normalized = (
             select lower(trim(u.email::text)) from auth.users u where u.id = p_profile
           )
  );
$$;

revoke all on function public.may_start_trial(uuid, uuid) from public, anon, authenticated;
grant execute on function public.may_start_trial(uuid, uuid) to service_role;

create or replace function public.record_trial_use(
  p_profile uuid,
  p_org uuid,
  p_subscription text
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  address text;
begin
  select lower(trim(u.email::text)) into address from auth.users u where u.id = p_profile;
  if address is null then
    raise exception 'no account with that id' using errcode = 'P0002';
  end if;

  insert into private.trial_uses (profile_id, email_normalized, org_id, stripe_subscription_id)
  values (p_profile, address, p_org, p_subscription);
end;
$$;

revoke all on function public.record_trial_use(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.record_trial_use(uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Stripe events: claim one
-- ---------------------------------------------------------------------------

create or replace function public.claim_stripe_event(
  p_id text,
  p_type text,
  p_livemode boolean
) returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  insert into private.stripe_events (id, type, livemode)
  values (p_id, p_type, p_livemode)
  on conflict (id) do nothing;
  return found;
end;
$$;

revoke all on function public.claim_stripe_event(text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.claim_stripe_event(text, text, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- The backfill
-- ---------------------------------------------------------------------------

create or replace function private.grant_existing_workspaces(p_created_before timestamptz)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.access_grants (org_id, kind, reason, granted_by)
  select o.id,
         case when o.self_registered then 'grandfathered' else 'exempt' end,
         case when o.self_registered then 'existed before billing, 2026-10-27'
              else 'shared workspace' end,
         'migration'
    from public.orgs o
   where o.created_at < p_created_before
  on conflict (org_id, kind) where revoked_at is null do nothing;
$$;

revoke all on function private.grant_existing_workspaces(timestamptz)
  from public, anon, authenticated, service_role;

do $$
begin
  if current_setting('learn.billing_first_run', true) = 'true' then
    -- Every workspace there is at this moment existed before billing.
    perform private.grant_existing_workspaces('infinity');
  end if;
end
$$;
