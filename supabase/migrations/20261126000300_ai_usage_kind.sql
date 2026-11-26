-- One monthly AI cap for import and drafting (#621, ADR 0018 decision 1).
--
-- What changes
-- ------------
--   private.ai_usage_reservations.kind
--       What a reservation is for: 'import' (every reservation before this migration, and the
--       default), 'draft_rationale' or 'draft_variant'. Existing rows read 'import' (the column's
--       default fills them). A drafting reservation belongs to no import batch.
--   public.reserve_ai_usage(org, pages, cost_usd, batch, kind)   SERVICE ROLE ONLY
--       Gains `p_kind text default 'import'`, last, so every existing call (three or four
--       arguments, by position or by name) is unchanged and records 'import'. The old
--       four-argument function is dropped in the same transaction, so no overload of it is left
--       to call. Everything else is as `20261015000000_ai_import.sql` made it: the workspace
--       switch (`orgs.ai_import_enabled`) and the cap (`orgs.ai_import_monthly_cap_usd`, and the
--       page cap when set) are checked here for every kind, against the one `public.ai_usage` row
--       per workspace and month, under that row's lock. A drafting call reserves no pages.
--
-- `public.ai_usage` and `settle_ai_usage` do not change: one row per workspace and month, so the
-- cap stays one cap. The code names keep "import"; the interface calls it the workspace's monthly
-- AI allowance (ADR 0018).
--
-- Backward compatible with the app deployed before it (docs/05 §7.1): that app calls with named
-- arguments p_org, p_pages, p_cost_usd and p_batch, which still resolve to the new function.

alter table private.ai_usage_reservations
  add column kind text not null default 'import',
  add constraint ai_usage_reservations_kind_check
    check (kind in ('import', 'draft_rationale', 'draft_variant')),
  add constraint ai_usage_reservations_draft_batch_check
    check (kind = 'import' or batch_id is null);

comment on column private.ai_usage_reservations.kind is
  'What the reservation is for: import, draft_rationale or draft_variant (#621, ADR 0018). All share the workspace''s one monthly cap.';

drop function public.reserve_ai_usage(uuid, integer, numeric, uuid);

create function public.reserve_ai_usage(
  p_org uuid,
  p_pages integer,
  p_cost_usd numeric,
  p_batch uuid default null,
  p_kind text default 'import'
)
returns table (
  allowed boolean,
  reason text,
  reservation_id uuid,
  remaining_usd numeric,
  remaining_pages integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  this_month date := date_trunc('month', now() at time zone 'utc')::date;
  enabled boolean;
  cap_usd numeric;
  cap_pages integer;
  month_row public.ai_usage%rowtype;
  committed_usd numeric;
  committed_pages integer;
  new_id uuid;
begin
  if p_org is null then
    raise exception 'reserve_ai_usage: the workspace is required' using errcode = '22023';
  end if;
  if p_pages is null or p_pages not between 0 and 1000 then
    raise exception 'reserve_ai_usage: pages must be between 0 and 1000' using errcode = '22023';
  end if;
  if p_cost_usd is null or p_cost_usd < 0 or p_cost_usd > 100 then
    raise exception 'reserve_ai_usage: cost_usd must be between 0 and 100'
      using errcode = '22023';
  end if;
  if p_kind is null or p_kind not in ('import', 'draft_rationale', 'draft_variant') then
    raise exception 'reserve_ai_usage: kind must be import, draft_rationale or draft_variant'
      using errcode = '22023';
  end if;
  if p_kind <> 'import' and p_batch is not null then
    raise exception 'reserve_ai_usage: a drafting call belongs to no import batch'
      using errcode = '22023';
  end if;

  select o.ai_import_enabled, o.ai_import_monthly_cap_usd, o.ai_import_monthly_page_cap
    into enabled, cap_usd, cap_pages
    from public.orgs o
   where o.id = p_org;
  if not found then
    raise exception 'reserve_ai_usage: no such workspace' using errcode = 'P0002';
  end if;
  if p_batch is not null and not exists (
    select 1 from public.ai_import_batches b where b.id = p_batch and b.org_id = p_org
  ) then
    raise exception 'reserve_ai_usage: that batch is not in this workspace'
      using errcode = '22023';
  end if;
  -- AI is off for this workspace (#355; ADR 0018 decision 2, for drafting too): nothing is
  -- reserved, and no row is made.
  if not enabled then
    return query select false, 'disabled'::text, null::uuid, null::numeric, null::integer;
    return;
  end if;

  -- The month's row, made if needed and then locked: every reservation and settlement for this
  -- workspace and month, of every kind, queues here, so the check and the increment below are one
  -- step and import and drafting cannot pass the cap together.
  insert into public.ai_usage (org_id, month) values (p_org, this_month)
    on conflict (org_id, month) do nothing;
  select * into month_row from public.ai_usage u
   where u.org_id = p_org and u.month = this_month
     for update;

  committed_usd := month_row.cost_used_usd + month_row.cost_reserved_usd;
  committed_pages := month_row.pages_used + month_row.pages_reserved;

  if committed_usd + p_cost_usd > cap_usd
     or (cap_pages is not null and committed_pages + p_pages > cap_pages) then
    return query select false, 'cap_reached'::text, null::uuid,
      greatest(cap_usd - committed_usd, 0),
      case when cap_pages is null then null else greatest(cap_pages - committed_pages, 0) end;
    return;
  end if;

  update public.ai_usage u
     set cost_reserved_usd = u.cost_reserved_usd + p_cost_usd,
         pages_reserved = u.pages_reserved + p_pages,
         updated_at = now()
   where u.org_id = p_org and u.month = this_month;

  insert into private.ai_usage_reservations
    (org_id, month, batch_id, pages_reserved, cost_reserved_usd, kind)
  values (p_org, this_month, p_batch, p_pages, p_cost_usd, p_kind)
  returning id into new_id;

  return query select true, 'ok'::text, new_id,
    greatest(cap_usd - committed_usd - p_cost_usd, 0),
    case when cap_pages is null then null
         else greatest(cap_pages - committed_pages - p_pages, 0) end;
end;
$$;

revoke all on function public.reserve_ai_usage(uuid, integer, numeric, uuid, text)
  from public, anon, authenticated;
grant execute on function public.reserve_ai_usage(uuid, integer, numeric, uuid, text)
  to service_role;
