-- The shared rate limiter (#234): private.shared_rate_limits and hit_rate_limit.
--
-- The burst test is real concurrency, not a loop: twelve dblink sessions each send one call, all
-- parked behind an advisory lock this session holds, and are released together. Every one of them
-- races for the same new row, so the unique index and ON CONFLICT decide the outcome, exactly as two
-- Vercel instances would. Those sessions commit on their own, so their rows are deleted over dblink
-- before this session touches the table (a local lock on the row would block that delete).
--
-- dblink connects back over TCP, to the address this session reached the server on, as `postgres`
-- with the local stack's default password. That is the
-- local and CI stack only; the hosted project's password is never in this file.
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
select plan(20);

-- ---------------------------------------------------------------------------
-- Shape and privileges
-- ---------------------------------------------------------------------------

select has_table('private', 'shared_rate_limits', 'the shared counter table exists');

select ok(
  (select relrowsecurity from pg_class where oid = 'private.shared_rate_limits'::regclass),
  'the shared counter table has row level security on'
);

select ok(
  not has_table_privilege('anon', 'private.shared_rate_limits', 'select')
    and not has_table_privilege('authenticated', 'private.shared_rate_limits', 'select')
    and not has_table_privilege('anon', 'private.shared_rate_limits', 'insert')
    and not has_table_privilege('authenticated', 'private.shared_rate_limits', 'insert'),
  'anon and authenticated can neither read nor write the counter table'
);

select ok(
  not has_function_privilege('anon', 'public.hit_rate_limit(text, text, integer, integer)', 'execute')
    and not has_function_privilege('authenticated', 'public.hit_rate_limit(text, text, integer, integer)', 'execute'),
  'anon and authenticated cannot call public.hit_rate_limit'
);

select ok(
  not has_function_privilege('anon', 'private.hit_rate_limit(text, text, integer, integer)', 'execute')
    and not has_function_privilege('authenticated', 'private.hit_rate_limit(text, text, integer, integer)', 'execute')
    and not has_function_privilege('service_role', 'private.hit_rate_limit(text, text, integer, integer)', 'execute'),
  'nobody but its owner can call private.hit_rate_limit directly'
);

select ok(
  has_function_privilege('service_role', 'public.hit_rate_limit(text, text, integer, integer)', 'execute'),
  'the server (service_role) can call public.hit_rate_limit'
);

-- As the real roles, not just the catalog: the call itself is refused.
set local role authenticated;
select throws_ok(
  $$ select public.hit_rate_limit('pgtap_role', repeat('a', 64), 5, 60) $$,
  '42501',
  null,
  'a signed-in user is refused at the call'
);
reset role;

set local role anon;
select throws_ok(
  $$ select public.hit_rate_limit('pgtap_role', repeat('a', 64), 5, 60) $$,
  '42501',
  null,
  'a signed-out visitor is refused at the call'
);
reset role;

-- ---------------------------------------------------------------------------
-- Keys are digests, never addresses
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select public.hit_rate_limit('pgtap_keys', '203.0.113.7', 5, 60) $$,
  '22023',
  null,
  'an IP address in the clear is refused as a key'
);

select throws_ok(
  $$ select public.hit_rate_limit('pgtap_keys', 'nurse@school.edu', 5, 60) $$,
  '22023',
  null,
  'an email address in the clear is refused as a key'
);

select throws_ok(
  $$ insert into private.shared_rate_limits (bucket, key_hash, expires_at, calls)
     values ('pgtap_keys', 'nurse@school.edu', now() + interval '1 minute', 1) $$,
  '23514',
  null,
  'the table itself refuses a key that is not a hex digest, whoever writes it'
);

select throws_ok(
  $$ select public.hit_rate_limit('pgtap_keys', repeat('a', 64), 0, 60) $$,
  '22023',
  null,
  'a limit below one is refused'
);

select throws_ok(
  $$ select public.hit_rate_limit('Bad Bucket', repeat('a', 64), 5, 60) $$,
  '22023',
  null,
  'a bucket name outside the pattern is refused'
);

-- ---------------------------------------------------------------------------
-- A real burst: twelve sessions at once against a limit of five
-- ---------------------------------------------------------------------------

-- The burst reconnects over TCP with a password. Say so plainly if this session is on a unix
-- socket, rather than failing later inside dblink.
select ok(inet_server_addr() is not null, 'this session reached the server over TCP, as dblink needs');

-- The burst sessions commit on their own. If this file stops part-way, their rows stay until their
-- five-minute window ends or the next run deletes them first.
create temporary table burst_results (allowed boolean) on commit drop;

do $$ begin perform pg_advisory_lock(234234); end; $$;

do $$
declare
  conn text;
begin
  for i in 1..12 loop
    conn := 'burst' || i;
    -- The server's own non-loopback address: loopback is `trust` in the stack's pg_hba, and dblink
    -- refuses a non-superuser connection that did not use its password.
    perform extensions.dblink_connect(
      conn,
      format(
        'host=%s port=%s dbname=postgres user=postgres password=postgres',
        host(inet_server_addr()),
        inet_server_port()
      )
    );
  end loop;
  perform extensions.dblink_exec(
    'burst1', $q$delete from private.shared_rate_limits where bucket = 'pgtap_burst'$q$
  );
  for i in 1..12 loop
    -- Each session waits on the gate, then makes its one call; the gate opens for all at once.
    perform extensions.dblink_send_query(
      'burst' || i,
      $q$select public.hit_rate_limit('pgtap_burst', repeat('ab', 32), 5, 300)
           from (select pg_advisory_lock_shared(234234)) as gate$q$
    );
  end loop;
end;
$$;

do $$ begin perform pg_advisory_unlock(234234); end; $$;

do $$
begin
  for i in 1..12 loop
    insert into burst_results
      select allowed from extensions.dblink_get_result('burst' || i) as r(allowed boolean);
  end loop;
end;
$$;

select is(
  (select count(*) from burst_results),
  12::bigint,
  'all twelve concurrent calls answered'
);

select is(
  (select count(*) from burst_results where allowed),
  5::bigint,
  'twelve concurrent calls at a limit of five allow exactly five'
);

select is(
  (select calls from private.shared_rate_limits where bucket = 'pgtap_burst'),
  6,
  'calls over the limit are counted but capped one past it, so hammering cannot stretch the wait'
);

-- Remove the committed rows over dblink before this session locks anything, then hang up.
-- burst2..12 hang up with their result read; burst1 is drained (dblink wants one more, empty, read
-- after an async query) and reused for the delete.
do $$
begin
  for i in 2..12 loop
    perform extensions.dblink_disconnect('burst' || i);
  end loop;
  perform * from extensions.dblink_get_result('burst1') as r(allowed boolean);
  perform extensions.dblink_exec(
    'burst1', $q$delete from private.shared_rate_limits where bucket = 'pgtap_burst'$q$
  );
  perform extensions.dblink_disconnect('burst1');
end;
$$;

-- ---------------------------------------------------------------------------
-- The window resets, and expired rows are swept
-- ---------------------------------------------------------------------------

do $$
begin
  perform public.hit_rate_limit('pgtap_window', repeat('cd', 32), 2, 300) from generate_series(1, 3);
end;
$$;

-- Move the whole window into the past, as if five minutes had gone by.
update private.shared_rate_limits
   set expires_at = now() - interval '1 second'
 where bucket = 'pgtap_window';

select ok(
  public.hit_rate_limit('pgtap_window', repeat('cd', 32), 2, 300),
  'once the window has run out the same key is allowed again'
);

select is(
  (select calls from private.shared_rate_limits where bucket = 'pgtap_window'),
  1,
  'and its count starts over at one'
);

insert into private.shared_rate_limits (bucket, key_hash, expires_at, calls)
select 'pgtap_sweep', md5(n::text) || md5(n::text),
       now() - interval '1 hour', 3
  from generate_series(1, 5) as n;
insert into private.shared_rate_limits (bucket, key_hash, expires_at, calls)
values ('pgtap_sweep', repeat('ef', 32), now() + interval '1 hour', 2);

do $$ begin perform public.hit_rate_limit('pgtap_other', repeat('12', 32), 5, 60); end; $$;

select results_eq(
  $$ select key_hash from private.shared_rate_limits where bucket = 'pgtap_sweep' $$,
  $$ values (repeat('ef', 32)) $$,
  'a call sweeps expired rows from any bucket, and leaves a live window alone'
);

select * from finish();
rollback;
