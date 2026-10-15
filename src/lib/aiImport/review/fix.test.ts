import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { matrixFormFromStored, type MatrixFormValues } from "@/lib/authoring/forms/matrix";
import { fromMatrixMultipleChoiceDraft, type MatrixMultipleChoiceDraft } from "@/lib/ngn/draft";
import { itemSchema } from "@/lib/ngn/schemas";
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
    ai_import_entries: options.serviceEntries ?? [{ data: [{ version: 4, status: "ready" }] }],
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

    // Read with the teacher's own session; written with the service client, named in full.
    expect(session.stepsOn("ai_import_entries", "update")).toEqual([]);
    const [[patch]] = service.stepsOn("ai_import_entries", "update") as [[Record<string, unknown>]];
    expect(patch.status).toBe("ready");
    expect(itemSchema.safeParse(patch.item).success).toBe(true);
    expect(patch.reasons).toContain("duplicate: The same question as Question 1.");
    expect((patch.reasons as string[]).some((r) => r.startsWith("needs_answer"))).toBe(false);
    expect(service.stepsOn("ai_import_entries", "eq")).toEqual([
      ["id", ENTRY],
      ["batch_id", BATCH],
      ["org_id", ORG],
      ["version", 3],
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
