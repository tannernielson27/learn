import { caseSteps, stepIsKeyed, stepOfReason, stepType } from "@/lib/authoring/aiImportCaseStudy";
import {
  readStoredReasons,
  restoredStatus,
  type ReviewStatus,
} from "@/lib/authoring/aiImportReview";
import { itemQualityWarnings } from "@/lib/ngn/quality";
import { caseStudySchema, itemSchema, type Item, type ItemType } from "@/lib/ngn/schemas";
import { POSITIONS_PER_FILE, placeOf } from "../places";
import {
  CHECK_FORMAT_KEY,
  CHECK_KEY,
  MAX_REASONS,
  NEEDS_ANSWER,
  NOT_BUILT,
  UNMARKED_KEY,
  caseIssueReasons,
  convertDraft,
  fixReason,
  formatReason,
  readReason,
  type EntryReason,
  type KeyBelief,
} from "../stage";

/**
 * The two ways out of a staged case study that needs the teacher (#593, owner decision
 * 2026-11-17). Pure: what a save or a split writes, worked out from the stored entry.
 *
 * - **Add the key per step** (`withStepSaved`): one step question, saved from its type's own
 *   editor, put back into the case study. When every step is keyed and the whole passes
 *   `caseStudySchema`, the case study is ready.
 * - **Split** (`splitSteps`, `placeSteps`): the case study becomes six separate questions, each
 *   with the status `stageQuestion` would have given it on its own. The patient record is not
 *   attached to any of them, and each one says so.
 *
 * The AI never writes a key (ADR 0008 "Extract only"), and neither path lets one in: a step whose
 * key the document does not show is split with no item, exactly as a single question is staged.
 */

type Status = Exclude<ReviewStatus, "dropped">;

/** About the batch or the source, not the step's state: a teacher's save leaves them. */
const KEPT_CODES: readonly string[] = ["duplicate", "instructor_note", "source_error", "note"];

interface Parsed {
  code: string;
  step: number | null;
  /** The reason's words without its step. */
  message: string;
  stored: string;
}

function parseReasons(stored: readonly string[]): Parsed[] {
  return stored.map((text) => {
    const reason = readReason(text) ?? { code: "note", message: text };
    return { code: reason.code, ...stepOfReason(reason.message), stored: text };
  });
}

const stepReason = (step: number, reason: EntryReason): string =>
  formatReason({ ...reason, message: `Step ${step}: ${reason.message}` });

const warningsOf = (item: Item): EntryReason[] =>
  itemQualityWarnings(item).map((warning) => ({ code: "warning", message: warning.message }));

export interface SavedCase {
  item: Record<string, unknown>;
  status: Status;
  reasons: string[];
}

/**
 * A case study entry with `saved` as its step `step` (from 1). The step keeps its own id and its
 * place decides its clinical judgment step, whatever the form sent; a record of its own is left
 * out, since the case study owns the patient record. Null when the entry holds no step questions.
 */
export function withStepSaved(
  row: { item: unknown; reasons: readonly string[] },
  step: number,
  saved: Item,
): SavedCase | null {
  const steps = caseSteps(row.item);
  const old = steps?.[step - 1];
  if (!steps || !old) return null;
  const question = Object.fromEntries(Object.entries(saved).filter(([key]) => key !== "ehr"));
  const items = steps.map((existing, index) =>
    index === step - 1 ? { ...question, id: existing.id, cjmmStep: step } : existing,
  );
  const item = { ...(row.item as Record<string, unknown>), items };

  // What the save answers goes: this step's own flags, every "needs an answer" line (worked out
  // again below) and whatever an earlier save said about the whole case study.
  const kept = parseReasons(row.reasons).filter((reason) => {
    if (reason.code === "needs_answer") return false;
    if (reason.step === null) return reason.code !== "needs_fix";
    return reason.step !== step || KEPT_CODES.includes(reason.code);
  });
  const unkeyed = items.flatMap((question, index) =>
    stepIsKeyed(question)
      ? []
      : [stepReason(index + 1, { code: "needs_answer", message: NEEDS_ANSWER })],
  );
  const checked = unkeyed.length === 0 ? caseStudySchema.safeParse(item) : null;
  const unbuilt = checked && !checked.success ? caseIssueReasons(checked.error.issues) : [];
  const reasons = [
    ...unkeyed,
    ...unbuilt.map(formatReason),
    ...kept.map((reason) => reason.stored),
    ...warningsOf({ ...saved, cjmmStep: step as Item["cjmmStep"] }).map((warning) =>
      stepReason(step, warning),
    ),
  ].slice(0, MAX_REASONS);
  const status = restoredStatus({
    kind: "case_study",
    type: null,
    item,
    reasons: readStoredReasons(reasons),
  });
  return { item, status, reasons };
}

/**
 * The entry's draft with `step` noted as saved by the teacher. A split does not ask the teacher
 * to check again a key they marked and saved themselves (`splitSteps`), and nothing else on the
 * entry says which steps those are.
 */
export function draftWithSaved(draft: unknown, step: number): Record<string, unknown> {
  const base =
    typeof draft === "object" && draft !== null && !Array.isArray(draft)
      ? (draft as Record<string, unknown>)
      : {};
  const before = (listOf(base, "saved") ?? []).filter((n) => typeof n === "number");
  return { ...base, saved: [...new Set([...before, step])].sort() };
}

export interface SplitStep {
  /** From 1; the first takes the case study's own row. */
  step: number;
  type: ItemType;
  status: Status;
  reasons: string[];
  item: unknown;
  draft: unknown;
}

/** A step's own flags that still stand when it is a question by itself. */
const CARRIED_CODES = [
  "not_in_source",
  "relies_on_image",
  "cut_off",
  "instructor_note",
  "low_confidence",
  "source_error",
  "scoring_conflict",
  "check_key",
];

const BELIEFS: readonly KeyBelief[] = ["shown", "formatting", "none"];

const listOf = (value: unknown, key: string): unknown[] | null => {
  const list = (value as Record<string, unknown> | null)?.[key];
  return Array.isArray(list) ? list : null;
};

/**
 * Whether the document shows step `step`'s key, for a case study staged with no item. Since #593
 * the draft says so for each step. An older batch names only the first step whose key the
 * document does not show, so that step and every one after it are treated as unshown.
 */
function beliefOf(draft: unknown, reasons: readonly Parsed[], step: number): KeyBelief {
  const stored = listOf(draft, "keys")?.[step - 1];
  if (BELIEFS.includes(stored as KeyBelief)) return stored as KeyBelief;
  const unshown = reasons
    .filter((reason) => reason.code === "unmarked_key" && reason.step !== null)
    .map((reason) => reason.step!);
  return unshown.length > 0 && step >= Math.min(...unshown) ? "none" : "shown";
}

/** One step from the model's draft, as `stageQuestion` stages a question; null if it cannot be read. */
function stepFromDraft(
  raw: unknown,
  belief: KeyBelief,
  unchecked: boolean,
): (Pick<SplitStep, "type" | "item"> & { reasons: EntryReason[] }) | null {
  const converted = convertDraft(raw);
  if (!converted.ok) return null;
  const type = converted.draft.type as ItemType;
  if (converted.keyed && belief === "none") return { type, item: null, reasons: [UNMARKED_KEY] };
  if (converted.problems.length > 0) {
    const unbuilt = converted.problems.length > converted.fixes.length ? [NOT_BUILT] : [];
    return {
      type,
      item: null,
      reasons: [...converted.fixes.slice(0, 5).map(fixReason), ...unbuilt],
    };
  }
  if (!converted.keyed || converted.valid === null) {
    const message =
      converted.reasons.find((reason) => reason.code === "needs_answer")?.message ?? NEEDS_ANSWER;
    return { type, item: converted.item, reasons: [{ code: "needs_answer", message }] };
  }
  return {
    type,
    item: converted.valid,
    reasons: [
      ...(unchecked ? [CHECK_KEY] : []),
      ...(belief === "formatting" ? [CHECK_FORMAT_KEY] : []),
      ...warningsOf(converted.valid),
    ],
  };
}

/** One step from the case study's item, which may carry a key the teacher added. */
function stepFromItem(
  question: Record<string, unknown>,
): (Pick<SplitStep, "type" | "item"> & { reasons: EntryReason[] }) | null {
  const type = stepType(question);
  if (type === null) return null;
  const parsed = itemSchema.safeParse(question);
  return parsed.success
    ? { type, item: parsed.data, reasons: warningsOf(parsed.data) }
    : { type, item: question, reasons: [{ code: "needs_answer", message: NEEDS_ANSWER }] };
}

/**
 * A staged case study as six separate questions, step 1 first; null when it cannot be split (its
 * steps were not kept, or one is of no type an editor opens). `pdf` says the source was a PDF,
 * whose keys could not be checked against any text.
 */
export function splitSteps(row: {
  item: unknown;
  draft: unknown;
  reasons: readonly string[];
  title: string;
  pdf: boolean;
}): SplitStep[] | null {
  const reasons = parseReasons(row.reasons);
  const fromItem = caseSteps(row.item);
  const drafts = listOf(row.draft, "steps");
  if (!fromItem && drafts?.length !== 6) return null;
  const note = formatReason({
    code: "note",
    message: `Split from the case study "${row.title}". The patient record was not attached.`,
  });
  // Whether a step's key went unchecked against the document. Since #593 the draft says so for
  // each step. Before that a key read from a PDF was flagged once for the whole case study, and
  // only once it was ready, so the source being a PDF is asked as well.
  const caseCheck = reasons.some((reason) => reason.code === "check_key" && reason.step === null);
  const uncheckedAt = (step: number): boolean => {
    const stored = listOf(row.draft, "unchecked")?.[step - 1];
    return typeof stored === "boolean" ? stored : caseCheck || row.pdf;
  };

  const saved = listOf(row.draft, "saved") ?? [];

  const steps: SplitStep[] = [];
  for (let step = 1; step <= 6; step += 1) {
    const draft = drafts?.[step - 1] ?? null;
    const belief = beliefOf(row.draft, reasons, step);
    const built = fromItem
      ? stepFromItem(fromItem[step - 1]!)
      : stepFromDraft(draft, belief, uncheckedAt(step));
    if (!built) return null;
    const carried = reasons
      .filter(
        (reason) =>
          reason.step === step &&
          CARRIED_CODES.includes(reason.code) &&
          !(reason.code === "check_key" && saved.includes(step)),
      )
      .map((reason) => formatReason({ code: reason.code, message: reason.message } as EntryReason));
    // A step taken from the case study's item was never asked these two when it was staged.
    // One the teacher has saved is not asked at all: its key is theirs now.
    const keyedFromItem =
      fromItem !== null && built.reasons.every((r) => r.code !== "needs_answer");
    const checks =
      keyedFromItem && !saved.includes(step)
        ? [
            ...(uncheckedAt(step) ? [CHECK_KEY] : []),
            ...(belief === "formatting" ? [CHECK_FORMAT_KEY] : []),
          ]
        : [];
    const stored = [
      ...new Set([...built.reasons, ...checks].map(formatReason).concat(carried, note)),
    ].slice(0, MAX_REASONS);
    steps.push({
      step,
      type: built.type,
      item: built.item,
      draft,
      reasons: stored,
      status: restoredStatus({
        kind: "item",
        type: built.type,
        item: built.item,
        reasons: readStoredReasons(stored),
      }),
    });
  }
  return steps;
}

/**
 * Where a split case study's steps 2 to 6 go. A case study sits at its first step's place and its
 * other steps' own places after it were never used (`stageCaseStudy`), so the next free places
 * after it are theirs, and a change of type on one of them reads the right question again. They
 * stay inside the file's thousand (`place × 1000 + n`), or a later file's questions would be
 * listed under the wrong file. Null when the file has no five free places left.
 */
export function placeSteps(lead: number, taken: ReadonlySet<number>): number[] | null {
  const end = (placeOf(lead) + 1) * POSITIONS_PER_FILE;
  const free: number[] = [];
  for (let position = lead + 1; position < end && free.length < 5; position += 1) {
    if (!taken.has(position)) free.push(position);
  }
  return free.length === 5 ? free : null;
}
