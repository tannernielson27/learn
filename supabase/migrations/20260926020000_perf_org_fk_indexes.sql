-- #295 (perf audit row #25): index items and participants by parent and org.
--
-- Row level security adds `org_id = current_org_id()` to every read, so the bank counts
-- (`items where bank_id = ?`) and the sessions list and live progress poll
-- (`participants where session_id = ?`) filter on the parent id AND org_id. With only
-- single-column indexes, Postgres ANDs the parent's bitmap with the org-wide org_id bitmap
-- once per outer row. A (parent, org_id) index answers both conditions in one scan.
--
-- The same column pairs are the composite foreign keys `items_bank_org_fkey` and
-- `participants_session_org_fkey`, which had no exactly matching index until now.
--
-- Index only: no table, policy, grant or function changes. Plain `create index` (not
-- concurrently), because migrations run inside a transaction.

create index if not exists items_bank_id_org_id_idx
  on public.items (bank_id, org_id);

create index if not exists participants_session_id_org_id_idx
  on public.participants (session_id, org_id);
