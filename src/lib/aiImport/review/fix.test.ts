import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { matrixFormFromStored, type MatrixFormValues } from "@/lib/authoring/forms/matrix";
import { fromMatrixMultipleChoiceDraft, type MatrixMultipleChoiceDraft } from "@/lib/ngn/draft";
import { multipleResponseFormFromStored } from "@/lib/authoring/forms/multipleResponse";
import { sampleCaseStudy } from "@/lib/ngn/fixtures";
import { caseStudySchema, itemSchema } from "@/lib/ngn/schemas";
import {
  BATCH,
  OFF,
  ON,
  ORG,
  fakeClient,
  teacher,
  type Reply,
} from "../upload/testing/fakeSupabase";
import { editorStart, reasonsAfterFix, saveEntryFix, type FixDeps } from "./fix";

const ENTRY = "00000000-0000-4000-8000-0000000000e1";

// A fictional matrix, as the Malnutrition sample's shape: the source marks no answer.
const draft: MatrixMultipleChoiceDraft = {
  type: "matrix_multiple_choice",
  stem: "For each finding, choose whether it is expected or unexpected.",
  columns: ["Expected", "Unexpected"],
  rows: [
    { text: "Weight loss of 3 kg", cells: ["", ""] },
    { text: "Serum albumin 2.4 g/dL", cells: ["", ""] },
    { text: "Brisk capillary refill", cells: ["", ""] },
  ],
};
const keyless = fromMatrixMultipleChoiceDraft(draft).item;
const keyedDraft: MatrixMultipleChoiceDraft = {
  ...draft,
  rows: draft.rows.map((row, index) => ({ ...row, cells: index === 2 ? ["", "*"] : ["*", ""] })),
};

/** The editor's form for the keyless matrix, with every row marked. */
function markedForm(): MatrixFormValues {
  const form = matrixFormFromStored(keyless, ENTRY);
  return {
    ...form,
    rows: form.rows.map((row, index) => ({
      ...row,
      correctColumnIds: [index === 2 ? "col_2" : "col_1"],
    })),
  };
}

const row = (over: Record<string, unknown> = {}): Reply => ({
  data: {
    id: ENTRY,
    version: 3,
    position: 2,
    kind: "item",
    type: "matrix_multiple_choice",
    status: "needs_answer",
    reasons: [
      "needs_answer: The source marks no answer. Add the key before this question can be imported.",
      "duplicate: The same question as Question 1.",
    ],
    source_excerpt: "For each finding...",
    item: keyless,
    group_key: null,
    step: null,
    ...over,
  },
});
const inReview: Reply = { data: { status: "review" } };

function setup(
  options: {
    entries?: Reply[];
    batches?: Reply[];
    serviceBatches?: Reply[];
    serviceEntries?: Reply[];
    /** What the duplicate pass reads, and what its writes answer. */
    stems?: unknown[];
    flagged?: Reply[];
    enabled?: boolean;
    env?: Record<string, string>;
  } = {},
) {
  const { author, session } = teacher(options.enabled ?? true, {
    ai_import_entries: options.entries ?? [row()],
    ai_import_batches: options.batches ?? [inReview],
  });
  const service = fakeClient({
    ai_import_batches: options.serviceBatches ?? [inReview],
    // The write, then the duplicate pass's read of the batch's stems (#593).
    ai_import_entries: options.serviceEntries ?? [
      { data: [{ version: 4, status: "ready" }] },
      { data: options.stems ?? [] },
      ...(options.flagged ?? []),
    ],
    ai_import_files: [{ data: [] }],
  });
  const deps: FixDeps = {
    author: async () => author,
    env: options.env ?? ON,
    service: () => service.client,
  };
  return { deps, session, service };
}

const input = (over: Record<string, unknown> = {}) => ({
  batchId: BATCH,
  entryId: ENTRY,
  version: 3,
  values: markedForm(),
  ...over,
});

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

describe("editorStart", () => {
  it("opens on the staged item when there is one, key or no key", () => {
    expect(editorStart({ item: keyless, draft, reasons: [] })).toBe(keyless);
  });

  it("opens on the converted draft when no item was built", () => {
    const start = editorStart({
      item: null,
      draft: keyedDraft,
      reasons: ["needs_fix: Row 1 is cut off."],
    }) as { answerKey: { rows: unknown[] } };
    expect(start.answerKey.rows).toHaveLength(3);
  });

  it("leaves out a key the document does not show, so the teacher marks it", () => {
    const start = editorStart({
      item: null,
      draft: keyedDraft,
      reasons: ["unmarked_key: The AI marked an answer this part of the document does not show."],
    }) as Record<string, unknown>;
    expect(start).not.toHaveProperty("answerKey");
    expect(start).toMatchObject({ type: "matrix_multiple_choice" });
  });

  it("opens empty when the draft cannot be read", () => {
    expect(editorStart({ item: null, draft: { nonsense: true }, reasons: [] })).toEqual({});
    expect(editorStart({ item: undefined, draft: null, reasons: [] })).toEqual({});
  });
});

describe("reasonsAfterFix", () => {
  const item = itemSchema.parse(fromMatrixMultipleChoiceDraft(keyedDraft).item);

  it("drops what the teacher's fix answers and keeps what is about the batch or the source", () => {
    const kept = reasonsAfterFix(
      [
        "needs_answer: No key.",
        "needs_fix: Row 2 has two marks.",
        "unmarked_key: The AI marked an answer.",
        "check_key: Read from a PDF.",
        "cut_off: Runs past the end.",
        "relies_on_image: A picture.",
        "not_in_source: Not found.",
        "scoring_conflict: Two rules.",
        "low_confidence: A guess.",
        "warning: An old warning.",
        "duplicate: The same question as Question 1.",
        "instructor_note: A note was left out.",
        "source_error: Possible source error: a typo.",
        "note: Not six steps.",
        "not a reason at all",
      ],
      item,
    );
    expect(kept.slice(0, 4)).toEqual([
      "duplicate: The same question as Question 1.",
      "instructor_note: A note was left out.",
      "source_error: Possible source error: a typo.",
      "note: Not six steps.",
    ]);
    expect(kept.slice(4).every((reason) => reason.startsWith("warning: "))).toBe(true);
    expect(kept).not.toContain("warning: An old warning.");
  });

  it("holds at most 20", () => {
    const many = Array.from({ length: 30 }, (_, index) => `duplicate: Copy ${index}.`);
    expect(reasonsAfterFix(many, item)).toHaveLength(20);
  });
});

describe("saveEntryFix", () => {
  it("saves a keyed question at the shown version and makes it ready", async () => {
    const { deps, session, service } = setup();
    const result = await saveEntryFix(deps, input());
    expect(result).toEqual({ ok: true, version: 4, status: "ready" });
    // A single question's save neither reads nor writes the model's draft.
    expect(String(session.stepsOn("ai_import_entries", "select")[0]?.[0])).not.toContain("draft");
    expect(service.stepsOn("ai_import_entries", "update")[0]?.[0]).not.toHaveProperty("draft");

    // Read with the teacher's own session; written with the service client, named in full.
    expect(session.stepsOn("ai_import_entries", "update")).toEqual([]);
    const [[patch]] = service.stepsOn("ai_import_entries", "update") as [[Record<string, unknown>]];
    expect(patch.status).toBe("ready");
    expect(itemSchema.safeParse(patch.item).success).toBe(true);
    expect(patch.reasons).toContain("duplicate: The same question as Question 1.");
    expect((patch.reasons as string[]).some((r) => r.startsWith("needs_answer"))).toBe(false);
    // The write names the entry in full; the duplicate pass after it reads the batch (#593).
    expect(service.stepsOn("ai_import_entries", "eq")).toEqual([
      ["id", ENTRY],
      ["batch_id", BATCH],
      ["org_id", ORG],
      ["version", 3],
      ["batch_id", BATCH],
      ["org_id", ORG],
    ]);
    expect(service.stepsOn("ai_import_batches", "eq")).toEqual([
      ["id", BATCH],
      ["org_id", ORG],
    ]);
    expect(session.stepsOn("ai_import_entries", "eq")).toEqual(
      expect.arrayContaining([["org_id", ORG]]),
    );
  });

  it("keeps the type the entry has, whatever the form says", async () => {
    const { deps, service } = setup({ entries: [row({ type: "matrix_multiple_response" })] });
    const result = await saveEntryFix(deps, input());
    // A matrix form read as multiple response: valid, and of the entry's own type.
    expect(result).toMatchObject({ ok: true });
    const [[patch]] = service.stepsOn("ai_import_entries", "update") as [
      [{ item: { type: string } }],
    ];
    expect(patch.item.type).toBe("matrix_multiple_response");
  });

  it("refuses a question that is still not complete, and writes nothing", async () => {
    const { deps, service } = setup();
    const result = await saveEntryFix(
      deps,
      input({ values: matrixFormFromStored(keyless, ENTRY) }),
    );
    expect(result).toMatchObject({ ok: false, code: "not_complete" });
    expect(service.from).not.toHaveBeenCalled();
  });

  it("refuses an entry another tab changed since the page read it", async () => {
    const { deps, service } = setup({ entries: [row({ version: 5 })] });
    expect(await saveEntryFix(deps, input())).toMatchObject({ ok: false, code: "entry_changed" });
    expect(service.from).not.toHaveBeenCalled();
  });

  it("reports a change that lands between the read and the write", async () => {
    const { deps } = setup({ serviceEntries: [{ data: [] }] });
    expect(await saveEntryFix(deps, input())).toMatchObject({ ok: false, code: "entry_changed" });
  });

  it("refuses when the batch is not in review, read by the teacher or just before the write", async () => {
    const closed: Reply = { data: { status: "imported" } };
    const early = setup({ batches: [closed] });
    expect(await saveEntryFix(early.deps, input())).toMatchObject({ code: "not_review" });
    expect(early.service.from).not.toHaveBeenCalled();

    const late = setup({ serviceBatches: [closed] });
    expect(await saveEntryFix(late.deps, input())).toMatchObject({ code: "not_review" });
    expect(late.service.stepsOn("ai_import_entries", "update")).toEqual([]);
  });

  it.each([
    ["a dropped question", { status: "dropped" }],
    ["a case study", { kind: "case_study", type: null }],
    ["a question with no NGN type", { type: null, status: "not_importable" }],
    ["a type outside the catalogue", { type: "essay" }],
  ])("refuses %s", async (_, over) => {
    const { deps, service } = setup({ entries: [row(over)] });
    expect(await saveEntryFix(deps, input())).toMatchObject({ ok: false, code: "not_editable" });
    expect(service.from).not.toHaveBeenCalled();
  });

  it("refuses values that are not the type's form", async () => {
    const { deps } = setup();
    expect(await saveEntryFix(deps, input({ values: { rows: "nope" } }))).toMatchObject({
      ok: false,
      code: "malformed",
    });
  });

  it("refuses a form past the size limit before reading anything", async () => {
    const { deps, session } = setup();
    const huge = { ...markedForm(), stem: "x".repeat(250_000) };
    expect(await saveEntryFix(deps, input({ values: huge }))).toMatchObject({ code: "too_large" });
    expect(session.stepsOn("ai_import_entries", "select")).toEqual([]);
  });

  it.each([
    ["no batch id", { batchId: "nope" }],
    ["no version", { version: 0 }],
    ["no values", { values: undefined }],
  ])("refuses a request with %s", async (_, over) => {
    const { deps } = setup();
    expect(await saveEntryFix(deps, input(over))).toMatchObject({ code: "malformed" });
  });

  it("is not found for another workspace's entry", async () => {
    const { deps } = setup({ entries: [{ data: null }] });
    expect(await saveEntryFix(deps, input())).toMatchObject({ code: "not_found" });
  });

  it("checks the caller first", async () => {
    expect(
      await saveEntryFix(
        { author: async () => ({ status: "signed_out" }), env: ON, service: vi.fn() },
        input(),
      ),
    ).toMatchObject({ code: "signed_out" });
    expect(
      await saveEntryFix(
        { author: async () => ({ status: "forbidden" }), env: ON, service: vi.fn() },
        input(),
      ),
    ).toMatchObject({ code: "forbidden" });
    const off = setup({ env: OFF });
    expect(await saveEntryFix(off.deps, input())).toMatchObject({ code: "not_found" });
    const workspaceOff = setup({ enabled: false });
    expect(await saveEntryFix(workspaceOff.deps, input())).toMatchObject({ code: "not_found" });
  });

  it("says so when a read or the write fails", async () => {
    const readFails = setup({ entries: [{ error: { code: "XX000" } }] });
    expect(await saveEntryFix(readFails.deps, input())).toMatchObject({ code: "unavailable" });
    const recheckFails = setup({ serviceBatches: [{ error: { code: "XX000" } }] });
    expect(await saveEntryFix(recheckFails.deps, input())).toMatchObject({ code: "unavailable" });
    const writeFails = setup({ serviceEntries: [{ error: { code: "XX000" } }] });
    expect(await saveEntryFix(writeFails.deps, input())).toMatchObject({ code: "unavailable" });
    expect(errorSpy).toHaveBeenCalled();
    // Codes only: never the question or its key.
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("Weight loss");
  });
});

describe("saveEntryFix on a case study's step (#593, add the key per step)", () => {
  // The fictional sample case study with step 4's key taken out, as an unmarked step is staged.
  const whole = caseStudySchema.parse(sampleCaseStudy);
  const staged = {
    ...whole,
    items: whole.items.map((item, index) => {
      if (index !== 3) return item;
      return Object.fromEntries(Object.entries(item).filter(([key]) => key !== "answerKey"));
    }),
  };
  const NEEDS_ANSWER =
    "needs_answer: Step 4: The source marks no answer. Add the key before this question can be imported.";
  const caseRow = (over: Record<string, unknown> = {}) =>
    row({
      kind: "case_study",
      type: null,
      reasons: [NEEDS_ANSWER],
      item: staged,
      group_key: "Pulmonary embolism",
      ...over,
    });
  const KEY = ["o_o2", "o_ct", "o_antico", "o_hob"];
  /** The multiple response editor's form for step 4, opened on what was staged, then marked. */
  const stepForm = (marked: readonly string[] = KEY) => {
    const form = multipleResponseFormFromStored(staged.items[3], ENTRY);
    return {
      ...form,
      options: form.options.map((option) => ({ ...option, correct: marked.includes(option.id) })),
    };
  };

  it("puts the keyed step back, and a case study with one unkeyed step becomes ready", async () => {
    const { deps, service, session } = setup({
      entries: [caseRow({ draft: { title: "Pulmonary embolism" } })],
      serviceEntries: [{ data: [{ version: 4, status: "ready" }] }, { data: [] }],
    });
    const result = await saveEntryFix(deps, input({ step: 4, values: stepForm() }));
    expect(result).toEqual({ ok: true, version: 4, status: "ready" });
    const [[patch]] = service.stepsOn("ai_import_entries", "update") as [[Record<string, unknown>]];
    expect(patch.status).toBe("ready");
    expect(patch.reasons).not.toContain(NEEDS_ANSWER);
    // The draft is read for a step's save, and notes that the teacher saved step 4: a later
    // split does not ask them to check their own key again.
    expect(patch.draft).toEqual({ title: "Pulmonary embolism", saved: [4] });
    expect(String(session.stepsOn("ai_import_entries", "select")[0]?.[0])).toMatch(/, draft$/);
    const saved = caseStudySchema.parse(patch.item);
    expect(saved.items[3]).toMatchObject({
      id: whole.items[3]!.id,
      cjmmStep: 4,
      answerKey: { correctOptionIds: ["o_o2", "o_ct", "o_antico", "o_hob"] },
    });
    // The other five steps are exactly as they were staged.
    expect(saved.items.filter((_, index) => index !== 3)).toEqual(
      whole.items.filter((_, index) => index !== 3),
    );
    expect(service.stepsOn("ai_import_entries", "eq")).toEqual(
      expect.arrayContaining([
        ["id", ENTRY],
        ["org_id", ORG],
        ["version", 3],
      ]),
    );
  });

  it("refuses a step that is not complete, and writes nothing", async () => {
    const { deps, service } = setup({ entries: [caseRow()] });
    expect(await saveEntryFix(deps, input({ step: 4, values: stepForm([]) }))).toMatchObject({
      code: "not_complete",
    });
    expect(service.from).not.toHaveBeenCalled();
  });

  it("reads the form as the step's own stored type, never one the request names", async () => {
    const { deps, service } = setup({ entries: [caseRow()] });
    // The matrix form is not step 4's form: it is refused, not saved as a matrix.
    expect(await saveEntryFix(deps, input({ step: 4 }))).toMatchObject({ ok: false });
    expect(service.from).not.toHaveBeenCalled();
  });

  it("has no step to save on a question, a dropped case study or one with no step questions", async () => {
    const question = setup();
    expect(await saveEntryFix(question.deps, input({ step: 2 }))).toMatchObject({
      code: "not_editable",
    });
    for (const over of [{ status: "dropped" }, { item: null }]) {
      const { deps } = setup({ entries: [caseRow(over)] });
      expect(await saveEntryFix(deps, input({ step: 4, values: stepForm() }))).toMatchObject({
        code: "not_editable",
      });
    }
    // Without a step, a case study is still not a question.
    const whole6 = setup({ entries: [caseRow()] });
    expect(await saveEntryFix(whole6.deps, input())).toMatchObject({ code: "not_editable" });
    for (const step of [0, 7, 1.5, "4"]) {
      expect(await saveEntryFix(setup().deps, input({ step }))).toMatchObject({
        code: "malformed",
      });
    }
  });

  it("answers with the version the duplicate pass left the entry at", async () => {
    const { deps } = setup({
      stems: [
        { id: "first", position: 0, status: "ready", reasons: [], stem: "Which food first?" },
        { id: ENTRY, position: 2, status: "ready", reasons: [], stem: "Which food first?" },
      ],
      flagged: [{ data: [{ id: ENTRY, version: 5 }] }],
    });
    expect(await saveEntryFix(deps, input())).toEqual({ ok: true, version: 5, status: "ready" });
  });
});
