-- Shared rate limits (#234): one fixed-window counter that every server instance shares.
--
-- Why this exists
-- ---------------
-- The sign-in limits (#134, #139), the class invite limits (#217) and the reminder cron's limits
-- (#212) lived in each server instance's memory. Vercel's functions share no memory, so a burst
-- spread over N warm instances could spend each budget N times. The authoring (#111, #123), live
-- (#129, #152) and assignment (#208) limits already live in Postgres, keyed on auth.uid() or a
-- participant, and are unchanged here. This table is for the limits whose caller has not signed in
-- (or is pg_cron), which the app keys on an IP address, an email address or a class.
--
-- #134 kept the sign-in limit out of Postgres for three reasons, and all three are answered:
--
--   1. "It would have to be callable by anon." It is not. public.hit_rate_limit is granted to
--      service_role alone, so the only caller is this app's own server, holding the secret key.
--   2. "The key would be an argument anyone could forge." Only the server passes it, and the server
--      read the address off the request itself (see src/lib/auth/signInRateLimit.ts, clientIp).
--   3. "Failing closed would lock everyone out." Supabase Auth runs on this same database, so when
--      it cannot answer a limiter call it cannot send a sign-in link either. The app refuses sign-in
--      and invite requests when the limiter fails, and says so plainly.
--
-- Keys are digests, never addresses
-- ---------------------------------
-- The server passes HMAC-SHA256(key derived from its secret key, bucket + key) as 64 hex digits.
-- The function and a CHECK on the table both refuse anything else, so an IP address or an email
-- address cannot be stored here in the clear, whoever writes the row. Without the server's secret
-- the digests cannot be reversed by trying every IPv4 address, and the same address hashes
-- differently in every bucket.
--
-- Concurrency
-- -----------
-- One INSERT ... ON CONFLICT DO UPDATE per hit. Two instances hitting a new key at once race on the
-- primary key: one inserts, the other waits for it and then updates, so every hit is counted exactly
-- once and exactly `max_hits` are allowed in a window (proved with twelve real sessions in
-- supabase/tests/database/shared_rate_limits.test.sql). Calls over the limit are counted but capped
-- one past it, so hammering neither shortens nor lengthens the wait, as in #111's counter.
--
-- Growth
-- ------
-- Unlike private.rate_limits (one row per user and action), these keys are unbounded, so each call
-- then deletes up to 20 rows whose window has ended, oldest first, skipping any row another call
-- holds. That is an index range scan on expires_at and never touches a live window, so it cannot
-- clear anyone's budget early. Each call adds at most one row and removes up to twenty, so the table
-- stays near the number of windows open at once. No pg_cron job: the hosted project may not have
-- the extension, and this migration must apply without it.
--
-- The limits themselves (max_hits, window_seconds) are the caller's arguments, unlike
-- private.take_rate_limit, whose caller is a signed-in user who must not choose its own window.
-- Here the caller is the server; the numbers live beside the code that explains them. They are
-- constants per bucket: the cap on `calls` is taken from the call, not stored, so a bucket whose
-- limit changed mid-deploy is only consistent again once its windows roll over.

create table private.shared_rate_limits (
  bucket text not null check (bucket ~ '^[a-z][a-z0-9_]{0,47}$'),
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  calls integer not null check (calls >= 1),
  primary key (bucket, key_hash)
);

alter table private.shared_rate_limits enable row level security;
revoke all on private.shared_rate_limits from public, anon, authenticated, service_role;
create index shared_rate_limits_expires_at_idx on private.shared_rate_limits (expires_at);

create function private.hit_rate_limit(
  bucket_name text,
  key_digest text,
  max_hits integer,
  window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  used integer;
begin
  if bucket_name is null or bucket_name !~ '^[a-z][a-z0-9_]{0,47}$' then
    raise exception 'hit_rate_limit: the bucket must be a lower-case word' using errcode = '22023';
  end if;
  if key_digest is null or key_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'hit_rate_limit: the key must be an HMAC-SHA256 hex digest'
      using errcode = '22023';
  end if;
  if max_hits is null or max_hits not between 1 and 100000 then
    raise exception 'hit_rate_limit: max_hits must be between 1 and 100000' using errcode = '22023';
  end if;
  if window_seconds is null or window_seconds not between 1 and 86400 then
    raise exception 'hit_rate_limit: window_seconds must be between 1 and 86400'
      using errcode = '22023';
  end if;

  insert into private.shared_rate_limits as r (bucket, key_hash, expires_at, calls)
  values (bucket_name, key_digest, now() + make_interval(secs => window_seconds), 1)
  on conflict (bucket, key_hash) do update
    set expires_at = case
          when r.expires_at <= now() then now() + make_interval(secs => window_seconds)
          else r.expires_at
        end,
        calls = case
          when r.expires_at <= now() then 1
          else least(r.calls + 1, max_hits + 1)
        end
  returning calls into used;

  -- The sweep comes after this call's own upsert, never before. The upsert is the only statement
  -- here that can wait on another transaction, and it must wait holding no other row's lock:
  -- sweeping first could lock key Q's stale row while waiting on key P, as another call holds P
  -- and waits on Q, which is a deadlock (40P01) and, through fail-closed, a refused sign-in. SKIP
  -- LOCKED means the sweep itself never waits. This call's own row is not expired, so it is never
  -- swept.
  delete from private.shared_rate_limits s
   where (s.bucket, s.key_hash) in (
     select e.bucket, e.key_hash
       from private.shared_rate_limits e
      where e.expires_at <= now()
      order by e.expires_at
      limit 20
        for update skip locked
   );

  return used <= max_hits;
end;
$$;

revoke all on function private.hit_rate_limit(text, text, integer, integer)
  from public, anon, authenticated, service_role;

-- The Data API exposes only public, so the server calls this. Security definer because service_role
-- has no USAGE on private; granted to service_role and to nobody else.
create function public.hit_rate_limit(
  bucket_name text,
  key_digest text,
  max_hits integer,
  window_seconds integer
)
returns boolean
language sql
security definer
set search_path = ''
as $$ select private.hit_rate_limit(bucket_name, key_digest, max_hits, window_seconds) $$;

revoke all on function public.hit_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, text, integer, integer) to service_role;
