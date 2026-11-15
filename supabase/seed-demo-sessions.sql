-- Demo live-session history for the LOCAL stack only (#565). Not in config.toml's sql_paths, so
-- `supabase db reset`, `pnpm test:db` and CI never load it. Run it with `pnpm seed:demo-sessions`
-- after seed.sql and seed-demo.sql have loaded (any `supabase start` or `db reset` does that).
--
-- It gives demo@learn.test about six months of classes: 60 ended sessions with rosters and
-- scored answers, plus one in the lobby and one paused, so the sessions list is as crowded as the
-- issue describes and every report has real numbers in it.
--
-- Why triggers are off: `private.guard_session_change` makes every new session start in the lobby
-- with `opened_at = now()`, and an ended one can never change again. That is right for the app
-- and makes back-dated history impossible to write the normal way. So this runs as the
-- container's superuser with `session_replication_role = replica` for this transaction only. That
-- also turns off foreign-key checks, so every id below is written to be correct, and the delete
-- at the top goes child-first. The public-state mirror the trigger would have written is
-- backfilled at the end.
--
-- Safe to re-run: it removes only its own rows (ids starting 5eed) and writes them again. The
-- numbers come from a fixed random seed, so the output is the same each time.

begin;
set local session_replication_role = replica;

-- Only this file's rows: sessions 5eed0000-…, participants 5eed0001-….
delete from public.session_responses where session_id::text like '5eed0000-%';
delete from public.participants where session_id::text like '5eed0000-%';
delete from live.session_public_state where session_id::text like '5eed0000-%';
delete from public.sessions where id::text like '5eed0000-%';

do $$
declare
  demo_org constant uuid := '00000000-0000-4000-8000-000000000001';
  demo_host constant uuid := '00000000-0000-4000-8000-00000000d3e0';
  sample_bank constant uuid := '00000000-0000-4000-8000-000000000002';
  hip_case constant uuid := '00000000-0000-4000-8000-000000000003';
  -- seed.sql's standalone questions (100–114) and the hip case study's six (115–120).
  quiz_items uuid[] := array(
    select ('00000000-0000-4000-8000-000000000' || n)::uuid from generate_series(100, 114) n
  );
  case_items uuid[] := array(
    select ('00000000-0000-4000-8000-000000000' || n)::uuid from generate_series(115, 120) n
  );
  titles text[] := array[
    'Cardiac review', 'Respiratory check-in', 'Med-surg warm-up', 'Pharmacology drill',
    'NGN practice: mixed', 'Endocrine emergencies', 'Week 3 exit ticket', 'Prioritization round',
    'Pediatrics quick quiz', 'Exam prep: day 1', 'Exam prep: day 2', 'Neuro assessment'
  ];
  sections text[] := array['Period 1', 'Period 2', 'Evening cohort', 'Section B', 'Lab group'];
  first_names text[] := array[
    'Ada', 'Bea', 'Cal', 'Dev', 'Eli', 'Fay', 'Gus', 'Hana', 'Ivo', 'Jo', 'Kai', 'Lena', 'Mo',
    'Nia', 'Oren', 'Pia', 'Quin', 'Rae', 'Sol', 'Tess', 'Uma', 'Vic', 'Wren', 'Xan', 'Yara', 'Zed'
  ];
  last_initials text := 'ABCDEFGHJKLMNPRSTW';
  code_chars constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  n integer;
  sid uuid;
  status public.session_status;
  is_case boolean;
  item_ids uuid[];
  item_count integer;
  roster integer;
  opened timestamptz;
  closed timestamptz;
  code text;
  p integer;
  pid uuid;
  skill numeric;
  pos integer;
  it record;
  frac numeric;
  answered integer;
begin
  perform setseed(0.565);

  for n in 1..62 loop
    sid := ('5eed0000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
    -- 1–60 ended, oldest first, three days apart; 61 waiting in the lobby; 62 paused mid-class.
    status := case when n = 61 then 'lobby' when n = 62 then 'paused' else 'ended' end;
    is_case := n % 7 = 0;

    if is_case then
      item_ids := case_items;
    else
      -- 5 to 12 standalone questions, in a shuffled order that differs per session.
      item_ids := (
        select array_agg(id order by r)
          from (select id, random() as r from unnest(quiz_items) id order by r limit 5 + (n % 8)) s
      );
    end if;
    item_count := array_length(item_ids, 1);

    if status = 'ended' then
      opened := date_trunc('day', now()) - make_interval(days => (61 - n) * 3)
        + make_interval(hours => 8 + (n % 9), mins => (n * 7) % 60);
      closed := opened + make_interval(mins => 12 + (n % 5) * 6);
    else
      opened := now() - make_interval(mins => 20 + n);
      closed := null;
    end if;

    code := '';
    for p in 1..6 loop
      code := code || substr(code_chars, 1 + floor(random() * 32)::integer, 1);
    end loop;

    insert into public.sessions (
      id, org_id, host_id, bank_id, case_study_id, title, code, mode, status, item_set,
      current_position, reveal, opened_at, closed_at, created_at, updated_at, patient_record
    )
    values (
      sid, demo_org, demo_host,
      case when is_case then null else sample_bank end,
      case when is_case then hip_case else null end,
      case
        when is_case then 'Case study: post-op dyspnea, ' || sections[1 + n % 5]
        else titles[1 + n % 12] || ', ' || sections[1 + (n * 3) % 5]
      end,
      code, 'instructor_paced', status, to_jsonb(item_ids),
      case when status = 'paused' then 2 else null end,
      false, opened, closed, opened, coalesce(closed, opened),
      case when is_case then (select ehr from public.case_studies where id = hip_case) else null end
    );

    -- The lobby session has nobody in it yet.
    roster := case when status = 'lobby' then 0 else 8 + floor(random() * 18)::integer end;

    for p in 1..roster loop
      pid := (
        '5eed0001-' || lpad(n::text, 4, '0') || '-4000-8000-' || lpad(p::text, 12, '0')
      )::uuid;
      insert into public.participants (
        id, session_id, org_id, display_name, rejoin_hash, joined_at, last_seen_at
      )
      values (
        pid, sid, demo_org,
        first_names[1 + floor(random() * 26)::integer] || ' '
          || substr(last_initials, 1 + floor(random() * 18)::integer, 1) || '.',
        extensions.digest(gen_random_uuid()::text, 'sha256'),
        opened + make_interval(secs => p * 5), coalesce(closed, now())
      );

      -- How strong this student is, from about 35% to 95%.
      skill := 0.35 + random() * 0.6;
      -- A paused room has only reached its second question.
      answered := case when status = 'paused' then 2 else item_count end;

      for pos in 1..answered loop
        -- About one answer in twenty is missing: a student who joined late or ran out of time.
        continue when random() < 0.05;
        select i.id, i.scoring->>'model' as model, (i.scoring->>'maxPoints')::numeric as max_points
          into it
          from public.items i where i.id = item_ids[pos];
        frac := greatest(0, least(1, skill + (random() - 0.5) * 0.6));
        insert into public.session_responses (
          session_id, org_id, participant_id, item_id, item_position, response, points,
          max_points, model, submitted_at
        )
        values (
          sid, demo_org, pid, it.id, pos, '{}'::jsonb,
          round(it.max_points * frac), it.max_points, it.model,
          opened + make_interval(mins => pos * 2, secs => p)
        );
      end loop;
    end loop;
  end loop;
end
$$;

-- What `private.mirror_session_state` would have written on insert, the same select its
-- migration backfills with.
insert into live.session_public_state
  (session_id, status, item_position, item_count, reveal, item_ends_at)
select s.id, s.status, s.current_position, jsonb_array_length(s.item_set), s.reveal, s.item_ends_at
  from public.sessions s
  where s.id::text like '5eed0000-%'
on conflict (session_id) do nothing;

commit;

select
  count(*) filter (where status = 'ended') as ended_sessions,
  count(*) filter (where status <> 'ended') as open_sessions,
  (select count(*) from public.participants where session_id::text like '5eed0000-%') as students,
  (select count(*) from public.session_responses where session_id::text like '5eed0000-%') as answers
from public.sessions where id::text like '5eed0000-%';
