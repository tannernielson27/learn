import { IMPORT_ERRORS, IMPORT_MAX_BYTES } from "./transfer";

/**
 * Importing many files at once (#109). Each file is its own learn.v1 import, sent in its own
 * request and written in its own database call, so a file lands whole or not at all, one refused
 * file never blocks the others, and no request carries more than one file (800 KB, under the 1 MB
 * Server Action body limit). A larger set is several files. Pure, so the browser and tests share it.
 */
export const IMPORT_MAX_FILES = 20;
export const PASTED_LABEL = "Pasted JSON";

const MAX_LABEL = 80;

export const BULK_IMPORT_ERRORS = {
  nothing: "Choose JSON files or paste JSON to import.",
  tooMany: `Choose at most ${IMPORT_MAX_FILES} files at a time.`,
  empty: "This file is empty.",
  unsent:
    "This file could not be sent, so it may not have been imported. Check the bank before importing it again.",
} as const;

/** What the server says about one file: the imported summary, or every reason it was refused. */
export type FileImportResult =
  { status: "done"; message: string } | { status: "error"; errors: string[] };

/** One line of the report: a file's label and what happened to it. */
export type FileReport = { label: string } & FileImportResult;

export type ImportStep =
  | { kind: "file"; index: number; label: string }
  | { kind: "pasted"; label: string }
  | { kind: "refused"; label: string; errors: string[] };

/**
 * A file's name as the report shows it. Control and direction characters are dropped, since they
 * could make one name look like another, and a long name is shortened.
 */
export function importLabel(name: string): string {
  // Cc: control characters. Cf: format characters, among them the direction overrides.
  const plain = name.replace(/[\p{Cc}\p{Cf}]/gu, "").trim();
  if (plain.length === 0) return "Untitled file";
  return plain.length > MAX_LABEL ? `${plain.slice(0, MAX_LABEL - 1)}…` : plain;
}

/**
 * What an import sends, in order: each chosen file, then pasted JSON. A file that is empty or over
 * the size limit is refused here, before anything is sent, and the rest still go.
 */
export function planImport(
  files: readonly { name: string; size: number }[],
  pasted: string,
): { ok: true; steps: ImportStep[] } | { ok: false; error: string } {
  const hasPasted = pasted.trim().length > 0;
  if (files.length === 0 && !hasPasted) return { ok: false, error: BULK_IMPORT_ERRORS.nothing };
  if (files.length + (hasPasted ? 1 : 0) > IMPORT_MAX_FILES) {
    return { ok: false, error: BULK_IMPORT_ERRORS.tooMany };
  }
  const steps: ImportStep[] = files.map((file, index) => {
    const label = importLabel(file.name);
    if (file.size === 0) return { kind: "refused", label, errors: [BULK_IMPORT_ERRORS.empty] };
    if (file.size > IMPORT_MAX_BYTES) {
      return { kind: "refused", label, errors: [IMPORT_ERRORS.tooLarge] };
    }
    return { kind: "file", index, label };
  });
  return {
    ok: true,
    steps: hasPasted ? [...steps, { kind: "pasted", label: PASTED_LABEL }] : steps,
  };
}

/** One sentence for the whole import: how many files landed, where, and how many were refused. */
export function reportSummary(reports: readonly FileReport[], folderName: string | null): string {
  const total = reports.length;
  const done = reports.filter((report) => report.status === "done").length;
  const refused = total - done;
  const into = folderName ? ` into ${folderName}` : "";
  if (done === 0) {
    return total === 1 ? "Nothing was imported." : `Nothing was imported from ${total} files.`;
  }
  if (refused === 0) {
    return total === 1 ? `Imported 1 file${into}.` : `Imported all ${total} files${into}.`;
  }
  return `Imported ${done} of ${total} files${into}. ${refused} ${refused === 1 ? "was" : "were"} refused.`;
}
