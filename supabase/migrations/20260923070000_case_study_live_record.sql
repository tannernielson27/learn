-- A case study run live (#184): the patient's record on every phone.
--
-- A session started from a case study already snapshots its six steps (`item_set`, #128). The
-- record those steps are read against lives on `public.case_studies.ehr`, which the session only
-- points at through `case_study_id` — a pointer `on delete set null` clears, and a row an author
-- can keep editing while the room is running. So the record is snapshotted too, when the session
-- is created, beside the item set: the room reads the chart it started with, whatever happens to
-- the case study afterwards.
--
-- Why a trigger and not a change to `start_session`: the snapshot has to hold for *every* insert,
-- including one written straight at the Data API under the host policy, and a trigger is the one
-- place that sees them all. It also overwrites whatever the insert carried, so a client can never
-- choose the record a room is shown. Nothing may change it afterwards: `authenticated` has column
-- grants on `public.sessions` for the room's moves only (#128), and this column is not among them.
--
-- The record is not answer-bearing (docs/01-NGN-ITEM-SPEC.md, `ITEM_FIELD_VISIBILITY.ehr`), so
-- it may reach a participant before any reveal. It reaches them through the play page's server
-- render, read by the service role after the participant cookie has been checked; `anon` still
-- has no privilege on this table at all.

alter table public.sessions
  add column patient_record jsonb
    check (patient_record is null or jsonb_typeof(patient_record) = 'object');

comment on column public.sessions.patient_record is
  'The case study''s patient record (EHR) as it was when the session started, or null for a '
  'session started from a bank. Written only by private.snapshot_session_record on insert; see '
  'migration 20260923070000_case_study_live_record.sql.';

-- Security definer so the snapshot does not depend on what the inserting role may read: the org
-- is matched explicitly instead, which the composite foreign key on (case_study_id, org_id)
-- already guarantees and this restates, so a record never crosses an org.
create function private.snapshot_session_record() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.patient_record := null;
  if new.case_study_id is not null then
    select c.ehr into new.patient_record
      from public.case_studies c
     where c.id = new.case_study_id and c.org_id = new.org_id;
    -- An empty or malformed record is no record: the phone shows the step on its own.
    if new.patient_record is not null and jsonb_typeof(new.patient_record) <> 'object' then
      new.patient_record := null;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.snapshot_session_record() from public, anon, authenticated;

create trigger sessions_snapshot_record before insert on public.sessions
  for each row execute function private.snapshot_session_record();
