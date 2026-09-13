/**
 * The version a publish records: one past the latest snapshot in item_versions, or 1 for a first
 * publish. Computed on the server from stored history only, never from the submitted item.
 */
export function nextPublishedVersion(latestVersion: number | null): number {
  if (latestVersion === null || !Number.isInteger(latestVersion) || latestVersion < 1) return 1;
  return latestVersion + 1;
}
