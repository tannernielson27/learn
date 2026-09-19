-- Sprint 5 polish (#111): starting a case study step in one locked call, and a per-user rate limit
-- on authoring mutations.

-- ---------------------------------------------------------------------------
-- Starting (or changing the type of) one step, atomically
-- ---------------------------------------------------------------------------

-- One call creates the step's new draft item in the case study's own bank, places it (through
-- place_case_study_step, which also pins its CJMM step), marks the case study a draft again, and
-- removes the step's previous item if it is still a draft. The case study row is locked first, so
-- two tabs changing the same step take turns: the second sees the first's new item as the step's
-- previous item and removes it, instead of both reading the same old item and leaving one new
-- draft orphaned in the bank. Any failure rolls the whole call back.
--
-- Security invoker: RLS decides what the caller may see and write. A case study the caller cannot
-- see (gone, or another org's) raises P0002, so the app can say it no longer exists.
create function public.start_case_study_step(target uuid, step_position smallint, step_type text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  case_bank uuid;
  case_org uuid;
  previous_item uuid;
  new_item uuid;
begin
  if step_position is null or step_position < 1 or step_position > 6 then
    raise exception 'a step position is 1 to 6' using errcode = '22023';
  end if;

  -- Taken before the steps' own locks (in place_case_study_step), and neither reorder nor place
  -- locks the case study row, so this adds no lock cycle with them.
  select cs.bank_id, cs.org_id into case_bank, case_org
    from public.case_studies cs
   where cs.id = target
     for update;
  if not found then
    raise exception 'that case study does not exist' using errcode = 'P0002';
  end if;

  -- The steps are locked too (in the same order as reorder and place), so a reorder cannot move
  -- another item into this position between reading it here and replacing it. Read after the
  -- locks, so a change that committed while this call waited is seen.
  perform 1 from public.case_study_items where case_study_id = target order by position for update;
  select csi.item_id into previous_item
    from public.case_study_items csi
   where csi.case_study_id = target and csi.position = step_position;

  -- An empty draft, as the bank's New item starts one; its editor fills it in.
  insert into public.items
    (bank_id, org_id, type, status, content, answer_key, scoring, cjmm_step, created_by)
  values
    (case_bank, case_org, step_type, 'draft', '{"stem": {"kind": "markdown", "value": ""}}',
     '{}', '{}', step_position, (select auth.uid()))
  returning id into new_item;

  perform public.place_case_study_step(target, step_position, new_item);

  -- A new step starts unfinished, so a published case study is a draft again until republished.
  update public.case_studies set status = 'draft' where id = target;

  -- A published previous item stays in the bank. A draft one the database still refuses to delete
  -- (something else holds a key to it) stays too, as before; only that refusal is set aside.
  if previous_item is not null then
    begin
      delete from public.items where id = previous_item and status = 'draft';
    exception when foreign_key_violation then
      null;
    end;
  end if;

  return new_item;
end;
$$;

revoke all on function public.start_case_study_step(uuid, smallint, text) from public, anon;
grant execute on function public.start_case_study_step(uuid, smallint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Rate limits: a fixed-window counter per user and action
-- ---------------------------------------------------------------------------

-- The app's authoring actions (save, publish, import, step changes) count each call here before
-- writing. It limits the authoring UI; it is not a trigger on the tables, so an author's own
-- session token used against the Data API directly is still bounded only by RLS (authors are
-- trusted members of their org, and nothing public can write).
-- Vercel's serverless functions share no memory, so the count lives here. One row per user and
-- action: the table never grows past users x actions. Keyed to auth.users (not profiles) and
-- removed with the user: a counter means nothing without its user.
create table private.rate_limits (
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null,
  window_start timestamptz not null,
  calls integer not null check (calls >= 1),
  primary key (user_id, action)
);

alter table private.rate_limits enable row level security;
revoke all on private.rate_limits from public, anon, authenticated;

-- Counts one call of an action by the signed-in user and says whether it is within the limit. The
-- limits live here rather than in the caller's arguments: a caller who could pass its own window
-- could reset its counter between the app's calls. Every window is one minute; the limits are
-- generous, so an author working normally never meets them.
--   save    60 a minute (item drafts and the case study record)
--   publish 20 a minute (items and case studies)
--   import  10 a minute
--   step    30 a minute (starting a step or changing its type)
-- Security definer, so it can write the private table the caller cannot touch; it only ever
-- writes the caller's own rows. Calls over the limit are still counted (capped), so hammering
-- does not shorten the wait.
create function private.take_rate_limit(action_name text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  limit_calls integer;
  window_length constant interval := interval '1 minute';
  used integer;
begin
  if caller is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;

  limit_calls := case action_name
    when 'save' then 60
    when 'publish' then 20
    when 'import' then 10
    when 'step' then 30
  end;
  if limit_calls is null then
    raise exception 'that action has no rate limit' using errcode = '22023';
  end if;

  insert into private.rate_limits as r (user_id, action, window_start, calls)
  values (caller, action_name, now(), 1)
  on conflict (user_id, action) do update
    set window_start = case
          when r.window_start <= now() - window_length then now()
          else r.window_start
        end,
        calls = case
          when r.window_start <= now() - window_length then 1
          else least(r.calls + 1, limit_calls + 1)
        end
  returning calls into used;

  return used <= limit_calls;
end;
$$;

revoke all on function private.take_rate_limit(text) from public, anon;
grant execute on function private.take_rate_limit(text) to authenticated;

-- The Data API exposes only public, so the app calls this. Security invoker: the definer rights
-- stay on the private function above.
create function public.take_rate_limit(action_name text)
returns boolean
language sql
security invoker
set search_path = ''
as $$ select private.take_rate_limit(action_name) $$;

revoke all on function public.take_rate_limit(text) from public, anon;
grant execute on function public.take_rate_limit(text) to authenticated;
