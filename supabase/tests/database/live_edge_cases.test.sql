-- A live class's edge cases, at the database (the class of 2026-10-27): one member on two devices,
-- a member who joined as a guest and then signed in, a retried answer, and the teacher ending the
-- session in the middle of a question. Nothing here may write a second answer for one person to
-- one question, or take an answer after the end. Runs with `pnpm exec supabase test db`. Uses
-- its own fixture ids so it never counts the seed's rows.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- ---------------------------------------------------------------------------
-- Fixtures, as the superuser
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role)
values
  -- T teaches. M and G are members of NUR 320.
  ('00000000-0000-0000-0000-0000000eeda1', 'live-edge-t@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000eedd1', 'live-edge-m@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000eedd2', 'live-edge-g@example.test', 'authenticated', 'authenticated');

insert into public.orgs (id, name) values
  ('00000000-0000-0000-0000-0000000eeda0', 'Live edge cases');
update public.profiles set org_id = '00000000-0000-0000-0000-0000000eeda0', role = 'instructor'
 where id = '00000000-0000-0000-0000-0000000eeda1';
update public.profiles set org_id = '00000000-0000-0000-0000-0000000eeda0', role = 'student'
 where id in ('00000000-0000-0000-0000-0000000eedd1', '00000000-0000-0000-0000-0000000eedd2');

insert into public.item_banks (id, org_id, name) values
  ('00000000-0000-0000-0000-0000000eedb1', '00000000-0000-0000-0000-0000000eeda0', 'Live edge bank');
-- Two questions, made in this order, so the session's set is e1, e2.
insert into public.items (id, bank_id, org_id, type, status, cjmm_step, content, answer_key, scoring)
values
  ('00000000-0000-0000-0000-0000000eede1', '00000000-0000-0000-0000-0000000eedb1',
   '00000000-0000-0000-0000-0000000eeda0', 'multiple_choice', 'published', 2, '{}',
   '{"correctOptionId":"a"}', '{"model":"zero_one","maxPoints":1}');
insert into public.items (id, bank_id, org_id, type, status, cjmm_step, content, answer_key, scoring)
values
  ('00000000-0000-0000-0000-0000000eede2', '00000000-0000-0000-0000-0000000eedb1',
   '00000000-0000-0000-0000-0000000eeda0', 'multiple_choice', 'published', 4, '{}',
   '{"correctOptionId":"b"}', '{"model":"zero_one","maxPoints":1}');

insert into public.classes (id, org_id, name) values
  ('00000000-0000-0000-0000-0000000eedc1', '00000000-0000-0000-0000-0000000eeda0', 'NUR 320');
insert into public.class_members (class_id, profile_id) values
  ('00000000-0000-0000-0000-0000000eedc1', '00000000-0000-0000-0000-0000000eedd1'),
  ('00000000-0000-0000-0000-0000000eedc1', '00000000-0000-0000-0000-0000000eedd2');

create temporary table fixture (label text primary key, id uuid, secret text);
grant select, insert on fixture to anon, authenticated, service_role;

create function pg_temp.fx(name text) returns uuid
language sql as $$ select id from fixture where label = name $$;

create function pg_temp.secret(name text) returns text
language sql as $$ select secret from fixture where label = name $$;

-- One answer, as the submit route writes it (service role), answering the refusal.
create function pg_temp.answer(who text, pos integer, item uuid) returns text
language sql as $$
  select r.refusal from public.record_session_response(
    pg_temp.fx('s'), pg_temp.fx(who), pos::smallint, item, '{"type":"multiple_choice"}'::jsonb,
    1, 1, 'zero_one', '[]'::jsonb) r
$$;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000eeda1', 'role', 'authenticated')::text,
  true);
insert into fixture (label, id) select 's', public.start_session(
  source_bank => '00000000-0000-0000-0000-0000000eedb1'::uuid,
  target_class => '00000000-0000-0000-0000-0000000eedc1'::uuid);
reset role;

update public.sessions set status = 'running', current_position = 1 where id = pg_temp.fx('s');

-- ---------------------------------------------------------------------------
-- Case 1: one member, a phone and a laptop
-- ---------------------------------------------------------------------------

insert into fixture (label, id, secret)
  select 'phone', j.participant_id, j.rejoin_secret
  from public.join_session(pg_temp.fx('s'), 'Mia', '00000000-0000-0000-0000-0000000eedd1') as j;
insert into fixture (label, id, secret)
  select 'laptop', j.participant_id, j.rejoin_secret
  from public.join_session(pg_temp.fx('s'), 'Mia on a laptop',
                           '00000000-0000-0000-0000-0000000eedd1') as j;

select is(pg_temp.fx('laptop'), pg_temp.fx('phone'),
  'case 1: the second device is the same participant, not a second one');

set local role service_role;
select is(pg_temp.answer('phone', 1, '00000000-0000-0000-0000-0000000eede1'), null,
  'case 1: the first device''s answer is written');
select is(pg_temp.answer('laptop', 1, '00000000-0000-0000-0000-0000000eede1'), 'already_answered',
  'case 1: the second device answering the same question is told it is already answered');
reset role;

select is(
  (select count(*)::int || ':' || sum(points)::text from public.session_responses
    where session_id = pg_temp.fx('s') and participant_id = pg_temp.fx('phone')),
  '1:1',
  'case 1: one answer and one point for the member, not two'
);

select is(
  (select count(*)::int from public.resume_participant(
     pg_temp.fx('phone'), pg_temp.fx('s'), pg_temp.secret('phone'))),
  0,
  'case 1: the first device''s token stops working (ADR 0013 decision 1)'
);

-- ---------------------------------------------------------------------------
-- Case 2: a member who joined as a guest, then signed in and joined again
-- ---------------------------------------------------------------------------

insert into fixture (label, id, secret)
  select 'g_guest', j.participant_id, j.rejoin_secret
  from public.join_session(pg_temp.fx('s'), 'Gia') as j;

set local role service_role;
select is(pg_temp.answer('g_guest', 1, '00000000-0000-0000-0000-0000000eede1'), null,
  'case 2: the guest answers question 1');
reset role;

insert into fixture (label, id, secret)
  select 'g_member', j.participant_id, j.rejoin_secret
  from public.join_session(pg_temp.fx('s'), 'Gia Park', '00000000-0000-0000-0000-0000000eedd2') as j;

select isnt(pg_temp.fx('g_member'), pg_temp.fx('g_guest'),
  'case 2: signed in, the member is a new participant (ADR 0013 decision 2)');

select is(
  (select profile_id from public.participants where id = pg_temp.fx('g_guest')),
  null,
  'case 2: the guest row is never linked after the fact'
);

select is(
  (select count(*)::int from public.session_responses where participant_id = pg_temp.fx('g_guest')),
  1,
  'case 2: the guest''s answer stays with the guest row'
);

set local role service_role;
select is(pg_temp.answer('g_member', 1, '00000000-0000-0000-0000-0000000eede1'), null,
  'case 2: the linked row may answer question 1 again, as a different participant');
reset role;

select is(
  (select count(*)::int from public.participants where session_id = pg_temp.fx('s')),
  3,
  'case 2: the room holds three participants for two people (Mia, and Gia twice)'
);

-- ---------------------------------------------------------------------------
-- Case 3: the teacher ends the session in the middle of question 2
-- ---------------------------------------------------------------------------

update public.sessions set current_position = 2 where id = pg_temp.fx('s');

set local role service_role;
select is(pg_temp.answer('phone', 2, '00000000-0000-0000-0000-0000000eede2'), null,
  'case 3: an answer that lands before the end is written');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000eeda1', 'role', 'authenticated')::text,
  true);
select isnt(public.end_session(pg_temp.fx('s')), null, 'case 3: the teacher ends the session');
reset role;

set local role service_role;
select is(pg_temp.answer('g_member', 2, '00000000-0000-0000-0000-0000000eede2'), 'not_open',
  'case 3: an answer still in the air at the end is refused as not_open, not written');
reset role;

select is(
  (select count(*)::int from public.session_responses
    where session_id = pg_temp.fx('s') and item_position = 2),
  1,
  'case 3: the half-answered question keeps exactly the answers that landed before the end'
);

select is(
  (select session_status::text from public.resume_participant(
     pg_temp.fx('laptop'), pg_temp.fx('s'), pg_temp.secret('laptop'))),
  'ended',
  'case 3: a phone that reloads after the end is still recognised, and told the session ended'
);

select throws_ok(
  $$ select * from public.join_session(
       (select id from fixture where label = 's'), 'Late', null) $$,
  '22023',
  'that session has ended',
  'case 3: nobody joins after the end'
);

select * from finish();
rollback;
