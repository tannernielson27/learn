import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { CaseStudy, ItemInput } from "@/lib/ngn/schemas";

/**
 * The files the eval reads (#339): what each corpus document should import as, and what the
 * pipeline returned for it. Both are JSON written by people or by `pnpm eval:ai-import`, so they
 * are parsed here before anything trusts them.
 */

export const AI_IMPORT_DIR = join(import.meta.dirname);
export const CORPUS_DIR = join(AI_IMPORT_DIR, "corpus");
export const RECORDINGS_DIR = join(AI_IMPORT_DIR, "recordings");

/** The bucket for a question with no NGN type: open prompts, matching, calculations, recall. */
export const NOT_IMPORTABLE = "not_importable";

const looseObject = z.record(z.string(), z.unknown());

const expectedImportable = z.object({
  label: z.string().min(1),
  /** `ready` when the source has its key; `needs_answer` when it has none and none may be added. */
  status: z.enum(["ready", "needs_answer"]),
  /** The learn.v1 item. A `needs_answer` item has an empty key, so it does not pass itemSchema. */
  item: looseObject,
});

const expectedNotImportable = z.object({
  label: z.string().min(1),
  status: z.literal(NOT_IMPORTABLE),
  /** The question's opening words as printed, to find the pipeline's entry for it. */
  opening: z.string().min(1),
  reason: z.string().min(1),
});

export const expectedDocumentSchema = z.object({
  document: z.string().min(1),
  /** The corpus cases this document exercises (see `CORPUS_CASES`). */
  covers: z.array(z.string()).min(1),
  questions: z.array(z.union([expectedImportable, expectedNotImportable])),
  caseStudies: z.array(z.object({ label: z.string().min(1), caseStudy: looseObject })).default([]),
});
export type ExpectedDocument = z.infer<typeof expectedDocumentSchema>;
export type ExpectedQuestion = ExpectedDocument["questions"][number];
export type ExpectedImportable = z.infer<typeof expectedImportable>;

export const asItem = (question: ExpectedImportable): ItemInput =>
  question.item as unknown as ItemInput;
export const asCaseStudy = (value: Record<string, unknown>): CaseStudy =>
  value as unknown as CaseStudy;

const recordedQuestion = z.object({
  /** The question's opening words, as the segment pass copied them. */
  opening: z.string(),
  /** A draft type, or `not_importable`. */
  type: z.string().min(1),
  /** The extract pass's draft, unparsed: the scorer parses it and counts a bad one as a failure. */
  draft: z.unknown().optional(),
  reason: z.string().optional(),
});
export type RecordedQuestion = z.infer<typeof recordedQuestion>;

export const recordingSchema = z.object({
  document: z.string().min(1),
  /** `hand-written` until a live run replaces it; otherwise the model that answered. */
  source: z.string().min(1),
  recordedAt: z.string().optional(),
  questions: z.array(recordedQuestion),
  caseStudies: z.array(z.object({ draft: z.unknown() })).default([]),
  usage: z
    .object({ inputTokens: z.number(), outputTokens: z.number(), costUsd: z.number() })
    .optional(),
});
export type Recording = z.infer<typeof recordingSchema>;

/** The corpus cases the issue asks for; each must be covered by at least one document. */
export const CORPUS_CASES = [
  "asterisk-glued",
  "asterisk-spaced",
  "check-answer-line",
  "word-highlight",
  "unmarked-key",
  "answers-at-the-back",
  "two-column-pdf",
  "scanned-page",
  "case-study",
  "standalone-bowtie",
  "open-prompt",
  "matching",
  "instructor-notes",
  "injected-instruction",
] as const;

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));

/** `<document>.expected.json` files beside the documents in `dir`. */
export function loadExpected(dir: string = CORPUS_DIR): ExpectedDocument[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".expected.json"))
    .sort()
    .map((name) => {
      const parsed = expectedDocumentSchema.safeParse(readJson(join(dir, name)));
      if (!parsed.success) throw new Error(`${name}: ${z.prettifyError(parsed.error)}`);
      return parsed.data;
    });
}

/** Every recording in `dir`, keyed by the document it was made from. */
export function loadRecordings(dir: string = RECORDINGS_DIR): Map<string, Recording> {
  const recordings = new Map<string, Recording>();
  if (!existsSync(dir)) return recordings;
  for (const name of readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .sort()) {
    const parsed = recordingSchema.safeParse(readJson(join(dir, name)));
    if (!parsed.success) throw new Error(`${name}: ${z.prettifyError(parsed.error)}`);
    recordings.set(parsed.data.document, parsed.data);
  }
  return recordings;
}
