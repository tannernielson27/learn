import { isRemovedFile } from "./files/reasons";

/**
 * Where a batch's staged questions sit (#343), and which of those places belong to a file the
 * teacher removed (#591). Pure, so every reader of entries can share it.
 *
 * A question's `position` is `file place * 1000 + its place in the file`, and a file's place is
 * its order among the batch's file rows (by `created_at`, then `id`). A removed file keeps its
 * row, so no place ever moves; its place is simply one nothing may be read from again.
 *
 * Why readers filter, and do not rely on the delete alone: a request that was already reading a
 * file when it was removed can stage a question afterwards, at any moment up to the route's time
 * limit. No delete can be timed to catch that. So every reader of a batch's entries leaves out
 * the removed places, and the import deletes them just before it runs.
 */

/** A file's questions are placed `file order * 1000 + position in the file`. */
export const POSITIONS_PER_FILE = 1000;

/** The place of the file a position belongs to. */
export const placeOf = (position: number): number => Math.floor(position / POSITIONS_PER_FILE);

/** The places of removed files, from the batch's file rows in upload order, every row counted. */
export function removedPlaces(
  files: readonly { status: string; rejected_reason: string | null }[],
): ReadonlySet<number> {
  return new Set(files.flatMap((file, place) => (isRemovedFile(file) ? [place] : [])));
}

/** The entries that are not at a removed file's place. */
export function withoutRemoved<T extends { position: number }>(
  entries: readonly T[],
  removed: ReadonlySet<number>,
): T[] {
  return entries.filter((entry) => !removed.has(placeOf(entry.position)));
}
