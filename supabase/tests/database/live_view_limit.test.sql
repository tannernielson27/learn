-- How often one person may read the room (#152): the counter behind `POST /api/live/view`, and
-- the function the route calls instead of reading `public.sessions` itself.
-- Runs with `pnpm exec supabase test db`. Uses its own fixture ids so it never counts the seed's.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- ---------------------------------------------------------------------------
-- Fixtures, as the superuser
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role)
values ('00000000-0000-0000-0000-0000000152aa', 'view-host@example.test', 'authenticated',
        'authenticated');

-- #204: the sign-up trigger grants no role, so make these accounts instructors in the seeded
-- org explicitly, where the trigger used to put them.
update public.profiles
  set org_id = (select id from public.orgs order by created_at, id limit 1), role = 'instructor'
  where id in ('00000000-0000-0000-0000-0000000152aa');

insert into public.item_banks (id, org_id, name)
  select '00000000-0000-0000-0000-0000000152b1', org_id, 'View bank'
  from public.profiles where id = '00000000-0000-0000-0000-0000000152aa';

insert into public.items (id, bank_id, org_id, type, status, content, answer_key, scoring)
  select '00000000-0000-0000-0000-0000000152e1', '00000000-0000-0000-0000-0000000152b1', p.org_id,
         'multiple_choice', 'published', jsonb_build_object('id', 'itm-view'), '{}', '{}'
  from public.profiles p where p.id = '00000000-0000-0000-0000-0000000152aa';

insert into public.sessions (id, org_id, host_id, bank_id, title, code, item_set)
  select '00000000-0000-0000-0000-0000000152d1', p.org_id, p.id,
         '00000000-0000-0000-0000-0000000152b1', 'Viewing', 'VUEW52',
         '["00000000-0000-0000-0000-0000000152e1"]'::jsonb
  from public.profiles p where p.id = '00000000-0000-0000-0000-0000000152aa';

-- ---------------------------------------------------------------------------
-- The counter's table
-- ---------------------------------------------------------------------------

select has_table('private', 'session_views', 'the view counter has a table of its own');

-- Deliberately `private.session_submits`'s three columns and no more. A counter that grew a
-- session id or an address would be a second dialect of the same idea; see the migration.
select columns_are(
  'private', 'session_views',
  array['participant_id', 'window_start', 'calls'],
  'and it holds a participant, a window and a count, exactly as the submission counter does'
);

set local role anon;
select throws_ok(
  $$ select * from private.session_views $$,
  '42501', null,
  'nobody reads the counter through the Data API'
);
reset role;

-- ---------------------------------------------------------------------------
-- What the route is told about the room
-- ---------------------------------------------------------------------------

set local role service_role;
select results_eq(
  $$ select refusal, session_status::text, session_position, session_reveal, session_items
       from public.begin_session_view(
         '00000000-0000-0000-0000-0000000152d1',
         '00000000-0000-0000-0000-0000000152f1') $$,
  $$ values (null::text, 'lobby', null::smallint, false,
             '["00000000-0000-0000-0000-0000000152e1"]'::jsonb) $$,
  'the four facts a student may know about a room, and no code, host, org or title'
);

-- The same 401 the route always answered a deleted session with: no rows, not a refusal.
select is_empty(
  $$ select * from public.begin_session_view(
       '00000000-0000-0000-0000-0000000152dd',
       '00000000-0000-0000-0000-0000000152f1') $$,
  'a session that is no longer there answers with nothing at all'
);
reset role;

set local role anon;
select throws_ok(
  $$ select * from public.begin_session_view(
       '00000000-0000-0000-0000-0000000152d1',
       '00000000-0000-0000-0000-0000000152f1') $$,
  '42501', null,
  'and this app''s own server is the only caller: a browser cannot reach the function'
);
reset role;

-- ---------------------------------------------------------------------------
-- How often one person may read the room
-- ---------------------------------------------------------------------------

select ok(
  (select bool_and(private.take_session_view('00000000-0000-0000-0000-000000015255'))
     from generate_series(1, 600)),
  'the first six hundred reads in a window are all allowed'
);

select ok(
  not private.take_session_view('00000000-0000-0000-0000-000000015255'),
  'and the six hundred and first is not'
);

set local role service_role;
select is(
  (select v.refusal from public.begin_session_view(
     '00000000-0000-0000-0000-0000000152d1',
     '00000000-0000-0000-0000-000000015255') v),
  'rate_limited',
  'so the view route is told to back off before it reads the session at all'
);
reset role;

select is(
  (select count(*)::int from private.session_views
    where participant_id = '00000000-0000-0000-0000-000000015255' and calls > 601),
  0,
  'and reads over the limit are counted no further, so hammering does not lengthen the wait'
);

-- The two budgets are separate, which is the whole reason there are two tables: a phone that has
-- spent its reads can still send the answer it is holding.
select is(
  (select count(*)::int from private.session_submits
    where participant_id = '00000000-0000-0000-0000-000000015255'),
  0,
  'reading the room does not spend the answering budget'
);

select ok(
  private.take_session_submission('00000000-0000-0000-0000-000000015255'),
  'so a participant who has run out of reads may still answer'
);

update private.session_views set window_start = now() - interval '6 minutes'
 where participant_id = '00000000-0000-0000-0000-000000015255';

select ok(
  private.take_session_view('00000000-0000-0000-0000-000000015255'),
  'and the window is a window: once it has passed, the budget is whole again'
);

select is(
  (select v.calls from private.session_views v
    where v.participant_id = '00000000-0000-0000-0000-000000015255'),
  1,
  'counted from one, not carried over'
);

select * from finish();
rollback;
