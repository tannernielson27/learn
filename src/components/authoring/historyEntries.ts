import {
  formatPublished,
  readVersion,
  summarizeChanges,
  type VersionRow,
} from "@/lib/authoring/versionHistory";
import type { Item } from "@/lib/ngn/schemas";
import { editorFor, storedItemOf, type EditableItemRow } from "./editorFor";
import type { ItemEditorLoaderProps } from "./ItemEditorLoader";

/**
 * One published version as the History panel shows it. A restorable one carries the full item (its
 * answer key included) and the editor form to restore it into, so it belongs to the authoring area
 * only, never the play page.
 */
export type HistoryEntry = {
  version: number;
  /** "Published Sep 18, 2026". */
  published: string;
  /** What differs from the saved draft; empty when nothing does. */
  changes: string[];
} & ({ ok: true; item: Item; restore: ItemEditorLoaderProps } | { ok: false; reason: string });

const NO_EDITOR = "This kind of question has no editor yet, so this version cannot be restored.";

/** Reads an item's version rows, newest first, against its saved draft. */
export function historyEntries(
  row: EditableItemRow & { id: string },
  versions: readonly VersionRow[],
): HistoryEntry[] {
  const draft = storedItemOf(row);
  return versions.map((versionRow) => {
    const read = readVersion(versionRow, row.type);
    const base = {
      version: read.version,
      published: formatPublished(read.publishedAt),
      changes: summarizeChanges(versionRow.snapshot, draft),
    };
    if (!read.ok) return { ...base, ok: false, reason: read.reason };
    // The draft keeps its own version number; publishing sets the next one on the server.
    const restore = editorFor(row.id, row.type, { ...read.item, version: row.version });
    if (!restore) return { ...base, ok: false, reason: NO_EDITOR };
    return { ...base, ok: true, item: read.item, restore };
  });
}
