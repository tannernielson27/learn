-- One round trip for a phone to read the room (#407): `public.open_session_view`, which checks a
-- participant's token, charges their view limit and answers with the room, the item or set it is
-- on and their own answers, in the one call `POST /api/live/view` now makes.
--
-- What is held here is what only the database can hold: who may call it, that a token is matched
-- before anything is charged or read, that marks are not read before the reveal, that nobody is
-- handed anybody else's answer, and that `last_seen_at` is left alone. That the route strips the
-- keys this function returns is held on the response bytes, in
-- src/lib/liveSupabase/viewRoute.test.ts.
-- Runs with `pnpm test:db`. Uses its own fixture ids so it never counts the seed's.
begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

-- ---------------------------------------------------------------------------
-- Fixtures, as the superuser
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role)
values ('00000000-0000-0000-0000-0000004070aa', 'open-view-host@example.test', 'authenticated',
        'authenticated');

-- #204: the sign-up trigger grants no role, so make this account an instructor in the seeded org
-- explicitly, where the trigger used to put it.
update public.profiles
  set org_id = (select id from public.orgs order by created_at, id limit 1), role = 'instructor'
  where id in ('00000000-0000-0000-0000-0000004070aa');

insert into public.item_banks (id, org_id, name)
  select '00000000-0000-0000-0000-0000004070b1', org_id, 'Open view bank'
  from public.profiles where id = '00000000-0000-0000-0000-0000004070aa';

insert into public.items (id, bank_id, org_id, type, status, content, answer_key, scoring)
  select v.id, '00000000-0000-0000-0000-0000004070b1', p.org_id, 'multiple_choice', 'published',
         jsonb_build_object('id', v.ref), jsonb_build_object('correctOptionId', v.correct), '{}'
  from public.profiles p,
       (values ('00000000-0000-0000-0000-0000004070e1'::uuid, 'itm-one', 'opt_a'),
               ('00000000-0000-0000-0000-0000004070e2'::uuid, 'itm-two', 'opt_b'),
               ('00000000-0000-0000-0000-0000004070e3'::uuid, 'itm-three', 'opt_c'))
         as v (id, ref, correct)
  where p.id = '00000000-0000-0000-0000-0000004070aa';

-- A room the host leads, and a student-paced one beside it.
insert into public.sessions (id, org_id, host_id, bank_id, title, code, item_set)
  select '00000000-0000-0000-0000-0000004070d1', p.org_id, p.id,
         '00000000-0000-0000-0000-0000004070b1', 'Led', 'VEW407',
         '["00000000-0000-0000-0000-0000004070e1",
           "00000000-0000-0000-0000-0000004070e2"]'::jsonb
  from public.profiles p where p.id = '00000000-0000-0000-0000-0000004070aa';

insert into public.sessions (id, org_id, host_id, bank_id, title, code, mode, item_set)
  select '00000000-0000-0000-0000-0000004070d2', p.org_id, p.id,
         '00000000-0000-0000-0000-0000004070b1', 'Paced', 'VEW408', 'student_paced',
         '["00000000-0000-0000-0000-0000004070e1",
           "00000000-0000-0000-0000-0000004070e2",
           "00000000-0000-0000-0000-0000004070e3"]'::jsonb
  from public.profiles p where p.id = '00000000-0000-0000-0000-0000004070aa';

-- Ada (...11) and Grace (...12) in the led room, Pia (...21) in the paced one, each with a
-- secret this file knows. `join_session` draws its own, which a test cannot present.
insert into public.participants (id, session_id, org_id, display_name, rejoin_hash)
  select v.id, s.id, s.org_id, v.name, extensions.digest(v.secret, 'sha256')
  from (values
         ('00000000-0000-0000-0000-000000407011'::uuid,
          '00000000-0000-0000-0000-0000004070d1'::uuid, 'Ada', 'secret-ada'),
         ('00000000-0000-0000-0000-000000407012'::uuid,
          '00000000-0000-0000-0000-0000004070d1'::uuid, 'Grace', 'secret-grace'),
         ('00000000-0000-0000-0000-000000407021'::uuid,
          '00000000-0000-0000-0000-0000004070d2'::uuid, 'Pia', 'secret-pia'))
         as v (id, room, name, secret)
  join public.sessions s on s.id = v.room;

-- So a touch would show: `resume_participant` sets this to now() on every call.
update public.participants set last_seen_at = now() - interval '1 hour'
 where id = '00000000-0000-0000-0000-000000407011';

-- ---------------------------------------------------------------------------
-- Who may call it
-- ---------------------------------------------------------------------------

select has_function(
  'public', 'open_session_view', array['uuid', 'uuid', 'text'],
  'the view route has one function to call'
);

select ok(
  not has_function_privilege('anon', 'public.open_session_view(uuid, uuid, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.open_session_view(uuid, uuid, text)',
                                 'execute'),
  'no browser role may execute it: it returns items with their keys'
);

select ok(
  has_function_privilege('service_role', 'public.open_session_view(uuid, uuid, text)', 'execute'),
  'and this app''s own server may'
);

set local role anon;
select throws_ok(
  $$ select * from public.open_session_view(
       '00000000-0000-0000-0000-000000407011',
       '00000000-0000-0000-0000-0000004070d1', 'secret-ada') $$,
  '42501', null,
  'so a browser holding a real token still cannot reach it'
);
reset role;

-- ---------------------------------------------------------------------------
-- The token is matched before anything is charged or read
-- ---------------------------------------------------------------------------

set local role service_role;

select results_eq(
  $$ select refusal, session_status::text, session_mode::text, session_position, session_reveal,
            session_items, view_items, view_answers
       from public.open_session_view(
         '00000000-0000-0000-0000-000000407011',
         '00000000-0000-0000-0000-0000004070d1', 'secret-ada') $$,
  $$ values (null::text, 'lobby', 'instructor_paced', null::smallint, false,
             '["00000000-0000-0000-0000-0000004070e1",
               "00000000-0000-0000-0000-0000004070e2"]'::jsonb,
             '[]'::jsonb, '[]'::jsonb) $$,
  'in the lobby: the room as begin_session_view tells it, and no item and no answer'
);

select is_empty(
  $$ select * from public.open_session_view(
       '00000000-0000-0000-0000-000000407011',
       '00000000-0000-0000-0000-0000004070d1', 'secret-wrong') $$,
  'a wrong secret answers with nothing at all'
);

select is_empty(
  $$ select * from public.open_session_view(
       '00000000-0000-0000-0000-000000407011',
       '00000000-0000-0000-0000-0000004070d1', null) $$,
  'and so does a missing one'
);

select is_empty(
  $$ select * from public.open_session_view(
       '00000000-0000-0000-0000-000000407011',
       '00000000-0000-0000-0000-0000004070d2', 'secret-ada') $$,
  'a token is for one session: the right secret opens no other room'
);

select is_empty(
  $$ select * from public.open_session_view(
       '00000000-0000-0000-0000-000000407011',
       '00000000-0000-0000-0000-0000004070d1', 'secret-grace') $$,
  'one participant''s secret does not make you another participant'
);

reset role;

select is(
  (select v.calls from private.session_views v
    where v.participant_id = '00000000-0000-0000-0000-000000407011'),
  1,
  'only the call whose secret matched was charged: nobody spends a budget that is not theirs'
);

-- ---------------------------------------------------------------------------
-- A room on one item
-- ---------------------------------------------------------------------------

update public.sessions set status = 'running', current_position = 1
 where id = '00000000-0000-0000-0000-0000004070d1';

-- Ada answers items one and two, Grace item one. Written directly: scoring is the route's, and
-- what is asked here is only who is handed which row. Ada's first carries the key it was scored
-- with, as `record_session_response` stores it (#208).
insert into public.session_responses
  (session_id, org_id, participant_id, item_id, item_position, response, points, max_points,
   model, reveal)
  select s.id, s.org_id, v.who, v.item, v.place, v.said, v.earned, 1, 'zero_one', v.scored_with
  from public.sessions s,
       (values
          ('00000000-0000-0000-0000-000000407011'::uuid,
           '00000000-0000-0000-0000-0000004070e1'::uuid, 1::smallint,
           '{"type":"multiple_choice","optionId":"opt_a"}'::jsonb, 1,
           '{"answerKey":{"correctOptionId":"opt_a"}}'::jsonb),
          ('00000000-0000-0000-0000-000000407011'::uuid,
           '00000000-0000-0000-0000-0000004070e2'::uuid, 2::smallint,
           '{"type":"multiple_choice","optionId":"opt_c"}'::jsonb, 0, null::jsonb),
          ('00000000-0000-0000-0000-000000407012'::uuid,
           '00000000-0000-0000-0000-0000004070e1'::uuid, 1::smallint,
           '{"type":"multiple_choice","optionId":"opt_d"}'::jsonb, 0, null::jsonb))
         as v (who, item, place, said, earned, scored_with)
  where s.id = '00000000-0000-0000-0000-0000004070d1';

set local role service_role;

select is(
  (select jsonb_array_length(v.view_items) from public.open_session_view(
     '00000000-0000-0000-0000-000000407011',
     '00000000-0000-0000-0000-0000004070d1', 'secret-ada') v),
  1,
  'a room on one item hands back one item, not the set'
);

select is(
  (select v.view_items -> 0 ->> 'id' from public.open_session_view(
     '00000000-0000-0000-0000-000000407011',
     '00000000-0000-0000-0000-0000004070d1', 'secret-ada') v),
  '00000000-0000-0000-0000-0000004070e1',
  'and it is the item the room is on'
);

select is(
  (select array(select k from jsonb_object_keys(v.view_items -> 0) as k order by k collate "C")
     from public.open_session_view(
       '00000000-0000-0000-0000-000000407011',
       '00000000-0000-0000-0000-0000004070d1', 'secret-ada') v),
  array['answer_key', 'cjmm_step', 'content', 'id', 'rationale', 'scoring', 'tags', 'type',
        'version'],
  'as the nine columns the route used to select, and no org, bank or author'
);

-- Said out loud, because it is the reason for the grants above: this is a row with its key.
select is(
  (select v.view_items -> 0 -> 'answer_key' from public.open_session_view(
     '00000000-0000-0000-0000-000000407011',
     '00000000-0000-0000-0000-0000004070d1', 'secret-ada') v),
  '{"correctOptionId":"opt_a"}'::jsonb,
  'the item comes back with its key, which is why only the server may call this'
);

select is(
  (select jsonb_array_length(v.view_answers) from public.open_session_view(
     '00000000-0000-0000-0000-000000407011',
     '00000000-0000-0000-0000-0000004070d1', 'secret-ada') v),
  1,
  'one answer comes back: not Grace''s to the same item, and not Ada''s to another'
);

select is(
  (select v.view_answers -> 0 -> 'response' from public.open_session_view(
     '00000000-0000-0000-0000-000000407011',
     '00000000-0000-0000-0000-0000004070d1', 'secret-ada') v),
  '{"type":"multiple_choice","optionId":"opt_a"}'::jsonb,
  'and it is what Ada sent'
);

select is(
  (select array(select k from jsonb_object_keys(v.view_answers -> 0) as k order by k collate "C")
     from public.open_session_view(
       '00000000-0000-0000-0000-000000407011',
       '00000000-0000-0000-0000-0000004070d1', 'secret-ada') v),
  array['item_position', 'response', 'submitted_at'],
  'before the reveal an answer is what was sent and when: no points, no key it was scored with'
);

select is(
  (select v.view_answers -> 0 -> 'response' from public.open_session_view(
     '00000000-0000-0000-0000-000000407012',
     '00000000-0000-0000-0000-0000004070d1', 'secret-grace') v),
  '{"type":"multiple_choice","optionId":"opt_d"}'::jsonb,
  'Grace is handed her own answer to the same item'
);

reset role;

-- ---------------------------------------------------------------------------
-- After the reveal
-- ---------------------------------------------------------------------------

update public.sessions set reveal = true where id = '00000000-0000-0000-0000-0000004070d1';

set local role service_role;

select is(
  (select array(select k from jsonb_object_keys(v.view_answers -> 0) as k order by k collate "C")
     from public.open_session_view(
       '00000000-0000-0000-0000-000000407011',
       '00000000-0000-0000-0000-0000004070d1', 'secret-ada') v),
  array['breakdown', 'groups', 'item_position', 'max_points', 'model', 'points', 'response',
        'reveal', 'submitted_at'],
  'once the host has revealed, the same answer comes back with its marks'
);

select is(
  (select (v.view_answers -> 0 ->> 'points')::numeric from public.open_session_view(
     '00000000-0000-0000-0000-000000407011',
     '00000000-0000-0000-0000-0000004070d1', 'secret-ada') v),
  1::numeric,
  'the points it earned'
);

select is(
  (select v.view_answers -> 0 -> 'reveal' from public.open_session_view(
     '00000000-0000-0000-0000-000000407011',
     '00000000-0000-0000-0000-0000004070d1', 'secret-ada') v),
  '{"answerKey":{"correctOptionId":"opt_a"}}'::jsonb,
  'and the key it was scored with, so an edit since cannot split the marks from the key (#208)'
);

select is(
  (select jsonb_array_length(v.view_answers) from public.open_session_view(
     '00000000-0000-0000-0000-000000407011',
     '00000000-0000-0000-0000-0000004070d1', 'secret-ada') v),
  1,
  'still one answer: a reveal hands nobody anybody else''s marks'
);

reset role;

-- ---------------------------------------------------------------------------
-- The room moves on, and ends
-- ---------------------------------------------------------------------------

update public.sessions set current_position = 2 where id = '00000000-0000-0000-0000-0000004070d1';

set local role service_role;

select results_eq(
  $$ select v.session_position, v.session_reveal, v.view_items -> 0 ->> 'id',
            jsonb_array_length(v.view_items), v.view_answers -> 0 -> 'response'
       from public.open_session_view(
         '00000000-0000-0000-0000-000000407011',
         '00000000-0000-0000-0000-0000004070d1', 'secret-ada') v $$,
  $$ values (2::smallint, false, '00000000-0000-0000-0000-0000004070e2', 1,
             '{"type":"multiple_choice","optionId":"opt_c"}'::jsonb) $$,
  'on the next item: that item, and Ada''s answer to it'
);

select is(
  (select v.view_answers from public.open_session_view(
     '00000000-0000-0000-0000-000000407012',
     '00000000-0000-0000-0000-0000004070d1', 'secret-grace') v),
  '[]'::jsonb,
  'Grace has not answered it, so she is handed no answer'
);

reset role;

update public.sessions set status = 'ended' where id = '00000000-0000-0000-0000-0000004070d1';

set local role service_role;

select results_eq(
  $$ select v.refusal, v.session_status::text, v.view_items, v.view_answers
       from public.open_session_view(
         '00000000-0000-0000-0000-000000407011',
         '00000000-0000-0000-0000-0000004070d1', 'secret-ada') v $$,
  $$ values (null::text, 'ended', '[]'::jsonb, '[]'::jsonb) $$,
  'an ended room still answers, so the phone can say it is over, and shows no item'
);

reset role;

-- ---------------------------------------------------------------------------
-- A student-paced room
-- ---------------------------------------------------------------------------

set local role service_role;

select results_eq(
  $$ select v.session_status::text, v.session_mode::text, v.view_items
       from public.open_session_view(
         '00000000-0000-0000-0000-000000407021',
         '00000000-0000-0000-0000-0000004070d2', 'secret-pia') v $$,
  $$ values ('lobby', 'student_paced', '[]'::jsonb) $$,
  'a student-paced room shows nothing in the lobby either'
);

reset role;

update public.sessions set status = 'running', current_position = 1
 where id = '00000000-0000-0000-0000-0000004070d2';

insert into public.session_responses
  (session_id, org_id, participant_id, item_id, item_position, response, points, max_points,
   model)
  select s.id, s.org_id, '00000000-0000-0000-0000-000000407021', v.item, v.place,
         '{"type":"multiple_choice","optionId":"opt_a"}'::jsonb, 1, 1, 'zero_one'
  from public.sessions s,
       (values ('00000000-0000-0000-0000-0000004070e1'::uuid, 1::smallint),
               ('00000000-0000-0000-0000-0000004070e3'::uuid, 3::smallint)) as v (item, place)
  where s.id = '00000000-0000-0000-0000-0000004070d2';

set local role service_role;

select is(
  (select array(select e ->> 'id' from jsonb_array_elements(v.view_items) e order by 1)
     from public.open_session_view(
       '00000000-0000-0000-0000-000000407021',
       '00000000-0000-0000-0000-0000004070d2', 'secret-pia') v),
  array['00000000-0000-0000-0000-0000004070e1', '00000000-0000-0000-0000-0000004070e2',
        '00000000-0000-0000-0000-0000004070e3'],
  'once it is running, the whole set comes back in the one call'
);

select is(
  (select array(select (e ->> 'item_position')::int
                  from jsonb_array_elements(v.view_answers) e order by 1)
     from public.open_session_view(
       '00000000-0000-0000-0000-000000407021',
       '00000000-0000-0000-0000-0000004070d2', 'secret-pia') v),
  array[1, 3],
  'with every answer this participant has given, whichever items they were'
);

select is(
  (select bool_and(not (e ? 'points') and not (e ? 'reveal'))
     from public.open_session_view(
       '00000000-0000-0000-0000-000000407021',
       '00000000-0000-0000-0000-0000004070d2', 'secret-pia') v,
       jsonb_array_elements(v.view_answers) e),
  true,
  'and no marks on any of them until Show answers'
);

reset role;

update public.sessions set status = 'paused' where id = '00000000-0000-0000-0000-0000004070d2';

set local role service_role;

select is(
  (select jsonb_array_length(v.view_items) from public.open_session_view(
     '00000000-0000-0000-0000-000000407021',
     '00000000-0000-0000-0000-0000004070d2', 'secret-pia') v),
  3,
  'a paused room keeps its set: the phones hold their place and wait'
);

reset role;

-- ---------------------------------------------------------------------------
-- The same limit, charged the same way
-- ---------------------------------------------------------------------------

-- Pia's budget is spent to the last call, by the counter `begin_session_view` shares.
update private.session_views set calls = 600, window_start = now()
 where participant_id = '00000000-0000-0000-0000-000000407021';

set local role service_role;

select results_eq(
  $$ select v.refusal, v.session_status::text, v.session_items, v.view_items, v.view_answers,
            v.server_now is not null
       from public.open_session_view(
         '00000000-0000-0000-0000-000000407021',
         '00000000-0000-0000-0000-0000004070d2', 'secret-pia') v $$,
  $$ values ('rate_limited', null::text, null::jsonb, null::jsonb, null::jsonb, true) $$,
  'the six hundred and first read is refused, with nothing about the room beside the refusal'
);

select is(
  (select v.refusal from public.begin_session_view(
     '00000000-0000-0000-0000-0000004070d2',
     '00000000-0000-0000-0000-000000407021') v),
  'rate_limited',
  'it is one budget: the channel-token route, which charges it the old way, is refused too'
);

select is(
  (select v.refusal from public.open_session_view(
     '00000000-0000-0000-0000-000000407012',
     '00000000-0000-0000-0000-0000004070d1', 'secret-grace') v),
  null::text,
  'and it is each participant''s own: Grace may still read her room'
);

reset role;

-- ---------------------------------------------------------------------------
-- What it does not write
-- ---------------------------------------------------------------------------

select ok(
  (select p.last_seen_at < now() - interval '30 minutes' from public.participants p
    where p.id = '00000000-0000-0000-0000-000000407011'),
  'none of Ada''s reads touched last_seen_at: a view makes one write, the counter''s'
);

select * from finish();
rollback;
