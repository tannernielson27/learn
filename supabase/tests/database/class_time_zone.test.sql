-- A class's time zone setting (#242).
--
-- The class's owner (an author of its org, the same people who name it and manage its roster)
-- changes the zone through the one column grant this adds. A zone Postgres does not know is refused
-- by the check, whoever writes it. A student of the class, an author of another org, an account
-- with no role and anon change nothing. A student reads the zone of their own classes through
-- public.my_classes(), and nothing else about the class.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- ---------------------------------------------------------------------------
-- Cast, as the superuser
-- ---------------------------------------------------------------------------

insert into public.orgs (id, name) values ('00000000-0000-0000-0000-0000002420f0', 'Another school 242');

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000002420a1', 'zone-teacher@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002420a2', 'zone-elsewhere@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002420d1', 'zone-student@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002420d2', 'zone-norole@example.test', 'authenticated', 'authenticated');

select private.make_instructor('zone-teacher@example.test');
update public.profiles set org_id = '00000000-0000-0000-0000-0000002420f0', role = 'instructor'
 where id = '00000000-0000-0000-0000-0000002420a2';
update public.profiles
   set org_id = (select org_id from public.profiles where id = '00000000-0000-0000-0000-0000002420a1'),
       role = 'student'
 where id = '00000000-0000-0000-0000-0000002420d1';

create function pg_temp.act_as(account uuid) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', account, 'role', 'authenticated')::text, true);
$$;

create function pg_temp.zone() returns text
language sql as $$
  select time_zone from public.classes where id = '00000000-0000-0000-0000-0000002420c1';
$$;

insert into public.classes (id, org_id, name, created_by)
  select '00000000-0000-0000-0000-0000002420c1', org_id, 'NUR 310 zone', id
    from public.profiles where id = '00000000-0000-0000-0000-0000002420a1';
insert into public.class_members (class_id, profile_id) values
  ('00000000-0000-0000-0000-0000002420c1', '00000000-0000-0000-0000-0000002420d1');

select is(pg_temp.zone(), 'America/Denver', 'a new class is on America/Denver');

-- ---------------------------------------------------------------------------
-- The owner
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000002420a1');

select lives_ok(
  $$update public.classes set time_zone = 'America/New_York'
     where id = '00000000-0000-0000-0000-0000002420c1'$$,
  'the class''s owner changes its zone'
);
select is(
  (select time_zone from public.classes where id = '00000000-0000-0000-0000-0000002420c1'),
  'America/New_York',
  'and reads the new zone back'
);
select throws_ok(
  $$update public.classes set time_zone = 'Mars/Olympus_Mons'
     where id = '00000000-0000-0000-0000-0000002420c1'$$,
  '23514', null,
  'a zone Postgres does not know is refused'
);
select throws_ok(
  $$update public.classes set time_zone = '' where id = '00000000-0000-0000-0000-0000002420c1'$$,
  '23514', null,
  'so is an empty one'
);
select throws_ok(
  $$update public.classes set time_zone = 'posixrules'
     where id = '00000000-0000-0000-0000-0000002420c1'$$,
  '23514', null,
  'and so is a tz database file that is not a zone'
);
select throws_ok(
  $$update public.classes set invite_token = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
     where id = '00000000-0000-0000-0000-0000002420c1'$$,
  '42501', null,
  'the grant is the zone and the name only: the token still changes only by rotation'
);

-- ---------------------------------------------------------------------------
-- Everyone else
-- ---------------------------------------------------------------------------

select pg_temp.act_as('00000000-0000-0000-0000-0000002420d1');
update public.classes set time_zone = 'Europe/London'
 where id = '00000000-0000-0000-0000-0000002420c1';
select pg_temp.act_as('00000000-0000-0000-0000-0000002420a2');
update public.classes set time_zone = 'Asia/Tokyo'
 where id = '00000000-0000-0000-0000-0000002420c1';
select pg_temp.act_as('00000000-0000-0000-0000-0000002420d2');
update public.classes set time_zone = 'Australia/Sydney'
 where id = '00000000-0000-0000-0000-0000002420c1';
reset role;

select is(
  pg_temp.zone(),
  'America/New_York',
  'a student of the class, an author of another org and an account with no role change nothing'
);

set local role anon;
select throws_ok(
  $$update public.classes set time_zone = 'Europe/London'
     where id = '00000000-0000-0000-0000-0000002420c1'$$,
  '42501', null,
  'anon cannot write it at all'
);
reset role;

-- ---------------------------------------------------------------------------
-- What a student reads
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000002420d1');
select results_eq(
  $$ select class_name, time_zone from public.my_classes() $$,
  $$ values ('NUR 310 zone'::text, 'America/New_York'::text) $$,
  'a student reads the zone of their own class through my_classes'
);
select is_empty(
  $$ select 1 from public.classes $$,
  'and still no class row'
);

select pg_temp.act_as('00000000-0000-0000-0000-0000002420a2');
select is_empty($$ select * from public.my_classes() $$, 'an author of another org reads none');
reset role;

-- ---------------------------------------------------------------------------
-- The catalog
-- ---------------------------------------------------------------------------

select ok(
  has_column_privilege('authenticated', 'public.classes', 'time_zone', 'update'),
  'authenticated may update the zone column, under the authors-only update policy'
);
select ok(
  not has_column_privilege('anon', 'public.classes', 'time_zone', 'update'),
  'anon may not'
);
select ok(
  not private.is_time_zone('posix/America/Denver') and not private.is_time_zone('right/UTC'),
  'the tz database''s posix and right copies are not offered as zones'
);
select ok(
  private.is_time_zone('America/New_York') and private.is_time_zone('UTC'),
  'real zones and UTC are'
);
select ok(
  not has_function_privilege('anon', 'public.my_classes()', 'execute'),
  'anon cannot call my_classes'
);

select * from finish();
rollback;
