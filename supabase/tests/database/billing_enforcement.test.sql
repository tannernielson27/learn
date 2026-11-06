-- Billing enforcement (#521): every gated write, both ways, and what is never gated.
--
-- What is held here:
--   1. The gate: write_allowed() is true for every workspace while billing_config.enforced is
--      false, and the restrictive policies exist (the storage one too).
--   2. Every gated write by a teacher of a lapsed workspace (no grant, no subscription): refused
--      when enforced, allowed when not. Each attempt is rolled back (pg_temp.attempt), so every
--      write meets the same fixtures. A refused insert raises 42501; a refused update or delete
--      matches no row ('none'); archive_item finds no row to lock (22023).
--   3. The same for the definer paths: an invitation (create_org_invite, as the server) and the
--      move of an AI import batch to 'imported' (import_ai_batch's last write).
--   4. When enforced: a workspace with a grant, a trialing, an active and a past_due
--      subscription writes and starts a live session; a livemode mismatch and a canceled
--      subscription do not; another teacher of the lapsed workspace is refused too.
--   5. Students of the lapsed workspace, when enforced: start an attempt of an open assignment,
--      save an answer, begin the submit, and a new student joins a class by code. A live session
--      already running is ended by its host.
--   6. The sweep skips a workspace with a billing row or any grant, revoked too.
--   7. A founder whose workspace has a live subscription cannot move by invitation
--      ('has_subscription'); one whose subscription is canceled can. remove_org_member's new
--      workspace has no grant.
--
-- Runs with `pnpm test:db`. Fixture ids of its own (…521…); the closing rollback removes them.
begin;
create extension if not exists pgtap with schema extensions;
select plan(115);

-- ---------------------------------------------------------------------------
-- Cast, as the superuser
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data) values
  -- Lia started the lapsed workspace L; Leo teaches there too; Sam is a student in its class.
  ('00000000-0000-0000-0000-000000521a01', 'lia@enf521.test', 'authenticated', 'authenticated',
   '{"provider": "email"}', '{}'),
  ('00000000-0000-0000-0000-000000521a02', 'leo@enf521.test', 'authenticated', 'authenticated',
   '{"provider": "email"}', '{}'),
  ('00000000-0000-0000-0000-000000521a03', 'sam@enf521.test', 'authenticated', 'authenticated',
   '{"provider": "email"}', '{}'),
  -- Zed has no role yet, and joins L's class by code while it is lapsed.
  ('00000000-0000-0000-0000-000000521a04', 'zed@enf521.test', 'authenticated', 'authenticated',
   '{"provider": "email"}', '{}'),
  -- One founder per other workspace: a grant, trialing, active, past_due, a livemode mismatch
  -- and a canceled subscription.
  ('00000000-0000-0000-0000-000000521b01', 'gus@enf521.test', 'authenticated', 'authenticated',
   '{"provider": "email"}', '{}'),
  ('00000000-0000-0000-0000-000000521c01', 'tia@enf521.test', 'authenticated', 'authenticated',
   '{"provider": "email"}', '{}'),
  ('00000000-0000-0000-0000-000000521d01', 'al@enf521.test', 'authenticated', 'authenticated',
   '{"provider": "email"}', '{}'),
  ('00000000-0000-0000-0000-000000521e01', 'pat@enf521.test', 'authenticated', 'authenticated',
   '{"provider": "email"}', '{}'),
  ('00000000-0000-0000-0000-000000521f01', 'mo@enf521.test', 'authenticated', 'authenticated',
   '{"provider": "email"}', '{}'),
  ('00000000-0000-0000-0000-000000521f02', 'cy@enf521.test', 'authenticated', 'authenticated',
   '{"provider": "email"}', '{}');

insert into public.orgs (id, name, self_registered, ai_import_enabled) values
  ('00000000-0000-0000-0000-000000521f0a', 'Lapsed 521', true, true),
  ('00000000-0000-0000-0000-000000521f0b', 'Grant 521', true, false),
  ('00000000-0000-0000-0000-000000521f0c', 'Trialing 521', true, false),
  ('00000000-0000-0000-0000-000000521f0d', 'Active 521', true, false),
  ('00000000-0000-0000-0000-000000521f0e', 'Past due 521', true, false),
  ('00000000-0000-0000-0000-000000521f0f', 'Live mode 521', true, false),
  ('00000000-0000-0000-0000-000000521f10', 'Canceled 521', true, false);

-- Three abandoned workspaces for the sweep, each emptied 31 days ago with nobody teaching.
insert into public.orgs (id, name, self_registered, emptied_at) values
  ('00000000-0000-0000-0000-000000521f21', 'Swept billing 521', true, now() - interval '31 days'),
  ('00000000-0000-0000-0000-000000521f22', 'Swept grant 521', true, now() - interval '31 days'),
  ('00000000-0000-0000-0000-000000521f23', 'Swept plain 521', true, now() - interval '31 days');

update public.profiles set org_id = '00000000-0000-0000-0000-000000521f0a', role = 'instructor'
 where id in ('00000000-0000-0000-0000-000000521a01', '00000000-0000-0000-0000-000000521a02');
update public.profiles set org_id = '00000000-0000-0000-0000-000000521f0a', role = 'student'
 where id = '00000000-0000-0000-0000-000000521a03';
update public.profiles p set org_id = v.org::uuid, role = 'instructor'
  from (values ('00000000-0000-0000-0000-000000521b01', '00000000-0000-0000-0000-000000521f0b'),
               ('00000000-0000-0000-0000-000000521c01', '00000000-0000-0000-0000-000000521f0c'),
               ('00000000-0000-0000-0000-000000521d01', '00000000-0000-0000-0000-000000521f0d'),
               ('00000000-0000-0000-0000-000000521e01', '00000000-0000-0000-0000-000000521f0e'),
               ('00000000-0000-0000-0000-000000521f01', '00000000-0000-0000-0000-000000521f0f'),
               ('00000000-0000-0000-0000-000000521f02', '00000000-0000-0000-0000-000000521f10'))
         as v(profile, org)
 where p.id = v.profile::uuid;

update public.orgs o set founder_id = p.id
  from public.profiles p
 where p.org_id = o.id
   and p.id in ('00000000-0000-0000-0000-000000521a01', '00000000-0000-0000-0000-000000521b01',
                '00000000-0000-0000-0000-000000521c01', '00000000-0000-0000-0000-000000521d01',
                '00000000-0000-0000-0000-000000521e01', '00000000-0000-0000-0000-000000521f01',
                '00000000-0000-0000-0000-000000521f02');

-- The deployment is the sandbox (billing_config.livemode false, as it starts). M's subscription
-- is a live one, so it grants nothing here.
insert into public.workspace_billing
  (org_id, stripe_customer_id, stripe_subscription_id, status, price_lookup_key,
   current_period_end, trial_end, billing_email, livemode)
values
  ('00000000-0000-0000-0000-000000521f0c', 'cus_521c', 'sub_521c', 'trialing', 'learn_monthly_v1',
   now() + interval '7 days', now() + interval '7 days', 'tia@enf521.test', false),
  ('00000000-0000-0000-0000-000000521f0d', 'cus_521d', 'sub_521d', 'active', 'learn_monthly_v1',
   now() + interval '30 days', null, 'al@enf521.test', false),
  ('00000000-0000-0000-0000-000000521f0e', 'cus_521e', 'sub_521e', 'past_due', 'learn_monthly_v1',
   now() + interval '30 days', null, 'pat@enf521.test', false),
  ('00000000-0000-0000-0000-000000521f0f', 'cus_521f', 'sub_521f', 'active', 'learn_monthly_v1',
   now() + interval '30 days', null, 'mo@enf521.test', true),
  ('00000000-0000-0000-0000-000000521f10', 'cus_521g', 'sub_521g', 'canceled', 'learn_monthly_v1',
   now() - interval '1 day', null, 'cy@enf521.test', false),
  ('00000000-0000-0000-0000-000000521f21', 'cus_521s', 'sub_521s', 'canceled', 'learn_monthly_v1',
   now() - interval '60 days', null, 'gone@enf521.test', false);

insert into public.access_grants (org_id, kind, reason, granted_by) values
  ('00000000-0000-0000-0000-000000521f0b', 'beta', 'a tester', 'pass_521b');
insert into public.access_grants (org_id, kind, reason, granted_by, revoked_at) values
  ('00000000-0000-0000-0000-000000521f22', 'beta', 'a tester', 'pass_521s', now());

-- Every workspace but the sweep's has a quiz with a published question, for starting sessions.
insert into public.item_banks (id, org_id, name)
  select ('00000000-0000-0000-0000-000000521' || v.tag)::uuid,
         ('00000000-0000-0000-0000-000000521' || v.org)::uuid, 'Quiz ' || v.tag
    from (values ('b0a', 'f0a'), ('b0b', 'f0b'), ('b0c', 'f0c'), ('b0d', 'f0d'), ('b0e', 'f0e'),
                 ('b0f', 'f0f'), ('b10', 'f10')) as v(tag, org);
insert into public.items (id, bank_id, org_id, type, cjmm_step, status, content, answer_key, scoring)
  select ('00000000-0000-0000-0000-000000521' || v.item)::uuid,
         ('00000000-0000-0000-0000-000000521' || v.bank)::uuid,
         ('00000000-0000-0000-0000-000000521' || v.org)::uuid,
         'multiple_choice', 1, 'published', '{}', '{"correctOptionId":"opt_a"}', '{}'
    from (values ('e0a', 'b0a', 'f0a'), ('e0b', 'b0b', 'f0b'), ('e0c', 'b0c', 'f0c'),
                 ('e0d', 'b0d', 'f0d'), ('e0e', 'b0e', 'f0e'), ('e0f', 'b0f', 'f0f'),
                 ('e10', 'b10', 'f10')) as v(item, bank, org);

-- L's other content: an empty quiz, two draft questions (one to edit, one to delete), a draft
-- case study with one step, a folder in the quiz, a library folder, two classes (Sam in the
-- first), an open assignment and one that opens tomorrow, a practice share, and two AI import
-- batches in review (one with an entry).
insert into public.item_banks (id, org_id, name) values
  ('00000000-0000-0000-0000-000000521b1a', '00000000-0000-0000-0000-000000521f0a', 'Empty 521');
insert into public.items (id, bank_id, org_id, type, cjmm_step, status, content, answer_key, scoring)
values
  ('00000000-0000-0000-0000-000000521e1a', '00000000-0000-0000-0000-000000521b0a',
   '00000000-0000-0000-0000-000000521f0a', 'multiple_choice', 1, 'draft', '{}', '{}', '{}'),
  ('00000000-0000-0000-0000-000000521e2a', '00000000-0000-0000-0000-000000521b0a',
   '00000000-0000-0000-0000-000000521f0a', 'multiple_choice', 1, 'draft', '{}', '{}', '{}'),
  ('00000000-0000-0000-0000-000000521e3a', '00000000-0000-0000-0000-000000521b0a',
   '00000000-0000-0000-0000-000000521f0a', 'multiple_choice', 1, 'published', '{}', '{}', '{}');
insert into public.case_studies (id, bank_id, org_id, title, ehr) values
  ('00000000-0000-0000-0000-000000521c5a', '00000000-0000-0000-0000-000000521b0a',
   '00000000-0000-0000-0000-000000521f0a', 'Case 521', '{}');
insert into public.case_study_items (case_study_id, org_id, bank_id, position, item_id) values
  ('00000000-0000-0000-0000-000000521c5a', '00000000-0000-0000-0000-000000521f0a',
   '00000000-0000-0000-0000-000000521b0a', 1, '00000000-0000-0000-0000-000000521e3a');
insert into public.bank_folders (id, bank_id, org_id, name) values
  ('00000000-0000-0000-0000-000000521d0a', '00000000-0000-0000-0000-000000521b0a',
   '00000000-0000-0000-0000-000000521f0a', 'Folder 521');
insert into public.library_folders (id, org_id, name) values
  ('00000000-0000-0000-0000-000000521d1a', '00000000-0000-0000-0000-000000521f0a', 'Shelf 521');
insert into public.classes (id, org_id, name) values
  ('00000000-0000-0000-0000-000000521ca1', '00000000-0000-0000-0000-000000521f0a', 'NUR 521'),
  ('00000000-0000-0000-0000-000000521ca2', '00000000-0000-0000-0000-000000521f0a', 'NUR 522');
insert into public.class_members (class_id, profile_id) values
  ('00000000-0000-0000-0000-000000521ca1', '00000000-0000-0000-0000-000000521a03');
insert into public.assignments (id, org_id, class_id, bank_id, title, opens_at, closes_at, max_attempts)
values
  ('00000000-0000-0000-0000-000000521aa1', '00000000-0000-0000-0000-000000521f0a',
   '00000000-0000-0000-0000-000000521ca1', '00000000-0000-0000-0000-000000521b0a', 'Open 521',
   now() - interval '1 hour', now() + interval '1 day', 2),
  ('00000000-0000-0000-0000-000000521aa2', '00000000-0000-0000-0000-000000521f0a',
   '00000000-0000-0000-0000-000000521ca1', '00000000-0000-0000-0000-000000521b0a', 'Later 521',
   now() + interval '1 day', now() + interval '2 days', 1);
insert into public.bank_practice_shares (org_id, bank_id, class_id) values
  ('00000000-0000-0000-0000-000000521f0a', '00000000-0000-0000-0000-000000521b0a',
   '00000000-0000-0000-0000-000000521ca1');
insert into public.ai_import_batches (id, org_id, created_by, status) values
  ('00000000-0000-0000-0000-000000521ab1', '00000000-0000-0000-0000-000000521f0a',
   '00000000-0000-0000-0000-000000521a01', 'review'),
  ('00000000-0000-0000-0000-000000521ab2', '00000000-0000-0000-0000-000000521f0a',
   '00000000-0000-0000-0000-000000521a01', 'review');
insert into public.ai_import_entries
  (id, batch_id, org_id, chunk_id, position, type, status, draft, source_excerpt)
values
  ('00000000-0000-0000-0000-000000521ae1', '00000000-0000-0000-0000-000000521ab1',
   '00000000-0000-0000-0000-000000521f0a', null, 0, 'multiple_choice', 'ready',
   '{"stem":"Which first?","key":"B"}', 'Which first? *B');

-- Signs in as `account` for the rest of the transaction (or until the next call).
create function pg_temp.act_as(account uuid) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', account, 'role', 'authenticated')::text, true);
$$;

-- Runs `q` as the current role and rolls it back, whatever it did: 'wrote' when it touched at
-- least one row (a function call counts as one), 'none' when it matched no row, and otherwise
-- the SQLSTATE it raised. Every attempt therefore meets the same fixtures.
create function pg_temp.attempt(q text) returns text
language plpgsql as $$
declare
  n bigint;
begin
  begin
    execute q;
    get diagnostics n = row_count;
    raise exception using errcode = 'LR521', message = case when n > 0 then 'wrote' else 'none' end;
  exception
    when sqlstate 'LR521' then return sqlerrm;
    when others then return sqlstate;
  end;
end;
$$;

create function pg_temp.attempt_as(account uuid, q text) returns text
language plpgsql as $$
begin
  perform pg_temp.act_as(account);
  return pg_temp.attempt(q);
end;
$$;

-- Every gated write a teacher of L can make, and how a refusal shows. Each writes only the
-- columns granted to authenticated (org_id, created_by and the like come from defaults), so a
-- 42501 here is the gate and never a column privilege.
create temporary table writes (n int primary key, label text, q text, refused text);
insert into writes (n, label, q, refused) values
  (1, 'create a quiz',
   $$ insert into public.item_banks (org_id, name)
      values ('00000000-0000-0000-0000-000000521f0a', 'New 521') $$, '42501'),
  (2, 'rename a quiz',
   $$ update public.item_banks set name = 'Renamed 521'
       where id = '00000000-0000-0000-0000-000000521b0a' $$, 'none'),
  (3, 'delete a quiz',
   $$ delete from public.item_banks where id = '00000000-0000-0000-0000-000000521b1a' $$, 'none'),
  (4, 'create a question',
   $$ insert into public.items (bank_id, org_id, type, cjmm_step, status, content, answer_key, scoring)
      values ('00000000-0000-0000-0000-000000521b0a', '00000000-0000-0000-0000-000000521f0a',
              'multiple_choice', 1, 'draft', '{}', '{}', '{}') $$, '42501'),
  (5, 'edit a question',
   $$ update public.items set content = '{"stem":"Edited"}'
       where id = '00000000-0000-0000-0000-000000521e1a' $$, 'none'),
  (6, 'delete a question',
   $$ delete from public.items where id = '00000000-0000-0000-0000-000000521e2a' $$, 'none'),
  (7, 'publish a question version',
   $$ insert into public.item_versions (item_id, version, org_id, snapshot)
      values ('00000000-0000-0000-0000-000000521e0a', 99, '00000000-0000-0000-0000-000000521f0a',
              '{}') $$, '42501'),
  (8, 'create a case study',
   $$ insert into public.case_studies (bank_id, org_id, title, ehr)
      values ('00000000-0000-0000-0000-000000521b0a', '00000000-0000-0000-0000-000000521f0a',
              'New case 521', '{}') $$, '42501'),
  (9, 'edit a case study',
   $$ update public.case_studies set title = 'Renamed case 521'
       where id = '00000000-0000-0000-0000-000000521c5a' $$, 'none'),
  (10, 'remove a case study step',
   $$ delete from public.case_study_items
       where case_study_id = '00000000-0000-0000-0000-000000521c5a' $$, 'none'),
  (11, 'create a folder in a quiz',
   $$ insert into public.bank_folders (bank_id, org_id, name)
      values ('00000000-0000-0000-0000-000000521b0a', '00000000-0000-0000-0000-000000521f0a',
              'New folder 521') $$, '42501'),
  (12, 'rename a folder in a quiz',
   $$ update public.bank_folders set name = 'Renamed folder 521'
       where id = '00000000-0000-0000-0000-000000521d0a' $$, 'none'),
  (13, 'delete a folder in a quiz',
   $$ delete from public.bank_folders where id = '00000000-0000-0000-0000-000000521d0a' $$, 'none'),
  (14, 'create a library folder',
   $$ insert into public.library_folders (org_id, name)
      values ('00000000-0000-0000-0000-000000521f0a', 'New shelf 521') $$, '42501'),
  (15, 'rename a library folder',
   $$ update public.library_folders set name = 'Renamed shelf 521'
       where id = '00000000-0000-0000-0000-000000521d1a' $$, 'none'),
  (16, 'delete a library folder',
   $$ delete from public.library_folders
       where id = '00000000-0000-0000-0000-000000521d1a' $$, 'none'),
  (17, 'create a class',
   $$ insert into public.classes (name) values ('NUR 599') $$, '42501'),
  (18, 'rename a class',
   $$ update public.classes set name = 'NUR 598'
       where id = '00000000-0000-0000-0000-000000521ca1' $$, 'none'),
  (19, 'remove a student from a class',
   $$ delete from public.class_members
       where class_id = '00000000-0000-0000-0000-000000521ca1'
         and profile_id = '00000000-0000-0000-0000-000000521a03' $$, 'none'),
  (20, 'assign a quiz',
   $$ insert into public.assignments
        (class_id, bank_id, title, opens_at, closes_at, max_attempts)
      values ('00000000-0000-0000-0000-000000521ca1',
              '00000000-0000-0000-0000-000000521b0a', 'New 521', now() + interval '1 day',
              now() + interval '2 days', 1) $$, '42501'),
  (21, 'edit an assignment',
   $$ update public.assignments set max_attempts = 3
       where id = '00000000-0000-0000-0000-000000521aa2' $$, 'none'),
  (22, 'delete an assignment',
   $$ delete from public.assignments where id = '00000000-0000-0000-0000-000000521aa2' $$, 'none'),
  (23, 'share a quiz for practice',
   $$ insert into public.bank_practice_shares (bank_id, class_id)
      values ('00000000-0000-0000-0000-000000521b0a',
              '00000000-0000-0000-0000-000000521ca2') $$, '42501'),
  (24, 'stop sharing for practice',
   $$ delete from public.bank_practice_shares
       where bank_id = '00000000-0000-0000-0000-000000521b0a'
         and class_id = '00000000-0000-0000-0000-000000521ca1' $$, 'none'),
  (25, 'start a live session (start_session)',
   $$ select public.start_session(source_bank => '00000000-0000-0000-0000-000000521b0a') $$,
   '42501'),
  (26, 'start an AI import',
   $$ insert into public.ai_import_batches (org_id)
      values ('00000000-0000-0000-0000-000000521f0a') $$,
   '42501'),
  (27, 'retarget an AI import',
   $$ update public.ai_import_batches set bank_id = '00000000-0000-0000-0000-000000521b0a'
       where id = '00000000-0000-0000-0000-000000521ab1' $$, 'none'),
  (28, 'discard an AI import',
   $$ delete from public.ai_import_batches
       where id = '00000000-0000-0000-0000-000000521ab1' $$, 'none'),
  (29, 'edit an AI import entry',
   $$ update public.ai_import_entries set draft = '{"stem":"Edited","key":"B"}'
       where id = '00000000-0000-0000-0000-000000521ae1' $$, 'none'),
  (30, 'rotate a class invite link (rotate_class_invite)',
   $$ select public.rotate_class_invite('00000000-0000-0000-0000-000000521ca1') $$, '42501'),
  (31, 'duplicate a question (duplicate_item)',
   $$ select public.duplicate_item('00000000-0000-0000-0000-000000521e0a') $$, '42501'),
  (32, 'archive a question (archive_item)',
   $$ select public.archive_item('00000000-0000-0000-0000-000000521e0a') $$, '22023');
grant select on writes to authenticated, service_role;

-- Values that must survive a role change.
create temporary table fixture (label text primary key, id uuid, secret text);
grant select, insert, update on fixture to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. The gate
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and policyname like 'billing: % needs access'
      and permissive = 'RESTRICTIVE'),
  32,
  'every gated table write has its restrictive billing policy'
);
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and policyname like 'billing: % needs access'
      and cmd = 'SELECT'),
  0,
  'no read is gated'
);
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'sessions'
      and policyname like 'billing: % needs access'),
  1,
  'only starting a live session is gated, never running one'
);
select ok(
  exists (select 1 from pg_policies
           where schemaname = 'storage' and tablename = 'objects'
             and policyname = 'ai-imports: uploads need access'
             and permissive = 'RESTRICTIVE' and cmd = 'INSERT'),
  'AI import uploads are gated'
);
select ok(
  has_function_privilege('authenticated', 'private.write_allowed()', 'execute')
  and not has_function_privilege('authenticated', 'private.org_write_allowed(uuid)', 'execute')
  and not has_function_privilege('anon', 'private.write_allowed()', 'execute'),
  'a signed-in user may ask write_allowed() of their own workspace, and of no other'
);

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-000000521a01');
select ok(
  (select private.write_allowed()),
  'with enforcement off (the default), a lapsed workspace may write'
);
reset role;

-- ---------------------------------------------------------------------------
-- 2. Every gated write: allowed when not enforced, refused when enforced
-- ---------------------------------------------------------------------------

set local role authenticated;
select is(
  pg_temp.attempt_as('00000000-0000-0000-0000-000000521a01', w.q),
  'wrote',
  'not enforced: a lapsed teacher may ' || w.label
) from writes w order by w.n;
reset role;

update private.billing_config set enforced = true where id;

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-000000521a01');
select ok(
  not (select private.write_allowed()),
  'enforced: a lapsed workspace may not write'
);
select is(
  pg_temp.attempt_as('00000000-0000-0000-0000-000000521a01', w.q),
  w.refused,
  'enforced: a lapsed teacher may not ' || w.label
) from writes w order by w.n;

-- Reads are not gated.
select is(
  (select count(*)::int from public.items
    where org_id = '00000000-0000-0000-0000-000000521f0a'),
  4,
  'enforced: a lapsed teacher still reads every question'
);
select is(
  (select name from public.classes where id = '00000000-0000-0000-0000-000000521ca1'),
  'NUR 521',
  'enforced: a lapsed teacher still reads their classes'
);

-- Another teacher of the workspace is refused the same way.
select is(
  pg_temp.attempt_as('00000000-0000-0000-0000-000000521a02', (select q from writes where n = 1)),
  '42501',
  'enforced: another teacher of a lapsed workspace may not create a quiz'
);
reset role;

-- ---------------------------------------------------------------------------
-- 3. The definer paths
-- ---------------------------------------------------------------------------

set local role service_role;
select is(
  pg_temp.attempt(
    $$ select * from public.create_org_invite('00000000-0000-0000-0000-000000521a01',
                                              'new-colleague@enf521.test') $$),
  '42501',
  'enforced: a lapsed workspace may not invite a colleague (create_org_invite)'
);
reset role;
select is(
  pg_temp.attempt(
    $$ update public.ai_import_batches set status = 'imported'
        where id = '00000000-0000-0000-0000-000000521ab2' $$),
  '42501',
  'enforced: a lapsed workspace''s AI import cannot be imported (the batch never becomes imported)'
);
set local role service_role;
select is(
  pg_temp.attempt(
    $$ update public.ai_import_batches set status = 'imported'
        where id = '00000000-0000-0000-0000-000000521ab2' $$),
  '42501',
  'enforced: nor by the server, which bypasses row level security'
);
reset role;

update private.billing_config set enforced = false where id;

set local role service_role;
select is(
  pg_temp.attempt(
    $$ select * from public.create_org_invite('00000000-0000-0000-0000-000000521a01',
                                              'new-colleague@enf521.test') $$),
  'wrote',
  'not enforced: a lapsed workspace may invite a colleague'
);
reset role;
select is(
  pg_temp.attempt(
    $$ update public.ai_import_batches set status = 'imported'
        where id = '00000000-0000-0000-0000-000000521ab2' $$),
  'wrote',
  'not enforced: a lapsed workspace''s AI import may be imported'
);

-- A live session started while enforcement is off, still running when it is turned on.
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-000000521a01');
insert into fixture (label, id)
  select 'running', public.start_session(source_bank => '00000000-0000-0000-0000-000000521b0a');
reset role;

update private.billing_config set enforced = true where id;

-- ---------------------------------------------------------------------------
-- 4. Who may write when enforced
-- ---------------------------------------------------------------------------

set local role authenticated;
select is(
  pg_temp.attempt_as(v.teacher::uuid, format(
    'insert into public.item_banks (org_id, name) values (%L, %L)', v.org, 'New 521')),
  v.expected,
  'enforced: ' || v.label || ' creating a quiz'
) from (values
  ('00000000-0000-0000-0000-000000521b01', '00000000-0000-0000-0000-000000521f0b', 'wrote',
   'a workspace on a grant may write,'),
  ('00000000-0000-0000-0000-000000521c01', '00000000-0000-0000-0000-000000521f0c', 'wrote',
   'a workspace in its free trial may write,'),
  ('00000000-0000-0000-0000-000000521d01', '00000000-0000-0000-0000-000000521f0d', 'wrote',
   'a workspace with an active subscription may write,'),
  ('00000000-0000-0000-0000-000000521e01', '00000000-0000-0000-0000-000000521f0e', 'wrote',
   'a workspace whose payment failed (past_due) may write,'),
  ('00000000-0000-0000-0000-000000521f01', '00000000-0000-0000-0000-000000521f0f', '42501',
   'a workspace whose subscription is in the other livemode may not write,'),
  ('00000000-0000-0000-0000-000000521f02', '00000000-0000-0000-0000-000000521f10', '42501',
   'a workspace whose subscription is canceled may not write,')
) as v(teacher, org, expected, label);

select is(
  pg_temp.attempt_as(v.teacher::uuid, format(
    'select public.start_session(source_bank => %L::uuid)', v.bank)),
  v.expected,
  'enforced: ' || v.label || ' starting a live session'
) from (values
  ('00000000-0000-0000-0000-000000521b01', '00000000-0000-0000-0000-000000521b0b', 'wrote',
   'a workspace on a grant may start one,'),
  ('00000000-0000-0000-0000-000000521c01', '00000000-0000-0000-0000-000000521b0c', 'wrote',
   'a workspace in its free trial may start one,'),
  ('00000000-0000-0000-0000-000000521d01', '00000000-0000-0000-0000-000000521b0d', 'wrote',
   'a workspace with an active subscription may start one,'),
  ('00000000-0000-0000-0000-000000521e01', '00000000-0000-0000-0000-000000521b0e', 'wrote',
   'a workspace whose payment failed (past_due) may start one,'),
  ('00000000-0000-0000-0000-000000521f01', '00000000-0000-0000-0000-000000521b0f', '42501',
   'a workspace whose subscription is in the other livemode may not start one,'),
  ('00000000-0000-0000-0000-000000521f02', '00000000-0000-0000-0000-000000521b10', '42501',
   'a workspace whose subscription is canceled may not start one,')
) as v(teacher, bank, expected, label);

-- The whole list, for one workspace with access: nothing a paying teacher does is refused.
select is(
  pg_temp.attempt_as('00000000-0000-0000-0000-000000521d01',
    replace(replace(replace(w.q, '521f0a', '521f0d'), '521b0a', '521b0d'), '521e0a', '521e0d')),
  'wrote',
  'enforced: a teacher with an active subscription may ' || w.label
) from writes w where w.n in (1, 4, 8, 11, 14, 17, 31, 32) order by w.n;
reset role;

-- ---------------------------------------------------------------------------
-- 5. Students and running sessions are never gated
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-000000521a03');
insert into fixture (label, id)
  select 'attempt', a.attempt_id
    from public.start_assignment_attempt('00000000-0000-0000-0000-000000521aa1') as a;
select ok(
  (select id is not null from fixture where label = 'attempt'),
  'enforced: a student of a lapsed workspace starts an attempt of an open assignment'
);
select is(
  (select refusal from public.save_attempt_response(
     (select id from fixture where label = 'attempt'), '00000000-0000-0000-0000-000000521e0a',
     '{"type":"multiple_choice","selectedOptionId":"opt_a"}')),
  null,
  'enforced: and saves an answer'
);
select lives_ok(
  $$ select * from public.begin_attempt_submission((select id from fixture where label = 'attempt')) $$,
  'enforced: and begins the submit'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000521a04');
reset role;
insert into fixture (label, secret)
  select 'code', join_code from public.classes where id = '00000000-0000-0000-0000-000000521ca1';
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-000000521a04');
select is(
  public.join_class_by_code((select secret from fixture where label = 'code')),
  'joined',
  'enforced: a new student joins a lapsed workspace''s class by its code'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000521a01');
select lives_ok(
  $$ select public.end_session((select id from fixture where label = 'running')) $$,
  'enforced: a live session already running is ended by its host'
);
select is(
  (select status::text from public.sessions
    where id = (select id from fixture where label = 'running')),
  'ended',
  'enforced: and it ended'
);
reset role;

-- ---------------------------------------------------------------------------
-- 6. The sweep
-- ---------------------------------------------------------------------------

select is(
  (select row(s.outcome, s.reason)::text
     from public.sweep_abandoned_workspaces(false, 100) s
    where s.org_id = '00000000-0000-0000-0000-000000521f21'),
  '(skipped,billing)',
  'the sweep skips a workspace with a billing row, whatever its status'
);
select is(
  (select row(s.outcome, s.reason)::text
     from public.sweep_abandoned_workspaces(false, 100) s
    where s.org_id = '00000000-0000-0000-0000-000000521f22'),
  '(skipped,billing)',
  'the sweep skips a workspace with a grant, even a revoked one'
);
select is(
  (select s.outcome
     from public.sweep_abandoned_workspaces(false, 100) s
    where s.org_id = '00000000-0000-0000-0000-000000521f23'),
  'would_delete',
  'an abandoned workspace with neither is swept as before'
);

-- ---------------------------------------------------------------------------
-- 7. Moving and removing
-- ---------------------------------------------------------------------------

set local role service_role;
-- Gus's workspace has a grant, so it invites while enforced.
insert into fixture (label, secret)
  select 'tia', c.token
    from public.create_org_invite('00000000-0000-0000-0000-000000521b01', 'tia@enf521.test') c;
insert into fixture (label, secret)
  select 'cy', c.token
    from public.create_org_invite('00000000-0000-0000-0000-000000521b01', 'cy@enf521.test') c;

select is(
  (select p.status from public.org_invite_move_preview(
     '00000000-0000-0000-0000-000000521c01', (select secret from fixture where label = 'tia')) p),
  'has_subscription',
  'the move preview tells a founder with a free trial they cannot move yet'
);
select is(
  public.accept_org_invite('00000000-0000-0000-0000-000000521c01',
    (select secret from fixture where label = 'tia'), true,
    '00000000-0000-0000-0000-000000521f0c'),
  'has_subscription',
  'accept_org_invite refuses to move a founder whose workspace is in its free trial'
);
select is(
  (select org_id from public.profiles where id = '00000000-0000-0000-0000-000000521c01'),
  '00000000-0000-0000-0000-000000521f0c'::uuid,
  'and the founder stays where they were'
);
select is(
  (select p.status from public.org_invite_move_preview(
     '00000000-0000-0000-0000-000000521f02', (select secret from fixture where label = 'cy')) p),
  'move_needs_confirmation',
  'a founder whose subscription is canceled may move'
);
reset role;

-- Lia removes Leo while her workspace is lapsed: taking access away is never refused, and the
-- workspace Leo is given has no grant.
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-000000521a01');
select lives_ok(
  $$ select public.remove_org_member('00000000-0000-0000-0000-000000521a02') $$,
  'enforced: the person who started a lapsed workspace may still remove a colleague'
);
reset role;
select isnt(
  (select org_id from public.profiles where id = '00000000-0000-0000-0000-000000521a02'),
  '00000000-0000-0000-0000-000000521f0a'::uuid,
  'the removed teacher has a workspace of their own'
);
select ok(
  not exists (
    select 1 from public.access_grants g
     where g.org_id = (select org_id from public.profiles
                        where id = '00000000-0000-0000-0000-000000521a02')
  ) and not private.org_has_access(
    (select org_id from public.profiles where id = '00000000-0000-0000-0000-000000521a02')),
  'and that workspace has no grant and no access'
);

select * from finish();
rollback;
