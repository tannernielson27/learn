/**
 * One request's warning counts by item id. The bank page's item list and its tag counts each ask
 * for counts, mostly of the same items, so each count is worked out once and shared. The store
 * lives for one request only (see `banks.ts`); it is a memo, so it is written to as it fills.
 */
export type WarningCountStore = Map<string, Promise<number>>;

/**
 * The warning count of each of `ids`, in their order. Ids the store does not know yet are read
 * together in one call of `read`; ids already read, or being read, reuse that read. An id the read
 * does not return counts none, and a failed read fails every list that waits on it.
 */
export async function sharedWarningCounts(
  store: WarningCountStore,
  ids: readonly string[],
  read: (ids: string[]) => Promise<Map<string, number>>,
): Promise<Map<string, number>> {
  const missing = [...new Set(ids)].filter((id) => !store.has(id));
  if (missing.length > 0) {
    const batch = (async () => read(missing))();
    for (const id of missing) {
      store.set(
        id,
        batch.then((counts) => counts.get(id) ?? 0),
      );
    }
  }
  const entries = await Promise.all(
    ids.map(async (id) => [id, (await store.get(id)) ?? 0] as const),
  );
  return new Map(entries);
}
