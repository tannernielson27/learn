-- A class code a student types to join (#356).
--
-- Every class has an eight-character code from an alphabet with no look-alikes, unique, made by
-- the database and readable only by the class's authors. `join_class_by_code` admits by it under
-- join_class's rules, counts every try against the caller's own account, and "Replace the link"
-- replaces the code with the token.
--
-- Fixture ids of its own (…356…), and no savepoints: the closing rollback cleans up.
begin;
create extension if not exists pgtap with schema extensions;
select plan(41);

-- ---------------------------------------------------------------------------
-- Cast, as the superuser
-- ---------------------------------------------------------------------------

insert into public.orgs (id, name) values
  ('00000000-0000-0000-0000-0000003560a0', 'Code school'),
  ('00000000-0000-0000-0000-0000003560b0', 'Another code school');

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000003560a1', 'code-teacher-a@example.test', 'authenticated',
   'authenticated', '{"provider": "email"}', '{}'),
  ('00000000-0000-0000-0000-0000003560b1', 'code-teacher-b@example.test', 'authenticated',
   'authenticated', '{"provider": "email"}', '{}'),
  -- Four accounts with no role yet, and one student of the other org.
  ('00000000-0000-0000-0000-0000003560d1', 'code-joiner@example.test', 'authenticated',
   'authenticated', '{"provider": "email"}', '{}'),
  ('00000000-0000-0000-0000-0000003560d3', 'code-elsewhere@example.test', 'authenticated',
   'authenticated', '{"provider": "email"}', '{}'),
  ('00000000-0000-0000-0000-0000003560d4', 'code-guesser@example.test', 'authenticated',
   'authenticated', '{"provider": "email"}', '{}'),
  ('00000000-0000-0000-0000-0000003560d5', 'code-latecomer@example.test', 'authenticated',
   'authenticated', '{"provider": "email"}', '{}');

update public.profiles set org_id = '00000000-0000-0000-0000-0000003560a0', role = 'instructor'
  where id = '00000000-0000-0000-0000-0000003560a1';
update public.profiles set org_id = '00000000-0000-0000-0000-0000003560b0', role = 'instructor'
  where id = '00000000-0000-0000-0000-0000003560b1';
update public.profiles set org_id = '00000000-0000-0000-0000-0000003560b0', role = 'student'
  where id = '00000000-0000-0000-0000-0000003560d3';

insert into public.classes (id, org_id, name) values
  ('00000000-0000-0000-0000-0000003560c1', '00000000-0000-0000-0000-0000003560a0', 'NUR 356'),
  ('00000000-0000-0000-0000-0000003560c2', '00000000-0000-0000-0000-0000003560a0', 'NUR 357');

-- The codes and tokens as made, for the roles below to type.
create temporary table issued as
  select c.id, c.join_code, c.invite_token from public.classes c
   where c.id in ('00000000-0000-0000-0000-0000003560c1', '00000000-0000-0000-0000-0000003560c2');
grant select on issued to authenticated, service_role;

create temporary table rotated (token text, code text);
grant all on rotated to authenticated, service_role;

create function pg_temp.act_as(account uuid) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', account, 'role', 'authenticated')::text, true);
$$;

-- The code of class c1 as issued, written the way a person might type it.
create function pg_temp.typed(separator text) returns text
language sql as $$
  select lower(left(i.join_code, 4)) || separator || lower(right(i.join_code, 4))
    from issued i where i.id = '00000000-0000-0000-0000-0000003560c1';
$$;

create function pg_temp.wrong_codes(times integer) returns void
language plpgsql as $$
begin
  for i in 1..times loop
    perform public.join_class_by_code('ZZZZ-ZZZZ');
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- The column
-- ---------------------------------------------------------------------------

select has_column('public', 'classes', 'join_code', 'a class has a join code');
select col_not_null('public', 'classes', 'join_code', 'every class has one, old classes included');
select ok(
  (select bool_and(join_code ~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$') from issued),
  'it is eight characters with no 0, O, 1, I or L'
);
select isnt(
  (select join_code from issued where id = '00000000-0000-0000-0000-0000003560c1'),
  (select join_code from issued where id = '00000000-0000-0000-0000-0000003560c2'),
  'two classes get two different codes'
);
select throws_ok(
  $$ insert into public.classes (org_id, name, join_code) values
       ('00000000-0000-0000-0000-0000003560a0', 'Copy',
        (select join_code from issued where id = '00000000-0000-0000-0000-0000003560c1')) $$,
  '23505', null,
  'no two classes can share a code, whoever writes it'
);
select throws_ok(
  $$ insert into public.classes (org_id, name, join_code) values
       ('00000000-0000-0000-0000-0000003560a0', 'Look-alikes', 'ABCD0OIL') $$,
  '23514', null,
  'and a code with a look-alike in it is refused'
);

-- ---------------------------------------------------------------------------
-- Who can read and write it
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000003560a1');

select is(
  (select join_code from public.classes where id = '00000000-0000-0000-0000-0000003560c1'),
  (select join_code from issued where id = '00000000-0000-0000-0000-0000003560c1'),
  'the class''s author reads its code'
);
insert into public.classes (name) values ('Made by an author');
select ok(
  (select join_code ~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$'
     from public.classes where name = 'Made by an author'),
  'a class an author creates gets a code from the database'
);
select throws_ok(
  $$ insert into public.classes (name, join_code) values ('Chosen', 'ABCDEFGH') $$,
  '42501', null,
  'an author cannot choose a code'
);
select throws_ok(
  $$ update public.classes set join_code = 'ABCDEFGH'
      where id = '00000000-0000-0000-0000-0000003560c1' $$,
  '42501', null,
  'or set one'
);

select pg_temp.act_as('00000000-0000-0000-0000-0000003560b1');
select is(
  (select count(*)::int from public.classes where id = '00000000-0000-0000-0000-0000003560c1'),
  0,
  'an author of another org never sees the class, so never its code'
);

reset role;
select ok(
  not has_function_privilege('anon', 'public.join_class_by_code(text)', 'execute'),
  'anon cannot execute join_class_by_code'
);
select ok(
  has_function_privilege('authenticated', 'public.join_class_by_code(text)', 'execute'),
  'a signed-in account can'
);

set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select throws_ok(
  $$ select public.join_class_by_code('ABCD-EFGH') $$,
  '42501', null,
  'a signed-out visitor calling it is refused'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"role": "authenticated"}', true);
select throws_ok(
  $$ select public.join_class_by_code('ABCD-EFGH') $$,
  '42501', null,
  'and so is a token with no account in it'
);

-- ---------------------------------------------------------------------------
-- Joining by code
-- ---------------------------------------------------------------------------

select pg_temp.act_as('00000000-0000-0000-0000-0000003560d1');
select is(public.join_class_by_code(pg_temp.typed('-')), 'joined',
  'an account with no role joins by typing the code, in lower case with a hyphen');
select is(public.join_class_by_code(pg_temp.typed(' ')), 'joined',
  'joining again, with a space this time, is harmless');
select is((select count(*)::int from public.classes), 0,
  'the student it made reads no class row, so never a code');

reset role;
select is(
  (select row(org_id, role)::text from public.profiles
    where id = '00000000-0000-0000-0000-0000003560d1'),
  row('00000000-0000-0000-0000-0000003560a0'::uuid, 'student'::public.org_role)::text,
  'the account that joined is a student of the class''s org'
);
select ok(
  exists (select 1 from public.class_members
           where class_id = '00000000-0000-0000-0000-0000003560c1'
             and profile_id = '00000000-0000-0000-0000-0000003560d1'),
  'and a member of the class'
);

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000003560a1');
select is(public.join_class_by_code(pg_temp.typed('-')), 'instructor',
  'an instructor typing the code is told so');
select is(public.join_class_by_code('ZZZZ-ZZZZ'), 'instructor',
  'and is told the same for any code, so the answer says nothing about which codes exist');

select pg_temp.act_as('00000000-0000-0000-0000-0000003560d3');
select is(public.join_class_by_code(pg_temp.typed('-')), 'invalid',
  'a student of another org is refused');

reset role;
select ok(
  not exists (select 1 from public.class_members
               where profile_id in ('00000000-0000-0000-0000-0000003560a1',
                                    '00000000-0000-0000-0000-0000003560d3'))
  and (select role::text from public.profiles where id = '00000000-0000-0000-0000-0000003560a1')
      = 'instructor'
  and (select org_id from public.profiles where id = '00000000-0000-0000-0000-0000003560d3')
      = '00000000-0000-0000-0000-0000003560b0',
  'neither the instructor nor the other org''s student was moved or added'
);

-- ---------------------------------------------------------------------------
-- A removed student stays removed
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000003560a1');
delete from public.class_members
 where class_id = '00000000-0000-0000-0000-0000003560c1'
   and profile_id = '00000000-0000-0000-0000-0000003560d1';

select pg_temp.act_as('00000000-0000-0000-0000-0000003560d1');
select is(public.join_class_by_code(pg_temp.typed('-')), 'invalid',
  'a removed student typing the code is refused');

reset role;
select ok(
  not exists (select 1 from public.class_members
               where class_id = '00000000-0000-0000-0000-0000003560c1'
                 and profile_id = '00000000-0000-0000-0000-0000003560d1'),
  'so the removal holds'
);

-- ---------------------------------------------------------------------------
-- Wrong codes and the limit
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000003560d4');
select is(public.join_class_by_code('ZZZZ-ZZZZ'), 'invalid', 'a wrong code joins nothing');
select is(public.join_class_by_code('not a code at all'), 'invalid',
  'and a malformed one gets the same answer');

reset role;
select is(
  (select calls from private.code_lookups
    where client_key = 'class-code|00000000-0000-0000-0000-0000003560d4'),
  2,
  'each wrong code counted once against the caller''s own account'
);

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000003560d4');
select lives_ok($$ select pg_temp.wrong_codes(58) $$, 'sixty tries in five minutes are answered');
select is(public.join_class_by_code('ZZZZ-ZZZZ'), 'rate_limited', 'the sixty-first is refused');
select is(public.join_class_by_code(pg_temp.typed('-')), 'rate_limited',
  'and over the limit nothing is looked up, so a script cannot land on a real code by luck');

reset role;
select ok(
  not exists (select 1 from public.class_members
               where profile_id = '00000000-0000-0000-0000-0000003560d4')
  and (select role from public.profiles where id = '00000000-0000-0000-0000-0000003560d4') is null,
  'the guessing account joined nothing and has no role'
);

-- ---------------------------------------------------------------------------
-- "Replace the link" replaces the code too
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000003560a1');
insert into rotated (token)
  select public.rotate_class_invite('00000000-0000-0000-0000-0000003560c1');
update rotated
   set code = (select join_code from public.classes
                where id = '00000000-0000-0000-0000-0000003560c1');

select isnt((select token from rotated),
  (select invite_token from issued where id = '00000000-0000-0000-0000-0000003560c1'),
  'replacing the link gives a new token');
select isnt((select code from rotated),
  (select join_code from issued where id = '00000000-0000-0000-0000-0000003560c1'),
  'and a new code');
select ok((select code ~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$' from rotated),
  'from the same alphabet');

select pg_temp.act_as('00000000-0000-0000-0000-0000003560d5');
select is(public.join_class_by_code(pg_temp.typed('-')), 'invalid', 'the old code stops working');
select is(
  public.join_class((select invite_token from issued
                      where id = '00000000-0000-0000-0000-0000003560c1')),
  'invalid',
  'and so does the old link'
);

set local role service_role;
select is_empty(
  $$ select * from public.resolve_class_invite(
       (select invite_token from issued where id = '00000000-0000-0000-0000-0000003560c1'),
       '10.0.3.56') $$,
  'the old link resolves to nothing on the invite page either'
);

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000003560d5');
select is(
  public.join_class_by_code((select left(code, 4) || ' ' || right(code, 4) from rotated)),
  'joined',
  'the new code works'
);

reset role;
select ok(
  exists (select 1 from public.class_members
           where class_id = '00000000-0000-0000-0000-0000003560c1'
             and profile_id = '00000000-0000-0000-0000-0000003560d5'),
  'and makes a member of the class'
);

select * from finish();
rollback;
