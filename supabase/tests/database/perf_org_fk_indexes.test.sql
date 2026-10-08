-- #295: items and participants are indexed by (parent, org_id), the pair that row level
-- security plus the parent lookup filters on, and the composite foreign keys' columns.
-- Runs with `pnpm exec supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

select has_index('public', 'items', 'items_bank_id_org_id_idx', array['bank_id', 'org_id'],
  'items are indexed by bank and org');
select has_index('public', 'participants', 'participants_session_id_org_id_idx',
  array['session_id', 'org_id'], 'participants are indexed by session and org');

select * from finish();
rollback;
