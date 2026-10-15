import { fromDraft, itemDraftSchema, type DraftReason, type ItemDraft } from "@/lib/ngn/draft";
import { itemQualityWarnings } from "@/lib/ngn/quality";
import { itemSchema, type Item, type ItemInput, type ItemType } from "@/lib/ngn/schemas";
import { LOW_CONFIDENCE } from "./config";
import type { DraftProblem, ExtractedDraft } from "./extract";
import { showsKey } from "./keyEvidence";
import type { MergedQuestion } from "./merge";

/**
 * A question becomes a staged entry (#343, ADR 0008 Pipeline steps 6-7). Pure.
 *
 * `fromDraft`, then `itemSchema`, then `itemQualityWarnings`. The status says what the teacher
 * must do, and each reason says why, in plain words:
 *
 * - `ready`: a valid item whose key the source shows.
 * - `needs_answer`: the source has no key; the item's key is empty and only the teacher fills it.
 * - `needs_fix`: the draft does not convert after its repair, or the question cannot stand as it
 *   was read (cut off, relies on an image, or not found in the source). The draft is kept.
 * - `not_importable`: no NGN type (an open prompt, a calculation, matching, recall).
 *
 * Extract only: a draft that comes back keyed from a text source whose part of the document shows
 * no answer at all is not converted (`unmarked_key`); the model wrote that key.
 */

export type EntryStatus = "ready" | "needs_answer" | "needs_fix" | "not_importable";

export type EntryReasonCode =
  | "not_ngn"
  | "needs_answer"
  | "needs_fix"
  | "unmarked_key"
  | "check_key"
  | "not_in_source"
  | "relies_on_image"
  | "cut_off"
  | "instructor_note"
  | "low_confidence"
  | "scoring_conflict"
  | "source_error"
  | "warning"
  | "duplicate";

export interface EntryReason {
  code: EntryReasonCode;
  message: string;
}

/** `ai_import_entries.reasons` holds at most 20. */
export const MAX_REASONS = 20;
const MAX_REASON_LENGTH = 500;

/** How a reason is stored: `code: message`. */
export const formatReason = (reason: EntryReason): string =>
  `${reason.code}: ${reason.message}`.slice(0, MAX_REASON_LENGTH);

const REASON_CODES: readonly EntryReasonCode[] = [
  "not_ngn",
  "needs_answer",
  "needs_fix",
  "unmarked_key",
  "check_key",
  "not_in_source",
  "relies_on_image",
  "cut_off",
  "instructor_note",
  "low_confidence",
  "scoring_conflict",
  "source_error",
  "warning",
  "duplicate",
];

/** A stored reason read back; null for text that is not one. */
export function readReason(stored: string): EntryReason | null {
  const at = stored.indexOf(": ");
  if (at < 0) return null;
  const code = stored.slice(0, at) as EntryReasonCode;
  return REASON_CODES.includes(code) ? { code, message: stored.slice(at + 2) } : null;
}

export interface StagedEntry {
  /** The question's place in its file (`MergedQuestion.position`). */
  position: number;
  /** The first chunk it was read from. */
  chunk: number;
  status: EntryStatus;
  /** The item's type, or the draft's when it did not convert; null with no NGN type. */
  type: ItemType | null;
  reasons: EntryReason[];
  /** The model's draft as it gave it, kept whatever happened to it. */
  draft: unknown;
  /** A valid item (`ready`), the converter's item with an empty key (`needs_answer`), or null. */
  item: Item | ItemInput | null;
  sourceExcerpt: string;
  group: { title: string; step: number | null } | null;
}

export type Converted =
  | { ok: false; problems: DraftProblem[] }
  | {
      ok: true;
      draft: ItemDraft;
      item: ItemInput;
      /** A valid item, when the draft converted with a key and passes `itemSchema`. */
      valid: Item | null;
      keyed: boolean;
      reasons: DraftReason[];
      /** What a repair call would be told; empty when nothing needs repairing. */
      problems: DraftProblem[];
    };

const pathOf = (path: readonly PropertyKey[]): (string | number)[] =>
  path.map((part) => (typeof part === "number" ? part : String(part)));

/** Parses and converts one draft, and lists what is wrong with it. */
export function convertDraft(raw: unknown): Converted {
  const parsed = itemDraftSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      problems: parsed.error.issues.slice(0, 10).map((issue) => ({
        path: pathOf(issue.path),
        message: issue.message,
      })),
    };
  }
  const conversion = fromDraft(parsed.data);
  const keyed = !conversion.reasons.some((reason) => reason.code === "needs_answer");
  const fixes = conversion.reasons
    .filter((reason) => reason.code === "needs_fix")
    .map((reason) => ({ path: reason.path ?? [], message: reason.message }));
  let valid: Item | null = null;
  const schemaProblems: DraftProblem[] = [];
  if (keyed && fixes.length === 0) {
    const checked = itemSchema.safeParse(conversion.item);
    if (checked.success) valid = checked.data;
    else {
      schemaProblems.push(
        ...checked.error.issues.slice(0, 10).map((issue) => ({
          path: pathOf(issue.path),
          message: issue.message,
        })),
      );
    }
  }
  return {
    ok: true,
    draft: parsed.data,
    item: conversion.item as ItemInput,
    valid,
    keyed,
    reasons: conversion.reasons,
    problems: [...fixes, ...schemaProblems],
  };
}

/** Whether a converted draft gets the one repair call. A refused key is never repaired. */
export const needsRepair = (converted: Converted): boolean =>
  !converted.ok || converted.problems.length > 0;

export interface StageInput {
  question: MergedQuestion;
  /** Undefined when the model gave no draft for it. */
  extracted: ExtractedDraft | undefined;
  /** The draft as converted (after its repair, if it had one). */
  converted: Converted | undefined;
  /** Whether the source is text (checked) or a PDF (not). */
  source: "text" | "pdf";
  /** The question's part of a text source; null when it could not be found. */
  region: string | null;
}

const RANK: Record<EntryStatus, number> = {
  ready: 0,
  needs_answer: 1,
  needs_fix: 2,
  not_importable: 3,
};
const worse = (a: EntryStatus, b: EntryStatus): EntryStatus => (RANK[a] >= RANK[b] ? a : b);

function flagReasons(question: MergedQuestion): { status: EntryStatus; reasons: EntryReason[] } {
  const reasons: EntryReason[] = [];
  let status: EntryStatus = "ready";
  if (question.flags.notInSource) {
    status = "needs_fix";
    reasons.push({
      code: "not_in_source",
      message:
        "The question's opening words were not found in the document. Check that it is really there before you keep it.",
    });
  }
  if (question.flags.reliesOnImage) {
    status = "needs_fix";
    reasons.push({
      code: "relies_on_image",
      message: "The question relies on a picture, which LeaRN does not import.",
    });
  }
  if (question.cutOff) {
    status = "needs_fix";
    reasons.push({
      code: "cut_off",
      message: "The question runs past the end of what was read, so part of it may be missing.",
    });
  }
  if (question.flags.instructorNote) {
    reasons.push({
      code: "instructor_note",
      message: "A note addressed to instructors was left out of the question.",
    });
  }
  if (question.type !== null && question.confidence < LOW_CONFIDENCE) {
    reasons.push({
      code: "low_confidence",
      message: `The question type is a guess (${question.confidence.toFixed(2)}). Change it if it is wrong.`,
    });
  }
  return { status, reasons };
}

const NO_DRAFT: EntryReason = {
  code: "needs_fix",
  message: "The AI's draft of this question could not be read. Fix it, or drop it.",
};

const UNMARKED_KEY: EntryReason = {
  code: "unmarked_key",
  message:
    "The AI marked an answer this part of the document does not show, so the question was not converted. Check the key against the document.",
};

const CHECK_KEY: EntryReason = {
  code: "check_key",
  message: "The key was read from a PDF, which could not be checked against its text. Check it.",
};

function keyBelieved(input: StageInput): boolean {
  if (input.source === "pdf") return true;
  if (input.question.answers.length > 0) return true;
  return input.region !== null && showsKey(input.region);
}

function base(input: StageInput): Omit<StagedEntry, "status" | "type" | "reasons" | "item"> {
  const { question } = input;
  return {
    position: question.position,
    chunk: question.chunks[0] ?? question.chunk,
    draft: input.extracted?.draft ?? null,
    sourceExcerpt: question.excerpt,
    group: question.group,
  };
}

/** Builds one staged entry. */
export function stageQuestion(input: StageInput): StagedEntry {
  const { question } = input;
  if (question.type === null) {
    return {
      ...base(input),
      status: "not_importable",
      type: null,
      item: null,
      reasons: [
        {
          code: "not_ngn",
          message: question.flags.notNgn || "This question has no NGN item type.",
        },
      ],
    };
  }

  const flags = flagReasons(question);
  const notes: EntryReason[] = (input.extracted?.sourceErrors ?? []).map((note) => ({
    code: "source_error",
    message: `Possible source error: ${note}`,
  }));
  const converted = input.converted;
  const finish = (
    status: EntryStatus,
    item: Item | ItemInput | null,
    reasons: EntryReason[],
  ): StagedEntry => ({
    ...base(input),
    status: worse(status, flags.status),
    type: (item?.type ?? (converted?.ok ? converted.draft.type : question.type)) as ItemType,
    item,
    reasons: [...reasons, ...flags.reasons, ...notes].slice(0, MAX_REASONS),
  });

  if (!input.extracted || !converted || !converted.ok) return finish("needs_fix", null, [NO_DRAFT]);

  const scoring: EntryReason[] = converted.reasons
    .filter((reason) => reason.code === "scoring_conflict")
    .map((reason) => ({ code: "scoring_conflict", message: reason.message }));
  if (converted.keyed && !keyBelieved(input)) return finish("needs_fix", null, [UNMARKED_KEY]);
  if (converted.problems.length > 0) {
    const fixes = converted.problems.slice(0, 5).map((problem): EntryReason => ({
      code: "needs_fix",
      message: problem.path.length
        ? `${problem.path.join(".")}: ${problem.message}`
        : problem.message,
    }));
    return finish("needs_fix", null, [...fixes, ...scoring]);
  }
  const unchecked =
    input.source === "pdf" || question.answers.some((answer) => !answer.sourceChecked);
  const check = unchecked ? [CHECK_KEY] : [];
  if (!converted.keyed || converted.valid === null) {
    const message =
      converted.reasons.find((reason) => reason.code === "needs_answer")?.message ??
      "The source marks no answer. Add the key before this question can be imported.";
    return finish("needs_answer", converted.item, [{ code: "needs_answer", message }, ...scoring]);
  }
  const warnings = itemQualityWarnings(converted.valid).map((warning): EntryReason => ({
    code: "warning",
    message: warning.message,
  }));
  return finish("ready", converted.valid, [...check, ...scoring, ...warnings]);
}
