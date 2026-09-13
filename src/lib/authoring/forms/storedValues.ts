/**
 * Readers for stored item JSON, which is external input: each returns a safe default instead of
 * throwing when a piece is missing or malformed. Used to reopen drafts that are not valid items.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The text of a `{ kind: "markdown", value }` object, or "". */
export function markdownText(value: unknown): string {
  return isRecord(value) && typeof value.value === "string" ? value.value : "";
}

export function storedString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function storedId(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

export function storedVersion(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 ? value : 1;
}

export function storedStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

/** Records from an array that carry a string `id`, capped at `max`. */
export function storedRecordsWithId(
  value: unknown,
  max: number,
): (Record<string, unknown> & { id: string })[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .filter(
      (entry): entry is Record<string, unknown> & { id: string } => typeof entry.id === "string",
    )
    .slice(0, max);
}
