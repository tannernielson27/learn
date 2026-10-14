-- A take-home case study's patient record is no longer readable by the student's own client (#335).
--
-- `assignments.patient_record` holds the whole record a case study was assigned with. Since #334 an
-- author can hold parts of it back until a later step (`fromStep`, `stepAccess`), and the student's
-- page is now handed only the chart at each step the student has reached, cut on the server by
-- `recordAtStep`. But `authenticated` had `select` on every column of this table, and the student
-- policy ("students read their classes' open assignments") lets a student select their own class's
-- row, so a student's browser could ask PostgREST for the column and read every step's chart before
-- answering a single one (docs/audits/S10-security.md). Row level security cannot hide one column,
-- so this is a column grant: `select` on every column but `patient_record`.
--
-- Who still reads the column, and how:
--
--   * the take-home page, through the service role (`readAssignmentRecord`), only for an
--     assignment the student's own client has just read under RLS, and it sends `recordsThrough`
--     of it, never the record;
--   * `public.my_assignment_result` (security definer), which hands the record to the results page
--     only once the assignment has closed: the results page shows the full record;
--   * the attempt functions (`start_assignment_attempt` and the rest), which are security definer
--     and read the row as their owner.
--
-- No app code selects the column with a user's client after this PR: `readStudentAssignment` no
-- longer names it, and the author screens never did. An author loses the column too; nothing an
-- author's client reads needs it, and the case study itself is theirs to read.
--
-- Deploy order: the app ships first and works with or without this migration. Safe to replay: a
-- revoke and a grant, nothing else. The update and insert grants are untouched (neither names the
-- column: the snapshot trigger writes it).

revoke select on public.assignments from authenticated;

grant select (
  id,
  org_id,
  class_id,
  bank_id,
  case_study_id,
  title,
  opens_at,
  closes_at,
  max_attempts,
  shuffle_options,
  item_set,
  created_by,
  created_at,
  updated_at
) on public.assignments to authenticated;

comment on column public.assignments.patient_record is
  'The case study''s EHR as it was on insert, or null for a bank. Not answer-bearing, but staged by '
  'step (#334), so not granted to authenticated (#335): the take-home page reads it with the '
  'service role and sends each reached step''s view. See 20261014200000_assignment_record_column_grant.sql.';
