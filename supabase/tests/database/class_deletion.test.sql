-- Deleting a class, or a student's account, while the student is on a roster (#233).
--
-- private.record_class_removal writes a row to private.class_removals whenever a class_members
-- row is deleted, so a removed student cannot rejoin with the old invite link. The same trigger
-- fired when the delete was a cascade from the class or from the student's profile, and then
-- tried to insert a row naming the class or profile being deleted: the foreign key refused it and
-- the whole delete failed. A student's account could not be deleted once they had joined a class.
-- The audit found it while cleaning up its own probe data.
--
-- A removal is still recorded when an author takes a student off a class that goes on existing.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000002330a1', 'deletion-teacher@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002330d1', 'deletion-ada@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002330d2', 'deletion-grace@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002330d3', 'deletion-hal@example.test', 'authenticated', 'authenticated');

select private.make_instructor('deletion-teacher@example.test');
update public.profiles
   set org_id = (select org_id from public.profiles where id = '00000000-0000-0000-0000-0000002330a1'),
       role = 'student'
 where id in ('00000000-0000-0000-0000-0000002330d1', '00000000-0000-0000-0000-0000002330d2',
              '00000000-0000-0000-0000-0000002330d3');

insert into public.classes (id, org_id, name)
  select v.id::uuid, org_id, v.name
    from public.profiles,
         (values ('00000000-0000-0000-0000-0000002330c1', 'NUR 233 A'),
                 ('00000000-0000-0000-0000-0000002330c2', 'NUR 233 B')) as v(id, name)
   where public.profiles.id = '00000000-0000-0000-0000-0000002330a1';
insert into public.class_members (class_id, profile_id) values
  ('00000000-0000-0000-0000-0000002330c1', '00000000-0000-0000-0000-0000002330d1'),
  ('00000000-0000-0000-0000-0000002330c1', '00000000-0000-0000-0000-0000002330d2'),
  ('00000000-0000-0000-0000-0000002330c2', '00000000-0000-0000-0000-0000002330d3');

-- An author removing a student still leaves the record that keeps them out.
delete from public.class_members
 where class_id = '00000000-0000-0000-0000-0000002330c1'
   and profile_id = '00000000-0000-0000-0000-0000002330d2';
select ok(
  exists (select 1 from private.class_removals
           where class_id = '00000000-0000-0000-0000-0000002330c1'
             and profile_id = '00000000-0000-0000-0000-0000002330d2'),
  'taking a student off a class records the removal'
);

-- Deleting a student's account takes their memberships with it.
select lives_ok(
  $$ delete from auth.users where id = '00000000-0000-0000-0000-0000002330d1' $$,
  'a student on a roster can have their account deleted'
);
select is(
  (select count(*)::integer from public.class_members
    where profile_id = '00000000-0000-0000-0000-0000002330d1'),
  0,
  'the deleted student leaves no membership behind'
);
select is(
  (select count(*)::integer from private.class_removals
    where profile_id = '00000000-0000-0000-0000-0000002330d1'),
  0,
  'and no removal record naming them'
);

-- The earlier removal record goes with the account it names.
select lives_ok(
  $$ delete from auth.users where id = '00000000-0000-0000-0000-0000002330d2' $$,
  'a student with a removal record can have their account deleted'
);

-- Deleting a class that still has members.
select lives_ok(
  $$ delete from public.classes where id = '00000000-0000-0000-0000-0000002330c2' $$,
  'a class with students on its roster can be deleted'
);
select is(
  (select count(*)::integer from private.class_removals
    where class_id = '00000000-0000-0000-0000-0000002330c2'),
  0,
  'deleting the class records no removals for it'
);

select * from finish();
rollback;
