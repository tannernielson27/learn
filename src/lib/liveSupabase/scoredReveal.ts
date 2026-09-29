/**
 * The key an answer was scored with, read back beside its score (`session_responses.reveal`).
 *
 * The submission route stores the item's key, rationale and scoring with the score, and the two
 * reveal paths (`viewRoute.ts`, `pacedView.ts`) draw the marks against that rather than against
 * the item as it is now, so an author's edit between the answer and the reveal cannot split the
 * points from the red and green (see `withScoredReveal`).
 *
 * ## Before the migration is pushed
 *
 * The column and the eleventh argument of `record_session_response` arrive in
 * `20260928000000_scored_reveal.sql`, and the app reaches production before a hosted `db push`
 * does. So both are asked for once and, if the database says it has never heard of them, asked
 * for again without: a submit is recorded without its reveal, and a reveal reads the item as it
 * is now, which is exactly what the app did before. Nothing else is retried — any other error is
 * the caller's to report.
 */

/** A PostgREST or Postgres error, as far as these reads care. */
export interface DatabaseError {
  code?: string;
  message?: string;
}

/**
 * PostgREST found no function with these argument names (PGRST202), or Postgres has no such column
 * (42703; PostgREST's PGRST204 is the same thing on a write). All three mean a database older than
 * the migration, and none of them ran anything, so asking again is safe.
 */
const BEFORE_THE_MIGRATION = new Set(["PGRST202", "PGRST204", "42703"]);

export function isBeforeRevealMigration(error: DatabaseError | null | undefined): boolean {
  return typeof error?.code === "string" && BEFORE_THE_MIGRATION.has(error.code);
}

/** The column, added to a select list. */
export const REVEAL_COLUMN = "reveal";

/**
 * Runs a read with the reveal column, and again without it if the database does not have it yet.
 * `run` is handed the columns to select.
 */
export async function selectWithReveal<T extends { error: DatabaseError | null }>(
  columns: string,
  run: (columns: string) => PromiseLike<T>,
): Promise<T> {
  const first = await run(`${columns}, ${REVEAL_COLUMN}`);
  return isBeforeRevealMigration(first.error) ? run(columns) : first;
}
