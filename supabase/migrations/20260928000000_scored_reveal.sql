-- Mark an answer against the key it was scored with.
--
-- A live answer and an assignment answer are scored once, on the server, and the score is stored
-- on the response row (#131, #208). The key their marks are drawn against was not: the reveal, the
-- phone's paced view and a student's results all read it from the item row as it is *now*. An
-- author who edits an item between the score and the reveal therefore split the two — points from
-- the old key, red and green from the new one, so a correct pick shows as wrong beside its points
-- or the other way round. Practice never had this: it snapshots its items when a run starts
-- (#271, practice_run_items).
--
-- `item_versions` is no help here: it is written only on publish, and a published item can be
-- edited in place.
--
-- So the reveal is stored beside the score, at scoring time:
--
--   * `session_responses.reveal` and `attempt_responses.reveal`: nullable jsonb holding exactly
--     the answer-bearing fields the score was computed from, `{ answerKey, rationale, scoring }`
--     (`Reveal` in src/lib/ngn/submit.ts). An object or null, capped like a response, with room
--     for Postgres's own spacing of jsonb text. Rows written before this migration stay null and
--     the app falls back to the item as it is now, which is what it did for every row until today.
--
--   * `public.record_session_response` takes it as an eleventh argument, `scored_reveal`, default
--     null. A new argument is a new signature, so the function is dropped and created again with
--     the body, the security definer, the search_path and the grants of its latest definition
--     (20260923080000_student_paced.sql, grants from 20260920130000): execute for service_role
--     only. The default means a caller that does not pass it still works.
--
--   * `public.record_attempt_submission` keeps its signature. Each object in `marks` may now carry
--     `reveal`, which is stored on its row; anything there that is not an object is refused as
--     'malformed'. `create or replace` keeps its privileges. Body otherwise as in
--     20260924030800_assignment_attempts.sql.
--
--   * `public.my_assignment_result` (#210) hands each mark's `reveal` back beside it. It already
--     answers only the caller, about their own attempts, and only after the close — the moment
--     the key is released to them anyway. Same signature, `create or replace`, privileges kept.
--
-- Who can read the new columns: exactly who could read the rows. `session_responses` is granted
-- to `authenticated` table-wide and the only policy is an author reading their own org's rows, the
-- people who wrote the key; anon holds nothing. `attempt_responses` is granted to students column
-- by column, and `reveal` is not one of the columns, so no student can select it before the close.
--
-- Safe to replay on a fresh project: two `add column if not exists`, one function dropped with
-- `if exists` and created with its grants, and two `create or replace` with unchanged signatures.

-- ---------------------------------------------------------------------------
-- The columns
-- ---------------------------------------------------------------------------

alter table public.session_responses
  add column if not exists reveal jsonb
    constraint session_responses_reveal_shape
    check (reveal is null
           or (jsonb_typeof(reveal) = 'object' and octet_length(reveal::text) <= 400000));

comment on column public.session_responses.reveal is
  'The answer key, rationale and scoring this answer was scored against, as the item held them at '
  'submit. Null for rows written before it existed; the reveal then reads the item as it is now.';

alter table public.attempt_responses
  add column if not exists reveal jsonb
    constraint attempt_responses_reveal_shape
    check (reveal is null
           or (jsonb_typeof(reveal) = 'object' and octet_length(reveal::text) <= 400000));

comment on column public.attempt_responses.reveal is
  'The answer key, rationale and scoring this answer was marked against, written at submit with '
  'the mark. Null while the attempt is open, and for rows marked before it existed.';

-- ---------------------------------------------------------------------------
-- record_session_response: the reveal is written with the score
-- ---------------------------------------------------------------------------

drop function if exists public.record_session_response(
  uuid, uuid, smallint, uuid, jsonb, numeric, numeric, text, jsonb, jsonb);

-- #185's function with one more argument. Every check, and its order, is unchanged.
create function public.record_session_response(
  target_session uuid,
  participant uuid,
  at_position smallint,
  target_item uuid,
  answer jsonb,
  earned numeric,
  possible numeric,
  scoring_model text,
  marks jsonb,
  row_groups jsonb default null,
  scored_reveal jsonb default null
)
returns table (refusal text, submitted_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare
  found_session public.sessions%rowtype;
  written timestamptz;
begin
  select * into found_session from public.sessions s where s.id = target_session;
  if not found or found_session.status = 'ended' then
    return query select 'not_open'::text, null::timestamptz;
    return;
  end if;
  if found_session.status = 'lobby' or found_session.current_position is null then
    return query select 'not_started'::text, null::timestamptz;
    return;
  end if;
  if found_session.status = 'paused' then
    return query select 'paused'::text, null::timestamptz;
    return;
  end if;
  if found_session.reveal then
    return query select 'already_revealed'::text, null::timestamptz;
    return;
  end if;
  if found_session.item_ends_at is not null
     and now() > found_session.item_ends_at + interval '2 seconds' then
    return query select 'time_up'::text, null::timestamptz;
    return;
  end if;
  if (found_session.mode = 'instructor_paced' and found_session.current_position <> at_position)
     or at_position is null
     or at_position < 1
     or (found_session.item_set ->> (at_position - 1))::uuid is distinct from target_item then
    return query select 'wrong_item'::text, null::timestamptz;
    return;
  end if;

  begin
    insert into public.session_responses as written_row
      (session_id, org_id, participant_id, item_id, item_position, response,
       points, max_points, model, breakdown, groups, reveal)
    values
      (target_session, found_session.org_id, participant, target_item, at_position, answer,
       earned, possible, scoring_model, coalesce(marks, '[]'::jsonb), row_groups, scored_reveal)
    returning written_row.submitted_at into written;
  exception when unique_violation then
    -- The only unique constraint this insert can meet is one answer per person per item.
    return query select 'already_answered'::text, null::timestamptz;
    return;
  end;

  return query select null::text, written;
end;
$$;

revoke all on function public.record_session_response(
  uuid, uuid, smallint, uuid, jsonb, numeric, numeric, text, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_session_response(
  uuid, uuid, smallint, uuid, jsonb, numeric, numeric, text, jsonb, jsonb, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- record_attempt_submission: each mark may carry its reveal
-- ---------------------------------------------------------------------------

-- #208's function, same signature. Two changes: a mark whose `reveal` is present and not an object
-- is 'malformed', and the reveal is written to the row with the mark.
create or replace function public.record_attempt_submission(
  target_attempt uuid,
  student uuid,
  expected_revision integer,
  total numeric,
  possible numeric,
  marks jsonb,
  automatic boolean default false
)
returns table (refusal text, submitted_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare
  found_attempt public.assignment_attempts%rowtype;
  found_assignment public.assignments%rowtype;
  stamp timestamptz;
begin
  select * into found_attempt
    from public.assignment_attempts a
   where a.id = target_attempt and a.student_id = student
   for update;
  if not found then
    return query select 'not_found'::text, null::timestamptz;
    return;
  end if;
  if found_attempt.submitted_at is not null then
    return query select 'already_submitted'::text, found_attempt.submitted_at;
    return;
  end if;
  select * into found_assignment from public.assignments a where a.id = found_attempt.assignment_id;
  if not found then
    return query select 'not_found'::text, null::timestamptz;
    return;
  end if;

  if automatic then
    if private.assignment_refusal(found_assignment.opens_at, found_assignment.closes_at)
       is distinct from 'closed' then
      return query select 'not_closed'::text, null::timestamptz;
      return;
    end if;
    stamp := found_assignment.closes_at;
  else
    if not private.is_current_member(found_assignment.class_id, student) then
      return query select 'not_found'::text, null::timestamptz;
      return;
    end if;
    if private.assignment_refusal(found_assignment.opens_at, found_assignment.closes_at)
       is not null then
      return query select 'closed'::text, null::timestamptz;
      return;
    end if;
    stamp := now();
  end if;

  if found_attempt.revision is distinct from expected_revision then
    return query select 'changed'::text, null::timestamptz;
    return;
  end if;
  if total is null or possible is null or possible < 0 or total > possible
     or marks is null or jsonb_typeof(marks) <> 'array'
     or exists (select 1 from jsonb_array_elements(marks) as m
                 where jsonb_typeof(m) <> 'object'
                    or coalesce(m ->> 'item_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                    or coalesce(jsonb_typeof(m -> 'reveal'), 'null') not in ('object', 'null')) then
    return query select 'malformed'::text, null::timestamptz;
    return;
  end if;

  update public.attempt_responses r
     set points = (m ->> 'points')::numeric,
         max_points = (m ->> 'max_points')::numeric,
         model = m ->> 'model',
         breakdown = coalesce(m -> 'breakdown', '[]'::jsonb),
         groups = case when jsonb_typeof(m -> 'groups') = 'array' then m -> 'groups' end,
         reveal = case when jsonb_typeof(m -> 'reveal') = 'object' then m -> 'reveal' end
    from jsonb_array_elements(marks) as m
   where r.attempt_id = target_attempt
     and r.item_id = (m ->> 'item_id')::uuid;

  update public.assignment_attempts
     set submitted_at = stamp,
         score = total,
         max_score = possible,
         auto_submitted = automatic
   where id = target_attempt;

  return query select null::text, stamp;
end;
$$;

-- ---------------------------------------------------------------------------
-- my_assignment_result: each mark comes back with the reveal it was marked against
-- ---------------------------------------------------------------------------

-- #210's function, same signature and the same rules. One key more in each mark: `reveal`.
create or replace function public.my_assignment_result(target_assignment uuid)
returns table (
  assignment_id uuid,
  title text,
  closes_at timestamptz,
  max_attempts smallint,
  item_set jsonb,
  patient_record jsonb,
  attempt_id uuid,
  attempt_number smallint,
  started_at timestamptz,
  submitted_at timestamptz,
  auto_submitted boolean,
  score numeric,
  max_score numeric,
  marks jsonb
)
language sql stable security definer set search_path = ''
as $$
  with caller as (
    select (select auth.uid()) as id
  ),
  target as (
    select s.id, s.title, s.closes_at, s.max_attempts, s.item_set, s.patient_record, c.id as caller
      from public.assignments s
      join caller c on c.id is not null
     where s.id = target_assignment
       and private.assignment_refusal(s.opens_at, s.closes_at) is not distinct from 'closed'
       and (
         private.is_current_member(s.class_id, c.id)
         or exists (
           select 1 from public.assignment_attempts a
            where a.assignment_id = s.id and a.student_id = c.id
         )
       )
  )
  select t.id,
         t.title,
         t.closes_at,
         t.max_attempts,
         t.item_set,
         t.patient_record,
         a.id,
         a.number,
         a.started_at,
         a.submitted_at,
         coalesce(a.auto_submitted, false),
         case when a.submitted_at is not null then a.score end,
         case when a.submitted_at is not null then a.max_score end,
         case when a.submitted_at is not null then (
           select coalesce(
                    jsonb_agg(
                      jsonb_build_object(
                        'item_id', r.item_id,
                        'response', r.response,
                        'points', r.points,
                        'max_points', r.max_points,
                        'model', r.model,
                        'breakdown', r.breakdown,
                        'groups', r.groups,
                        'reveal', r.reveal)
                      order by r.item_id),
                    '[]'::jsonb)
             from public.attempt_responses r
            where r.attempt_id = a.id
         ) end
    from target t
    left join public.assignment_attempts a
      on a.assignment_id = t.id and a.student_id = t.caller
   order by a.number nulls first;
$$;
