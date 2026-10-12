-- The workspace on practice rows, and workspaces of one name told apart
-- (20261011010000_practice_workspace_name.sql).
--
-- What is held here:
--   1. my_practice_banks() gives each listed bank the name of its workspace, lists exactly the
--      banks it did (once each, however many of the caller's classes share it), with the counts
--      it gave, and gives nothing of a workspace the caller has no class in.
--   2. my_classes() numbers the caller's workspaces: classes of one workspace carry one number,
--      classes of two workspaces carry two, even when the two workspaces have the same name. It
--      still returns no org id.
--
-- Fixture ids of its own (…4200…).
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

-- ---------------------------------------------------------------------------
-- Cast, as the superuser
-- ---------------------------------------------------------------------------

-- Two workspaces with the same name, and a third the students below have no class in.
insert into public.orgs (id, name) values
  ('00000000-0000-0000-0000-0000004200a0', 'Same name 420'),
  ('00000000-0000-0000-0000-0000004200b0', 'Same name 420'),
  ('00000000-0000-0000-0000-0000004200c0', 'Elsewhere 420');

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000004200a1', 'teacher-a@pwn.test', 'authenticated', 'authenticated',
   '{"provider": "email"}', '{}'),
  -- In two classes of the first workspace and one of the second.
  ('00000000-0000-0000-0000-0000004200d1', 'student-both@pwn.test', 'authenticated',
   'authenticated', '{"provider": "email"}', '{}'),
  -- In one class of the first workspace.
  ('00000000-0000-0000-0000-0000004200d2', 'student-one@pwn.test', 'authenticated',
   'authenticated', '{"provider": "email"}', '{}');

update public.profiles set org_id = '00000000-0000-0000-0000-0000004200a0', role = 'instructor'
 where id = '00000000-0000-0000-0000-0000004200a1';
update public.profiles set org_id = '00000000-0000-0000-0000-0000004200a0', role = 'student'
 where id in ('00000000-0000-0000-0000-0000004200d1', '00000000-0000-0000-0000-0000004200d2');

insert into public.classes (id, org_id, name) values
  ('00000000-0000-0000-0000-0000004200c1', '00000000-0000-0000-0000-0000004200a0', 'NUR 420 A'),
  ('00000000-0000-0000-0000-0000004200c2', '00000000-0000-0000-0000-0000004200a0', 'NUR 420 B'),
  ('00000000-0000-0000-0000-0000004200c3', '00000000-0000-0000-0000-0000004200b0', 'NUR 420 C'),
  ('00000000-0000-0000-0000-0000004200c4', '00000000-0000-0000-0000-0000004200c0', 'NUR 420 D');

insert into public.class_members (class_id, profile_id) values
  ('00000000-0000-0000-0000-0000004200c1', '00000000-0000-0000-0000-0000004200d1'),
  ('00000000-0000-0000-0000-0000004200c2', '00000000-0000-0000-0000-0000004200d1'),
  ('00000000-0000-0000-0000-0000004200c3', '00000000-0000-0000-0000-0000004200d1'),
  ('00000000-0000-0000-0000-0000004200c1', '00000000-0000-0000-0000-0000004200d2');

-- One bank in each workspace. The first two share a name, as their workspaces do.
insert into public.item_banks (id, org_id, name) values
  ('00000000-0000-0000-0000-0000004200e1', '00000000-0000-0000-0000-0000004200a0', 'Bank 420'),
  ('00000000-0000-0000-0000-0000004200e2', '00000000-0000-0000-0000-0000004200b0', 'Bank 420'),
  ('00000000-0000-0000-0000-0000004200e3', '00000000-0000-0000-0000-0000004200c0', 'Bank 420 far');

insert into public.items (id, bank_id, org_id, type, cjmm_step, status, content, answer_key, scoring)
values
  ('00000000-0000-0000-0000-0000004200f1', '00000000-0000-0000-0000-0000004200e1',
   '00000000-0000-0000-0000-0000004200a0', 'multiple_choice', 1, 'published', '{}',
   '{"correctOptionId":"secret_key_420_a"}', '{}'),
  ('00000000-0000-0000-0000-0000004200f2', '00000000-0000-0000-0000-0000004200e2',
   '00000000-0000-0000-0000-0000004200b0', 'multiple_choice', 2, 'published', '{}',
   '{"correctOptionId":"secret_key_420_b"}', '{}');

-- The first bank is shared with both classes of its workspace; the others with their one class.
insert into public.bank_practice_shares (org_id, bank_id, class_id, shared_by) values
  ('00000000-0000-0000-0000-0000004200a0', '00000000-0000-0000-0000-0000004200e1',
   '00000000-0000-0000-0000-0000004200c1', '00000000-0000-0000-0000-0000004200a1'),
  ('00000000-0000-0000-0000-0000004200a0', '00000000-0000-0000-0000-0000004200e1',
   '00000000-0000-0000-0000-0000004200c2', '00000000-0000-0000-0000-0000004200a1'),
  ('00000000-0000-0000-0000-0000004200b0', '00000000-0000-0000-0000-0000004200e2',
   '00000000-0000-0000-0000-0000004200c3', null),
  ('00000000-0000-0000-0000-0000004200c0', '00000000-0000-0000-0000-0000004200e3',
   '00000000-0000-0000-0000-0000004200c4', null);

create function pg_temp.act_as(account uuid) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', account, 'role', 'authenticated')::text, true);
$$;

-- The claims outlive `reset role`. Cleared after each signed-in block.
create function pg_temp.act_as_nobody() returns void
language sql as $$ select set_config('request.jwt.claims', '{}', true); $$;

-- ---------------------------------------------------------------------------
-- A student in classes of two workspaces that share a name
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000004200d1');

select results_eq(
  $$ select bank_id, bank_name, item_count, answered, workspace_name
       from public.my_practice_banks() $$,
  $$ values ('00000000-0000-0000-0000-0000004200e1'::uuid, 'Bank 420'::text, 1, 0,
             'Same name 420'::text),
            ('00000000-0000-0000-0000-0000004200e2'::uuid, 'Bank 420'::text, 1, 0,
             'Same name 420'::text) $$,
  'each practice bank comes with its workspace''s name, once, though two classes share the first'
);
select is(
  (select count(*)::integer from public.my_practice_banks()
    where workspace_name = 'Elsewhere 420' or bank_name = 'Bank 420 far'),
  0,
  'nothing of a workspace they have no class in: not its bank, not its name'
);
select results_eq(
  $$ select class_id, workspace_name from public.my_classes() $$,
  $$ values ('00000000-0000-0000-0000-0000004200c1'::uuid, 'Same name 420'::text),
            ('00000000-0000-0000-0000-0000004200c2'::uuid, 'Same name 420'::text),
            ('00000000-0000-0000-0000-0000004200c3'::uuid, 'Same name 420'::text) $$,
  'my_classes still lists the three classes in name order, each with its workspace''s name'
);
select is(
  (select count(distinct workspace_name)::integer from public.my_classes()),
  1,
  'control: by name the two workspaces are one'
);
select is(
  (select array_agg(distinct workspace_number order by workspace_number) from public.my_classes()),
  array[1, 2],
  'by number they are two, counted from 1'
);
select ok(
  (select a.workspace_number = b.workspace_number and a.workspace_number <> c.workspace_number
     from public.my_classes() a, public.my_classes() b, public.my_classes() c
    where a.class_id = '00000000-0000-0000-0000-0000004200c1'
      and b.class_id = '00000000-0000-0000-0000-0000004200c2'
      and c.class_id = '00000000-0000-0000-0000-0000004200c3'),
  'the two classes of one workspace carry one number and the class of the other carries another'
);
select is(
  (select count(*)::integer from public.orgs)
  + (select count(*)::integer from public.classes)
  + (select count(*)::integer from public.item_banks)
  + (select count(*)::integer from public.items),
  0,
  'they still read no org, class, bank or item row'
);

-- ---------------------------------------------------------------------------
-- A student in one workspace
-- ---------------------------------------------------------------------------

select pg_temp.act_as('00000000-0000-0000-0000-0000004200d2');

select results_eq(
  $$ select bank_id, workspace_name from public.my_practice_banks() $$,
  $$ values ('00000000-0000-0000-0000-0000004200e1'::uuid, 'Same name 420'::text) $$,
  'a student of one class reads its one bank and that workspace''s name'
);
select is(
  (select array_agg(workspace_number) from public.my_classes()),
  array[1],
  'and their one workspace is number 1'
);

-- ---------------------------------------------------------------------------
-- Leaving the second workspace
-- ---------------------------------------------------------------------------

reset role;
delete from public.class_members
 where class_id = '00000000-0000-0000-0000-0000004200c3'
   and profile_id = '00000000-0000-0000-0000-0000004200d1';

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000004200d1');

select results_eq(
  $$ select bank_id, workspace_name from public.my_practice_banks() $$,
  $$ values ('00000000-0000-0000-0000-0000004200e1'::uuid, 'Same name 420'::text) $$,
  'off the second workspace''s class, its bank and its name are gone from the list'
);
select is(
  (select array_agg(distinct workspace_number) from public.my_classes()),
  array[1],
  'and the classes left are all of workspace number 1'
);

-- ---------------------------------------------------------------------------
-- Everyone else
-- ---------------------------------------------------------------------------

select pg_temp.act_as('00000000-0000-0000-0000-0000004200a1');
select is_empty(
  $$ select * from public.my_practice_banks() $$,
  'an author, who is in no class, has no practice list'
);
select is_empty(
  $$ select * from public.my_classes() $$,
  'and no classes of their own'
);

select pg_temp.act_as_nobody();
select is_empty(
  $$ select * from public.my_practice_banks() $$,
  'no session reads no practice bank'
);
select is_empty(
  $$ select * from public.my_classes() $$,
  'and no class'
);

reset role;

-- ---------------------------------------------------------------------------
-- The catalog
-- ---------------------------------------------------------------------------

select is(
  (select pg_get_function_result(p.oid)
     from pg_proc p where p.oid = 'public.my_practice_banks()'::regprocedure),
  'TABLE(bank_id uuid, bank_name text, item_count integer, answered integer, workspace_name text)',
  'my_practice_banks returns the four columns it did and the workspace name, and no id of it'
);
select is(
  (select pg_get_function_result(p.oid)
     from pg_proc p where p.oid = 'public.my_classes()'::regprocedure),
  'TABLE(class_id uuid, class_name text, joined_at timestamp with time zone, time_zone text, '
    || 'workspace_name text, workspace_number integer)',
  'my_classes returns the five columns it did and the workspace number: no token, code or org id'
);
select ok(
  has_function_privilege('authenticated', 'public.my_practice_banks()', 'execute')
  and has_function_privilege('authenticated', 'public.my_classes()', 'execute'),
  'a signed-in account can call both'
);
select ok(
  not has_function_privilege('anon', 'public.my_practice_banks()', 'execute')
  and not has_function_privilege('anon', 'public.my_classes()', 'execute'),
  'anon can call neither'
);
select ok(
  (select bool_and(p.prosecdef and p.provolatile = 's' and p.proconfig @> array['search_path=""'])
     from pg_proc p
    where p.oid in ('public.my_practice_banks()'::regprocedure,
                    'public.my_classes()'::regprocedure)),
  'both are stable, run with definer rights and have an empty search_path'
);

select * from finish();
rollback;
