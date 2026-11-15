-- Renaming and archiving live sessions (#565). Runs with `pnpm test:db`. Own fixture ids.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- ---------------------------------------------------------------------------
-- Fixtures, as the superuser: a host and a co-teacher in the seeded org, and two sessions of the
-- host's, one ended and one still in the lobby.
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-000000565aaa', 'tidy-host@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000565bbb', 'tidy-co@example.test', 'authenticated', 'authenticated');

update public.profiles
  set org_id = (select id from public.orgs order by created_at, id limit 1), role = 'instructor'
  where id in ('00000000-0000-0000-0000-000000565aaa', '00000000-0000-0000-0000-000000565bbb');

insert into public.sessions (id, org_id, host_id, title, code)
  select v.id, p.org_id, p.id, v.title, v.code
  from public.profiles p,
       (values ('00000000-0000-0000-0000-000000565e01'::uuid, 'Week 1 review', '2A3B4C'),
               ('00000000-0000-0000-0000-000000565e02'::uuid, 'Still open', '5D6E7F'))
         as v (id, title, code)
  where p.id = '00000000-0000-0000-0000-000000565aaa';
-- A lobby may go straight to ended; the guard sets closed_at.
update public.sessions set status = 'ended' where id = '00000000-0000-0000-0000-000000565e01';

-- ---------------------------------------------------------------------------
-- As the host
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000565aaa","role":"authenticated"}', true);

select lives_ok(
  $$ update public.sessions set title = 'Week 1 review, Period 2'
      where id = '00000000-0000-0000-0000-000000565e01' $$,
  'the host can rename a session that has ended'
);
select is(
  (select title from public.sessions where id = '00000000-0000-0000-0000-000000565e01'),
  'Week 1 review, Period 2',
  'the new title is kept'
);

select lives_ok(
  $$ update public.sessions set archived_at = '2000-01-01'
      where id = '00000000-0000-0000-0000-000000565e01' $$,
  'the host can archive a session that has ended'
);
select ok(
  (select archived_at > now() - interval '1 minute'
     from public.sessions where id = '00000000-0000-0000-0000-000000565e01'),
  'the archive time is the server''s, not the one the client sent'
);
select is(
  (select status::text from public.sessions where id = '00000000-0000-0000-0000-000000565e01'),
  'ended',
  'archiving changes nothing else about the session'
);

select lives_ok(
  $$ update public.sessions set archived_at = null
      where id = '00000000-0000-0000-0000-000000565e01' $$,
  'the host can restore an archived session'
);
select is(
  (select archived_at from public.sessions where id = '00000000-0000-0000-0000-000000565e01'),
  null,
  'a restored session has no archive time'
);

select throws_ok(
  $$ update public.sessions set archived_at = now()
      where id = '00000000-0000-0000-0000-000000565e02' $$,
  '22023', 'a live session can be archived only once it has ended',
  'a session still open cannot be archived'
);

select lives_ok(
  $$ update public.sessions set title = 'Open, renamed'
      where id = '00000000-0000-0000-0000-000000565e02' $$,
  'the host can rename a session that is still open'
);

-- Anything else on an ended session is still refused, alone or riding with a rename.
select throws_ok(
  $$ update public.sessions set reveal = true
      where id = '00000000-0000-0000-0000-000000565e01' $$,
  '22023', 'that session has ended',
  'an ended session still refuses every other change'
);
select throws_ok(
  $$ update public.sessions set title = 'Sneaky', timer_seconds = 30
      where id = '00000000-0000-0000-0000-000000565e01' $$,
  '22023', 'that session has ended',
  'a rename cannot carry another change past the guard'
);
select throws_ok(
  $$ delete from public.sessions where id = '00000000-0000-0000-0000-000000565e01' $$,
  '42501', null,
  'a session still cannot be deleted'
);

-- ---------------------------------------------------------------------------
-- As a co-teacher in the same org
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000565bbb","role":"authenticated"}', true);

select throws_ok(
  $$ update public.sessions set title = 'Mine now'
      where id = '00000000-0000-0000-0000-000000565e01' $$,
  '42501', 'only the teacher who ran a live session can rename or archive it',
  'a co-teacher cannot rename someone else''s session'
);
select throws_ok(
  $$ update public.sessions set archived_at = now()
      where id = '00000000-0000-0000-0000-000000565e01' $$,
  '42501', 'only the teacher who ran a live session can rename or archive it',
  'a co-teacher cannot archive someone else''s session'
);
select is(
  (select count(*)::integer from public.sessions
    where id = '00000000-0000-0000-0000-000000565e01'),
  1,
  'the co-teacher can still read the session'
);

reset role;
select is(
  (select title from public.sessions where id = '00000000-0000-0000-0000-000000565e01'),
  'Week 1 review, Period 2',
  'the refused writes changed nothing'
);

select * from finish();
rollback;
