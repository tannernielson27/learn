/**
 * Why a file was refused, as a code and the sentence a teacher reads. The sentence is what goes
 * into `ai_import_files.rejected_reason` (at most 200 characters), so it never quotes the file.
 */
export const REJECTIONS = {
  empty: "The file is empty.",
  too_large: "The file is larger than 25 MB.",
  unsupported:
    "This kind of file cannot be imported. Use a PDF, a Word .docx, Markdown or text file.",
  legacy_doc:
    "This is an older Word .doc file or a password-protected Word file. Save it as .docx without a password and upload it again.",
  macro_enabled:
    "This Word file contains macros (.docm). Save it as a plain .docx and upload it again.",
  encrypted: "The PDF is password-protected. Save a copy without a password and upload it again.",
  corrupt: "The file is damaged or is not what its name says, so it cannot be read.",
  too_complex: "The file expands to more than the importer reads. Split it into smaller files.",
  not_utf8: "The text file is not UTF-8. Save it as UTF-8 and upload it again.",
  no_text: "The file has no text to import.",
  too_many_pages: "The file has more than 100 pages. Split it and upload the parts in two batches.",
  batch_pages: "The batch would have more than 100 pages. Upload this file in a new batch.",
  batch_files: "A batch holds at most 5 files.",
  batch_closed: "This batch is no longer taking files. Start a new import to add more.",
  duplicate: "The same document is already in this batch.",
} as const;

export type RejectionCode = keyof typeof REJECTIONS;

export interface Rejection {
  ok: false;
  code: RejectionCode;
  /** The sentence for the teacher, from `REJECTIONS`. */
  reason: string;
}

export const reject = (code: RejectionCode): Rejection => ({
  ok: false,
  code,
  reason: REJECTIONS[code],
});
