-- A live session for a class (ADR 0013, 20261024000000_class_live_sessions.sql): a teacher starts
-- one for a class of their own workspace, anyone still joins with the code, and only a signed-in
-- current member of that class is linked to their profile. Runs with `pnpm exec supabase test db`.
-- Uses its own fixture ids so it never counts the seed's rows.
--
-- Every call of a function that writes is made with scalar subqueries as its arguments rather
-- than through a LATERAL join, for the reason session_participants.test.sql gives.
begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

-- ---------------------------------------------------------------------------
-- Fixtures, as the superuser
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role)
values
  -- T teaches in workspace A, U in workspace B.
  ('00000000-0000-0000-0000-0000013c0a01', 'class-live-t@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000013c0b01', 'class-live-u@example.test', 'authenticated', 'authenticated'),
  -- M is a member of class A1. N is a student of workspace A in no class of it. R was in A1 and
  -- was taken off it. X is a member of class B1, in the other workspace.
  ('00000000-0000-0000-0000-0000013c0d01', 'class-live-m@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000013c0d02', 'class-live-n@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000013c0d03', 'class-live-r@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000013c0d04', 'class-live-x@example.test', 'authenticated', 'authenticated');

insert into public.orgs (id, name) values
  ('00000000-0000-0000-0000-0000013c00a0', 'Class live A'),
  ('00000000-0000-0000-0000-0000013c00b0', 'Class live B');

update public.profiles set org_id = '00000000-0000-0000-0000-0000013c00a0', role = 'instructor'
 where id = '00000000-0000-0000-0000-0000013c0a01';
update public.profiles set org_id = '00000000-0000-0000-0000-0000013c00b0', role = 'instructor'
 where id = '00000000-0000-0000-0000-0000013c0b01';
update public.profiles set org_id = '00000000-0000-0000-0000-0000013c00a0', role = 'student'
 where id in ('00000000-0000-0000-0000-0000013c0d01', '00000000-0000-0000-0000-0000013c0d02',
              '00000000-0000-0000-0000-0000013c0d03');
update public.profiles set org_id = '00000000-0000-0000-0000-0000013c00b0', role = 'student'
 where id = '00000000-0000-0000-0000-0000013c0d04';

insert into public.item_banks (id, org_id, name) values
  ('00000000-0000-0000-0000-0000013c00b1', '00000000-0000-0000-0000-0000013c00a0', 'Class live bank');
insert into public.items (id, bank_id, org_id, type, status, content, answer_key, scoring) values
  ('00000000-0000-0000-0000-0000013c00e1', '00000000-0000-0000-0000-0000013c00b1',
   '00000000-0000-0000-0000-0000013c00a0', 'multiple_choice', 'published', '{}', '{}', '{}');

insert into public.classes (id, org_id, name) values
  ('00000000-0000-0000-0000-0000013c0ca1', '00000000-0000-0000-0000-0000013c00a0', 'NUR 310'),
  ('00000000-0000-0000-0000-0000013c0ca2', '00000000-0000-0000-0000-0000013c00a0', 'NUR 320'),
  ('00000000-0000-0000-0000-0000013c0cb1', '00000000-0000-0000-0000-0000013c00b0', 'NUR 410');

insert into public.class_members (class_id, profile_id) values
  ('00000000-0000-0000-0000-0000013c0ca1', '00000000-0000-0000-0000-0000013c0d01'),
  ('00000000-0000-0000-0000-0000013c0ca1', '00000000-0000-0000-0000-0000013c0d03'),
  ('00000000-0000-0000-0000-0000013c0cb1', '00000000-0000-0000-0000-0000013c0d04');
-- Taken off the class: the removal trigger records it in private.class_removals.
delete from public.class_members
 where class_id = '00000000-0000-0000-0000-0000013c0ca1'
   and profile_id = '00000000-0000-0000-0000-0000013c0d03';

-- Values that have to survive a role change.
create temporary table fixture (label text primary key, id uuid, secret text);
grant select, insert, update on fixture to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- As T: starting sessions
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000013c0a01","role":"authenticated"}', true);

-- The old call, positional, exactly as every earlier caller makes it.
insert into fixture (label, id)
  select 'quick', public.start_session('00000000-0000-0000-0000-0000013c00b1'::uuid, null);

select ok(
  (select id from fixture where label = 'quick') is not null,
  'the old start_session call still starts a session'
);

select is(
  (select class_id from public.sessions where id = (select id from fixture where label = 'quick')),
  null,
  'and it is a quick session, for no class'
);

-- The old call by name, with pacing, as src/lib/supabase/sessions.ts made it before this change.
select lives_ok(
  $$ select public.start_session(source_bank => '00000000-0000-0000-0000-0000013c00b1'::uuid,
                                 paced => 'student_paced') $$,
  'the old named call, with pacing, still works'
);

insert into fixture (label, id)
  select 'classy', public.start_session(
    source_bank => '00000000-0000-0000-0000-0000013c00b1'::uuid,
    target_class => '00000000-0000-0000-0000-0000013c0ca1'::uuid);

select is(
  (select class_id from public.sessions where id = (select id from fixture where label = 'classy')),
  '00000000-0000-0000-0000-0000013c0ca1'::uuid,
  'a session started for a class of the teacher''s own workspace carries the class'
);

select throws_ok(
  $$ select public.start_session(source_bank => '00000000-0000-0000-0000-0000013c00b1'::uuid,
                                 target_class => '00000000-0000-0000-0000-0000013c0cb1'::uuid) $$,
  'LC001',
  'that class is not in your workspace',
  'a class of another workspace is refused, with the errcode the app maps'
);

select throws_ok(
  $$ select public.start_session(source_bank => '00000000-0000-0000-0000-0000013c00b1'::uuid,
                                 target_class => '00000000-0000-0000-0000-0000013c0fff'::uuid) $$,
  'LC001',
  'that class is not in your workspace',
  'and so is a class that does not exist'
);

-- Straight at the Data API under the host policy: the composite key holds the class to the
-- session's own workspace whoever writes the row.
select throws_ok(
  $$ insert into public.sessions (org_id, host_id, bank_id, class_id, title, code, item_set)
     values ('00000000-0000-0000-0000-0000013c00a0', '00000000-0000-0000-0000-0000013c0a01',
             '00000000-0000-0000-0000-0000013c00b1', '00000000-0000-0000-0000-0000013c0cb1',
             'Sneaky', 'ZZZZZ2', '["00000000-0000-0000-0000-0000013c00e1"]') $$,
  '23503',
  null,
  'a session row cannot name another workspace''s class however it is written'
);

-- A host cannot point a running session at a class: no column privilege, before the guard.
select throws_ok(
  format($$ update public.sessions set class_id = null where id = %L $$,
         (select id from fixture where label = 'classy')),
  '42501',
  null,
  'a host cannot change a session''s class'
);

-- ---------------------------------------------------------------------------
-- As U, of workspace B
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000013c0b01","role":"authenticated"}', true);

select throws_ok(
  $$ select public.start_session(source_bank => '00000000-0000-0000-0000-0000013c00b1'::uuid,
                                 target_class => '00000000-0000-0000-0000-0000013c0cb1'::uuid) $$,
  'P0002',
  null,
  'a teacher of another workspace cannot start A''s quiz, for a class or not'
);

-- ---------------------------------------------------------------------------
-- As the server: joining
-- ---------------------------------------------------------------------------

set local role service_role;

-- A quick session links nobody, even when the server says who is signed in.
insert into fixture (label, id, secret)
  select 'quick-m', j.participant_id, j.rejoin_secret
  from public.join_session((select id from fixture where label = 'quick'), 'Mia',
                           '00000000-0000-0000-0000-0000013c0d01') as j;
insert into fixture (label, id, secret)
  select 'quick-guest', j.participant_id, j.rejoin_secret
  from public.join_session((select id from fixture where label = 'quick'), 'Guest') as j;

select results_eq(
  $$ select display_name, profile_id from public.participants
      where session_id = (select id from fixture where label = 'quick') order by display_name $$,
  $$ values ('Guest', null::uuid), ('Mia', null::uuid) $$,
  'in a quick session everyone is anonymous, signed in or not'
);

-- A class session: a guest, then the member, a student of the workspace in no class, the removed
-- student, and a member of the other workspace's class.
insert into fixture (label, id, secret)
  select 'guest', j.participant_id, j.rejoin_secret
  from public.join_session((select id from fixture where label = 'classy'), 'Guest') as j;
insert into fixture (label, id, secret)
  select 'm', j.participant_id, j.rejoin_secret
  from public.join_session((select id from fixture where label = 'classy'), 'Mia',
                           '00000000-0000-0000-0000-0000013c0d01') as j;
insert into fixture (label, id, secret)
  select 'n', j.participant_id, j.rejoin_secret
  from public.join_session((select id from fixture where label = 'classy'), 'Noor',
                           '00000000-0000-0000-0000-0000013c0d02') as j;
insert into fixture (label, id, secret)
  select 'r', j.participant_id, j.rejoin_secret
  from public.join_session((select id from fixture where label = 'classy'), 'Rae',
                           '00000000-0000-0000-0000-0000013c0d03') as j;
insert into fixture (label, id, secret)
  select 'x', j.participant_id, j.rejoin_secret
  from public.join_session((select id from fixture where label = 'classy'), 'Xan',
                           '00000000-0000-0000-0000-0000013c0d04') as j;
-- A teacher's own account is never a member.
insert into fixture (label, id, secret)
  select 't', j.participant_id, j.rejoin_secret
  from public.join_session((select id from fixture where label = 'classy'), 'Teacher',
                           '00000000-0000-0000-0000-0000013c0a01') as j;

select is(
  (select profile_id from public.participants where id = (select id from fixture where label = 'guest')),
  null,
  'a guest in a class session is anonymous'
);

select is(
  (select profile_id from public.participants where id = (select id from fixture where label = 'm')),
  '00000000-0000-0000-0000-0000013c0d01'::uuid,
  'a current member of the session''s class is linked to their profile'
);

select is(
  (select profile_id from public.participants where id = (select id from fixture where label = 'n')),
  null,
  'a student of the same workspace who is not in the class is not linked'
);

select is(
  (select profile_id from public.participants where id = (select id from fixture where label = 'r')),
  null,
  'a student taken off the class is not linked'
);

select is(
  (select profile_id from public.participants where id = (select id from fixture where label = 'x')),
  null,
  'a member of another workspace''s class is not linked'
);

select is(
  (select profile_id from public.participants where id = (select id from fixture where label = 't')),
  null,
  'a teacher''s account is not linked'
);

select is(
  (select count(*)::int from public.participants
    where session_id = (select id from fixture where label = 'classy')),
  6,
  'everyone who joined is in the session, linked or not'
);

-- ---------------------------------------------------------------------------
-- The same member from a second phone
-- ---------------------------------------------------------------------------

insert into fixture (label, id, secret)
  select 'm2', j.participant_id, j.rejoin_secret
  from public.join_session((select id from fixture where label = 'classy'), 'Mia on a tablet',
                           '00000000-0000-0000-0000-0000013c0d01') as j;

select is(
  (select id from fixture where label = 'm2'),
  (select id from fixture where label = 'm'),
  'a member joining again gets their own participant back'
);

select is(
  (select count(*)::int from public.participants
    where session_id = (select id from fixture where label = 'classy')
      and profile_id = '00000000-0000-0000-0000-0000013c0d01'),
  1,
  'and the session still holds one row for them'
);

select is(
  (select display_name from public.participants where id = (select id from fixture where label = 'm')),
  'Mia',
  'under the name they first joined with'
);

select isnt(
  (select secret from fixture where label = 'm2'),
  (select secret from fixture where label = 'm'),
  'with a new secret'
);

select is(
  (select count(*)::int from public.resume_participant(
     (select id from fixture where label = 'm'),
     (select id from fixture where label = 'classy'),
     (select secret from fixture where label = 'm2'))),
  1,
  'the new secret resumes the participant'
);

select is(
  (select count(*)::int from public.resume_participant(
     (select id from fixture where label = 'm'),
     (select id from fixture where label = 'classy'),
     (select secret from fixture where label = 'm'))),
  0,
  'and the first phone''s secret no longer does: a participant has one live token'
);

-- Two guests with one name stay two people; the dedup is for linked rows only.
insert into fixture (label, id, secret)
  select 'guest2', j.participant_id, j.rejoin_secret
  from public.join_session((select id from fixture where label = 'classy'), 'Guest') as j;

select isnt(
  (select id from fixture where label = 'guest2'),
  (select id from fixture where label = 'guest'),
  'a second guest is a second participant'
);

select throws_ok(
  $$ insert into public.participants (session_id, org_id, profile_id, display_name, rejoin_hash)
     select session_id, org_id, profile_id, 'Copy', '\x00'::bytea from public.participants
      where id = (select id from fixture where label = 'm') $$,
  '23505',
  null,
  'the database itself refuses a second row for one member in one session'
);

-- ---------------------------------------------------------------------------
-- What the join page may be told
-- ---------------------------------------------------------------------------

select results_eq(
  format($$ select class_name from public.class_session_for_member(%L, %L::uuid) $$,
         lower((select code from public.sessions where id = (select id from fixture where label = 'classy'))),
         '00000000-0000-0000-0000-0000013c0d01'),
  $$ values ('NUR 310') $$,
  'a member is told the class of an open class session, whatever case the code is typed in'
);

select is_empty(
  format($$ select * from public.class_session_for_member(%L, %L::uuid) $$,
         (select code from public.sessions where id = (select id from fixture where label = 'classy')),
         '00000000-0000-0000-0000-0000013c0d02'),
  'someone who is not a member is told nothing'
);

select is_empty(
  format($$ select * from public.class_session_for_member(%L, %L::uuid) $$,
         (select code from public.sessions where id = (select id from fixture where label = 'quick')),
         '00000000-0000-0000-0000-0000013c0d01'),
  'and a quick session names no class'
);

-- ---------------------------------------------------------------------------
-- Who may call what
-- ---------------------------------------------------------------------------

reset role;

select ok(
  not has_function_privilege('anon', 'public.join_session(uuid, text, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.join_session(uuid, text, uuid)', 'execute'),
  'join_session is not callable by anon or a signed-in browser'
);

select ok(
  has_function_privilege('service_role', 'public.join_session(uuid, text, uuid)', 'execute'),
  'only the server joins'
);

select ok(
  not has_function_privilege('anon', 'public.class_session_for_member(text, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.class_session_for_member(text, uuid)', 'execute')
  and has_function_privilege('service_role', 'public.class_session_for_member(text, uuid)', 'execute'),
  'class_session_for_member is the server''s alone'
);

select ok(
  has_function_privilege('authenticated', 'public.start_session(uuid, uuid, public.session_mode, integer, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.start_session(uuid, uuid, public.session_mode, integer, uuid)', 'execute'),
  'start_session is a signed-in teacher''s, as before'
);

-- The guard: the class is part of the session's identity, even for a caller with every privilege.
-- (Clearing it to null is the pass-through a deleted class needs, as for a deleted bank.)
select throws_ok(
  format($$ update public.sessions set class_id = '00000000-0000-0000-0000-0000013c0ca2' where id = %L $$,
         (select id from fixture where label = 'quick')),
  '22023',
  null,
  'a quick session cannot be turned into a class session after it starts'
);

-- ---------------------------------------------------------------------------
-- Deleting the class keeps the record of the session
-- ---------------------------------------------------------------------------

update public.sessions set status = 'ended' where id = (select id from fixture where label = 'classy');

delete from public.classes where id = '00000000-0000-0000-0000-0000013c0ca1';

select results_eq(
  $$ select status::text, class_id from public.sessions
      where id = (select id from fixture where label = 'classy') $$,
  $$ values ('ended', null::uuid) $$,
  'deleting the class clears the pointer on an ended session and keeps the session'
);

select is(
  (select profile_id from public.participants where id = (select id from fixture where label = 'm')),
  '00000000-0000-0000-0000-0000013c0d01'::uuid,
  'and the member''s answers stay linked to them'
);

select * from finish();
rollback;
