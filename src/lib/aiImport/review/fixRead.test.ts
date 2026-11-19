import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fromMatrixMultipleChoiceDraft, type MatrixMultipleChoiceDraft } from "@/lib/ngn/draft";
import { sampleCaseStudy } from "@/lib/ngn/fixtures";
import { caseStudySchema } from "@/lib/ngn/schemas";
import { REMOVED_REASON } from "../files/reasons";
import { BANK, BATCH, ORG, fakeClient, type Reply } from "../upload/testing/fakeSupabase";
import { attentionTargets, nextTarget, readFixEntry } from "./fixRead";

const ENTRY = "00000000-0000-4000-8000-0000000000e1";
const OTHER = "00000000-0000-4000-8000-0000000000e2";
const CASE = "00000000-0000-4000-8000-0000000000e3";
const CHUNK = "00000000-0000-4000-8000-0000000000c9";

// A fictional matrix, as the Malnutrition sample's shape: the source marks no answer.
const draft: MatrixMultipleChoiceDraft = {
  type: "matrix_multiple_choice",
  stem: "For each finding, choose whether it is expected or unexpected.",
  columns: ["Expected", "Unexpected"],
  rows: [
    { text: "Weight loss of 3 kg", cells: ["", ""] },
    { text: "Serum albumin 2.4 g/dL", cells: ["", ""] },
  ],
};
const keyless = fromMatrixMultipleChoiceDraft(draft).item;
const keyedDraft = {
  ...draft,
  rows: draft.rows.map((row) => ({ ...row, cells: ["*", ""] })),
};

const whole = caseStudySchema.parse(sampleCaseStudy);
/** The sample case study with step 4's key taken out, as staging leaves an unmarked step. */
const staged = {
  ...whole,
  items: whole.items.map((item, index) => {
    if (index !== 3) return item;
    return Object.fromEntries(Object.entries(item).filter(([key]) => key !== "answerKey"));
  }),
};
const NEEDS_ANSWER =
  "The source marks no answer. Add the key before this question can be imported.";

const row = (over: Record<string, unknown> = {}): Reply => ({
  data: {
    id: ENTRY,
    version: 3,
    position: 2,
    kind: "item",
    type: "matrix_multiple_choice",
    status: "needs_answer",
    reasons: [`needs_answer: ${NEEDS_ANSWER}`, "duplicate: The same question as Question 1."],
    source_excerpt: "For each finding...",
    item: keyless,
    group_key: null,
    step: null,
    chunk_id: null,
    ...over,
  },
});
const caseRow = (over: Record<string, unknown> = {}): Reply =>
  row({
    id: CASE,
    position: 5,
    kind: "case_study",
    type: null,
    reasons: [`needs_answer: Step 4: ${NEEDS_ANSWER}`, "cut_off: Step 2: It runs past the end."],
    item: staged,
    group_key: "Pulmonary embolism",
    ...over,
  });
const inReview: Reply = { data: { status: "review" } };
type Light = Parameters<typeof attentionTargets>[0][number];
const light = (id: string, position: number, over: Partial<Light> = {}): Light => ({
  id,
  position,
  kind: "item",
  type: "matrix_multiple_choice",
  status: "ready",
  ...over,
});
const FILES: Reply = {
  data: [{ original_name: "Cardiac.pdf", status: "ready", rejected_reason: null }],
};

function read(
  options: {
    entry?: Reply;
    batch?: Reply;
    order?: Reply;
    files?: Reply;
    /** Answers for the reads that follow: the entry's chunk, then the waiting case studies. */
    chunks?: Reply[];
    cases?: Reply;
    ids?: { entryId?: string; step?: number };
  } = {},
) {
  const client = fakeClient({
    ai_import_batches: [options.batch ?? inReview],
    ai_import_entries: [
      options.entry ?? row(),
      options.order ?? {
        data: [light(OTHER, 1), light(ENTRY, 2, { status: "needs_answer" })],
      },
      ...(options.cases ? [options.cases] : []),
    ],
    ai_import_files: [options.files ?? FILES],
    ai_import_chunks: options.chunks ?? [],
  });
  const ids = { bankId: BANK, batchId: BATCH, entryId: ENTRY, ...options.ids };
  return { client, result: readFixEntry(client.client, ORG, ids) };
}

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

describe("readFixEntry", () => {
  it("reads the question, its number and what the editor opens on, for this workspace and quiz", async () => {
    const { client, result } = read({ entry: row({ draft }) });
    expect(await result).toEqual({
      batchStatus: "review",
      entry: {
        id: ENTRY,
        version: 3,
        type: "matrix_multiple_choice",
        status: "needs_answer",
        reasons: [
          { code: "needs_answer", message: NEEDS_ANSWER },
          { code: "duplicate", message: "The same question as Question 1." },
        ],
        sourceExcerpt: "For each finding...",
        sourcePages: null,
        fileName: "Cardiac.pdf",
        number: 2,
        start: keyless,
        caseStudy: null,
        next: null,
      },
    });
    expect(client.stepsOn("ai_import_batches", "eq")).toEqual([
      ["id", BATCH],
      ["org_id", ORG],
      ["bank_id", BANK],
    ]);
    for (const table of ["ai_import_entries", "ai_import_files"]) {
      expect(client.stepsOn(table, "eq")).toContainEqual(["org_id", ORG]);
    }
  });

  it("opens an unconverted question on its draft, without a key the document does not show", async () => {
    const { result } = read({
      entry: row({
        item: null,
        draft: keyedDraft,
        status: "needs_fix",
        reasons: ["unmarked_key: The AI marked an answer."],
      }),
    });
    const entry = (await result) as { entry: { start: Record<string, unknown> } };
    expect(entry.entry.start).not.toHaveProperty("answerKey");
  });

  it("says which pages of a PDF the question was read from", async () => {
    const { client, result } = read({
      entry: row({ chunk_id: CHUNK }),
      chunks: [{ data: [{ id: CHUNK, page_from: 3, page_to: 10 }] }],
    });
    expect(await result).toMatchObject({ entry: { sourcePages: { from: 3, to: 10 } } });
    expect(client.stepsOn("ai_import_chunks", "eq")).toEqual([
      ["id", CHUNK],
      ["batch_id", BATCH],
      ["org_id", ORG],
    ]);
    // A text file's chunk has no pages.
    const text = read({
      entry: row({ chunk_id: CHUNK }),
      chunks: [{ data: [{ id: CHUNK, page_from: null, page_to: null }] }],
    });
    expect(await text.result).toMatchObject({ entry: { sourcePages: null } });
  });

  it("opens one step of a case study on that step's question, with its own reasons", async () => {
    const order = {
      data: [
        light(ENTRY, 2),
        light(CASE, 5, { kind: "case_study", type: null, status: "needs_fix" }),
      ],
    };
    const { result } = read({
      entry: caseRow(),
      order,
      cases: {
        data: [
          { id: CASE, item: staged, reasons: (caseRow().data as { reasons: string[] }).reasons },
        ],
      },
      ids: { entryId: CASE, step: 4 },
    });
    const { entry } = (await result) as unknown as { entry: Record<string, unknown> };
    expect(entry).toMatchObject({
      id: CASE,
      type: "multiple_response",
      number: 2,
      // Without "Step 4: " in front: the page's heading says which step this is.
      reasons: [{ code: "needs_answer", message: NEEDS_ANSWER }],
      caseStudy: { title: "Pulmonary embolism", step: 4 },
      // Step 2 is flagged, so it is the other thing in this case study that needs the teacher.
      next: { entryId: CASE, step: 2 },
    });
    expect(entry.start).toEqual(staged.items[3]);
    expect((entry.caseStudy as { record: unknown }).record).toEqual(whole.ehr);
  });

  it("has no entry for one that cannot be edited here", async () => {
    for (const over of [{ status: "dropped" }, { kind: "case_study" }, { type: null }]) {
      expect(await read({ entry: row(over) }).result).toEqual({
        batchStatus: "review",
        entry: null,
      });
    }
    expect(await read({ entry: { data: null } }).result).toEqual({
      batchStatus: "review",
      entry: null,
    });
    // A step of a question, of a case study with no step questions, or past the sixth.
    for (const [entry, step] of [
      [row(), 2],
      [caseRow({ item: null }), 2],
      [caseRow({ status: "dropped" }), 4],
    ] as const) {
      expect(await read({ entry, ids: { step } }).result).toEqual({
        batchStatus: "review",
        entry: null,
      });
    }
  });

  it("has no entry for one at a removed file's place", async () => {
    const files = {
      data: [{ original_name: "gone.md", status: "rejected", rejected_reason: REMOVED_REASON }],
    };
    expect(await read({ files }).result).toEqual({ batchStatus: "review", entry: null });
  });

  it("is null for a batch of another workspace or quiz, and says so when a read fails", async () => {
    expect(await read({ batch: { data: null } }).result).toBeNull();
    for (const failing of [
      { batch: { error: { code: "XX000" } } },
      { order: { error: { code: "XX000" } } },
      { files: { error: { code: "XX000" } } },
      { entry: row({ chunk_id: CHUNK }), chunks: [{ error: { code: "XX000" } }] },
    ]) {
      expect(await read(failing).result).toBe("unavailable");
    }
  });
});

describe("attentionTargets and nextTarget (#593, save and go to the next one)", () => {
  const entries = [
    light("a", 0, { status: "needs_fix" }),
    light("b", 1),
    light("c", 2, { status: "needs_answer" }),
    light("open", 3, { type: null, status: "not_importable" }),
    light("odd", 4, { type: "essay", status: "needs_fix" }),
    light("case", 5, { kind: "case_study", type: null, status: "needs_answer" }),
    light("gone", 6, { status: "dropped" }),
    light("hidden", 7, { kind: "case_study", type: null, status: "needs_fix" }),
  ];
  const cases = new Map([
    [
      "case",
      {
        item: staged,
        reasons: [`needs_answer: Step 4: ${NEEDS_ANSWER}`, "cut_off: Step 2: It runs past."],
      },
    ],
    // No step questions: nothing to open, so "next" never leads there.
    ["hidden", { item: null, reasons: ["needs_fix: The patient record could not be read."] }],
  ]);
  const targets = attentionTargets(entries, cases);

  it("lists what needs the teacher and can be opened, in review order", () => {
    expect(targets.map((target) => [target.entryId, target.step])).toEqual([
      ["a", undefined],
      ["c", undefined],
      ["case", 2],
      ["case", 4],
    ]);
  });

  it("goes to the one after this, a case study's steps in turn, and round to the start", () => {
    expect(nextTarget(targets, { entryId: "a", position: 0 })).toEqual({ entryId: "c" });
    expect(nextTarget(targets, { entryId: "c", position: 2 })).toEqual({
      entryId: "case",
      step: 2,
    });
    expect(nextTarget(targets, { entryId: "case", position: 5, step: 2 })).toEqual({
      entryId: "case",
      step: 4,
    });
    expect(nextTarget(targets, { entryId: "case", position: 5, step: 4 })).toEqual({
      entryId: "a",
    });
  });

  it("starts from where a question that is already ready sits", () => {
    expect(nextTarget(targets, { entryId: "b", position: 1 })).toEqual({ entryId: "c" });
  });

  it("is null when nothing else needs attention", () => {
    expect(nextTarget(targets.slice(0, 1), { entryId: "a", position: 0 })).toBeNull();
    expect(nextTarget([], { entryId: "b", position: 1 })).toBeNull();
  });
});
