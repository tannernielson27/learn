-- The private session channel (#149): who Realtime lets into `live:<session id>`, and who may read a
-- session's public state over `postgres_changes`.
--
-- Realtime authorizes a private channel by querying `realtime.messages` as the socket's role, with
-- the socket's JWT claims in `request.jwt.claims` and the channel's topic in `realtime.topic`, and
-- rolling the query back. The tests below do the same thing by hand: the claims are exactly the
-- ones `src/lib/supabase/channelToken.ts` mints, and the topic is `liveTopic(sessionId)`.
--
-- Runs with `pnpm exec supabase test db`. Uses its own fixture ids so it never counts the seed's.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

-- ---------------------------------------------------------------------------
-- Fixtures, as the superuser
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-0000001490aa', 'chan-host@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000001490bb', 'chan-other@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000001490cc', 'chan-student@example.test', 'authenticated', 'authenticated');

-- #204: the sign-up trigger grants no role, so make these accounts instructors in the seeded
-- org explicitly, where the trigger used to put them.
update public.profiles
  set org_id = (select id from public.orgs order by created_at, id limit 1), role = 'instructor'
  where id in ('00000000-0000-0000-0000-0000001490aa',
               '00000000-0000-0000-0000-0000001490bb',
               '00000000-0000-0000-0000-0000001490cc');

-- BB authors in a second org; CC is a student account in the host's org, so the "author" half of
-- the host policy is exercised as well as the org half.
insert into public.orgs (id, name) values ('00000000-0000-0000-0000-0000001490f2', 'Other channels');
update public.profiles set org_id = '00000000-0000-0000-0000-0000001490f2'
  where id = '00000000-0000-0000-0000-0000001490bb';
update public.profiles set role = 'student' where id = '00000000-0000-0000-0000-0000001490cc';

-- Two sessions in the host's org: A, which the participant joined, and B, which they did not.
insert into public.sessions (id, org_id, host_id, title, code)
  select v.id, p.org_id, p.id, v.title, v.code
  from public.profiles p,
       (values ('00000000-0000-0000-0000-0000001490a1'::uuid, 'Room A', 'PRV234'),
               ('00000000-0000-0000-0000-0000001490b1'::uuid, 'Room B', 'PRV235')) as v (id, title, code)
  where p.id = '00000000-0000-0000-0000-0000001490aa';

-- One presence message per room, as Realtime writes it, so a select has something to find.
insert into realtime.messages (topic, extension, private)
values
  ('live:00000000-0000-0000-0000-0000001490a1', 'presence', true),
  ('live:00000000-0000-0000-0000-0000001490b1', 'presence', true);

-- Whether a policy lets this socket see anything of the room it is joining: 1 or 0. Whether, not
-- how much, because a participant's own `track` below adds a row of its own.
create function pg_temp.visible_here() returns integer
language sql as $$
  select (exists (select 1 from realtime.messages
                   where topic = realtime.topic() and extension = 'presence'))::int;
$$;

-- What `mintChannelToken` puts in a participant's token for session A.
create function pg_temp.as_participant_of_a() returns void
language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'role', 'anon',
    'sub', '00000000-0000-0000-0000-0000001490dd',
    'live_session_id', '00000000-0000-0000-0000-0000001490a1',
    'iat', 1, 'exp', 4102444800)::text, true);
$$;

create function pg_temp.topic(session uuid) returns void
language sql as $$ select set_config('realtime.topic', 'live:' || session::text, true); $$;

grant execute on function pg_temp.visible_here() to anon, authenticated;
grant execute on function pg_temp.as_participant_of_a() to anon, authenticated;
grant execute on function pg_temp.topic(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- A participant of session A
-- ---------------------------------------------------------------------------

set local role anon;
select pg_temp.as_participant_of_a();

select pg_temp.topic('00000000-0000-0000-0000-0000001490a1');
select is(pg_temp.visible_here(), 1, 'a participant of A may join A''s channel');
select lives_ok(
  $$ insert into realtime.messages (topic, extension, private)
     values ('live:00000000-0000-0000-0000-0000001490a1', 'presence', true) $$,
  'a participant of A may track their presence in A'
);
select throws_ok(
  $$ insert into realtime.messages (topic, extension, private)
     values ('live:00000000-0000-0000-0000-0000001490a1', 'broadcast', true) $$,
  '42501', null,
  'a participant may not broadcast, even in their own room'
);

select pg_temp.topic('00000000-0000-0000-0000-0000001490b1');
select is(pg_temp.visible_here(), 0, 'a participant of A may NOT join B''s channel');
select throws_ok(
  $$ insert into realtime.messages (topic, extension, private)
     values ('live:00000000-0000-0000-0000-0000001490b1', 'presence', true) $$,
  '42501', null,
  'a participant of A may NOT put a name in B''s roster'
);

select set_config('realtime.topic', 'room-1', true);
select is(pg_temp.visible_here(), 0, 'a participant token opens no topic but its own');

reset role;

-- ---------------------------------------------------------------------------
-- The publishable key alone: no claim, which is what knowing a session id used to be enough for
-- ---------------------------------------------------------------------------

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.topic('00000000-0000-0000-0000-0000001490a1');
select is(pg_temp.visible_here(), 0, 'the publishable key alone joins no session''s channel');
select throws_ok(
  $$ insert into realtime.messages (topic, extension, private)
     values ('live:00000000-0000-0000-0000-0000001490a1', 'presence', true) $$,
  '42501', null,
  'the publishable key alone cannot forge a name into a roster'
);

-- A token whose claim names A but whose topic is written differently is still not A.
select pg_temp.as_participant_of_a();
select set_config('realtime.topic', 'LIVE:00000000-0000-0000-0000-0000001490a1', true);
select is(pg_temp.visible_here(), 0, 'the topic must match exactly');
reset role;

-- ---------------------------------------------------------------------------
-- Hosts
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000001490aa","role":"authenticated"}', true);
select pg_temp.topic('00000000-0000-0000-0000-0000001490a1');
select is(pg_temp.visible_here(), 1, 'the host may watch their session''s channel');
select pg_temp.topic('00000000-0000-0000-0000-0000001490b1');
select is(pg_temp.visible_here(), 1, 'an author may watch any session in their own org');
select throws_ok(
  $$ insert into realtime.messages (topic, extension, private)
     values ('live:00000000-0000-0000-0000-0000001490b1', 'presence', true) $$,
  '42501', null,
  'a host watches the roster and is never in it'
);
select set_config('realtime.topic', 'live:not-a-uuid', true);
select lives_ok($$ select pg_temp.visible_here() $$, 'a malformed topic is refused, not an error');
select is(pg_temp.visible_here(), 0, 'a malformed topic names no session');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000001490bb","role":"authenticated"}', true);
select pg_temp.topic('00000000-0000-0000-0000-0000001490a1');
select is(pg_temp.visible_here(), 0, 'an author in another org may NOT watch the session');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000001490cc","role":"authenticated"}', true);
select is(pg_temp.visible_here(), 0, 'a signed-in student in the same org may NOT watch it either');
reset role;

-- ---------------------------------------------------------------------------
-- The session's public state over `postgres_changes`
-- ---------------------------------------------------------------------------

-- Today, the `true` policy still stands beside the new ones: this migration only adds (see its
-- header for the rollout order). This pins that state, so the follow-up that drops it has to
-- change this test on purpose.
select policies_are(
  'live', 'session_public_state',
  array[
    'a subscriber may read the public state of a session it names',
    'a participant reads their own session''s public state',
    'an author reads the public state of their org''s sessions'
  ],
  'the public state carries the old open policy and the two scoped ones'
);

-- What the scoped policies do once it is gone: drop it here, inside this rolled-back transaction.
drop policy "a subscriber may read the public state of a session it names"
  on live.session_public_state;

set local role anon;
select pg_temp.as_participant_of_a();
select results_eq(
  $$ select session_id from live.session_public_state
      where session_id in ('00000000-0000-0000-0000-0000001490a1',
                           '00000000-0000-0000-0000-0000001490b1') $$,
  $$ values ('00000000-0000-0000-0000-0000001490a1'::uuid) $$,
  'a participant of A reads A''s public state and not B''s'
);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(
  (select count(*)::int from live.session_public_state),
  0,
  'the publishable key alone reads no session''s public state'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000001490aa","role":"authenticated"}', true);
select is(
  (select count(*)::int from live.session_public_state
    where session_id in ('00000000-0000-0000-0000-0000001490a1',
                         '00000000-0000-0000-0000-0000001490b1')),
  2,
  'an author reads the public state of their org''s sessions'
);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000001490bb","role":"authenticated"}', true);
select is(
  (select count(*)::int from live.session_public_state
    where session_id in ('00000000-0000-0000-0000-0000001490a1',
                         '00000000-0000-0000-0000-0000001490b1')),
  0,
  'an author in another org reads none of them'
);
reset role;

-- ---------------------------------------------------------------------------
-- The helper, and what stays unexposed
-- ---------------------------------------------------------------------------

select is(
  private.live_topic_session('live:00000000-0000-0000-0000-0000001490a1'),
  '00000000-0000-0000-0000-0000001490a1'::uuid,
  'live_topic_session reads the session id out of a topic'
);
select is(private.live_topic_session('live:nope'), null, 'and nothing out of anything else');
select is(
  has_function_privilege('anon', 'private.live_topic_session(text)', 'execute'),
  false,
  'anon cannot call the helper directly'
);
select is(
  has_table_privilege('anon', 'live.session_public_state', 'insert'),
  false,
  'nobody but the mirror trigger writes the public state'
);

select * from finish();
rollback;
