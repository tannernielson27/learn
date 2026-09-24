-- #236: the head of history.sql, ahead of the rows of supabase_migrations.
--
-- The new project may or may not have supabase_migrations already (the CLI makes it on its first
-- `db push` or `migration repair`, and the dashboard may too), so this makes the two tables the
-- Supabase CLI keeps there only if they are missing, adds any column an older copy lacks, and
-- empties them, so the rows that follow are the whole history. The shapes match what
-- `supabase` 2.117 creates.
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (version text NOT NULL PRIMARY KEY);
ALTER TABLE supabase_migrations.schema_migrations
  ADD COLUMN IF NOT EXISTS statements text[],
  ADD COLUMN IF NOT EXISTS name text;
CREATE TABLE IF NOT EXISTS supabase_migrations.seed_files (path text NOT NULL PRIMARY KEY, hash text NOT NULL);
TRUNCATE supabase_migrations.schema_migrations, supabase_migrations.seed_files;
