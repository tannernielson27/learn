#!/usr/bin/env bash
# #236: a logical backup of a Supabase database, encrypted to an age public key as it is made.
#
#   PROD_DB_URL=... BACKUP_AGE_RECIPIENT=age1... OUT_DIR=/tmp/backup scripts/db-backup.sh
#
# .github/workflows/db-backup.yml runs it every night; docs/05 §7.10 has the restore. It writes
# five files to OUT_DIR, each an age ciphertext, and never a plaintext file: every dump is piped
# straight into age. They follow Supabase's documented CLI backup (roles, schema, data), plus the
# migration history so `supabase db push` still knows what a restored project has, plus what our
# migrations put in the platform's schemas, which the schema dump leaves out:
#
#   roles.sql.age    custom cluster roles (supabase db dump --role-only)
#   schema.sql.age   every schema the platform does not manage: public, private, live
#   data.sql.age     the rows of those schemas AND of auth (users, identities, sessions) and cron,
#                    as COPY; without auth.users a restored class has no students to sign in
#   history.sql.age  supabase_migrations, schema and rows
#   platform.sql.age triggers on auth.users and policies on realtime.messages
#                    (scripts/db-backup-platform.sql says why)
#
# Needs on PATH: supabase (the CLI runs pg_dump in Docker, at the major version in
# supabase/config.toml), pg_dump and psql at the server's major version, and age. SUPABASE_BIN overrides
# the CLI's path. The URL is never printed; the caller masks it.
set -euo pipefail
umask 077

: "${PROD_DB_URL:?PROD_DB_URL is not set}"
: "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT is not set}"
: "${OUT_DIR:?OUT_DIR is not set}"
supabase_bin="${SUPABASE_BIN:-supabase}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# The recipient is the PUBLIC key. A secret key here would put the means to decrypt every backup
# into the repo's secrets, and into any log that echoed it, so it is refused outright.
case "$BACKUP_AGE_RECIPIENT" in
  AGE-SECRET-KEY-*)
    echo "BACKUP_AGE_RECIPIENT holds an age SECRET key. Replace it with the public key (age1...) and rotate the key pair." >&2
    exit 1
    ;;
  age1*) ;;
  *)
    echo "BACKUP_AGE_RECIPIENT is not an age public key (it must start with age1)." >&2
    exit 1
    ;;
esac

mkdir -p "$OUT_DIR"

encrypt() {
  age --encrypt --recipient "$BACKUP_AGE_RECIPIENT" --output "$OUT_DIR/$1.sql.age"
}

# The role dump keeps the platform's own `GRANT SET ON PARAMETER ... TO "supabase_..."` lines,
# which a fresh project already has and which `postgres` may not grant, so they are commented out.
# The two storage tables are excluded as in Supabase's guide: they are platform state that a
# fresh project creates itself, and restoring them over it fails.
"$supabase_bin" db dump --db-url "$PROD_DB_URL" --role-only | sed -E 's/^GRANT .* ON PARAMETER .* TO "supabase_[a-z_]+";$/-- &/' | encrypt roles
"$supabase_bin" db dump --db-url "$PROD_DB_URL" | encrypt schema
"$supabase_bin" db dump --db-url "$PROD_DB_URL" --data-only --use-copy -x storage.buckets_vectors -x storage.vector_indexes | encrypt data
pg_dump --dbname "$PROD_DB_URL" --schema supabase_migrations --quote-all-identifiers --no-owner --no-privileges | encrypt history
psql --dbname "$PROD_DB_URL" -X -q -At -v ON_ERROR_STOP=1 -f "$here/db-backup-platform.sql" | encrypt platform

# An empty or truncated ciphertext means a dump produced nothing; fail rather than keep it.
for part in roles schema data history platform; do
  file="$OUT_DIR/$part.sql.age"
  [ -s "$file" ] || { echo "$part.sql.age is empty" >&2; exit 1; }
  head -c 21 "$file" | grep -q '^age-encryption.org/v1' || { echo "$part.sql.age is not an age file" >&2; exit 1; }
done

echo "Wrote five encrypted parts to OUT_DIR ($(du -ch "$OUT_DIR"/*.sql.age | tail -1 | cut -f1) in total)."
