-- Sprint 5 polish (#111): starting a step in one locked call, and per-user rate limits. Runs with
-- `pnpm exec supabase test db`. Uses its own fixture ids so it never counts the seed's rows.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

-- ---------------------------------------------------------------------------
-- Fixtures, as the superuser
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-0000000004aa', 'step-a@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000004bb', 'step-b@example.test', 'authenticated', 'authenticated');

-- B moves to a second org, to check isolation.
insert into public.orgs (id, name) values ('00000000-0000-0000-0000-0000000004f2', 'Other steps');
update public.profiles set org_id = '00000000-0000-0000-0000-0000000004f2'
  where id = '00000000-0000-0000-0000-0000000004bb';

insert into public.item_banks (id, org_id, name)
  select '00000000-0000-0000-0000-0000000004b1', org_id, 'Step bank'
  from public.profiles where id = '00000000-0000-0000-0000-0000000004aa';
-- A published case study, so starting a step can be seen to make it a draft again.
insert into public.case_studies (id, bank_id, org_id, title, ehr, status)
  select '00000000-0000-0000-0000-0000000004c1', '00000000-0000-0000-0000-0000000004b1', org_id,
    'Case', '{}', 'published'
  from public.profiles where id = '00000000-0000-0000-0000-0000000004aa';
-- A published item already at step 2, which a type change must leave in the bank.
insert into public.items (id, bank_id, org_id, type, status, content, answer_key, scoring, cjmm_step)
  select '00000000-0000-0000-0000-0000000004e2', '00000000-0000-0000-0000-0000000004b1', org_id,
    'multiple_choice', 'published', '{}', '{}', '{}', 2
  from public.profiles where id = '00000000-0000-0000-0000-0000000004aa';
insert into public.case_study_items (case_study_id, org_id, bank_id, position, item_id)
  select '00000000-0000-0000-0000-0000000004c1', org_id, '00000000-0000-0000-0000-0000000004b1', 2,
    '00000000-0000-0000-0000-0000000004e2'
  from public.profiles where id = '00000000-0000-0000-0000-0000000004aa';

-- Each started item's id, kept across role switches.
create temporary table started (label text primary key, item_id uuid);
grant select, insert on started to authenticated;

-- ---------------------------------------------------------------------------
-- As A: author in the case study's org
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000004aa","role":"authenticated"}', true);

select lives_ok(
  $$ insert into started
     select 'first', public.start_case_study_step('00000000-0000-0000-0000-0000000004c1', 1::smallint, 'multiple_choice') $$,
  'A can start an empty step'
);

select results_eq(
  $$ select i.type, i.status::text, i.cjmm_step::int, i.bank_id, i.created_by
     from public.items i join started s on s.item_id = i.id where s.label = 'first' $$,
  $$ values ('multiple_choice', 'draft', 1, '00000000-0000-0000-0000-0000000004b1'::uuid,
             '00000000-0000-0000-0000-0000000004aa'::uuid) $$,
  'the new item is an empty draft in the case study''s bank, pinned to the step, created by A'
);

select results_eq(
  $$ select csi.item_id from public.case_study_items csi
     where csi.case_study_id = '00000000-0000-0000-0000-0000000004c1' and csi.position = 1 $$,
  $$ select item_id from started where label = 'first' $$,
  'the new item is placed at the step'
);

select is(
  (select status::text from public.case_studies where id = '00000000-0000-0000-0000-0000000004c1'),
  'draft',
  'starting a step makes a published case study a draft again'
);

select lives_ok(
  $$ insert into started
     select 'second', public.start_case_study_step('00000000-0000-0000-0000-0000000004c1', 1::smallint, 'bowtie') $$,
  'A can change the step''s type'
);

select is(
  (select count(*)::int from public.items i join started s on s.item_id = i.id where s.label = 'first'),
  0,
  'changing a step''s type removes its previous draft, so none is orphaned'
);

select results_eq(
  $$ select csi.item_id from public.case_study_items csi
     where csi.case_study_id = '00000000-0000-0000-0000-0000000004c1' and csi.position = 1 $$,
  $$ select item_id from started where label = 'second' $$,
  'the step now holds the item of the new type'
);

select lives_ok(
  $$ insert into started
     select 'replaces published', public.start_case_study_step('00000000-0000-0000-0000-0000000004c1', 2::smallint, 'bowtie') $$,
  'A can change the type of a step whose item is published'
);

select is(
  (select status::text from public.items where id = '00000000-0000-0000-0000-0000000004e2'),
  'published',
  'a published previous item stays in the bank'
);

select throws_ok(
  $$ select public.start_case_study_step('00000000-0000-0000-0000-0000000004c1', 7::smallint, 'bowtie') $$,
  '22023', null,
  'a step position is 1 to 6'
);

select throws_ok(
  $$ select public.start_case_study_step('00000000-0000-0000-0000-0000000004c1', 3::smallint, 'not_a_type') $$,
  '23514', null,
  'an unknown item type is refused'
);

select throws_ok(
  $$ select public.start_case_study_step('00000000-0000-0000-0000-0000000004c9', 3::smallint, 'bowtie') $$,
  'P0002', null,
  'a case study that does not exist reads as gone'
);

-- Rate limits: publish allows 20 a minute.
select is(
  (select count(*)::int from generate_series(1, 20) where public.take_rate_limit('publish')),
  20,
  'A''s first 20 publishes in a minute are within the limit'
);

select is(public.take_rate_limit('publish'), false, 'the 21st publish in the minute is over it');

select is(public.take_rate_limit('save'), true, 'each action counts separately');

select throws_ok(
  $$ select public.take_rate_limit('delete_everything') $$,
  '22023', null,
  'an action without a limit is refused'
);

select throws_ok(
  $$ select * from private.rate_limits $$,
  '42501', null,
  'A cannot read the counters'
);

select throws_ok(
  $$ delete from private.rate_limits $$,
  '42501', null,
  'A cannot reset the counters'
);

-- ---------------------------------------------------------------------------
-- As B: author in another org
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000004bb","role":"authenticated"}', true);

select throws_ok(
  $$ select public.start_case_study_step('00000000-0000-0000-0000-0000000004c1', 3::smallint, 'bowtie') $$,
  'P0002', null,
  'another org''s case study reads as gone'
);

select is(public.take_rate_limit('publish'), true, 'B has a counter of its own');

-- ---------------------------------------------------------------------------
-- As anon
-- ---------------------------------------------------------------------------

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$ select public.start_case_study_step('00000000-0000-0000-0000-0000000004c1', 3::smallint, 'bowtie') $$,
  '42501', null,
  'anon cannot start a step'
);

select throws_ok(
  $$ select public.take_rate_limit('save') $$,
  '42501', null,
  'anon cannot call the rate limit'
);

-- ---------------------------------------------------------------------------
-- As the superuser: what was stored, and a window that has passed
-- ---------------------------------------------------------------------------

reset role;

select is(
  (select count(*)::int from public.items where bank_id = '00000000-0000-0000-0000-0000000004b1'),
  3,
  'the bank holds the published item and the two current step drafts, and no orphan'
);

select is(
  (select calls from private.rate_limits
    where user_id = '00000000-0000-0000-0000-0000000004aa' and action = 'publish'),
  21,
  'calls over the limit are counted, capped one past it'
);

update private.rate_limits set window_start = now() - interval '2 minutes'
  where user_id = '00000000-0000-0000-0000-0000000004aa' and action = 'publish';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000004aa","role":"authenticated"}', true);

select is(public.take_rate_limit('publish'), true, 'a new minute starts a new count');

reset role;

select is(
  (select calls from private.rate_limits
    where user_id = '00000000-0000-0000-0000-0000000004aa' and action = 'publish'),
  1,
  'the new window counts from one'
);

select is(
  (select count(*)::int from private.rate_limits
    where user_id in ('00000000-0000-0000-0000-0000000004aa', '00000000-0000-0000-0000-0000000004bb')),
  3,
  'one row per user and action'
);

select * from finish();
rollback;
