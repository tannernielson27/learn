-- Removing a student who has attempted an assignment (#242).
--
-- The author removes a student from the class after the student started or submitted an attempt.
-- The removal must go through as it does for a student with no attempt: the membership row goes,
-- the removal is recorded, and the attempts are kept for the report.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000002421a1', 'removal-teacher@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002421d1', 'removal-submitted@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002421d2', 'removal-open@example.test', 'authenticated', 'authenticated');

select private.make_instructor('removal-teacher@example.test');
update public.profiles
   set org_id = (select org_id from public.profiles where id = '00000000-0000-0000-0000-0000002421a1'),
       role = 'student'
 where id in ('00000000-0000-0000-0000-0000002421d1', '00000000-0000-0000-0000-0000002421d2');

create function pg_temp.act_as(account uuid) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', account, 'role', 'authenticated')::text, true);
$$;

insert into public.classes (id, org_id, name)
  select '00000000-0000-0000-0000-0000002421c1', org_id, 'NUR 310 removal'
    from public.profiles where id = '00000000-0000-0000-0000-0000002421a1';
insert into public.class_members (class_id, profile_id) values
  ('00000000-0000-0000-0000-0000002421c1', '00000000-0000-0000-0000-0000002421d1'),
  ('00000000-0000-0000-0000-0000002421c1', '00000000-0000-0000-0000-0000002421d2');

insert into public.item_banks (id, org_id, name)
  select '00000000-0000-0000-0000-0000002421e0', org_id, 'Removal bank 242'
    from public.profiles where id = '00000000-0000-0000-0000-0000002421a1';
insert into public.items (id, bank_id, org_id, type, cjmm_step, status, content, answer_key, scoring)
  select '00000000-0000-0000-0000-0000002421f1', '00000000-0000-0000-0000-0000002421e0', org_id,
         'multiple_choice', 1, 'published', '{}', '{"correctOptionId":"k"}', '{}'
    from public.profiles where id = '00000000-0000-0000-0000-0000002421a1';

insert into public.assignments (id, org_id, class_id, bank_id, title, opens_at, closes_at, max_attempts)
  select '00000000-0000-0000-0000-0000002421b1', org_id, '00000000-0000-0000-0000-0000002421c1',
         '00000000-0000-0000-0000-0000002421e0', 'Removal 242', now() - interval '1 hour',
         now() + interval '1 day', 1
    from public.profiles where id = '00000000-0000-0000-0000-0000002421a1';

-- Attempts made the way the app makes them: each student starts one through the database.
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000002421d1');
select public.start_assignment_attempt('00000000-0000-0000-0000-0000002421b1');
select pg_temp.act_as('00000000-0000-0000-0000-0000002421d2');
select public.start_assignment_attempt('00000000-0000-0000-0000-0000002421b1');
reset role;
-- One of them submitted (written directly, as the superuser).
update public.assignment_attempts
   set submitted_at = now(), score = 1, max_score = 1
 where student_id = '00000000-0000-0000-0000-0000002421d1';

select is(
  (select count(*)::integer from public.assignment_attempts
    where assignment_id = '00000000-0000-0000-0000-0000002421b1'),
  2,
  'control: both students have an attempt'
);

-- The author removes both, as the app's removeStudent does.
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000002421a1');

select lives_ok(
  $$ delete from public.class_members
      where class_id = '00000000-0000-0000-0000-0000002421c1'
        and profile_id = '00000000-0000-0000-0000-0000002421d1' $$,
  'the author removes a student who submitted an attempt'
);
select lives_ok(
  $$ delete from public.class_members
      where class_id = '00000000-0000-0000-0000-0000002421c1'
        and profile_id = '00000000-0000-0000-0000-0000002421d2' $$,
  'and one whose attempt is still open'
);
select is(
  (select count(*)::integer from public.class_roster('00000000-0000-0000-0000-0000002421c1')),
  0,
  'neither is on the roster any more'
);
select is(
  (select count(*)::integer from public.assignment_report_rows('00000000-0000-0000-0000-0000002421b1')
    where membership = 'removed'),
  2,
  'both attempts are still in the report, marked removed'
);
reset role;

select is(
  (select count(*)::integer from public.class_members
    where class_id = '00000000-0000-0000-0000-0000002421c1'),
  0,
  'the membership rows are gone'
);
select is(
  (select count(*)::integer from private.class_removals
    where class_id = '00000000-0000-0000-0000-0000002421c1'),
  2,
  'both removals are recorded'
);
select is(
  (select count(*)::integer from public.assignment_attempts
    where assignment_id = '00000000-0000-0000-0000-0000002421b1'),
  2,
  'and the attempts are kept'
);

select * from finish();
rollback;
