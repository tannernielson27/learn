import {
  caseStudyDraftSchema,
  chartsOf,
  fromCaseStudyDraft,
  fromDraft,
  itemDraftSchema,
  type DraftReason,
} from "@/lib/ngn/draft";
import { ITEM_TYPES, itemSchema, type EhrRecord, type ItemInput } from "@/lib/ngn/schemas";
import {
  asCaseStudy,
  asItem,
  NOT_IMPORTABLE,
  type ExpectedDocument,
  type ExpectedImportable,
  type RecordedQuestion,
  type Recording,
} from "./files";
import { signatureOf, type ItemSignature } from "./signature";

/**
 * The accuracy scorer (#339): compares what the pipeline returned for a document with what the
 * document should import as. Pure, so CI runs it on recorded responses and `pnpm eval:ai-import`
 * runs it on live ones.
 */

/** One expected question, scored. A check that does not apply (a key for an open prompt) is null. */
export interface QuestionResult {
  document: string;
  label: string;
  /** The expected type, or `not_importable`. */
  bucket: string;
  /** The pipeline returned an entry for this question. */
  found: boolean;
  /** It was typed as expected (or put in the not-importable bucket). */
  type: boolean;
  /** Its key matches exactly; for a question the source leaves unmarked, it has no key. */
  key: boolean | null;
  stem: boolean | null;
  options: boolean | null;
  /** It converts with no `needs_fix`, and a keyed question passes itemSchema. */
  valid: boolean | null;
  /** The source marks no answer, and the pipeline came back with one. Never acceptable. */
  inventedKey: boolean;
  notes: string[];
}

export interface CaseStudyResult {
  document: string;
  label: string;
  found: boolean;
  /** The patient header and the chart as each of the six steps shows it match. */
  chart: boolean;
  notes: string[];
}

export interface DocumentScore {
  document: string;
  questions: QuestionResult[];
  caseStudies: CaseStudyResult[];
  /** Openings of entries the pipeline returned that match no question in the source. */
  extras: string[];
}

const MATCH_WORDS = 12;
const MATCH_THRESHOLD = 0.5;

const words = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9%./]+/g, " ")
    .split(" ")
    .filter((word) => word !== "")
    .slice(0, MATCH_WORDS);

/** How alike two openings are: the Dice coefficient of their first words, 0 to 1. */
export function similarity(a: string, b: string): number {
  const left = new Set(words(a));
  const right = new Set(words(b));
  if (left.size === 0 || right.size === 0) return 0;
  const shared = [...left].filter((word) => right.has(word)).length;
  return (2 * shared) / (left.size + right.size);
}

const draftStem = (draft: unknown): string | undefined => {
  const stem = (draft as { stem?: unknown } | null | undefined)?.stem;
  return typeof stem === "string" ? stem : undefined;
};

const expectedText = (question: ExpectedDocument["questions"][number]): string =>
  question.status === NOT_IMPORTABLE ? question.opening : asItem(question).stem.value;

/** Pairs each expected question with at most one recorded entry, most alike first. */
function matchQuestions(
  expected: ExpectedDocument["questions"],
  recorded: RecordedQuestion[],
): Map<number, number> {
  const pairs: { e: number; r: number; score: number }[] = [];
  expected.forEach((question, e) => {
    const text = expectedText(question);
    recorded.forEach((entry, r) => {
      const stem = draftStem(entry.draft);
      const score = Math.max(similarity(text, entry.opening), stem ? similarity(text, stem) : 0);
      if (score >= MATCH_THRESHOLD) pairs.push({ e, r, score });
    });
  });
  pairs.sort((a, b) => b.score - a.score || a.e - b.e || a.r - b.r);
  const matched = new Map<number, number>();
  const used = new Set<number>();
  for (const { e, r } of pairs) {
    if (matched.has(e) || used.has(r)) continue;
    matched.set(e, r);
    used.add(r);
  }
  return matched;
}

const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((value, index) => value === b[index]);

const quote = (values: readonly string[]): string =>
  values.length === 0 ? "none" : values.map((value) => `"${value}"`).join(", ");

const missed = (document: string, label: string, bucket: string, applies: boolean) => ({
  document,
  label,
  bucket,
  found: false,
  type: false,
  key: applies ? false : null,
  stem: applies ? false : null,
  options: applies ? false : null,
  valid: applies ? false : null,
  inventedKey: false,
});

/** Scores one converted item against the item it should be. */
export function scoreConverted(
  where: { document: string; label: string },
  expected: { item: ItemInput; status: ExpectedImportable["status"] },
  converted: { item: ItemInput; reasons: DraftReason[] },
): QuestionResult {
  const want: ItemSignature = signatureOf(expected.item);
  const got: ItemSignature = signatureOf(converted.item);
  const notes: string[] = [];
  const type = got.type === want.type;
  if (!type) notes.push(`typed ${got.type}, expected ${want.type}`);

  const unmarked = expected.status === "needs_answer";
  const needsAnswer = converted.reasons.some((reason) => reason.code === "needs_answer");
  // A draft that marks options the source leaves unmarked invented a key, even when the
  // converter then refuses it (two marks on a single-answer question convert to no key).
  const inventedKey = unmarked && (got.key.length > 0 || !needsAnswer);
  const key = unmarked ? !inventedKey : !needsAnswer && sameList(got.key, want.key);
  if (inventedKey) {
    notes.push(
      got.key.length > 0
        ? `invented a key the source does not have: ${quote(got.key)}`
        : "invented a key the source does not have (marks the converter could not use)",
    );
  } else if (!key) notes.push(`key ${quote(got.key)}, expected ${quote(want.key)}`);

  const stem = got.stem === want.stem;
  if (!stem) notes.push(`stem "${got.stem}", expected "${want.stem}"`);
  const options = sameList(got.options, want.options);
  if (!options) notes.push(`options ${quote(got.options)}, expected ${quote(want.options)}`);

  const fixes = converted.reasons.filter((reason) => reason.code === "needs_fix");
  const valid = fixes.length === 0 && (unmarked || itemSchema.safeParse(converted.item).success);
  if (fixes.length > 0) notes.push(...fixes.map((reason) => `needs fix: ${reason.message}`));
  else if (!valid) notes.push("does not pass itemSchema");

  return {
    ...where,
    bucket: want.type,
    found: true,
    type,
    key,
    stem,
    options,
    valid,
    inventedKey,
    notes,
  };
}

function scoreQuestion(
  document: string,
  expected: ExpectedDocument["questions"][number],
  recorded: RecordedQuestion | undefined,
  index: number,
): QuestionResult {
  const where = { document, label: expected.label };
  if (expected.status === NOT_IMPORTABLE) {
    if (!recorded)
      return { ...missed(document, expected.label, NOT_IMPORTABLE, false), notes: ["not found"] };
    const type = recorded.type === NOT_IMPORTABLE;
    return {
      ...missed(document, expected.label, NOT_IMPORTABLE, false),
      found: true,
      type,
      notes: type ? [] : [`typed ${recorded.type}, expected not importable`],
    };
  }
  const bucket = asItem(expected).type;
  if (!recorded) return { ...missed(document, expected.label, bucket, true), notes: ["not found"] };
  if (recorded.type === NOT_IMPORTABLE) {
    return {
      ...missed(document, expected.label, bucket, true),
      found: true,
      notes: [`put in the not-importable bucket: ${recorded.reason ?? "no reason given"}`],
    };
  }
  const draft = itemDraftSchema.safeParse(recorded.draft);
  if (!draft.success) {
    return {
      ...missed(document, expected.label, bucket, true),
      found: true,
      type: recorded.type === bucket,
      notes: ["the draft does not parse as an item draft"],
    };
  }
  const converted = fromDraft(draft.data, { id: `eval_${index + 1}` });
  return scoreConverted(where, { item: asItem(expected), status: expected.status }, converted);
}

const chartOf = (ehr: Pick<EhrRecord, "patientHeader" | "timePoints" | "tabs">): string =>
  JSON.stringify({ header: ehr.patientHeader, charts: chartsOf(ehr as EhrRecord) });

function scoreCaseStudy(
  document: string,
  expected: ExpectedDocument["caseStudies"][number],
  recorded: unknown,
): { caseStudy: CaseStudyResult; steps: QuestionResult[] } {
  const want = asCaseStudy(expected.caseStudy);
  const stepLabel = (index: number) => `${expected.label}, step ${index + 1}`;
  const stepStatus = (item: ItemInput) =>
    signatureOf(item).key.length > 0 ? "ready" : "needs_answer";
  const parsed = recorded === undefined ? undefined : caseStudyDraftSchema.safeParse(recorded);
  if (!parsed?.success) {
    const note = parsed ? "the case study draft does not parse" : "not found";
    return {
      caseStudy: {
        document,
        label: expected.label,
        found: parsed !== undefined,
        chart: false,
        notes: [note],
      },
      steps: want.items.map((item, index) => ({
        ...missed(document, stepLabel(index), item.type, true),
        notes: [note],
      })),
    };
  }
  const converted = fromCaseStudyDraft(parsed.data, { id: "eval_case" });
  const chart = chartOf(converted.caseStudy.ehr as EhrRecord) === chartOf(want.ehr);
  const steps = want.items.map((item, index) => {
    const got = converted.caseStudy.items[index] as ItemInput | undefined;
    if (!got)
      return { ...missed(document, stepLabel(index), item.type, true), notes: ["step not found"] };
    const reasons = converted.reasons
      .filter((reason) => reason.path?.[0] === "steps" && reason.path[1] === index)
      .map((reason) => ({ ...reason, path: reason.path?.slice(2) }));
    return scoreConverted(
      { document, label: stepLabel(index) },
      { item: item as ItemInput, status: stepStatus(item as ItemInput) },
      { item: got, reasons },
    );
  });
  const chartNotes = converted.reasons
    .filter((reason) => reason.path?.[0] !== "steps")
    .map((reason) => reason.message);
  return {
    caseStudy: {
      document,
      label: expected.label,
      found: true,
      chart,
      notes: chart ? chartNotes : ["the chart differs from the expected one", ...chartNotes],
    },
    steps,
  };
}

/** Scores one document's recording against its expected output. */
export function scoreDocument(
  expected: ExpectedDocument,
  recording: Recording | undefined,
): DocumentScore {
  const recorded = recording?.questions ?? [];
  const matched = matchQuestions(expected.questions, recorded);
  const questions = expected.questions.map((question, index) => {
    const r = matched.get(index);
    return scoreQuestion(
      expected.document,
      question,
      r === undefined ? undefined : recorded[r],
      index,
    );
  });
  const used = new Set(matched.values());
  const extras = recorded.flatMap((entry, index) => (used.has(index) ? [] : [entry.opening]));

  const drafts = recording?.caseStudies ?? [];
  const takenDrafts = new Set<number>();
  const caseStudies: CaseStudyResult[] = [];
  for (const expectedCase of expected.caseStudies) {
    const title = String(expectedCase.caseStudy.title ?? expectedCase.label);
    const pick = drafts.findIndex(
      (entry, index) =>
        !takenDrafts.has(index) &&
        similarity(title, String((entry.draft as { title?: unknown } | null)?.title ?? "")) >=
          MATCH_THRESHOLD,
    );
    if (pick >= 0) takenDrafts.add(pick);
    const scored = scoreCaseStudy(
      expected.document,
      expectedCase,
      pick >= 0 ? drafts[pick].draft : undefined,
    );
    caseStudies.push(scored.caseStudy);
    questions.push(...scored.steps);
  }
  drafts.forEach((entry, index) => {
    if (!takenDrafts.has(index)) {
      extras.push(
        `case study "${String((entry.draft as { title?: unknown } | null)?.title ?? "")}"`,
      );
    }
  });
  return { document: expected.document, questions, caseStudies, extras };
}

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

export interface Tally {
  passed: number;
  of: number;
}

export interface BucketRow {
  bucket: string;
  count: number;
  type: Tally;
  key: Tally;
  stem: Tally;
  options: Tally;
  valid: Tally;
}

export interface EvalReport {
  documents: DocumentScore[];
  rows: BucketRow[];
  total: BucketRow;
  caseStudies: Tally;
  extras: number;
  inventedKeys: number;
}

const tally = (results: QuestionResult[], check: keyof QuestionResult): Tally => {
  const applies = results.filter((result) => result[check] !== null);
  return { passed: applies.filter((result) => result[check] === true).length, of: applies.length };
};

const rowOf = (bucket: string, results: QuestionResult[]): BucketRow => ({
  bucket,
  count: results.length,
  type: tally(results, "type"),
  key: tally(results, "key"),
  stem: tally(results, "stem"),
  options: tally(results, "options"),
  valid: tally(results, "valid"),
});

export function buildReport(documents: DocumentScore[]): EvalReport {
  const results = documents.flatMap((document) => document.questions);
  const order = [...ITEM_TYPES, NOT_IMPORTABLE] as string[];
  const rows = order
    .map((bucket) =>
      rowOf(
        bucket,
        results.filter((result) => result.bucket === bucket),
      ),
    )
    .filter((row) => row.count > 0);
  const cases = documents.flatMap((document) => document.caseStudies);
  return {
    documents,
    rows,
    total: rowOf("all", results),
    caseStudies: { passed: cases.filter((c) => c.found && c.chart).length, of: cases.length },
    extras: documents.reduce((sum, document) => sum + document.extras.length, 0),
    inventedKeys: results.filter((result) => result.inventedKey).length,
  };
}

const allPassed = ({ passed, of }: Tally) => passed === of;

/** Every question found and right on every check, no extras, and every chart right. */
export function isPerfect(report: EvalReport): boolean {
  const { type, key, stem, options, valid } = report.total;
  return (
    [type, key, stem, options, valid, report.caseStudies].every(allPassed) &&
    report.extras === 0 &&
    report.inventedKeys === 0
  );
}

const cell = ({ passed, of }: Tally): string =>
  of === 0 ? "n/a" : `${passed}/${of} (${Math.round((100 * passed) / of)}%)`;

/** The per-type table, then every failure, as markdown. */
export function formatReport(report: EvalReport): string {
  const head = [
    "| Type | Questions | Type right | Key exact | Stem | Options | Valid |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];
  const line = (row: BucketRow) =>
    `| ${row.bucket} | ${row.count} | ${cell(row.type)} | ${cell(row.key)} | ${cell(row.stem)} | ${cell(row.options)} | ${cell(row.valid)} |`;
  const failures = report.documents.flatMap((document) => [
    ...document.questions
      .filter((result) => result.notes.length > 0)
      .map((result) => `- ${document.document} › ${result.label}: ${result.notes.join("; ")}`),
    ...document.caseStudies
      .filter((result) => result.notes.length > 0)
      .map((result) => `- ${document.document} › ${result.label}: ${result.notes.join("; ")}`),
    ...document.extras.map(
      (opening) => `- ${document.document}: an entry the source does not have ("${opening}")`,
    ),
  ]);
  return [
    ...head,
    ...report.rows.map(line),
    line({ ...report.total, bucket: "**all**" }),
    "",
    `Case studies with the right chart at every step: ${cell(report.caseStudies)}.`,
    `Entries the source does not have: ${report.extras}. Keys invented for unmarked questions: ${report.inventedKeys}.`,
    "",
    ...(failures.length > 0 ? ["Failures:", "", ...failures] : ["No failures."]),
    "",
  ].join("\n");
}
