/**
 * The browser half of AI import's upload page (#345): what the page checks before anything is
 * sent, the words it uses for each answer, and the shapes the server answers with.
 *
 * This module is imported by a Client Component, so it imports nothing from `src/lib/aiImport`
 * (`noClientAiImport.test.ts`). Its limits copy `src/lib/aiImport/files/limits.ts`;
 * `aiImportUpload.test.ts` keeps the two equal.
 */

/** The private bucket files are uploaded to, with the teacher's own session. */
export const AI_IMPORT_UPLOAD_BUCKET = "ai-imports";
export const AI_IMPORT_MAX_FILES = 5;
export const AI_IMPORT_MAX_FILE_BYTES = 25 * 1024 * 1024;
export const AI_IMPORT_MAX_PAGES = 100;
export const AI_IMPORT_MAX_QUESTIONS = 150;
/** What the file picker offers. The server decides by the bytes. */
export const AI_IMPORT_ACCEPT = ".pdf,.docx,.md,.markdown,.txt";
const EXTENSIONS = new Set(["pdf", "docx", "md", "markdown", "txt"]);

/** The sentence the teacher ticks; ticking it is the rights confirmation (ADR 0008). */
export const RIGHTS_LABEL =
  "I may use this content in my course, and it contains no real patient information.";

/** Parts read at once, and extract units after the first (ADR 0008, kickoff decision 5). */
export const PARALLEL_REQUESTS = 3;
/** How long to wait before asking again about a part another tab or visit is reading. */
export const BUSY_RETRY_MS = 15_000;
/** How many times to wait for it: about eight minutes, past the server's six-minute claim. */
export const BUSY_RETRIES = 32;

/** About what one document costs to read (#333: a case study and its standalone, $0.25). */
const COST_PER_DOCUMENT_USD = 0.25;

export interface ChosenFile {
  name: string;
  size: number;
}

/** Checks the chosen files in the browser, before anything is uploaded or charged. */
export function checkChosenFiles(files: readonly ChosenFile[], slotsLeft: number): string[] {
  const problems: string[] = [];
  if (files.length === 0) problems.push("Choose at least one file.");
  if (files.length > slotsLeft) {
    problems.push(
      slotsLeft <= 0
        ? `This import already has ${AI_IMPORT_MAX_FILES} files.`
        : `An import holds at most ${AI_IMPORT_MAX_FILES} files. Choose ${slotsLeft} or fewer.`,
    );
  }
  for (const file of files) {
    const extension = /\.([^.]+)$/.exec(file.name)?.[1]?.toLowerCase() ?? "";
    if (!EXTENSIONS.has(extension)) {
      problems.push(`${file.name}: use a PDF, a Word .docx, Markdown or text file.`);
    } else if (file.size === 0) {
      problems.push(`${file.name}: the file is empty.`);
    } else if (file.size > AI_IMPORT_MAX_FILE_BYTES) {
      problems.push(`${file.name}: the file is larger than 25 MB.`);
    }
  }
  return problems;
}

/** "About 38 documents left this month", from the money left under the workspace's cap. */
export function allowanceLine(remainingUsd: number, remainingPages: number | null): string {
  const documents = Math.max(0, Math.floor(remainingUsd / COST_PER_DOCUMENT_USD));
  const base =
    documents === 0
      ? "Your workspace has used this month's AI import allowance."
      : `About ${documents} ${documents === 1 ? "document" : "documents"} left this month.`;
  if (remainingPages === null || documents === 0) return base;
  return `${base} ${remainingPages} ${remainingPages === 1 ? "page" : "pages"} left.`;
}

/** Why a request failed, in plain words. Every code the server answers has one. */
export const AI_IMPORT_MESSAGES = {
  malformed: "That request could not be read. Reload the page and try again.",
  signed_out: "Sign in again to keep importing.",
  forbidden: "Only teachers in this workspace can import with AI.",
  not_found: "This import could not be found.",
  disabled: "AI import is not turned on for your workspace.",
  rights: "Confirm you may use this content and that it has no real patient information.",
  rate_limited: "You have sent a lot of requests this hour. Wait a while, then try again.",
  cap_reached:
    "Your workspace has reached this month's AI import allowance. Nothing more was charged.",
  claude_failed:
    "Claude is unavailable right now. Try again later; nothing was charged for the part that failed.",
  bad_answer:
    "Claude's answer for part of this file could not be read. Try again; nothing more was charged for it.",
  unavailable: "Something went wrong on our side. Try again in a minute.",
  busy: "Another tab, or an earlier visit, is still reading this part.",
  spent: "This part failed too many times. Remove the file or start a new import.",
  not_parsing: "This import is not reading files now.",
  batch_closed: "This import is no longer taking files. Start a new import to add more.",
  too_many_open:
    "Your workspace has 20 imports open. Finish or discard one before starting another.",
  pending_files: "A file has not finished uploading. Remove it or upload it again.",
  no_files: "Add at least one file that can be imported.",
  not_uploaded: "The file did not finish uploading. Remove it and add it again.",
  changed: "The file changed after it was checked. Remove it and add it again.",
  in_progress: "This file is being checked. Wait a moment.",
  incomplete: "Some parts of the files have not been read yet.",
  upload_failed: "The file could not be uploaded. Check your connection and try again.",
  entry_changed:
    "This question changed in another tab or window. Reload the page to see it as it is now.",
  not_review: "This import is not waiting for review.",
  not_ready:
    "Some questions you kept still need an answer or a fix. Fix them or drop them, then import.",
  invalid_entry:
    "A question you kept is not complete, so nothing was imported. Fix it or drop it, then import.",
  nothing_to_import: "Nothing is left to import. Restore a question first.",
  already_imported: "This import is already in the quiz.",
  quiz_gone:
    "The quiz this import was started from no longer exists, so nothing was imported. Discard this import.",
  import_limited: "You are doing that too often. Wait a minute, then try again.",
  not_retypable:
    "Only a single question that has not been dropped can be read again as another type.",
  retype_busy:
    "This question is already being read again, or a try failed in the last few minutes. Wait a few minutes, or choose another type.",
} as const;

export type AiImportCode = keyof typeof AI_IMPORT_MESSAGES;

export function messageFor(code: string): string {
  return Object.hasOwn(AI_IMPORT_MESSAGES, code)
    ? AI_IMPORT_MESSAGES[code as AiImportCode]
    : AI_IMPORT_MESSAGES.unavailable;
}

/** A refusal: a code, and the sentence to show. `reason` overrides it for a refused file. */
export interface AiImportFailure {
  ok: false;
  code: string;
  message: string;
  remainingUsd?: number;
}

export type ChunkStatus = "pending" | "running" | "done" | "failed";
export type FileStatus = "pending" | "ready" | "rejected";

export interface FileView {
  id: string;
  name: string;
  status: FileStatus;
  /** Why a file was refused, as the teacher reads it. */
  reason: string | null;
  pages: number | null;
  chunks: { position: number; status: ChunkStatus }[];
  /** Questions staged from this file so far. */
  questions: number;
}

export type BatchStatus = "uploading" | "parsing" | "review" | "imported" | "discarded" | "failed";

export interface BatchView {
  id: string;
  status: BatchStatus;
  files: FileView[];
}

/** What the parse route answers for one part. */
export type ParseAnswer = { ok: true; questions: number; already: boolean } | AiImportFailure;

/** What the extract route answers for one unit. Counts only: never a question or a key. */
export type ExtractAnswer =
  | {
      ok: true;
      units: number;
      staged: number;
      alreadyStaged: number;
      overLimit: number;
    }
  | AiImportFailure;

/** How far a file has got, from 0 to 1: reading its parts is most of it. */
export function fileProgress(
  file: { status: FileStatus | "local"; chunks: FileView["chunks"] },
  units: { done: number; total: number } | null,
): number {
  if (file.status !== "ready") return file.status === "rejected" ? 1 : 0;
  const parts = file.chunks.length;
  const read = file.chunks.filter((chunk) => chunk.status === "done").length;
  const readShare = parts === 0 ? 0 : read / parts;
  const extractShare = units && units.total > 0 ? units.done / units.total : 0;
  return Math.min(1, readShare * 0.6 + extractShare * 0.4);
}

/** A file as the page tracks it while it uploads, is read and is extracted. */
export interface TrackedFile {
  key: string;
  fileId: string | null;
  name: string;
  /** `local`: the server refused it before registering it, so it has no row. */
  status: FileStatus | "local";
  reason: string | null;
  pages: number | null;
  chunks: { position: number; status: ChunkStatus }[];
  units: { done: number; total: number } | null;
  questions: number;
  /** What is happening to it right now, while it uploads or is checked. */
  note: string | null;
  /** Why reading or extracting it failed this time. */
  failed: string | null;
}

export function trackFile(file: FileView): TrackedFile {
  return { ...file, key: file.id, fileId: file.id, units: null, note: null, failed: null };
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export interface FileDescription {
  stage: string;
  tone: "working" | "done" | "refused";
  progress: number;
}

/** The words and bar for one file, from where it has got to. */
export function describeFile(file: TrackedFile, batchStatus: BatchStatus): FileDescription {
  if (file.status === "local" || file.status === "rejected") {
    return { stage: file.reason ?? AI_IMPORT_MESSAGES.unavailable, tone: "refused", progress: 1 };
  }
  if (file.status === "pending") {
    const stage = file.note ?? AI_IMPORT_MESSAGES.not_uploaded;
    return { stage, tone: file.note ? "working" : "refused", progress: 0 };
  }
  const progress = fileProgress(file, file.units);
  if (file.failed) return { stage: file.failed, tone: "refused", progress };
  const questions = plural(file.questions, "question", "questions");
  if (batchStatus === "review" || (file.units && file.units.done >= file.units.total)) {
    return { stage: `Done: ${questions} found.`, tone: "done", progress: 1 };
  }
  if (file.units) {
    return {
      stage: `Finding questions: ${file.units.done} of ${plural(file.units.total, "part", "parts")} done, ${questions} so far.`,
      tone: "working",
      progress,
    };
  }
  if (batchStatus === "uploading") {
    const pages = file.pages === null ? "" : ` ${plural(file.pages, "page", "pages")}.`;
    return { stage: `Uploaded and checked.${pages}`, tone: "working", progress: 0 };
  }
  const read = file.chunks.filter((chunk) => chunk.status === "done").length;
  return {
    stage: `Reading: ${read} of ${plural(file.chunks.length, "part", "parts")} read.`,
    tone: "working",
    progress,
  };
}

/** Runs `tasks` with at most `limit` at once; resolves when every one has settled. */
export async function runPool<T>(
  tasks: readonly (() => Promise<T>)[],
  limit: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < tasks.length) {
      const index = next;
      next += 1;
      results[index] = await (tasks[index] as () => Promise<T>)();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}
