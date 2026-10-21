import { countLabel, parseSelection, type SelectionResult } from "./folders";
import { isUuid } from "./ids";
import { selectionLabel } from "./quizMove";

/**
 * Archiving from the quiz page (#471): one row's own Archive, or every selected row at once. The
 * words and the form reading; the writes are in archiveSelectionData.ts, and the rules they meet
 * are the archive migration's triggers (20260919160000_archive_content.sql).
 */

/** The field a row's own Archive button sends: `item:<id>` or `caseStudy:<id>`. */
export const ARCHIVE_ONE = "archiveOne";

export interface ArchiveCounts {
  items: number;
  caseStudies: number;
}

/** The outcome the quiz page shows after an archive: what was archived, and what stayed and why. */
export type ArchiveSelectionState =
  | { status: "idle" }
  | { status: "done"; message: string; refusals: string[] }
  | { status: "error"; error: string; refusals: string[] };

export type ArchiveOne = { kind: "item" | "caseStudy"; id: string };

/** Reads a row's own Archive value; anything else reads as null. */
export function parseArchiveOne(value: FormDataEntryValue | null): ArchiveOne | null {
  if (typeof value !== "string") return null;
  const [kind, id] = value.split(":");
  if ((kind !== "item" && kind !== "caseStudy") || !id || !isUuid(id)) return null;
  return { kind, id };
}

/**
 * What to archive. A row's own Archive archives that row alone, whatever else is checked; the
 * Archive selected button sends the checked rows.
 */
export function parseArchiveSelection(formData: FormData): SelectionResult {
  const raw = formData.get(ARCHIVE_ONE);
  if (raw !== null) {
    const one = parseArchiveOne(raw);
    if (!one) return { ok: false, error: "That could not be read. Reload the page and try again." };
    return one.kind === "item"
      ? { ok: true, itemIds: [one.id], caseStudyIds: [] }
      : { ok: true, itemIds: [], caseStudyIds: [one.id] };
  }
  return parseSelection(formData, "archive");
}

/** "Archive 2 questions and 1 case study?" */
export function archiveConfirmTitle(counts: ArchiveCounts): string {
  return `Archive ${selectionLabel(counts)}?`;
}

/** "Archived 2 questions." */
export function archiveSummary(counts: ArchiveCounts): string {
  const parts = [
    countLabel(counts.items, "question", "questions"),
    countLabel(counts.caseStudies, "case study", "case studies"),
  ].filter((part): part is string => part !== null);
  return parts.length === 0 ? "Nothing was archived." : `Archived ${parts.join(" and ")}.`;
}

/** Why a question that is a case study step stays: the database refuses to archive it alone. */
export function stepRefusal(excerpt: string, caseTitle: string, position: number): string {
  const which = excerpt ? `"${excerpt}"` : "An untitled question";
  return `${which} is step ${position} of the case study "${caseTitle}", so it stays. Archive the case study instead, or give that step another question first.`;
}

export const ARCHIVE_SELECTION_ERRORS = {
  changed: "Some of these are no longer in this quiz. Reload the page and try again.",
  failed: "That could not be archived. Try again.",
} as const;
