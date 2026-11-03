-- One trial record per Stripe subscription (#518 follow-up, milestone S15: Billing, ADR 0016).
--
-- Checkout fires checkout.session.completed, customer.subscription.created and invoice.paid in
-- the same second. Each delivery runs the sync, and each sync asks may_start_trial and then calls
-- record_trial_use. Two deliveries can both ask before either inserts, so the local walk of #551
-- recorded one subscription's trial twice, 1.5 ms apart. Both rows block a second trial, so no one
-- gained anything, but the log of who trialed is wrong.
--
-- This makes the subscription the key: a partial unique index on stripe_subscription_id, and
-- record_trial_use inserts with `on conflict do nothing`, so the second delivery is a no-op.
-- Rows with no subscription id (none are written today) are left out of the index.
--
-- Duplicates already recorded for one subscription say nothing the first row does not, so all but
-- the earliest are removed before the index is built.

delete from private.trial_uses t
 using private.trial_uses earlier
 where t.stripe_subscription_id is not null
   and earlier.stripe_subscription_id = t.stripe_subscription_id
   and (earlier.started_at, earlier.id) < (t.started_at, t.id);

create unique index trial_uses_subscription_once
  on private.trial_uses (stripe_subscription_id)
  where stripe_subscription_id is not null;

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
  values (p_profile, address, p_org, p_subscription)
  on conflict (stripe_subscription_id) where stripe_subscription_id is not null do nothing;
end;
$$;

revoke all on function public.record_trial_use(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.record_trial_use(uuid, uuid, text) to service_role;
