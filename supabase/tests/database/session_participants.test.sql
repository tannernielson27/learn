-- Session participants (#129): joining without an account, coming back with the token, and who
-- may see a roster. Runs with `pnpm exec supabase test db`. Uses its own fixture ids so it never
-- counts the seed's rows.
--
-- Every call of a function that writes is made with scalar subqueries as its arguments rather
-- than through a LATERAL join, because a lateral over a filtered table may be evaluated for rows
-- the filter would have dropped, and `join_session` leaves a participant behind each time it runs.
begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

-- ---------------------------------------------------------------------------
-- Fixtures, as the superuser
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-000000000901', 'join-a@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000000902', 'join-b@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000000903', 'join-c@example.test', 'authenticated', 'authenticated');

-- B hosts in a second org, to check a roster never crosses one.
insert into public.orgs (id, name) values ('00000000-0000-0000-0000-0000000009f2', 'Other join');
update public.profiles set org_id = '00000000-0000-0000-0000-0000000009f2'
  where id = '00000000-0000-0000-0000-000000000902';

-- C is in A's org but a student, so the author half of the read policy is exercised too.
update public.profiles set role = 'student' where id = '00000000-0000-0000-0000-000000000903';

insert into public.item_banks (id, org_id, name)
  select '00000000-0000-0000-0000-0000000009b1', org_id, 'Join bank'
  from public.profiles where id = '00000000-0000-0000-0000-000000000901';

insert into public.items (id, bank_id, org_id, type, status, content, answer_key, scoring)
  select '00000000-0000-0000-0000-0000000009e1', '00000000-0000-0000-0000-0000000009b1', org_id,
         'multiple_choice', 'published', '{}', '{}', '{}'
  from public.profiles where id = '00000000-0000-0000-0000-000000000901';

-- Values that have to survive a role change.
create temporary table fixture (label text primary key, id uuid, secret text);
grant select, insert on fixture to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- As A: two open sessions to join
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000901","role":"authenticated"}', true);

insert into fixture (label, id)
  select 'room', public.start_session('00000000-0000-0000-0000-0000000009b1'::uuid, null);
insert into fixture (label, id)
  select 'crowd', public.start_session('00000000-0000-0000-0000-0000000009b1'::uuid, null);

-- ---------------------------------------------------------------------------
-- As the server: joining
-- ---------------------------------------------------------------------------

set local role service_role;

insert into fixture (label, id, secret)
  select 'sam', j.participant_id, j.rejoin_secret
  from public.join_session(
    (select id from fixture where label = 'room'), '  Sam   van   der   Berg  ') as j;

select matches(
  (select secret from fixture where label = 'sam'),
  '^[0-9a-f]{48}$',
  'joining hands back a 24-byte secret, hex encoded, once'
);

select results_eq(
  $$ select p.display_name, p.profile_id, p.org_id = s.org_id, p.last_seen_at = p.joined_at
       from public.participants p
       join public.sessions s on s.id = p.session_id
      where p.id = (select id from fixture where label = 'sam') $$,
  $$ values ('Sam van der Berg', null::uuid, true, true) $$,
  'the row carries the tidied name, no account, and the session''s own org'
);

select is(
  (select rejoin_hash from public.participants
    where id = (select id from fixture where label = 'sam')),
  extensions.digest((select secret from fixture where label = 'sam'), 'sha256'),
  'what is stored is the secret''s SHA-256, so a dump of the table holds no working token'
);

select isnt(
  (select rejoin_hash from public.participants
    where id = (select id from fixture where label = 'sam')),
  (select secret from fixture where label = 'sam')::bytea,
  'and never the secret itself'
);

-- A second person with exactly the same name. Identity is the token, never the name.
insert into fixture (label, id, secret)
  select 'sam2', j.participant_id, j.rejoin_secret
  from public.join_session(
    (select id from fixture where label = 'room'), 'Sam van der Berg') as j;

select isnt(
  (select id from fixture where label = 'sam2'),
  (select id from fixture where label = 'sam'),
  'two people called Sam are two participants, not one'
);

select is(
  (select count(*)::int from public.participants
    where session_id = (select id from fixture where label = 'room')),
  2,
  'and the room holds both of them'
);

-- Read back in a statement of its own: a row a set-returning function writes is not visible to
-- the statement that called it, which took its snapshot first.
insert into fixture (label, id, secret)
  select 'long', j.participant_id, j.rejoin_secret
  from public.join_session(
    (select id from fixture where label = 'room'), repeat('Wilhelmina', 9)) as j;

select is(
  (select display_name from public.participants
    where id = (select id from fixture where label = 'long')),
  left(repeat('Wilhelmina', 9), 32),
  'a name past the cap is cut to 32 characters rather than refused'
);

select throws_ok(
  format($$ select public.join_session(%L::uuid, '   ') $$,
         (select id from fixture where label = 'room')),
  '22023',
  null,
  'a name that is nothing but whitespace is refused'
);

select throws_ok(
  $$ select public.join_session('00000000-0000-0000-0000-0000000009ff'::uuid, 'Nobody') $$,
  'P0002',
  null,
  'a session that does not exist cannot be joined'
);

-- ---------------------------------------------------------------------------
-- As the server: coming back
-- ---------------------------------------------------------------------------

select results_eq(
  $$ select r.participant_name, r.session_status::text, r.session_mode::text, r.session_title
       from public.resume_participant(
         (select id from fixture where label = 'sam'),
         (select id from fixture where label = 'room'),
         (select secret from fixture where label = 'sam')) r $$,
  $$ values ('Sam van der Berg', 'lobby', 'instructor_paced', 'Join bank') $$,
  'the token brings back that participant''s own name and their session''s state'
);

select is(
  (select count(*)::int from public.resume_participant(
     (select id from fixture where label = 'sam'),
     (select id from fixture where label = 'room'),
     (select secret from fixture where label = 'sam'))),
  1,
  'and exactly one row, however many participants share a name'
);

-- #132: the roster at the front of the class is ordered by this, so it has to be the row's own
-- join time rather than anything a browser could offer.
select is(
  (select r.participant_joined_at
     from public.resume_participant(
       (select id from fixture where label = 'sam'),
       (select id from fixture where label = 'room'),
       (select secret from fixture where label = 'sam')) r),
  (select joined_at from public.participants
    where id = (select id from fixture where label = 'sam')),
  'and the join time a presence roster orders by'
);

-- `now()` is the transaction's clock, so a row written and touched inside one transaction carries
-- the same instant twice. Backdate it first, and the touch becomes visible.
reset role;
update public.participants set last_seen_at = now() - interval '1 hour'
 where id = (select id from fixture where label = 'sam');
set local role service_role;

select lives_ok(
  format($$ select * from public.resume_participant(%L::uuid, %L::uuid, %L) $$,
         (select id from fixture where label = 'sam'),
         (select id from fixture where label = 'room'),
         (select secret from fixture where label = 'sam')),
  'the same token comes back as often as the page is reloaded'
);

select ok(
  (select p.last_seen_at > now() - interval '1 minute' from public.participants p
    where p.id = (select id from fixture where label = 'sam')),
  'coming back marks the participant seen, which is what #132 will read'
);

select is_empty(
  format($$ select * from public.resume_participant(%L::uuid, %L::uuid, %L) $$,
         (select id from fixture where label = 'sam'),
         (select id from fixture where label = 'room'),
         repeat('0', 48)),
  'a wrong secret resolves to nobody'
);

select is_empty(
  format($$ select * from public.resume_participant(%L::uuid, %L::uuid, null) $$,
         (select id from fixture where label = 'sam'),
         (select id from fixture where label = 'room')),
  'and so does no secret at all'
);

select is_empty(
  format($$ select * from public.resume_participant(%L::uuid, %L::uuid, %L) $$,
         (select id from fixture where label = 'sam'),
         (select id from fixture where label = 'crowd'),
         (select secret from fixture where label = 'sam')),
  'a token is good for the one session it names and no other'
);

select is_empty(
  format($$ select * from public.resume_participant(%L::uuid, %L::uuid, %L) $$,
         (select id from fixture where label = 'sam2'),
         (select id from fixture where label = 'room'),
         (select secret from fixture where label = 'sam')),
  'one participant''s secret does not make you another participant'
);

-- ---------------------------------------------------------------------------
-- A session with no room left
-- ---------------------------------------------------------------------------

reset role;
insert into public.participants (session_id, org_id, display_name, rejoin_hash)
  select f.id, s.org_id, 'Filler ' || n, extensions.digest(n::text, 'sha256')
  from fixture f
  join public.sessions s on s.id = f.id,
       generate_series(1, 300) as n
 where f.label = 'crowd';

set local role service_role;
select throws_ok(
  format($$ select public.join_session(%L::uuid, 'One too many') $$,
         (select id from fixture where label = 'crowd')),
  '54000',
  null,
  'a session stops taking joins at three hundred participants'
);

-- ---------------------------------------------------------------------------
-- The table's own rules, where no function can be skipped
-- ---------------------------------------------------------------------------

reset role;
select throws_ok(
  format($$ insert into public.participants (session_id, org_id, display_name, rejoin_hash)
            select %L::uuid, s.org_id, repeat('x', 33), '\x00'::bytea
              from public.sessions s where s.id = %L::uuid $$,
         (select id from fixture where label = 'room'),
         (select id from fixture where label = 'room')),
  '23514',
  null,
  'the table itself refuses a name past 32 characters'
);

select throws_ok(
  format($$ insert into public.participants (session_id, org_id, display_name, rejoin_hash)
            values (%L::uuid, '00000000-0000-0000-0000-0000000009f2'::uuid, 'Wrong org',
                    '\x00'::bytea) $$,
         (select id from fixture where label = 'room')),
  '23503',
  null,
  'a participant cannot be filed under an org that is not their session''s'
);

-- ---------------------------------------------------------------------------
-- An ended session
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000901","role":"authenticated"}', true);
select lives_ok(
  format($$ select public.end_session(%L::uuid) $$, (select id from fixture where label = 'room')),
  'A ends the session'
);

set local role service_role;

select throws_ok(
  format($$ select public.join_session(%L::uuid, 'Late') $$,
         (select id from fixture where label = 'room')),
  '22023',
  null,
  'an ended session cannot be joined'
);

select results_eq(
  $$ select r.participant_name, r.session_status::text
       from public.resume_participant(
         (select id from fixture where label = 'sam'),
         (select id from fixture where label = 'room'),
         (select secret from fixture where label = 'sam')) r $$,
  $$ values ('Sam van der Berg', 'ended') $$,
  'someone already in the room is told the session ended rather than sent back to a form'
);

-- ---------------------------------------------------------------------------
-- As A: the host reads their own roster
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000901","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.participants
    where session_id = (select id from fixture where label = 'room')),
  3,
  'A sees the roster of A''s own session'
);

select throws_ok(
  $$ select rejoin_hash from public.participants $$,
  '42501',
  null,
  'but not the token hash, which no role reads through the Data API'
);

select throws_ok(
  $$ select * from public.participants $$,
  '42501',
  null,
  'and select * fails for the same reason, rather than quietly handing it over'
);

select throws_ok(
  format($$ insert into public.participants (session_id, org_id, display_name, rejoin_hash)
            select %L::uuid, s.org_id, 'Forged', '\x00'::bytea
              from public.sessions s where s.id = %L::uuid $$,
         (select id from fixture where label = 'crowd'),
         (select id from fixture where label = 'crowd')),
  '42501',
  null,
  'a host cannot write a participant straight at the table'
);

select throws_ok(
  $$ update public.participants set display_name = 'Renamed' $$,
  '42501',
  null,
  'nor rename one'
);

select throws_ok(
  $$ delete from public.participants $$,
  '42501',
  null,
  'nor remove one'
);

select throws_ok(
  format($$ select public.join_session(%L::uuid, 'Sneaky') $$,
         (select id from fixture where label = 'crowd')),
  '42501',
  null,
  'a signed-in author cannot call the join function'
);

select throws_ok(
  format($$ select * from public.resume_participant(%L::uuid, %L::uuid, %L) $$,
         (select id from fixture where label = 'sam'),
         (select id from fixture where label = 'room'),
         (select secret from fixture where label = 'sam')),
  '42501',
  null,
  'nor the resume function, whatever token they hold'
);

-- ---------------------------------------------------------------------------
-- As B, in another org, and C, a student in A's
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000902","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.participants),
  0,
  'an author in another org sees no participants at all'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000903","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.participants),
  0,
  'and neither does a student in the session''s own org'
);

-- ---------------------------------------------------------------------------
-- As anon: the publishable key that ships to every browser
-- ---------------------------------------------------------------------------

set local role anon;

select throws_ok(
  $$ select id from public.participants $$,
  '42501',
  null,
  'anon cannot read the participants table'
);

select throws_ok(
  format($$ select public.join_session(%L::uuid, 'Anon') $$,
         (select id from fixture where label = 'crowd')),
  '42501',
  null,
  'anon cannot join a session straight at the database'
);

select throws_ok(
  format($$ select * from public.resume_participant(%L::uuid, %L::uuid, %L) $$,
         (select id from fixture where label = 'sam'),
         (select id from fixture where label = 'room'),
         (select secret from fixture where label = 'sam')),
  '42501',
  null,
  'nor resume one'
);

select throws_ok(
  format($$ select private.session_is_full(%L::uuid) $$,
         (select id from fixture where label = 'crowd')),
  '42501',
  null,
  'and the roster ceiling is not a question anon may ask'
);

select * from finish();
rollback;
