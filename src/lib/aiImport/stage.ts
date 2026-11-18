import {
  assembleCaseStudy,
  assembleQuestion,
  fromDraft,
  itemDraftSchema,
  type AssemblyNote,
  type DraftReason,
  type ItemDraft,
} from "@/lib/ngn/draft";
import { itemQualityWarnings } from "@/lib/ngn/quality";
import {
  caseStudySchema,
  itemSchema,
  type CaseStudy,
  type Item,
  type ItemInput,
  type ItemType,
} from "@/lib/ngn/schemas";
import { LOW_CONFIDENCE } from "./config";
import type { DraftProblem, ExtractedDraft } from "./extract";
import { keyEvidence } from "./keyEvidence";
import type { MergedQuestion } from "./merge";

/**
 * Questions become staged entries (#343, ADR 0008 Pipeline steps 6-7). Pure.
 *
 * A standalone question: `fromDraft` (through #344's `assembleQuestion`, which adds its own chart
 * when it has one), then `itemSchema`, then `itemQualityWarnings`. A case study group: #344's
 * `assembleCaseStudy`, then `caseStudySchema`. The status says what the teacher must do, and each
 * reason says why, in plain words:
 *
 * - `ready`: valid, with a key the source shows.
 * - `needs_answer`: the source has no key; the key is empty and only the teacher fills it.
 * - `needs_fix`: the draft does not convert after its repair, or the question cannot stand as it
 *   was read (cut off, relies on an image, not found in the source, a chart that does not read).
 *   The draft is kept.
 * - `not_importable`: no NGN type (an open prompt, a calculation, matching, recall).
 *
 * Extract only: a draft that comes back keyed from a text source whose part of the document shows
 * no answer at all is not converted (`unmarked_key`); the model wrote that key. A key the source
 * marks only by making a choice bold, underlined or coloured is kept (#592, owner decision
 * 2026-11-17), and the entry says to check it (`check_key`), as a key read from a PDF does.
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
  | "note"
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
  "note",
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
  kind: "item" | "case_study";
  /** The question's place in its file (`MergedQuestion.position`); a case study's first step's. */
  position: number;
  /** The first chunk it was read from. */
  chunk: number;
  status: EntryStatus;
  /** The item's type, or the draft's when it did not convert; null with no NGN type or a case. */
  type: ItemType | null;
  reasons: EntryReason[];
  /** The model's draft as it gave it, kept whatever happened to it. A case study's charts and steps. */
  draft: unknown;
  /** Valid (`ready`), with an empty key (`needs_answer`), or null. */
  item: Item | ItemInput | CaseStudy | Record<string, unknown> | null;
  /**
   * What the review shows beside it (#593, `sourceOf`): the question's whole part of a text
   * source, or its opening words when that part is not known (a PDF).
   */
  sourceExcerpt: string;
  /** The segment pass's opening words, about thirty: how the question was found in the source. */
  opening: string;
  group: { title: string; step: number | null } | null;
}

export type Converted =
  | { ok: false; problems: DraftProblem[] }
  | {
      ok: true;
      draft: ItemDraft;
      item: ItemInput;
      /** What the converter itself said is wrong, in its own sentences (never a schema's). */
      fixes: DraftProblem[];
      /** A valid item, when the draft converted with a key and passes `itemSchema`. */
      valid: Item | null;
      keyed: boolean;
      reasons: DraftReason[];
      /** What a repair call would be told; empty when nothing needs repairing. */
      problems: DraftProblem[];
    };

const pathOf = (path: readonly PropertyKey[]): (string | number)[] =>
  path.map((part) => (typeof part === "number" ? part : String(part)));

const issuesOf = (issues: readonly { path: PropertyKey[]; message: string }[]): DraftProblem[] =>
  issues.slice(0, 10).map((issue) => ({ path: pathOf(issue.path), message: issue.message }));

const keyedBy = (reasons: readonly DraftReason[]) =>
  !reasons.some((reason) => reason.code === "needs_answer");

/** Parses and converts one draft (without its chart), and lists what is wrong with it. */
export function convertDraft(raw: unknown): Converted {
  const parsed = itemDraftSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, problems: issuesOf(parsed.error.issues) };
  const conversion = fromDraft(parsed.data);
  const keyed = keyedBy(conversion.reasons);
  const fixes = conversion.reasons
    .filter((reason) => reason.code === "needs_fix")
    .map((reason) => ({ path: reason.path ?? [], message: reason.message }));
  let valid: Item | null = null;
  const schemaProblems: DraftProblem[] = [];
  if (keyed && fixes.length === 0) {
    const checked = itemSchema.safeParse(conversion.item);
    if (checked.success) valid = checked.data;
    else schemaProblems.push(...issuesOf(checked.error.issues));
  }
  return {
    ok: true,
    draft: parsed.data,
    item: conversion.item as ItemInput,
    fixes,
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
  /** The output of its `standaloneChartJsonSchema()` call, when it has its own chart. */
  chart?: unknown;
  /** Notes #344's assembly gave it (a split case study group). */
  notes?: readonly AssemblyNote[];
  /** Its place in a split case study group, from 1. */
  step?: number;
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
      message: "The AI was not sure of this question's type. Change it if it is wrong.",
    });
  }
  return { status, reasons };
}

export const NO_DRAFT: EntryReason = {
  code: "needs_fix",
  message: "The AI's draft of this question could not be read. Fix it, or drop it.",
};

export const UNMARKED_KEY: EntryReason = {
  code: "unmarked_key",
  message:
    "The AI marked an answer this part of the document does not show, so the question was not converted. Check the key against the document.",
};

export const CHECK_KEY: EntryReason = {
  code: "check_key",
  message: "The key was read from a PDF, which could not be checked against its text. Check it.",
};

/** The same code as a PDF's key: either way the teacher confirms the key before trusting it. */
export const CHECK_FORMAT_KEY: EntryReason = {
  code: "check_key",
  message:
    "The key was read from bold, underlined or coloured text, which may not mark an answer. Check it.",
};

export const NEEDS_ANSWER =
  "The source marks no answer. Add the key before this question can be imported.";

/** Staging refused the question's item for a reason only a schema names; the editor lists them. */
export const NOT_BUILT: EntryReason = {
  code: "needs_fix",
  message:
    "Part of this question could not be built from the document. Open it to see what is missing.",
};

const RECORD_NOT_BUILT: EntryReason = {
  code: "needs_fix",
  message: "The question's patient record is not complete yet. Open the question to finish it.",
};

/** `ai_import_entries.source_excerpt` holds at most 20,000 characters. */
const MAX_SOURCE = 20_000;
const CUT_SHORT = "\n[…]";

/**
 * What the review shows beside a question (#593): its whole part of a text source, options,
 * marks and answer line included, so the teacher can check the key against it. A PDF has no text
 * here, and a question that could not be found has no part, so those keep the opening words.
 */
export function sourceOf(region: string | null, opening: string): string {
  const whole = region?.trim() ?? "";
  if (whole === "") return opening;
  return whole.length <= MAX_SOURCE
    ? whole
    : whole.slice(0, MAX_SOURCE - CUT_SHORT.length).trimEnd() + CUT_SHORT;
}

/**
 * Whether a key the model gave is one the source shows. A PDF's cannot be checked, and an answer
 * section printed elsewhere was checked when it was read. Otherwise the question's own part of
 * the text decides: a mark made to say "this is the answer" (`shown`), formatting alone
 * (`formatting`), or nothing (`none`).
 */
export type KeyBelief = "shown" | "formatting" | "none";

function keyBelief(
  question: MergedQuestion,
  source: "text" | "pdf",
  region: string | null,
): KeyBelief {
  if (source === "pdf") return "shown";
  if (question.answers.length > 0) return "shown";
  if (region === null) return "none";
  const evidence = keyEvidence(region);
  return evidence === "marked" ? "shown" : evidence;
}

const keyUnchecked = (question: MergedQuestion, source: "text" | "pdf") =>
  source === "pdf" || question.answers.some((answer) => !answer.sourceChecked);

/** #344's notes as reasons: a possible source error, or a note for the reviewer. */
const noteReasons = (notes: readonly AssemblyNote[] = []): EntryReason[] =>
  notes.map((note) =>
    note.code === "possible_source_error"
      ? { code: "source_error", message: `Possible source error: ${note.message}` }
      : { code: "note", message: note.message },
  );

/** "Step 3: " for something in a case study's third step (`steps.2` in the draft); else nothing. */
export const stepPrefix = (path: readonly (string | number)[] = []): string =>
  path[0] === "steps" && typeof path[1] === "number" ? `Step ${path[1] + 1}: ` : "";

/**
 * One of the converter's own sentences as a reason (#593). Its path says where in the draft, which
 * a teacher never sees: only a case study's step is named, numbered from 1 as the preview does.
 */
export const fixReason = (problem: DraftProblem): EntryReason => ({
  code: "needs_fix",
  message: `${stepPrefix(problem.path)}${problem.message}`,
});

/**
 * A case study that fails its schema, in sentences: which step, or the patient record. A schema's
 * own message ("Invalid input: expected string") is written for a developer and is never shown.
 */
export function caseIssueReasons(issues: readonly { path: PropertyKey[] }[]): EntryReason[] {
  const lines = issues.map(({ path }) => {
    if (path[0] === "items" && typeof path[1] === "number") {
      return `Step ${path[1] + 1} is not complete yet.`;
    }
    return path[0] === "ehr"
      ? "The patient record is not complete yet."
      : "The case study is not complete yet.";
  });
  return [...new Set(lines)].slice(0, 5).map((message) => ({ code: "needs_fix", message }));
}

const draftReasons = (reasons: readonly DraftReason[], code: DraftReason["code"]) =>
  reasons.filter((reason) => reason.code === code);

/** The item with its own chart attached, and what the chart adds. */
function withChart(
  converted: Extract<Converted, { ok: true }>,
  chart: unknown,
): { item: ItemInput; valid: Item | null; fixes: EntryReason[]; notes: AssemblyNote[] } {
  if (chart === undefined) {
    return { item: converted.item, valid: converted.valid, fixes: [], notes: [] };
  }
  const assembled = assembleQuestion(
    { draft: converted.draft, chart },
    {
      id: converted.item.id,
    },
  );
  const fixes = draftReasons(assembled.reasons, "needs_fix").map((reason) =>
    fixReason({ path: reason.path ?? [], message: reason.message }),
  );
  if (fixes.length > 0 || converted.valid === null) {
    return { item: assembled.item, valid: null, fixes, notes: assembled.notes };
  }
  const checked = itemSchema.safeParse(assembled.item);
  return checked.success
    ? { item: assembled.item, valid: checked.data, fixes: [], notes: assembled.notes }
    : { item: assembled.item, valid: null, fixes: [RECORD_NOT_BUILT], notes: assembled.notes };
}

/** Builds one question's staged entry. */
export function stageQuestion(input: StageInput): StagedEntry {
  const { question } = input;
  const base = {
    kind: "item" as const,
    position: question.position,
    chunk: question.chunks[0] ?? question.chunk,
    draft: input.extracted?.draft ?? null,
    sourceExcerpt: sourceOf(input.region, question.excerpt),
    opening: question.excerpt,
    group: question.group
      ? { title: question.group.title, step: input.step ?? question.group.step }
      : null,
  };
  const assembly = noteReasons(input.notes);
  if (question.type === null) {
    return {
      ...base,
      status: "not_importable",
      type: null,
      item: null,
      reasons: [
        {
          code: "not_ngn",
          message: question.flags.notNgn || "This is not a question type LeaRN can import.",
        },
        ...assembly,
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
    ...base,
    status: worse(status, flags.status),
    type: (item?.type ?? (converted?.ok ? converted.draft.type : question.type)) as ItemType,
    item,
    reasons: [...reasons, ...flags.reasons, ...assembly, ...notes].slice(0, MAX_REASONS),
  });

  if (!input.extracted || !converted || !converted.ok) return finish("needs_fix", null, [NO_DRAFT]);

  const scoring: EntryReason[] = draftReasons(converted.reasons, "scoring_conflict").map(
    (reason) => ({ code: "scoring_conflict", message: reason.message }),
  );
  const belief = keyBelief(question, input.source, input.region);
  if (converted.keyed && belief === "none") {
    return finish("needs_fix", null, [UNMARKED_KEY]);
  }
  if (converted.problems.length > 0) {
    const fixes = converted.fixes.slice(0, 5).map(fixReason);
    const unbuilt = converted.problems.length > converted.fixes.length ? [NOT_BUILT] : [];
    return finish("needs_fix", null, [...fixes, ...unbuilt, ...scoring]);
  }
  const charted = withChart(converted, input.chart);
  const chartNotes = noteReasons(charted.notes);
  if (charted.fixes.length > 0) {
    return finish("needs_fix", null, [...charted.fixes.slice(0, 5), ...scoring, ...chartNotes]);
  }
  if (!converted.keyed || charted.valid === null) {
    const message = draftReasons(converted.reasons, "needs_answer")[0]?.message ?? NEEDS_ANSWER;
    return finish("needs_answer", charted.item, [
      { code: "needs_answer", message },
      ...scoring,
      ...chartNotes,
    ]);
  }
  const check = [
    ...(keyUnchecked(question, input.source) ? [CHECK_KEY] : []),
    ...(belief === "formatting" ? [CHECK_FORMAT_KEY] : []),
  ];
  const warnings = itemQualityWarnings(charted.valid).map((warning): EntryReason => ({
    code: "warning",
    message: warning.message,
  }));
  return finish("ready", charted.valid, [...check, ...scoring, ...chartNotes, ...warnings]);
}

/** One step of a case study group, as extracted. */
export interface StageStep {
  question: MergedQuestion;
  extracted: ExtractedDraft | undefined;
  converted: Converted | undefined;
  region: string | null;
}

export interface StageCaseStudyInput {
  title: string;
  steps: readonly StageStep[];
  /** The output of the `caseStudyChartsJsonSchema()` call; undefined when it failed. */
  charts: unknown;
  source: "text" | "pdf";
}

/**
 * A case study group's staged entries, through #344's `assembleCaseStudy`. Questions with no NGN
 * type, and steps whose draft did not convert, are staged on their own. Six steps that convert
 * become one case study entry; any other count, each question on its own with #344's note.
 */
export function stageCaseStudy(input: StageCaseStudyInput): StagedEntry[] {
  const loose: StagedEntry[] = [];
  const drafted: (StageStep & { converted: Extract<Converted, { ok: true }> })[] = [];
  for (const step of input.steps) {
    if (step.question.type !== null && step.extracted && step.converted?.ok) {
      drafted.push({ ...step, converted: step.converted });
    } else {
      loose.push(stageQuestion({ ...step, source: input.source }));
    }
  }
  if (drafted.length === 0) return loose;

  const group = {
    title: input.title,
    charts: input.charts,
    steps: drafted.map((step) => step.converted.draft),
  };
  const assembled = assembleCaseStudy(group, { id: "ai_case" });
  const [first] = assembled;
  if (first.kind === "item") {
    const staged = drafted.map((step, index) =>
      stageQuestion({
        ...step,
        source: input.source,
        notes: assembled[index]?.notes ?? [],
        step: index + 1,
      }),
    );
    return [...loose, ...staged].sort((a, b) => a.position - b.position);
  }
  return [...loose, stageAssembledCase(input, drafted, first)].sort(
    (a, b) => a.position - b.position,
  );
}

function stageAssembledCase(
  input: StageCaseStudyInput,
  drafted: readonly (StageStep & { converted: Extract<Converted, { ok: true }> })[],
  assembled: Extract<ReturnType<typeof assembleCaseStudy>[number], { kind: "case_study" }>,
): StagedEntry {
  const lead = drafted[0].question;
  const prefix = (index: number) => `Step ${index + 1}: `;
  const stepFlags = drafted.flatMap((step, index) => {
    const flags = flagReasons(step.question);
    const errors = (step.extracted?.sourceErrors ?? []).map((note): EntryReason => ({
      code: "source_error",
      message: `Possible source error: ${note}`,
    }));
    return [...flags.reasons, ...errors].map((reason) => ({
      ...reason,
      message: prefix(index) + reason.message,
    }));
  });
  const flagged = drafted.some((step) => flagReasons(step.question).status === "needs_fix");
  const notes = noteReasons(assembled.notes);
  const beliefs = drafted.map((step) => keyBelief(step.question, input.source, step.region));
  const base = {
    kind: "case_study" as const,
    position: lead.position,
    chunk: lead.chunks[0] ?? lead.chunk,
    type: null,
    // Beside the model's own output, what #593's split needs to stage each step by itself as
    // `stageQuestion` would have: whether the source shows each step's key, and whether that was
    // checked. `opening` is what the duplicate pass tells one case study from another by.
    draft: {
      title: input.title,
      charts: input.charts ?? null,
      steps: drafted.map((step) => step.extracted?.draft ?? null),
      opening: lead.excerpt,
      keys: beliefs,
      unchecked: drafted.map((step) => keyUnchecked(step.question, input.source)),
    },
    // The steps' parts of the document, one after another as the document has them.
    sourceExcerpt: sourceOf(drafted.map((step) => step.region ?? "").join(""), lead.excerpt),
    opening: lead.excerpt,
    group: { title: input.title, step: null },
  };
  const finish = (status: EntryStatus, item: StagedEntry["item"], reasons: EntryReason[]) => ({
    ...base,
    status: flagged ? worse(status, "needs_fix") : status,
    item,
    reasons: [...reasons, ...stepFlags, ...notes].slice(0, MAX_REASONS),
  });

  const invented = drafted.flatMap((step, index): EntryReason[] =>
    step.converted.keyed && beliefs[index] === "none"
      ? [{ ...UNMARKED_KEY, message: prefix(index) + UNMARKED_KEY.message }]
      : [],
  );
  if (invented.length > 0) return finish("needs_fix", null, invented);
  const fixes = draftReasons(assembled.reasons, "needs_fix").map((reason) =>
    fixReason({ path: reason.path ?? [], message: reason.message }),
  );
  const scoring = draftReasons(assembled.reasons, "scoring_conflict").map(
    (reason): EntryReason => ({ code: "scoring_conflict", message: reason.message }),
  );
  if (fixes.length > 0) return finish("needs_fix", null, [...fixes.slice(0, 5), ...scoring]);
  const unanswered = draftReasons(assembled.reasons, "needs_answer").map((reason): EntryReason => ({
    code: "needs_answer",
    message: `${stepPrefix(reason.path)}${reason.message}`,
  }));
  if (unanswered.length > 0) {
    return finish("needs_answer", assembled.caseStudy as Record<string, unknown>, [
      ...unanswered.slice(0, 6),
      ...scoring,
    ]);
  }
  const checked = caseStudySchema.safeParse(assembled.caseStudy);
  if (!checked.success) {
    return finish("needs_fix", null, [...caseIssueReasons(checked.error.issues), ...scoring]);
  }
  const check = [
    ...(drafted.some((step) => keyUnchecked(step.question, input.source)) ? [CHECK_KEY] : []),
    ...drafted.flatMap((step, index): EntryReason[] =>
      step.converted.keyed && beliefs[index] === "formatting"
        ? [{ ...CHECK_FORMAT_KEY, message: prefix(index) + CHECK_FORMAT_KEY.message }]
        : [],
    ),
  ];
  const warnings = checked.data.items.flatMap((item, index) =>
    itemQualityWarnings(item).map((warning): EntryReason => ({
      code: "warning",
      message: prefix(index) + warning.message,
    })),
  );
  return finish("ready", checked.data, [...check, ...scoring, ...warnings]);
}
