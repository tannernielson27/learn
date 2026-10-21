-- The waiting screen's count (#426): `live.session_public_state.participant_count`, reported by
-- the host in place of every phone receiving Presence.
--
-- What is held here: the count is a number and nothing else about who is in the room; it is
-- written only by `refresh_participant_count`, never by a join or a state change; it is the host's
-- number, so it goes down when someone leaves (owner decision, 2026-10-21), but never below zero
-- nor above how many have joined; a report that changes nothing writes nothing (so phones are sent
-- nothing); only an author in the session's org may report; an ended room is left alone; the view
-- read answers with the stored number, at least 1; and row level security on the mirror is what it
-- was.
--
-- "Writes nothing" is read off the row's `ctid`: inside one transaction `now()` does not move and
-- neither does `xmin`, so neither can tell a second write from none; a new tuple's place can.
--
-- Runs with `pnpm test:db`. Uses its own fixture ids so it never counts the seed's.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

-- ---------------------------------------------------------------------------
-- Fixtures, as the superuser
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-0000004260aa', 'count-host@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000004260bb', 'count-other@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000004260cc', 'count-student@example.test', 'authenticated', 'authenticated');

update public.profiles
  set org_id = (select id from public.orgs order by created_at, id limit 1), role = 'instructor'
  where id in ('00000000-0000-0000-0000-0000004260aa',
               '00000000-0000-0000-0000-0000004260bb',
               '00000000-0000-0000-0000-0000004260cc');

-- BB authors in a second org; CC is a student account in the host's org.
insert into public.orgs (id, name) values ('00000000-0000-0000-0000-0000004260f2', 'Other counts');
update public.profiles set org_id = '00000000-0000-0000-0000-0000004260f2'
  where id = '00000000-0000-0000-0000-0000004260bb';
update public.profiles set role = 'student' where id = '00000000-0000-0000-0000-0000004260cc';

-- Room A, which the participants below join, and room B beside it.
insert into public.sessions (id, org_id, host_id, title, code)
  select v.id, p.org_id, p.id, v.title, v.code
  from public.profiles p,
       (values ('00000000-0000-0000-0000-0000004260a1'::uuid, 'Count A', 'CNT234'),
               ('00000000-0000-0000-0000-0000004260b1'::uuid, 'Count B', 'CNT235')) as v (id, title, code)
  where p.id = '00000000-0000-0000-0000-0000004260aa';

create function pg_temp.join_a(participant uuid, name text) returns void
language sql as $$
  insert into public.participants (id, session_id, org_id, display_name, rejoin_hash)
  select participant, s.id, s.org_id, name, extensions.digest('secret-' || name, 'sha256')
    from public.sessions s where s.id = '00000000-0000-0000-0000-0000004260a1';
$$;

create function pg_temp.count_of_a() returns integer
language sql as $$
  select participant_count from live.session_public_state
   where session_id = '00000000-0000-0000-0000-0000004260a1';
$$;

-- Where the row lives: every UPDATE writes a new tuple, so this moves on every write to it and on
-- nothing else, even inside this one transaction (where `xmin` would not move).
create function pg_temp.version_of_a() returns text
language sql as $$
  select ctid::text from live.session_public_state
   where session_id = '00000000-0000-0000-0000-0000004260a1';
$$;

create function pg_temp.as_host(who uuid) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', who, 'role', 'authenticated')::text, true);
$$;

grant execute on function pg_temp.as_host(uuid) to authenticated;
grant execute on function pg_temp.count_of_a() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The column: a number, and nothing about who
-- ---------------------------------------------------------------------------

select col_type_is('live', 'session_public_state', 'participant_count', 'integer',
  'the count is an integer');
select col_not_null('live', 'session_public_state', 'participant_count',
  'and never null, so a phone always has a number');
select col_default_is('live', 'session_public_state', 'participant_count', '0',
  'a room starts at nobody');
select is(pg_temp.count_of_a(), 0, 'a new room''s mirror says nobody has joined');

-- ---------------------------------------------------------------------------
-- Joins and state changes leave the count alone
-- ---------------------------------------------------------------------------

create temp table seen (label text primary key, version text);
insert into seen values ('before joins', pg_temp.version_of_a());

select pg_temp.join_a('00000000-0000-0000-0000-000000426011', 'Ada');
select pg_temp.join_a('00000000-0000-0000-0000-000000426012', 'Grace');

select is(pg_temp.version_of_a(), (select version from seen where label = 'before joins'),
  'two joins write nothing to the mirror, so no phone is sent anything for them');
select is(pg_temp.count_of_a(), 0, 'and the count waits for the host to report');

-- A phone entering reads the view, which never tells it fewer than itself.
set local role service_role;
select is(
  (select v.session_participants from public.open_session_view(
     '00000000-0000-0000-0000-000000426012',
     '00000000-0000-0000-0000-0000004260a1', 'secret-Grace') v),
  1,
  'before any report the view says at least the phone asking'
);
reset role;

-- A host choosing a time is news to every phone; who is in the room is not the session's to say.
update public.sessions set timer_seconds = 30 where id = '00000000-0000-0000-0000-0000004260a1';
select is(pg_temp.count_of_a(), 0, 'a state change leaves the count as it was');

-- ---------------------------------------------------------------------------
-- The host reports who is in the room
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.as_host('00000000-0000-0000-0000-0000004260aa');
select lives_ok(
  $$ select public.refresh_participant_count('00000000-0000-0000-0000-0000004260a1', 2) $$,
  'the host may report how many its roster shows'
);
select is(pg_temp.count_of_a(), 2, 'and the mirror holds that number');
reset role;

select pg_temp.join_a('00000000-0000-0000-0000-000000426013', 'Quiet');

set local role authenticated;
select pg_temp.as_host('00000000-0000-0000-0000-0000004260aa');
select public.refresh_participant_count('00000000-0000-0000-0000-0000004260a1', 99);
select is(pg_temp.count_of_a(), 3, 'never more than have joined: three');
select public.refresh_participant_count('00000000-0000-0000-0000-0000004260a1', 2);
select is(pg_temp.count_of_a(), 2, 'someone who leaves is taken out of the count');
reset role;

insert into seen values ('after report', pg_temp.version_of_a());

set local role authenticated;
select pg_temp.as_host('00000000-0000-0000-0000-0000004260aa');
select public.refresh_participant_count('00000000-0000-0000-0000-0000004260a1', 2);
reset role;
select is(pg_temp.version_of_a(), (select version from seen where label = 'after report'),
  'a report of the number already there writes nothing, so phones are sent nothing');

set local role authenticated;
select pg_temp.as_host('00000000-0000-0000-0000-0000004260aa');
select public.refresh_participant_count('00000000-0000-0000-0000-0000004260a1', -5);
select is(pg_temp.count_of_a(), 0, 'and never fewer than nobody');
select public.refresh_participant_count('00000000-0000-0000-0000-0000004260a1', 3);
reset role;

-- Who else may report. Every refusal reads as "no such session", as stop_item_timer's does.
set local role authenticated;
select pg_temp.as_host('00000000-0000-0000-0000-0000004260bb');
select throws_ok(
  $$ select public.refresh_participant_count('00000000-0000-0000-0000-0000004260a1', 1) $$,
  'P0002', null,
  'an author in another org may not'
);
select pg_temp.as_host('00000000-0000-0000-0000-0000004260cc');
select throws_ok(
  $$ select public.refresh_participant_count('00000000-0000-0000-0000-0000004260a1', 1) $$,
  'P0002', null,
  'a signed-in student in the same org may not'
);
select pg_temp.as_host('00000000-0000-0000-0000-0000004260aa');
select throws_ok(
  $$ select public.refresh_participant_count('00000000-0000-0000-0000-00000042600f', 1) $$,
  'P0002', null,
  'a session that does not exist is simply not there'
);
reset role;

select is(
  has_function_privilege('anon', 'public.refresh_participant_count(uuid, integer)', 'execute'),
  false,
  'a phone cannot report a count at all'
);

-- ---------------------------------------------------------------------------
-- The view read answers with the same number
-- ---------------------------------------------------------------------------

set local role service_role;
select is(
  (select v.session_participants from public.open_session_view(
     '00000000-0000-0000-0000-000000426011',
     '00000000-0000-0000-0000-0000004260a1', 'secret-Ada') v),
  3,
  'a phone entering the room is handed the count with the room'
);
reset role;

-- ---------------------------------------------------------------------------
-- What a phone can see of it
-- ---------------------------------------------------------------------------

set local role anon;
select set_config('request.jwt.claims', json_build_object(
  'role', 'anon',
  'sub', '00000000-0000-0000-0000-000000426011',
  'live_session_id', '00000000-0000-0000-0000-0000004260a1',
  'iat', 1, 'exp', 4102444800)::text, true);
select is(pg_temp.count_of_a(), 3, 'a participant of A reads A''s count');
select is(
  (select count(*)::int from live.session_public_state
    where session_id = '00000000-0000-0000-0000-0000004260b1'),
  0,
  'and not B''s: row level security on the mirror is what it was'
);
select throws_ok(
  $$ select display_name from public.participants $$,
  '42501', null,
  'and still cannot read who the three are'
);
select throws_ok(
  $$ update live.session_public_state set participant_count = 300 $$,
  '42501', null,
  'and cannot write a count of their own'
);
reset role;

select is(
  has_table_privilege('authenticated', 'live.session_public_state', 'update'),
  false,
  'nor can a host write the mirror directly: only through the function'
);

-- ---------------------------------------------------------------------------
-- An ended room is left alone
-- ---------------------------------------------------------------------------

update public.sessions set status = 'ended' where id = '00000000-0000-0000-0000-0000004260a1';
select pg_temp.join_a('00000000-0000-0000-0000-000000426014', 'Late');
insert into seen values ('ended', pg_temp.version_of_a());

set local role authenticated;
select pg_temp.as_host('00000000-0000-0000-0000-0000004260aa');
select public.refresh_participant_count('00000000-0000-0000-0000-0000004260a1', 4);
reset role;
select is(pg_temp.version_of_a(), (select version from seen where label = 'ended'),
  'a report on an ended room writes nothing');

-- ---------------------------------------------------------------------------
-- The function's own guards
-- ---------------------------------------------------------------------------

select is(
  (select p.prosecdef from pg_proc p
    where p.oid = 'public.refresh_participant_count(uuid, integer)'::regprocedure),
  true,
  'refresh_participant_count is security definer, because only it may write the count'
);
select ok(
  (select 'search_path=""' = any(p.proconfig) from pg_proc p
    where p.oid = 'public.refresh_participant_count(uuid, integer)'::regprocedure),
  'and pins an empty search_path'
);

select * from finish();
rollback;
