-- Live sessions (#128): the session row, its join code, the state machine and the rate-limited
-- code lookup. Runs with `pnpm exec supabase test db`. Uses its own fixture ids so it never
-- counts the seed's rows.
begin;
create extension if not exists pgtap with schema extensions;
select plan(50);

-- ---------------------------------------------------------------------------
-- Fixtures, as the superuser
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-0000000007aa', 'live-a@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000007bb', 'live-b@example.test', 'authenticated', 'authenticated');

-- B moves to a second org, to check isolation.
insert into public.orgs (id, name) values ('00000000-0000-0000-0000-0000000007f2', 'Other live');
update public.profiles set org_id = '00000000-0000-0000-0000-0000000007f2'
  where id = '00000000-0000-0000-0000-0000000007bb';

insert into public.item_banks (id, org_id, name)
  select '00000000-0000-0000-0000-0000000007b1', org_id, 'Live bank'
  from public.profiles where id = '00000000-0000-0000-0000-0000000007aa';
-- A bank with nothing published in it, to check that a session cannot start empty.
insert into public.item_banks (id, org_id, name)
  select '00000000-0000-0000-0000-0000000007b2', org_id, 'Empty bank'
  from public.profiles where id = '00000000-0000-0000-0000-0000000007aa';
-- B's own bank, in the other org.
insert into public.item_banks (id, org_id, name)
  values ('00000000-0000-0000-0000-0000000007b3', '00000000-0000-0000-0000-0000000007f2', 'B bank');

-- Two published items and one draft: the draft must not reach the session's set.
insert into public.items (id, bank_id, org_id, type, status, content, answer_key, scoring)
  select v.id, '00000000-0000-0000-0000-0000000007b1', p.org_id, 'multiple_choice', v.status,
         '{}', '{}', '{}'
  from public.profiles p,
       (values ('00000000-0000-0000-0000-0000000007e1'::uuid, 'published'::public.content_status),
               ('00000000-0000-0000-0000-0000000007e2'::uuid, 'published'::public.content_status),
               ('00000000-0000-0000-0000-0000000007e3'::uuid, 'draft'::public.content_status))
         as v (id, status)
  where p.id = '00000000-0000-0000-0000-0000000007aa';
-- One unpublished item in the empty bank, so the bank exists but has nothing to run.
insert into public.items (id, bank_id, org_id, type, status, content, answer_key, scoring)
  select '00000000-0000-0000-0000-0000000007e4', '00000000-0000-0000-0000-0000000007b2', org_id,
         'multiple_choice', 'draft', '{}', '{}', '{}'
  from public.profiles where id = '00000000-0000-0000-0000-0000000007aa';

insert into public.case_studies (id, bank_id, org_id, title, ehr, status)
  select '00000000-0000-0000-0000-0000000007c1', '00000000-0000-0000-0000-0000000007b1', org_id,
         'Live case', '{}', 'published'
  from public.profiles where id = '00000000-0000-0000-0000-0000000007aa';
insert into public.case_study_items (case_study_id, org_id, bank_id, position, item_id)
  select '00000000-0000-0000-0000-0000000007c1', org_id, '00000000-0000-0000-0000-0000000007b1', 1,
         '00000000-0000-0000-0000-0000000007e1'
  from public.profiles where id = '00000000-0000-0000-0000-0000000007aa';

-- Each started session's id, kept across role switches.
create temporary table started (label text primary key, session_id uuid);
grant select, insert on started to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- As A: the host, in the content's org
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000007aa","role":"authenticated"}', true);

select lives_ok(
  $$ insert into started
     select 'bank', public.start_session('00000000-0000-0000-0000-0000000007b1'::uuid, null) $$,
  'A can start a session from a bank'
);

select matches(
  (select s.code from public.sessions s join started t on t.session_id = s.id where t.label = 'bank'),
  '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$',
  'the code is six characters from the unambiguous alphabet: no O, 0, I or 1'
);

select results_eq(
  $$ select s.status::text, s.mode::text, s.host_id, s.org_id, s.reveal,
            s.closed_at is null, s.current_position
     from public.sessions s join started t on t.session_id = s.id where t.label = 'bank' $$,
  $$ select 'lobby', 'instructor_paced', '00000000-0000-0000-0000-0000000007aa'::uuid, org_id,
            false, true, null::smallint
     from public.profiles where id = '00000000-0000-0000-0000-0000000007aa' $$,
  'a new session opens in the lobby, unrevealed and not yet on an item, hosted by A in A''s org'
);

select results_eq(
  $$ select jsonb_array_length(s.item_set)
     from public.sessions s join started t on t.session_id = s.id where t.label = 'bank' $$,
  $$ values (2) $$,
  'the set snapshots the bank''s published items only; the draft is left out'
);

select throws_ok(
  $$ select public.start_session('00000000-0000-0000-0000-0000000007b2'::uuid, null) $$,
  '22023', null,
  'a bank with nothing published cannot be run'
);

select throws_ok(
  $$ select public.start_session(null, null) $$,
  '22023', null,
  'a session needs a source'
);

select throws_ok(
  $$ select public.start_session('00000000-0000-0000-0000-0000000007b1'::uuid,
                                 '00000000-0000-0000-0000-0000000007c1'::uuid) $$,
  '22023', null,
  'a session takes one source, not both'
);

select throws_ok(
  $$ select public.start_session('00000000-0000-0000-0000-0000000007b3'::uuid, null) $$,
  'P0002', null,
  'another org''s bank reads as gone'
);

select lives_ok(
  $$ insert into started
     select 'case', public.start_session(null, '00000000-0000-0000-0000-0000000007c1'::uuid) $$,
  'A can start a session from a case study'
);

select isnt(
  (select s.code from public.sessions s join started t on t.session_id = s.id where t.label = 'case'),
  (select s.code from public.sessions s join started t on t.session_id = s.id where t.label = 'bank'),
  'two open sessions never share a code'
);

-- The state machine, from a host who is allowed to drive it.
select throws_ok(
  $$ update public.sessions set status = 'paused'
      where id = (select session_id from started where label = 'bank') $$,
  '22023', null,
  'a session in the lobby cannot be paused'
);

select lives_ok(
  $$ update public.sessions set status = 'running', current_position = 1
      where id = (select session_id from started where label = 'bank') $$,
  'the lobby can start running'
);

select throws_ok(
  $$ update public.sessions set status = 'lobby'
      where id = (select session_id from started where label = 'bank') $$,
  '22023', null,
  'a running session cannot go back to the lobby'
);

select lives_ok(
  $$ update public.sessions set status = 'paused'
      where id = (select session_id from started where label = 'bank') $$,
  'a running session can be paused and resumed'
);

select lives_ok(
  $$ update public.sessions set status = 'running', reveal = true
      where id = (select session_id from started where label = 'bank') $$,
  'a paused session can resume, and the host can reveal'
);

select throws_ok(
  $$ update public.sessions set current_position = 9
      where id = (select session_id from started where label = 'bank') $$,
  '22023', null,
  'the room cannot be moved past the end of the set'
);

select throws_ok(
  $$ update public.sessions set code = 'ZZZZZZ'
      where id = (select session_id from started where label = 'bank') $$,
  '42501', null,
  'a host has no privilege to rewrite a join code'
);

select throws_ok(
  $$ update public.sessions set item_set = '[]'::jsonb
      where id = (select session_id from started where label = 'bank') $$,
  '42501', null,
  'a host has no privilege to rewrite the set the room is working through'
);

select throws_ok(
  $$ delete from public.sessions
      where id = (select session_id from started where label = 'bank') $$,
  '42501', null,
  'sessions are a record of a class and cannot be deleted'
);

-- Ending.
select isnt(
  (select public.end_session((select session_id from started where label = 'bank'))),
  null,
  'A can end the session, and gets the time it closed'
);

select results_eq(
  $$ select s.status::text, s.closed_at is not null, s.reveal
     from public.sessions s join started t on t.session_id = s.id where t.label = 'bank' $$,
  $$ values ('ended', true, false) $$,
  'ending closes the row and drops the reveal flag with it'
);

select is(
  (select public.end_session((select session_id from started where label = 'bank'))),
  (select s.closed_at from public.sessions s join started t on t.session_id = s.id
    where t.label = 'bank'),
  'ending an ended session is idempotent and returns the same closing time'
);

select throws_ok(
  $$ update public.sessions set status = 'running'
      where id = (select session_id from started where label = 'bank') $$,
  '22023', null,
  'an ended session cannot be reopened'
);

select throws_ok(
  $$ update public.sessions set reveal = true
      where id = (select session_id from started where label = 'bank') $$,
  '22023', null,
  'nothing at all can be changed on an ended session'
);

-- ---------------------------------------------------------------------------
-- As B: an author in another org
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000007bb","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.sessions),
  0,
  'another org sees none of A''s sessions'
);

select throws_ok(
  $$ select public.end_session((select session_id from started where label = 'case')) $$,
  'P0002', null,
  'another org cannot end A''s session; it reads as gone'
);

select throws_ok(
  $$ select public.resolve_session_code('ABCDEF', '10.0.0.1') $$,
  '42501', null,
  'a signed-in user cannot resolve codes; only this app''s server can'
);

-- ---------------------------------------------------------------------------
-- As anon
-- ---------------------------------------------------------------------------

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$ select * from public.sessions $$,
  '42501', null,
  'anon cannot read the sessions table at all'
);

select throws_ok(
  $$ select public.start_session('00000000-0000-0000-0000-0000000007b1'::uuid, null) $$,
  '42501', null,
  'anon cannot start a session'
);

select throws_ok(
  $$ select public.resolve_session_code('ABCDEF', '10.0.0.1') $$,
  '42501', null,
  'anon cannot resolve a code, so codes cannot be enumerated with the publishable key'
);

-- ---------------------------------------------------------------------------
-- As service_role: the app server's own view, which is the only way a code resolves
-- ---------------------------------------------------------------------------

reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select results_eq(
  $$ select r.session_id, r.session_status::text, r.session_title
     from public.resolve_session_code(
       (select s.code from public.sessions s join started t on t.session_id = s.id
         where t.label = 'case'), '10.0.0.2') r $$,
  $$ select session_id, 'lobby', 'Live case' from started where label = 'case' $$,
  'an open code resolves to its session, and to nothing else about it'
);

select results_eq(
  $$ select r.session_id from public.resolve_session_code(
       (select lower(s.code) from public.sessions s join started t on t.session_id = s.id
         where t.label = 'case'), '10.0.0.2') r $$,
  $$ select session_id from started where label = 'case' $$,
  'a code typed in lower case still resolves'
);

select results_eq(
  $$ select r.session_id from public.resolve_session_code(
       (select ' ' || substr(s.code, 1, 3) || '-' || substr(s.code, 4, 3) || ' '
          from public.sessions s join started t on t.session_id = s.id where t.label = 'case'),
       '10.0.0.2') r $$,
  $$ select session_id from started where label = 'case' $$,
  'spaces and a hyphen between the halves are forgiven'
);

select is(
  (select count(*)::int from public.resolve_session_code(
     (select s.code from public.sessions s join started t on t.session_id = s.id
       where t.label = 'bank'), '10.0.0.2')),
  0,
  'an ended session''s code no longer resolves'
);

select is(
  (select count(*)::int from public.resolve_session_code('ZZZZZZ', '10.0.0.2')),
  0,
  'a code that never existed answers exactly as an ended one does: nothing'
);

select is(
  (select count(*)::int from public.resolve_session_code('not a code at all', '10.0.0.2')),
  0,
  'a code holding characters outside the alphabet cannot match'
);

-- ---------------------------------------------------------------------------
-- The per-address limit
-- ---------------------------------------------------------------------------

reset role;

select is(
  (select count(*)::int from generate_series(1, 5)
    where private.take_code_lookup('10.0.0.3', 'attempt')),
  5,
  'lookups from an address are within the limit while the budget lasts'
);

update private.code_lookups set calls = 150
  where client_key = '10.0.0.3' and bucket = 'attempt';

select is(
  private.take_code_lookup('10.0.0.3', 'attempt'), false,
  'the 151st lookup in five minutes from one address is over the limit'
);

select is(
  (select calls from private.code_lookups where client_key = '10.0.0.3' and bucket = 'attempt'),
  151,
  'lookups over the limit are still counted, capped one past it, so hammering does not pay'
);

select is(
  private.take_code_lookup('10.0.0.4', 'attempt'), true,
  'every address is counted on its own'
);

select is(
  private.take_code_lookup('10.0.0.3', 'miss'), true,
  'misses have a budget of their own, so a spent attempt budget is not two limits in one'
);

select throws_ok(
  $$ select private.take_code_lookup('10.0.0.3', 'nonsense') $$,
  '22023', null,
  'a bucket without a limit is refused rather than waved through'
);

update private.code_lookups set window_start = now() - interval '6 minutes'
  where client_key = '10.0.0.3' and bucket = 'attempt';

select is(
  private.take_code_lookup('10.0.0.3', 'attempt'), true,
  'a new window starts a new count'
);

-- An address that has spent its attempt budget is refused even with a correct code.
insert into private.code_lookups (client_key, bucket, window_start, calls)
  values ('10.0.0.5', 'attempt', now(), 150);
-- An address that has only spent its MISS budget keeps working for correct codes.
insert into private.code_lookups (client_key, bucket, window_start, calls)
  values ('10.0.0.6', 'miss', now(), 60);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select throws_ok(
  $$ select public.resolve_session_code(
       (select s.code from public.sessions s join started t on t.session_id = s.id
         where t.label = 'case'), '10.0.0.5') $$,
  'PT429', null,
  'once an address has spent its lookups it is refused, right code or not'
);

select throws_ok(
  $$ select public.resolve_session_code('ZZZZZZ', '10.0.0.6') $$,
  'PT429', null,
  'an address that has run out of wrong guesses cannot keep guessing'
);

select results_eq(
  $$ select r.session_id from public.resolve_session_code(
       (select s.code from public.sessions s join started t on t.session_id = s.id
         where t.label = 'case'), '10.0.0.6') r $$,
  $$ select session_id from started where label = 'case' $$,
  'but a correct code still resolves for it, so one person''s typos cannot shut a class out'
);

-- ---------------------------------------------------------------------------
-- As the superuser: code reuse, and the collision retry
-- ---------------------------------------------------------------------------

reset role;

-- The ended session's code is free again, which is what "unique among open sessions" means.
select lives_ok(
  $$ insert into public.sessions (org_id, host_id, bank_id, title, code, item_set)
     select p.org_id, p.id, '00000000-0000-0000-0000-0000000007b1',
            'Reuse', s.code, '["00000000-0000-0000-0000-0000000007e1"]'::jsonb
     from public.profiles p, public.sessions s join started t on t.session_id = s.id
     where p.id = '00000000-0000-0000-0000-0000000007aa' and t.label = 'bank' $$,
  'an ended session''s code is free for a later session to draw'
);

select throws_ok(
  $$ insert into public.sessions (org_id, host_id, bank_id, title, code, item_set)
     select p.org_id, p.id, '00000000-0000-0000-0000-0000000007b1',
            'Clash', s.code, '["00000000-0000-0000-0000-0000000007e1"]'::jsonb
     from public.profiles p, public.sessions s join started t on t.session_id = s.id
     where p.id = '00000000-0000-0000-0000-0000000007aa' and t.label = 'case' $$,
  '23505', null,
  'but an open session''s code cannot be taken twice'
);

-- Force a collision: the generator hands out a code that is already open, then a free one. The
-- counter is a sequence rather than a table because the retry runs inside a subtransaction that
-- the unique violation rolls back — a table row would be reset with it and every draw would be
-- the first.
create sequence private.code_draws;
create or replace function private.new_session_code() returns text
language plpgsql volatile security definer set search_path = ''
as $$
begin
  return case when nextval('private.code_draws') = 1
              then (select s.code from public.sessions s
                      join pg_temp.started t on t.session_id = s.id
                     where t.label = 'case')
              else 'AJAJAJ' end;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000007aa","role":"authenticated"}', true);

-- Started outside an assertion on purpose: start_session is volatile, so putting it in a WHERE
-- clause would run it once per row scanned rather than once.
insert into started
select 'collide', public.start_session('00000000-0000-0000-0000-0000000007b1'::uuid, null);

select is(
  (select s.code from public.sessions s join started t on t.session_id = s.id
    where t.label = 'collide'),
  'AJAJAJ',
  'a code that collides with an open session is thrown away and another drawn'
);

reset role;

select is(
  (select last_value::int from private.code_draws), 2,
  'the collision cost exactly one extra draw, not a silent loop'
);

select * from finish();
rollback;
