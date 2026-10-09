-- The workspace on a student's practice rows, and two workspaces of one name told apart.
--
-- Since 20261009000000 one student account can be in classes of more than one teacher's
-- workspace, and the student home puts the workspace's name beside the class on open-assignment
-- and history rows for such a student. Two things were left:
--
--   * Practice rows could not say which workspace a bank came from: my_practice_banks() returned
--     the bank and nothing of its class or workspace, so two banks of one name from two
--     workspaces looked alike.
--   * The home decided "more than one workspace" by comparing the names my_classes() returns, so
--     two workspaces with the same name counted as one and no row named either.
--
-- ---------------------------------------------------------------------------
-- What changes
-- ---------------------------------------------------------------------------
--
--   1. public.my_practice_banks() gains `workspace_name`: the name of the org of the share that
--      puts the bank on the caller's list. A share, its bank and its class are held to one org by
--      bank_practice_shares' foreign keys, so this is the workspace of a class the caller is a
--      current member of, which my_classes() already names to them. Which banks are listed, the
--      counts and the order are 20260926000000's, line for line.
--   2. public.my_classes() gains `workspace_number`: 1, 2, 3 ... over the distinct workspaces of
--      the caller's own classes. Two classes carry the same number exactly when they are in the
--      same workspace, whatever the workspaces are called. It is a position within this one
--      answer, not an identifier: it says nothing outside the answer it came in, may differ after
--      the caller joins or leaves a class, and is not the org's id, which my_classes() still does
--      not return. Which classes are listed, the other columns and the order are
--      20261009000000's.
--
-- What a student can newly read: for a bank already on their Practice list, the name of its
-- workspace, which is a name my_classes() already gives them; and for their own classes, which
-- of them share a workspace. No id, no other column of public.orgs, and nothing of a workspace
-- they have no class in. No table, column, policy, grant on a table or row is touched, and
-- nothing about a run, an item or a key: the practice run functions are not restated here.
--
-- Both functions are dropped and recreated, with their grants, because Postgres cannot change a
-- function's result columns in place (as 20261009000000 did for `workspace_name`).
--
-- The app works before and after this is applied. Before, my_practice_banks() sends no
-- `workspace_name` and practice rows show none, and my_classes() sends no `workspace_number` and
-- the home compares names as it did.
--
-- Safe to replay on a fresh project, and safe to run twice: each function is dropped with
-- `if exists` and recreated with its grants. Depends on 20261009000000 (`my_classes` with
-- `workspace_name`) and 20260926000000 (`private.practice_run_set`).

-- ---------------------------------------------------------------------------
-- The student's classes
-- ---------------------------------------------------------------------------

drop function if exists public.my_classes();

-- A student's classes: the id, the name, the zone its due times are read in, the name of the
-- workspace it belongs to and that workspace's number among the caller's own, and nothing more.
-- Anyone signed in may call it; it only ever returns the caller's own memberships.
create function public.my_classes()
returns table (
  class_id uuid,
  class_name text,
  joined_at timestamptz,
  time_zone text,
  workspace_name text,
  workspace_number integer
)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.name, m.joined_at, c.time_zone, o.name,
         (dense_rank() over (order by c.org_id))::integer
    from public.class_members m
    join public.classes c on c.id = m.class_id
    join public.orgs o on o.id = c.org_id
   where m.profile_id = (select auth.uid())
   order by c.name, o.name, c.id;
$$;

revoke all on function public.my_classes() from public, anon;
grant execute on function public.my_classes() to authenticated;

-- ---------------------------------------------------------------------------
-- The student's Practice list
-- ---------------------------------------------------------------------------

drop function if exists public.my_practice_banks();

-- Each bank shared with one of the caller's current classes: its name, how many items the
-- caller's newest run holds (before any run, the bank's current set), how many of them that run
-- has answered, and the name of the workspace the bank and that class belong to.
create function public.my_practice_banks()
returns table (
  bank_id uuid,
  bank_name text,
  item_count integer,
  answered integer,
  workspace_name text
)
language sql stable security definer set search_path = ''
as $$
  with caller as (
    select (select auth.uid()) as id
  ),
  banks as (
    -- s.org_id is the class's org and the bank's (both foreign keys carry it), so a bank still
    -- appears once however many of the caller's classes it is shared with.
    select distinct s.bank_id, s.org_id, c.id as caller
      from caller c
      join public.class_members m on m.profile_id = c.id
      join public.bank_practice_shares s on s.class_id = m.class_id
     where c.id is not null
       and private.is_current_member(m.class_id, c.id)
  )
  select b.id,
         b.name,
         case
           when newest.id is null
             then (select count(*)::integer from private.practice_item_set(b.id))
           else (select count(*)::integer from private.practice_run_set(newest.id))
         end,
         coalesce((
           select count(*)::integer
             from public.practice_responses p
            where p.run_id = newest.id
         ), 0),
         o.name
    from banks x
    join public.item_banks b on b.id = x.bank_id
    join public.orgs o on o.id = x.org_id
    left join lateral (
      select r.id from public.practice_runs r
       where r.student_id = x.caller and r.bank_id = b.id
       order by r.started_at desc, r.id desc
       limit 1
    ) newest on true
   order by b.name, b.id
   limit 200;
$$;

revoke all on function public.my_practice_banks() from public, anon;
grant execute on function public.my_practice_banks() to authenticated;
