-- A short class code a student can type to join (#356).
--
-- Since #205 a class is joined through its invite link (`/c/<token>`) or the QR code that carries
-- it. A 32-character token cannot be read out loud or copied off a whiteboard, and from Sprint 13 a
-- student can sign up first and join after (ADR 0009), so a class also gets a code a person can
-- type: eight characters, shown as two groups of four (`XXXX-XXXX`) so it is never taken for a
-- live session's six.
--
-- ---------------------------------------------------------------------------
-- The code
-- ---------------------------------------------------------------------------
--
-- The alphabet is 2-9 and A-Z without I, L and O: 31 characters, none of which a reader can take
-- for another (no 0/O, no 1/I/L). It is the live session alphabet less L. 31^8 is
-- 852,891,037,441 codes. Kept as a literal in the check constraint, the generator and
-- join_class_by_code, and in src/lib/classes/classCode.ts, for the reason the live-sessions
-- migration gives: a check constraint may not call a function that is not immutable.
--
-- Drawn from gen_random_bytes (pgcrypto's CSPRNG, never random()). 31 does not divide 256, so a
-- byte of 248 or more (31 * 8) is thrown away and another taken: every character is equally likely.
--
-- Unique over all classes. The generator draws until it finds a code no class has (ten tries
-- against 8.5e11 codes: a second draw is already a one-in-a-billion event), and the unique
-- constraint is the invariant. Two inserts that draw the same unused code at the same instant would
-- leave one of them with a unique violation, which the author sees as a failed create and simply
-- retries; at these odds that is not a path worth a retry loop in every insert.
--
-- Who sees it: exactly who sees the invite token. Only an author of the class's org can read a row
-- of public.classes ("authors read their org's classes"); a student reads their classes through
-- my_classes(), which returns no code; anon holds no privilege on the table. The column has no
-- insert or update grant, so no client ever chooses or changes one: it comes from the default and
-- changes only through rotate_class_invite.
--
-- ---------------------------------------------------------------------------
-- Joining by code
-- ---------------------------------------------------------------------------
--
-- public.join_class_by_code(p_code) is join_class with a typed code instead of a token: the same
-- answers ('joined', 'instructor', 'invalid', 'rate_limited') and the same admission through
-- private.admit_to_class, so a removed student stays removed, a student of another org is refused
-- and an account with no role becomes a student of the class's org.
--
-- The limit. A code has 39 bits where a token has 192, so guessing is the threat this function is
-- built around. It runs as the signed-in caller through PostgREST, so it cannot be given the
-- caller's address: any `client_key` argument would be one the caller chose. The only key a caller
-- cannot forge is their own account, so the budget is private.take_failed_lookup's sixty per five
-- minutes per account (`class-code|<uid>`), separate from join_class's. Two differences from the
-- address-keyed lookups, both because the key is an account and not a shared campus address:
--
--   * The budget is taken before the lookup, and every try spends it, a right code as well as a
--     wrong one. Over the limit, nothing is looked up, so a script that keeps going cannot land on
--     a real code by luck. A person joins a class a handful of times a term; nobody else shares
--     the bucket, so this can lock out only the account doing the guessing.
--   * An instructor or admin is answered 'instructor' before any lookup, so an instructor account
--     cannot use the answer to learn which codes exist.
--
-- Every other refusal is 'invalid': no such code, a malformed one, a removed student, another
-- org's student. Nothing distinguishes them. A per-address limit on top belongs in the app's
-- server action, which reads the address off the request (#362's code box).
--
-- At sixty a five minutes an account gets 17,280 tries a day; against a thousand classes that is
-- about a one-in-fifty-thousand chance a day of landing in one, so even odds take some 34,000
-- account-days of guessing. Sign-up's own limits (#359) and "Replace the link" are the remedies.
--
-- Input is forgiving the way the live join code is: case is ignored, and so are spaces and
-- hyphens, so `abcd-efgh`, `ABCD EFGH` and `abcdefgh` are the same code.
--
-- ---------------------------------------------------------------------------
-- Rotating
-- ---------------------------------------------------------------------------
--
-- rotate_class_invite ("Replace the link") now replaces the token and the code in one UPDATE: a
-- link that went somewhere it should not has usually taken its code with it. Same signature and
-- return value (the new token), so the app's call is unchanged.
--
-- Safe to replay on a fresh project: a new function, a new column added nullable, backfilled one
-- row at a time (each draw sees the codes drawn before it) and then given its default and NOT NULL,
-- a `create or replace` with an unchanged signature, and a new function with its grants. On an
-- empty table the backfill does nothing. Nothing here depends on #355's migration.

-- ---------------------------------------------------------------------------
-- The generator
-- ---------------------------------------------------------------------------

-- Security definer so the column default works for an author (it reads every org's codes to avoid
-- a duplicate, which RLS would hide from the author) and so it can reach `extensions`. It takes no
-- input and returns only a code nobody has, so it answers no question about anyone's class.
create function private.new_class_join_code() returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  drawn bytea;
  picked integer;
  candidate text;
begin
  for attempt in 1 .. 10 loop
    candidate := '';
    while length(candidate) < 8 loop
      drawn := extensions.gen_random_bytes(16);
      for i in 0 .. 15 loop
        picked := get_byte(drawn, i);
        -- 248 = 31 * 8. Bytes from 248 to 255 would make the first eight characters likelier.
        if picked < 248 and length(candidate) < 8 then
          candidate := candidate || substr(alphabet, (picked % 31) + 1, 1);
        end if;
      end loop;
    end loop;

    if not exists (select 1 from public.classes c where c.join_code = candidate) then
      return candidate;
    end if;
  end loop;

  raise exception 'could not find a free class code' using errcode = '53400';
end;
$$;

revoke all on function private.new_class_join_code() from public, anon;
-- A column default runs as the inserting role, so the author creating a class needs this, exactly
-- as with private.new_invite_token.
grant execute on function private.new_class_join_code() to authenticated;

-- ---------------------------------------------------------------------------
-- The column
-- ---------------------------------------------------------------------------

alter table public.classes add column join_code text;
alter table public.classes add constraint classes_join_code_format
  check (join_code ~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$');
alter table public.classes add constraint classes_join_code_key unique (join_code);

-- Existing classes, one at a time so each draw sees the codes already given out. The updated_at
-- trigger is held off so the backfill does not look like an edit of every class.
alter table public.classes disable trigger classes_set_updated_at;
do $$
declare
  existing record;
begin
  for existing in
    select c.id from public.classes c where c.join_code is null order by c.created_at, c.id
  loop
    update public.classes set join_code = private.new_class_join_code() where id = existing.id;
  end loop;
end
$$;
alter table public.classes enable trigger classes_set_updated_at;

alter table public.classes alter column join_code set default private.new_class_join_code();
alter table public.classes alter column join_code set not null;

comment on column public.classes.join_code is
  'Eight characters a student types to join (#356), shown as XXXX-XXXX. Changes only through rotate_class_invite.';

-- ---------------------------------------------------------------------------
-- Rotating: the link and the code together
-- ---------------------------------------------------------------------------

-- A new token and a new code for a class of the caller's org; the new token is returned. The old
-- link and the old code stop working the moment this commits: join_class, resolve_class_invite and
-- join_class_by_code all match the current columns only. A class the caller cannot see is 'no such
-- class', never 'not yours'.
create or replace function public.rotate_class_invite(target_class uuid) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  fresh text;
begin
  if not (select private.is_author()) then
    raise exception 'only an author can rotate an invite link' using errcode = '42501';
  end if;

  update public.classes
     set invite_token = private.new_invite_token(),
         join_code = private.new_class_join_code()
   where id = target_class and org_id = (select private.current_org_id())
  returning invite_token into fresh;

  if fresh is null then
    raise exception 'that class does not exist' using errcode = 'P0002';
  end if;
  return fresh;
end;
$$;

revoke all on function public.rotate_class_invite(uuid) from public, anon;
grant execute on function public.rotate_class_invite(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Joining by code
-- ---------------------------------------------------------------------------

-- 'joined', 'instructor', 'invalid' or 'rate_limited', as join_class. See the header for the limit.
create function public.join_class_by_code(p_code text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  caller_role public.org_role;
  -- Clipped before anything else so no caller can make the regular expression below do much work.
  candidate text := upper(regexp_replace(left(coalesce(p_code, ''), 64), '[[:space:]-]', '', 'g'));
  hit uuid;
begin
  if caller is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;

  -- Before any lookup, so an instructor's answer says nothing about whether the code exists.
  -- admit_to_class checks the role again under a row lock.
  select p.role into caller_role from public.profiles p where p.id = caller;
  if caller_role in ('instructor', 'admin') then
    return 'instructor';
  end if;

  -- Every try is counted, and over the limit nothing is looked up. The key is the caller's own
  -- account, so this can only ever lock out the account that is guessing.
  if not private.take_failed_lookup('class-code|' || caller::text) then
    return 'rate_limited';
  end if;

  if candidate ~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$' then
    select c.id into hit from public.classes c where c.join_code = candidate;
  end if;

  if hit is null then
    return 'invalid';
  end if;

  return private.admit_to_class(caller, hit);
end;
$$;

revoke all on function public.join_class_by_code(text) from public, anon;
grant execute on function public.join_class_by_code(text) to authenticated;
